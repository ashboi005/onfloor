import {
  type Grade,
  type Merchant,
  type Persona,
  type Policy,
  type QaDeductionCode,
  SCORE_DIMENSION_LABELS,
  SCORE_WEIGHTS,
  type Scenario,
  type Scorecard,
  type ScorecardDimension,
  scorecardSchema,
  spokenDate,
  todayIst,
  type TranscriptTurn,
} from "@onfloor/contracts";
import { DEFAULT_POLICIES } from "@onfloor/contracts/fixtures";
import { scorecards, user } from "@onfloor/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { calls } from "../../core/calls";
import { AppError } from "../../core/errors";
import { services } from "../../core/services";
import { db } from "../../services";
import { getMerchant } from "../merchants";
import { getPersona } from "../personas";
import { requestsFor } from "../sim/prompt";
import { getScenario } from "../scenarios";
import { formatSnippets, goldenExamples, groundingFacts, rememberCall } from "../knowledge";
import { LIVE_POLICIES } from "../live/policies";
import { computeStats, toolAccuracyScore, type WorkspaceAudit, workspaceAudit } from "./analytics";

/**
 * Pillar 3: the QA scorecard. Public API for sim (Ashwath) and live (Tushar):
 *   scoreCall(callId) → Scorecard   (reads the transcript, persists, sets call status)
 *   getScorecard(callId) → Scorecard | null
 *
 * Split between judge and arithmetic: the LLM (job "scoring") reads the conversation
 * for objection handling, compliance, soft skills, the moments, the golden lines and the
 * transcript-level QA deductions (plan misrepresented, opening/closing, empathy).
 * Stats, the tools audit (lookup, Ad Studio, disposition), the late-disposition deduction,
 * tool accuracy, the overall score and the grade are computed.
 */

const JUDGED = ["objectionHandling", "compliance", "softSkills"] as const;
const JUDGED_DEDUCTIONS = ["plan_misrepresented", "opening_line", "closing_line", "empathy_missing"] as const satisfies readonly QaDeductionCode[];

const judgementSchema = z.object({
  summary: z.string(),
  dimensions: z
    .array(
      z.object({
        key: z.enum(JUDGED),
        score: z.number().int().min(0).max(100),
        verdict: z.string(),
        evidence: z.array(z.string()),
      }),
    )
    .min(1),
  moments: z.array(
    z.object({
      turnId: z.string(),
      severity: z.enum(["mistake", "warning", "good"]),
      title: z.string(),
      detail: z.string(),
      goldenLine: z.string().nullable(),
    }),
  ),
  /** QA infractions found in the transcript. Empty when none. */
  deductions: z.array(z.object({ code: z.enum(JUDGED_DEDUCTIONS), turnId: z.string().nullable(), detail: z.string() })),
});
type Judgement = z.infer<typeof judgementSchema>;

/**
 * Linear and forgiving by design: the customer is an unpredictable AI (or a real person), so the
 * agent can't know what's coming and real calls never follow the script word for word. Start
 * from "competent", move in proportion to impact, and keep low scores for calls that actually
 * went wrong.
 */
const RUBRIC: Record<(typeof JUDGED)[number], string> = {
  objectionHandling:
    "Start at 85 if the agent answered the customer's questions and concerns reasonably. Up to 100 for answers that were specific and convincing. Subtract in proportion to impact: about 5-10 per question that was dodged or answered vaguely. Below 50 only if the agent ignored the customer, caved on price, or lost a winnable deal through their own handling.",
  compliance:
    "Start at 90 if the plan was explained correctly. A wording difference or a skipped line from the script is not a breach (at most -5). A critical policy breach costs about 25 if the agent corrected it on the same call, and caps the score at 60 if it was never corrected. 100 if every applicable rule was followed.",
  softSkills:
    "Start at 80 for a clear, polite call. Up to 100 for one that is warm, concise and adapted to this customer. Subtract a few points per real problem (long monologue, talking over the customer, long silence); use the STATS. Below 50 only if the agent was rude, confusing or kept rambling.",
};

/** Weighted mean over applicable dimensions. Arithmetic, never asked of the LLM. */
export function overallScore(dims: ScorecardDimension[]): number {
  const applicable = dims.filter((d) => d.score !== null);
  const weight = applicable.reduce((s, d) => s + SCORE_WEIGHTS[d.key], 0);
  if (!weight) return 0;
  return Math.round(applicable.reduce((s, d) => s + (d.score ?? 0) * SCORE_WEIGHTS[d.key], 0) / weight);
}

export function gradeFor(score: number): Grade {
  return score >= 85 ? "A" : score >= 70 ? "B" : score >= 60 ? "C" : score >= 45 ? "D" : "F";
}

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

