import { join } from "node:path";
import type { LiveEvent, Scorecard } from "@onfloor/contracts";
import { calls } from "../../core/calls";
import { services } from "../../core/services";
import type { Snippet } from "../../core/services/knowledge";

/**
 * RAG, wired into OnFloor. The knowledge service (core/services/knowledge.ts) stores and
 * searches; this module decides WHAT goes in and WHERE it is used:
 *
 *   org_docs  playbook / price sheets / policies   → judge + copilot grounding (facts, policies)
 *   golden    real agent lines from strong calls    → judge "golden standard" lines
 *   agent     each agent's past mistakes            → simulator presses on their weak spots
 *   customer  memory of past live calls             → HUD "last time…" card + copilot context
 *
 * Writes happen automatically after every scored call (`rememberCall`, called by scoring).
 * Every helper returns [] / "" when RAG is off or a lookup fails: RAG improves a call, it
 * must never break one.
 */

export const PLAYBOOK_SOURCE = "playbook";
const PLAYBOOK_PATH = join(import.meta.dir, "../../../knowledge/onfloor-ads-playbook.md");

const safe = async <T>(fallback: T, run: () => Promise<T>): Promise<T> => {
  if (!services.knowledge.enabled) return fallback;
  try {
    return await run();
  } catch (err) {
    console.error("[knowledge]", (err as Error).message);
    return fallback;
  }
};

/** Ingest (or refresh) the bundled OnFloor Ads playbook into org_docs. */
export async function ingestPlaybook() {
  const text = await Bun.file(PLAYBOOK_PATH).text();
  return services.knowledge.ingest({
    scope: { kind: "org_docs" },
    source: PLAYBOOK_SOURCE,
    title: "OnFloor Ads playbook",
    text,
    format: "markdown",
  });
}

// --- Retrieval helpers (used by sim, scoring, and the live copilot) -----------------------

/** Approved facts / policies relevant to `query`. */
export const groundingFacts = (query: string, k = 4) =>
  safe<Snippet[]>([], () => services.knowledge.retrieve(query, { kind: "org_docs" }, k));

/** Real lines from strong calls that handled something like `query`. */
export const goldenExamples = (query: string, k = 3) =>
  safe<Snippet[]>([], () => services.knowledge.retrieve(query, { kind: "golden" }, k, { minScore: 0.6 }));

/** This agent's past mistakes most related to `query` (e.g. the scenario + persona objections). */
export const agentWeakSpots = (agentId: string, query: string, k = 3) =>
  safe<Snippet[]>([], () => services.knowledge.retrieve(query, { kind: "agent", agentId }, k, { minScore: 0.5 }));

/** What we remember about a customer. `query` steers it; the default favours open issues. */
export const customerMemory = (customerKey: string, query = "complaints, promises made, open issues, what they asked for", k = 3) =>
  safe<Snippet[]>([], () => services.knowledge.retrieve(query, { kind: "customer", customerKey }, k, { minScore: 0.35 }));

/** Snippets as a prompt block. Each line is tagged with its source title for citations. */
export function formatSnippets(snippets: Snippet[], maxChars = 2400): string {
  let out = "";
  for (const s of snippets) {
    const line = `- [${s.title}] ${s.text.replace(/\s+/g, " ").trim()}\n`;
    if (out.length + line.length > maxChars) break;
    out += line;
  }
  return out.trim();
}

/** Distinct source titles, for `hint.sources` on the HUD. */
export const sourceTitles = (snippets: Snippet[]) => [...new Set(snippets.map((s) => s.title))];

/**
 * The HUD's customer-memory event for a live call (Tushar: emit right after call_started).
 * Always resolves; `items` is [] for a first-time caller or when RAG is off.
 */
export async function customerMemoryEvent(customerKey: string | null, customerLabel: string): Promise<LiveEvent> {
  const memory = customerKey ? await customerMemory(customerKey) : [];
  return {
    type: "customer_memory",
    customerLabel,
    items: memory.map((m) => ({
      text: m.text,
      source: m.source,
      at: typeof m.meta.at === "string" ? m.meta.at : null,
    })),
  };
}

// --- Writes (after scoring) ----------------------------------------------------------------

const GOLDEN_MIN_OVERALL = 75;

/**
 * Turns a scored call into knowledge. Called by scoring after the scorecard is saved; never
 * throws. Idempotent per call (sources are keyed by call id, so re-scoring replaces).
 */
export async function rememberCall(callId: string, card: Scorecard): Promise<void> {
  await safe(undefined, async () => {
    const call = await calls.getWithTranscript(callId);
    const byId = new Map(call.transcript.map((t) => [t.id, t]));
    const at = call.endedAt ?? call.startedAt;
    const date = new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const jobs: Promise<unknown>[] = [];

    // agent: what this agent got wrong, so the simulator can press on it next time.
    const mistakes = card.moments.filter((m) => m.severity !== "good");
    if (mistakes.length) {
      jobs.push(
        services.knowledge.ingest({
          scope: { kind: "agent", agentId: call.agentId },
          source: `call:${callId}`,
          title: `${call.kind === "sim" ? "Practice" : "Live"} call with ${call.customerLabel}, ${date}`,
          format: "text",
          text: mistakes
            .map((m) => `${m.title}: ${m.detail}${m.goldenLine ? ` Better: "${m.goldenLine}"` : ""}`)
            .join("\n\n"),
          meta: { callId, kind: call.kind, at },
        }),
      );
    }

    // golden: real agent lines that worked, from strong calls only.
    if (card.overall >= GOLDEN_MIN_OVERALL) {
      card.moments
        .filter((m) => m.severity === "good")
        .forEach((m, i) => {
          const turn = byId.get(m.turnId);
          if (!turn || turn.speaker !== "agent") return;
          const before = call.transcript.filter((t) => t.speaker === "customer" && t.seq < turn.seq).at(-1);
          jobs.push(
            services.knowledge.ingest({
              scope: { kind: "golden" },
              source: `call:${callId}:${i + 1}`,
              title: `Top-rep line: ${m.title}`,
              format: "snippet",
              text: `${before ? `Customer: "${before.text}"\n` : ""}Agent: "${turn.text}"\nWhy it worked: ${m.detail}`,
              meta: { callId, overall: card.overall, at },
            }),
          );
        });
    }

    // customer: memory of this live call, for the next time they call.
    const customerKey = call.kind === "live" ? await calls.externalCustomerId(callId) : null;
    if (customerKey) {
      const raised = call.transcript
        .filter((t) => t.speaker === "customer")
        .map((t) => t.text)
        .slice(0, 6);
      jobs.push(
        services.knowledge.ingest({
          scope: { kind: "customer", customerKey },
          source: `call:${callId}`,
          title: `Call with ${call.customerLabel}, ${date}`,
          format: "text",
          text: [
            `${date}: ${card.summary}`,
            card.moments.length ? `Key moments: ${card.moments.map((m) => m.title).join("; ")}.` : "",
            raised.length ? `The customer said: ${raised.map((r) => `"${r}"`).join(" ")}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
          meta: { callId, at },
        }),
      );
    }

    await Promise.all(jobs);
  });
}
