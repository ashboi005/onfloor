import {
  type Grade,
  type Persona,
  type Policy,
  SCORE_DIMENSION_LABELS,
  SCORE_WEIGHTS,
  type Scenario,
  type Scorecard,
  type ScorecardDimension,
  scorecardSchema,
  type TranscriptTurn,
} from "@onfloor/contracts";
import { DEFAULT_POLICIES } from "@onfloor/contracts/fixtures";
import { scorecards } from "@onfloor/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { calls } from "../../core/calls";
import { AppError } from "../../core/errors";
import { services } from "../../core/services";
import { db } from "../../services";
import { getPersona } from "../personas";
import { getScenario } from "../scenarios";
import { formatSnippets, goldenExamples, groundingFacts, rememberCall } from "../knowledge";
import { LIVE_POLICIES } from "../live/policies";
import { computeStats, crmAudit, toolAccuracyScore } from "./analytics";

/**
 * Pillar 3: the QA scorecard. Public API for sim (Ashwath) and live (Tushar):
 *   scoreCall(callId) → Scorecard   (reads the transcript, persists, sets call status)
 *   getScorecard(callId) → Scorecard | null
 *
 * Split between judge and arithmetic: the LLM (job "scoring") reads the conversation
 * for objection handling, compliance, soft skills, the moments and the golden lines.
 * Stats, the CRM audit, tool accuracy, the overall score and the grade are computed.
 */

const JUDGED = ["objectionHandling", "compliance", "softSkills"] as const;

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
});
type Judgement = z.infer<typeof judgementSchema>;

const RUBRIC: Record<(typeof JUDGED)[number], string> = {
  objectionHandling:
    "0-20: ignored, talked over or capitulated instantly. 40-60: acknowledged and gave a generic answer. 80-100: found the real concern under the objection and answered it specifically with evidence, protecting value instead of discounting.",
  compliance:
    "Adherence to the POLICIES list and mandatory disclosures. Any critical policy breach caps this at 40. 100 only if every applicable policy was followed.",
  softSkills:
    "Pace, clarity, listening, tone, not monologuing, not interrupting, handling silence. Use the STATS as evidence. 0-20: rambling or rude. 40-60: understandable but unstructured. 80-100: clear, concise, adapted to this customer.",
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
  policies: Policy[];
  turns: TranscriptTurn[];
  stats: Scorecard["stats"];
  audit: Scorecard["crmAudit"];
  /** RAG: approved facts from the playbook / price sheets. */
  facts: string;
  /** RAG: real lines from strong calls. */
  golden: string;
}): string {
  const { scenario, persona } = input;
  return `You are a senior QA auditor for a B2B sales call centre selling local advertising (OnFloor Ads) to merchants. Score the AGENT, not the customer.

# Context
Call type: ${input.kind === "sim" ? "training simulation against an AI customer" : "real customer call"}.
${scenario ? `Scenario: ${scenario.title}\nObjective: ${scenario.objective}` : "Objective: handle the customer professionally, protect price, move toward a sale."}
${persona ? `Customer: ${persona.name}, ${persona.role} (${persona.archetype}).` : ""}

# POLICIES
${input.policies.map((p) => `- [${p.severity}] ${p.id}: ${p.rule}${p.goldenLine ? ` (approved phrasing: "${p.goldenLine}")` : ""}`).join("\n")}

${
    input.facts
      ? `# APPROVED FACTS (from the OnFloor knowledge base, the source of truth)\nIf the agent quoted a price, guarantee, timeline or policy that contradicts these, that is a compliance mistake: say which fact it contradicts.\n${input.facts}\n\n`
      : ""
  }${
    input.golden
      ? `# TOP-REP EXAMPLES (real lines from strong calls)\nPrefer adapting these when writing goldenLine.\n${input.golden}\n\n`
      : ""
  }# STATS (computed, trust these)
duration ${mmss(input.stats.durationMs)}, agent talk ${input.stats.agentTalkPct}%, interruptions ${input.stats.interruptions}, dead-air gaps >5s ${input.stats.deadAirCount}, longest agent monologue ${Math.round(input.stats.longestMonologueMs / 1000)}s, ${input.stats.wpm} wpm.

${
    input.audit.length
      ? `# CRM ACTIONS (computed from the agent's screen, trust these)\nThe agent was also operating a CRM during the call. Account changes the customer asked for:\n${input.audit
          .map((r) => `- ${r.field} → ${JSON.stringify(r.expected)}: ${r.correct ? "DONE correctly" : `NOT done (final value ${JSON.stringify(r.actual)})`}${r.latencyMs !== null ? ` after ${Math.round(r.latencyMs / 1000)}s` : ""}`)
          .join("\n")}\nA change made in the CRM counts as handled even if the agent didn't say so out loud. Do not flag it as ignored.\n\n`
      : ""
  }# RUBRIC (score each 0-100)
${JUDGED.map((k) => `## ${k} (${SCORE_DIMENSION_LABELS[k]})\n${RUBRIC[k]}`).join("\n")}

# OUTPUT
Return JSON:
- summary: 2 sentences, plain, specific to this call.
- dimensions: exactly one entry each for ${JUDGED.join(", ")}, with score, a one-line verdict, and evidence = turn ids (the [t_...] ids below).
- moments: the 2-6 moments that decided the call, each tied to ONE turn id. severity mistake|warning|good. title under 8 words (e.g. "Offered unapproved 15% discount"). detail one sentence. goldenLine = the exact words a top rep would have said instead (in the language the call was in), or null for "good" moments.
Use only turn ids that appear below.

# ACCURACY RULES
- Only flag a policy breach if the AGENT's own words in that turn breach it. Quote the number or promise in the detail (e.g. "offered 15%", "promised activation tomorrow"). What the customer demanded is not the agent's breach.
- Offering a discount within the allowed limit is NOT a breach.
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

    const audit =
      call.kind === "sim" && persona && scenario
        ? crmAudit(persona.crmRequests, scenario.initialCrm, await calls.crmLog(callId))
        : [];

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
    const toolScore = call.kind === "sim" ? toolAccuracyScore(audit) : null;
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
              : "The customer didn't ask for any account changes."
            : `${audit.filter((r) => r.correct).length}/${audit.length} account changes made correctly.`,
        evidence: [],
      },
    ];
    // Keep the contract's canonical order.
    const order = ["objectionHandling", "toolAccuracy", "compliance", "softSkills"];
    dimensions.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

    const overall = overallScore(dimensions);
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
      crmAudit: audit,
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

export async function getScorecard(callId: string): Promise<Scorecard | null> {
  const [row] = await db.select().from(scorecards).where(eq(scorecards.callId, callId));
  return row?.body ?? null;
}

/** Fire-and-forget scoring after hang-up. The UI polls GET /calls/:id/scorecard. */
export function scoreInBackground(callId: string) {
  scoreCall(callId).catch((err) => console.error(`[scoring] ${callId} failed:`, err.message, err.cause ?? ""));
}