function judgePrompt(input: {
  kind: "sim" | "live";
  scenario: Scenario | null;
  persona: Persona | null;
  merchant: Merchant | null;
  agentName: string;
  callDate: string;
  policies: Policy[];
  turns: TranscriptTurn[];
  stats: Scorecard["stats"];
  audit: WorkspaceAudit | null;
  /** RAG: approved facts from the playbook / price sheets. */
  facts: string;
  /** RAG: real lines from strong calls. */
  golden: string;
}): string {
  const { scenario, persona, merchant: m, audit } = input;
  const qa = input.kind === "sim" ? (scenario?.qaRules ?? []).filter((r) => (JUDGED_DEDUCTIONS as readonly string[]).includes(r.code)) : [];
  return `You are a senior QA auditor for ${
    input.kind === "sim"
      ? "Tomato's merchant sales team: outbound calls to restaurant partners pitching Max Grow, Tomato's ad plan"
      : "a B2B sales call centre"
  }. Score the AGENT (${input.agentName}), not the customer.

# Context
Call type: ${input.kind === "sim" ? "training simulation against an AI customer" : "real customer call"}. Call date: ${spokenDate(input.callDate)}.
${scenario ? `Scenario: ${scenario.title}\nObjective: ${scenario.objective}` : "Objective: handle the customer professionally and move toward a sale."}
${
    m
      ? `Merchant on record: ${m.ownerName}, ${m.restaurantName} (UID ${m.uid}), DRR ₹${m.drr.toLocaleString("en-IN")}/day. The person who answered: ${m.answerer.name}, ${m.answerer.relation}${m.answerer.isDecisionMaker ? " (decision maker)" : " (NOT a decision maker: the correct path is to ask when the owner is available and schedule a callback, not to pitch or set up a campaign)"}.`
      : ""
  }
${persona ? `Customer behaviour: ${persona.archetype}.` : ""}
${
    scenario && input.kind === "sim"
      ? `\n# STANDARD LINES (QA checks these)\nOpening: "${scenario.script.greeting.replace("{agentName}", input.agentName)}" (any time-of-day greeting is fine), then confirm the merchant's name, restaurant and that they are the owner / can make financial decisions ("${scenario.script.nonOwnerQuestion}").\nTimeline (after setting up): "${scenario.script.timeline}"\nClosing: "${scenario.script.closing}"\nEmpathy on complaints: ${scenario.script.empathy.map((e) => `"${e}"`).join(", ")}\n`
      : ""
  }
# POLICIES
${input.policies.map((p) => `- [${p.severity}] ${p.id}: ${p.rule}${p.goldenLine ? ` (approved phrasing: "${p.goldenLine}")` : ""}`).join("\n")}

${
    input.facts
      ? `# APPROVED FACTS (from the Tomato knowledge base, the source of truth)\nIf the agent stated a rate, condition, timeline or policy that contradicts these, that is a compliance mistake: say which fact it contradicts.\n${input.facts}\n\n`
      : ""
  }${
    input.golden
      ? `# TOP-REP EXAMPLES (real lines from strong calls)\nPrefer adapting these when writing goldenLine.\n${input.golden}\n\n`
      : ""
  }# STATS (computed, trust these)
duration ${mmss(input.stats.durationMs)}, agent talk ${input.stats.agentTalkPct}%, interruptions ${input.stats.interruptions}, dead-air gaps >5s ${input.stats.deadAirCount}, longest agent monologue ${Math.round(input.stats.longestMonologueMs / 1000)}s, ${input.stats.wpm} wpm.

${
    audit
      ? `# TOOLS (computed from the agent's screen, trust these; already scored separately, do not re-score them)
${audit.rows.map((r) => `- ${r.field}: expected ${JSON.stringify(r.expected)}, actual ${JSON.stringify(r.actual)} → ${r.correct ? "OK" : "WRONG"}`).join("\n")}
${audit.campaign ? `Ad Studio campaign: ${audit.campaign.startDate} to ${audit.campaign.endDate}. If the dates the agent SAID on the call differ from these, that is a mistake moment.` : "No campaign was launched."}${
          audit.failedLaunches.length ? `\nAd Studio refused ${audit.failedLaunches.length} launch attempt(s): ${audit.failedLaunches.join("; ")}.` : ""
        }
A detail confirmed or set up in the tools counts as handled even if the agent didn't say so out loud.

`
      : ""
  }# RUBRIC (score each 0-100)
${JUDGED.map((k) => `## ${k} (${SCORE_DIMENSION_LABELS[k]})\n${RUBRIC[k]}`).join("\n")}

