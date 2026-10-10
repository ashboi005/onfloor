import type { CrmAuditRow, CrmRequest, Scorecard, TranscriptTurn } from "@onfloor/contracts";

/**
 * Everything countable about a call, computed (never asked of the LLM), so it is
 * checkable and identical every time.
 */

const DEAD_AIR_MS = 5000;
/** Overlap below this is crosstalk jitter (and sim persona end times are estimates). */
const INTERRUPT_OVERLAP_MS = 400;

export function computeStats(turns: TranscriptTurn[], durationMs: number | null): Scorecard["stats"] {
  const sorted = [...turns].sort((a, b) => a.startMs - b.startMs);
  const dur = (t: TranscriptTurn) => Math.max(0, t.endMs - t.startMs);
  const agent = sorted.filter((t) => t.speaker === "agent");
  const agentMs = agent.reduce((s, t) => s + dur(t), 0);
  const totalMs = sorted.reduce((s, t) => s + dur(t), 0);

  let interruptions = 0;
  let deadAirCount = 0;
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.speaker === "agent" && prev.speaker === "customer" && prev.endMs - cur.startMs > INTERRUPT_OVERLAP_MS) interruptions++;
    if (cur.startMs - prev.endMs > DEAD_AIR_MS) deadAirCount++;
  }

  // Longest stretch of consecutive agent speech.
  let longestMonologueMs = 0;
  let runStart: number | null = null;
  let runEnd = 0;
  for (const t of sorted) {
    if (t.speaker === "agent") {
      runStart ??= t.startMs;
      runEnd = t.endMs;
      longestMonologueMs = Math.max(longestMonologueMs, runEnd - runStart);
    } else {
      runStart = null;
    }
  }

  const words = agent.reduce((s, t) => s + t.text.split(/\s+/).filter(Boolean).length, 0);
  return {
    durationMs: durationMs ?? sorted.at(-1)?.endMs ?? 0,
    agentTalkPct: totalMs ? Math.round((agentMs / totalMs) * 100) : 0,
    interruptions,
    deadAirCount,
    longestMonologueMs,
    wpm: agentMs ? Math.round(words / (agentMs / 60_000)) : 0,
  };
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  return a === b;
}

export interface CrmLog {
  actions: { field: string; to: unknown; atMs: number }[];
  voiced: { requestId: string; atMs: number }[];
}

/** One row per request the persona actually voiced: final value vs expected, and time to action it. */
export function crmAudit(requests: CrmRequest[], initial: Record<string, unknown>, log: CrmLog): CrmAuditRow[] {
  const rows: CrmAuditRow[] = [];
  for (const v of log.voiced) {
    const req = requests.find((r) => r.id === v.requestId);
    if (!req || rows.some((r) => r.requestId === req.id)) continue;
    const forField = log.actions.filter((a) => a.field === req.field);
    const actual = forField.length ? forField.at(-1)!.to : initial[req.field];
    const firstHit = forField.find((a) => a.atMs >= v.atMs - 2000 && sameValue(a.to, req.value));
    rows.push({
      requestId: req.id,
      field: req.field,
      expected: req.value,
      actual,
      correct: sameValue(actual, req.value),
      latencyMs: firstHit ? Math.max(0, firstHit.atMs - v.atMs) : null,
    });
  }
  return rows;
}

/** 70% correctness + 30% speed. null when the persona voiced no requests. */
export function toolAccuracyScore(rows: CrmAuditRow[]): number | null {
  if (!rows.length) return null;
  const correct = rows.filter((r) => r.correct).length / rows.length;
  const speed =
    rows.reduce((s, r) => {
      if (r.latencyMs === null) return s;
      return s + (r.latencyMs <= 5000 ? 1 : r.latencyMs <= 15_000 ? 0.7 : r.latencyMs <= 30_000 ? 0.4 : 0.1);
    }, 0) / rows.length;
  return Math.round(70 * correct + 30 * speed);
}
