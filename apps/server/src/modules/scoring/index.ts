import {
  type Grade,
  SCORE_WEIGHTS,
  type Scorecard,
  type ScorecardDimension,
  scorecardSchema,
} from "@onfloor/contracts";
import { liveScorecard, simScorecard } from "@onfloor/contracts/fixtures";
import { scorecards } from "@onfloor/db/schema";
import { eq } from "drizzle-orm";
import { calls } from "../../core/calls";
import { AppError } from "../../core/errors";
import { swapId } from "../../core/timeline";
import { db } from "../../services";

/**
 * Pillar 3: the QA scorecard engine. Public API for sim (Ashwath) and live (Tushar):
 *   scoreCall(callId) → Scorecard   (reads the transcript from the DB, persists, sets call status)
 *   getScorecard(callId) → Scorecard | null
 *
 * STUB: returns the fixture scorecard re-keyed to this call.
 * TODO(ashwath): the real judge:
 *   LLM judge (job "scoring") for dimensions/moments/golden lines + computed stats + CRM audit.
 */

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

export async function scoreCall(callId: string): Promise<Scorecard> {
  const call = await calls.get(callId);
  try {
    const fixture = call.kind === "sim" ? simScorecard : liveScorecard;
    const card = scorecardSchema.parse({
      ...swapId(fixture, fixture.callId, callId),
      createdAt: new Date().toISOString(),
    });
    await db
      .insert(scorecards)
      .values({ callId, body: card })
      .onConflictDoUpdate({ target: scorecards.callId, set: { body: card } });
    await calls.setStatus(callId, "scored", card.overall);
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
  scoreCall(callId).catch((err) => console.error(`[scoring] ${callId} failed`, err));
}
