import { z } from "zod";
import { CRM_FIELD_KEYS } from "./crm";
import { CALL_KINDS, GRADES, MOMENT_SEVERITIES, SCORE_DIMENSIONS } from "./domain";

const score = z.number().int().min(0).max(100);

export const scorecardDimensionSchema = z.object({
  key: z.enum(SCORE_DIMENSIONS),
  /** null = not applicable (toolAccuracy on a live call). */
  score: score.nullable(),
  weight: z.number(),
  verdict: z.string(),
  /** Transcript turn ids. */
  evidence: z.array(z.string()),
});
export type ScorecardDimension = z.infer<typeof scorecardDimensionSchema>;

export const scorecardMomentSchema = z.object({
  id: z.string(),
  atMs: z.number().int().min(0),
  turnId: z.string(),
  severity: z.enum(MOMENT_SEVERITIES),
  title: z.string(),
  detail: z.string(),
  /** The "Golden Standard" phrasing. */
  goldenLine: z.string().nullable(),
});
export type ScorecardMoment = z.infer<typeof scorecardMomentSchema>;

export const crmAuditRowSchema = z.object({
  requestId: z.string(),
  field: z.enum(CRM_FIELD_KEYS),
  expected: z.unknown(),
  actual: z.unknown(),
  correct: z.boolean(),
  /** Request spoken → CRM updated. null when never updated. */
  latencyMs: z.number().int().nullable(),
});
export type CrmAuditRow = z.infer<typeof crmAuditRowSchema>;

export const scorecardSchema = z.object({
  callId: z.string(),
  kind: z.enum(CALL_KINDS),
  /** Weighted mean, computed in code. Never asked of the LLM. */
  overall: score,
  grade: z.enum(GRADES),
  summary: z.string(),
  dimensions: z.array(scorecardDimensionSchema),
  moments: z.array(scorecardMomentSchema),
  /** Sim only; [] for live. */
  crmAudit: z.array(crmAuditRowSchema),
  stats: z.object({
    durationMs: z.number().int(),
    agentTalkPct: z.number().min(0).max(100),
    interruptions: z.number().int(),
    /** Gaps over 5s. */
    deadAirCount: z.number().int(),
    longestMonologueMs: z.number().int(),
    wpm: z.number(),
  }),
  createdAt: z.string(),
});
export type Scorecard = z.infer<typeof scorecardSchema>;