${
    qa.length
      ? `# QA DEDUCTIONS (the penalised report card)
Report an infraction only when it clearly and substantially happened, at most once per code, with the turn id where it happened (null if it's an omission across the whole call) and one sentence of detail quoting the agent. When in doubt, don't report it:
${qa.map((r) => `- ${r.code}: ${r.detail}`).join("\n")}
Only report what the AGENT did or failed to do. Paraphrasing a standard line is fine; only a line that is missing altogether counts. A correct statement of the plan, or a slip the agent corrected on the call, is never plan_misrepresented. If the customer never complained, empathy_missing does not apply. If the call ended before the agent could close (customer hung up abruptly), closing_line does not apply.

`
      : ""
  }# OUTPUT
Return JSON:
- summary: 2 sentences, plain, specific to this call.
- dimensions: exactly one entry each for ${JUDGED.join(", ")}, with score, a one-line verdict, and evidence = turn ids (the [t_...] ids below).
- moments: the 2-6 moments that decided the call, each tied to ONE turn id. severity mistake|warning|good. title under 8 words (e.g. "Quoted 15% instead of 20%"). detail one sentence. goldenLine = the exact words a top rep would have said instead (in the language the call was in), or null for "good" moments.
- deductions: ${qa.length ? "the QA infractions above, or []" : "[]"}.
Use only turn ids that appear below.

${
    input.kind === "live"
      ? `# LIVE CALL: NO CRM\nThis was a real call; the agent had no CRM open. If the customer asked for an account change, a clear verbal acknowledgement ("sure, I'll do that") is the correct handling. Never mark it as ignored or not actioned. Only judge what was said.\n\n`
      : ""
  }# HOW STRICT TO BE
The customer is unpredictable and the agent cannot know what is coming; real calls don't follow the script line by line. Judge the outcome and the big things: was the merchant told the plan correctly, were their questions answered, was the deal won (or lost through the agent's own mistakes), were the tools and disposition right. Skipping or rewording one step is a small thing. Grade linearly: each problem costs in proportion to its impact, and low scores are only for calls that went clearly wrong.

# ACCURACY RULES
- Only flag a policy breach if the AGENT's own words in that turn breach it. Quote the number or promise in the detail (e.g. "said 15% commission", "offered 10% instead"). What the customer demanded or misquoted is not the agent's breach; correcting the customer is good.
- Never produce two moments that contradict each other.

