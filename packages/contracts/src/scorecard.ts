import { z } from "zod";
import { CALL_KINDS, DISPOSITIONS, EMAIL_TEMPLATE_IDS, GRADES, MOMENT_SEVERITIES, SCORE_DIMENSIONS } from "./domain";
import { QA_DEDUCTION_CODES } from "./scenario";
import { callbackSlotSchema } from "./tomato";

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

/** One computed check of the tools work (lookup, Ad Studio fields, disposition). */
export const crmAuditRowSchema = z.object({
  /** Check id, e.g. "lookup", "campaign_email", "disposition_outcome", or the request id it audits. */
  requestId: z.string(),
  /** Human label, e.g. "Ad Studio · email". */
  field: z.string(),
  expected: z.unknown(),
  actual: z.unknown(),
  correct: z.boolean(),
  /** Request spoken (or call connected) → done in the tool. null when never done / not timed. */
  latencyMs: z.number().int().nullable(),
});
export type CrmAuditRow = z.infer<typeof crmAuditRowSchema>;

export const scorecardSchema = z.object({
  callId: z.string(),
  kind: z.enum(CALL_KINDS),
  /** Weighted mean minus QA deductions (floored at 0), computed in code. Never asked of the LLM. */
  overall: score,
  grade: z.enum(GRADES),
  summary: z.string(),
  dimensions: z.array(scorecardDimensionSchema),
  moments: z.array(scorecardMomentSchema),
  /** Sim only; [] for live. */
  crmAudit: z.array(crmAuditRowSchema),
  /** QA point deductions, already subtracted from `overall`. */
  deductions: z
    .array(
      z.object({
        code: z.enum(QA_DEDUCTION_CODES),
        label: z.string(),
        points: z.number().int(),
        turnId: z.string().nullable(),
        detail: z.string(),
      }),
    )
    .default([]),
  /** Sim only: what happened in Nugget after hang-up. null for live calls. */
  wrapUp: z
    .object({
      outcome: z.enum(DISPOSITIONS).nullable(),
      emailTemplate: z.enum(EMAIL_TEMPLATE_IDS).nullable(),
      callback: callbackSlotSchema.nullable(),
      /** From hang-up to dispose. null = never disposed (timer ran out). */
      secondsTaken: z.number().nullable(),
      withinLimit: z.boolean(),
      /** What the customer actually decided, from the simulation. */
      customerDecision: z.enum(DISPOSITIONS).nullable(),
    })
    .nullable()
    .default(null),
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