# TRANSCRIPT
${input.turns.map((t) => `[${t.id}] ${mmss(t.startMs)} ${t.speaker.toUpperCase()}: ${t.text}`).join("\n")}`;
}

export async function scoreCall(callId: string): Promise<Scorecard> {
  const call = await calls.get(callId);
  const turns = await calls.transcript(callId);
  if (turns.filter((t) => t.speaker === "agent").length < 1 || turns.length < 3) {
    await calls.setStatus(callId, "abandoned");
    throw new AppError("BAD_REQUEST", { message: "Too short to score." });
  }

  try {
    const scenario = call.scenarioId ? await getScenario(call.scenarioId) : null;
    // For sim calls the persona was played; for live it's extracted later, so it's optional.
    const persona = call.kind === "sim" && call.personaId ? await getPersona(call.personaId).catch(() => null) : null;
    // Live calls are judged against the live module's canonical list (owner: Tushar), which
    // extends the defaults (e.g. refunds); sim calls use their scenario's policies.
    const policies = scenario?.policies ?? (call.kind === "live" ? LIVE_POLICIES : DEFAULT_POLICIES);
    const stats = computeStats(turns, call.durationMs);
    const merchant = call.kind === "sim" && call.merchantId ? await getMerchant(call.merchantId).catch(() => null) : null;
    const callDate = todayIst(new Date(call.startedAt));
    const agentName = await agentNameOf(call.agentId);

    const audit =
      call.kind === "sim" && persona && scenario && merchant
        ? workspaceAudit({
            merchant,
            requests: requestsFor(merchant, persona),
            callDate,
            dispositionSec: scenario.dispositionSec,
            log: await calls.workspaceLog(callId),
          })
        : null;

    // RAG: ground the judge in the playbook and in what top reps actually said.
    const customerText = turns.filter((t) => t.speaker === "customer").map((t) => t.text).join(" ");
    const agentText = turns.filter((t) => t.speaker === "agent").map((t) => t.text).join(" ");
    const [facts, golden] = await Promise.all([
      groundingFacts(`${agentText}\n${customerText}`.slice(0, 3000), 5),
      goldenExamples(customerText.slice(0, 2000), 3),
    ]);

    const judged: Judgement = await services.llm.json({
      job: "scoring",
      schemaName: "call_judgement",
      schema: judgementSchema,
      temperature: 0.2,
      maxTokens: 4000,
      timeoutMs: 90_000,
      messages: [{ role: "user", content: judgePrompt({
            kind: call.kind,
            scenario,
            persona,
            merchant,
            agentName,
            callDate,
            policies,
            turns,
            stats,
            audit,
            facts: formatSnippets(facts),
            golden: formatSnippets(golden, 1200),
          }) }],
    });

    const ids = new Set(turns.map((t) => t.id));
    const byId = new Map(turns.map((t) => [t.id, t]));
    const auditRows = audit?.rows ?? [];
    const toolScore = call.kind === "sim" ? toolAccuracyScore(auditRows) : null;
    const dimensions: ScorecardDimension[] = [
      ...JUDGED.map((key) => {
        const d = judged.dimensions.find((x) => x.key === key);
        return {
          key,
          score: d?.score ?? 50,
          weight: SCORE_WEIGHTS[key],
          verdict: d?.verdict ?? "Not assessed.",
          evidence: (d?.evidence ?? []).filter((id) => ids.has(id)),
        };
      }),
      {
        key: "toolAccuracy",
        score: toolScore,
        weight: SCORE_WEIGHTS.toolAccuracy,
        verdict:
          toolScore === null
            ? call.kind === "live"
              ? "Not applicable for live calls."
              : "No tool work to check on this call."
            : `${auditRows.filter((r) => r.correct).length}/${auditRows.length} tool checks correct (lookup, Ad Studio, disposition).`,
        evidence: [],
      },
    ];
    // Keep the contract's canonical order.
    const order = ["objectionHandling", "toolAccuracy", "compliance", "softSkills"];
    dimensions.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

    // QA deductions: late disposition is computed; the rest come from the judge (once per code).
    const rules = new Map((scenario?.qaRules ?? []).map((r) => [r.code, r]));
    const deductions: Scorecard["deductions"] = [];
    const deduct = (code: QaDeductionCode, turnId: string | null, detail: string) => {
      const rule = rules.get(code);
      if (!rule || deductions.some((d) => d.code === code)) return;
      deductions.push({ code, label: rule.label, points: rule.points, turnId: turnId && ids.has(turnId) ? turnId : null, detail });
    };
    if (call.kind === "sim" && audit?.lateDisposition) {
      deduct(
        "late_disposition",
        null,
        audit.wrapUp.secondsTaken === null
          ? `The call was never disposed within the ${scenario?.dispositionSec ?? 90}s window.`
          : `Disposed after ${audit.wrapUp.secondsTaken}s (limit ${scenario?.dispositionSec ?? 90}s).`,
      );
    }
    for (const d of judged.deductions ?? []) deduct(d.code, d.turnId, d.detail);

    const overall = Math.max(0, overallScore(dimensions) - deductions.reduce((sum, d) => sum + d.points, 0));
    const card = scorecardSchema.parse({
      callId,
      kind: call.kind,
      overall,
      grade: gradeFor(overall),
      summary: judged.summary,
      dimensions,
      moments: judged.moments
        .filter((m) => ids.has(m.turnId))
        .map((m, i) => ({ ...m, id: `m_${i + 1}`, atMs: byId.get(m.turnId)!.startMs, goldenLine: m.goldenLine || null }))
        .sort((a, b) => a.atMs - b.atMs),
      crmAudit: auditRows,
      deductions,
      wrapUp: audit?.wrapUp ?? null,
      stats,
      createdAt: new Date().toISOString(),
    } satisfies Scorecard);

    await db
      .insert(scorecards)
      .values({ callId, body: card })
      .onConflictDoUpdate({ target: scorecards.callId, set: { body: card } });
    await calls.setStatus(callId, "scored", card.overall);
    // RAG write-back: agent weak spots, golden lines, customer memory. Never blocks or fails scoring.
    void rememberCall(callId, card);
    return card;
  } catch (err) {
    await calls.setStatus(callId, "failed");
    throw err instanceof AppError ? err : new AppError("LLM_FAILED", { cause: err });
  }
}

async function agentNameOf(agentId: string): Promise<string> {
  const [row] = await db.select({ name: user.name }).from(user).where(eq(user.id, agentId));
  return row?.name ?? "the agent";
}

export async function getScorecard(callId: string): Promise<Scorecard | null> {
  const [row] = await db.select().from(scorecards).where(eq(scorecards.callId, callId));
  return row?.body ?? null;
}

/** Fire-and-forget scoring after hang-up. The UI polls GET /calls/:id/scorecard. */
export function scoreInBackground(callId: string) {
  scoreCall(callId).catch((err) => console.error(`[scoring] ${callId} failed:`, err.message, err.cause ?? ""));
}
