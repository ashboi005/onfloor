import { z } from "zod";
import { POLICY_SEVERITIES } from "./domain";

/** Shared by simulator scoring and live guardrails. */
export const policySchema = z.object({
  id: z.string(),
  rule: z.string(),
  severity: z.enum(POLICY_SEVERITIES),
  /** What to say instead. */
  goldenLine: z.string().optional(),
});
export type Policy = z.infer<typeof policySchema>;

/**
 * QA point deductions (the "penalised report card"). Subtracted from the weighted score.
 * `late_disposition` is computed; the rest are found by the judge in the transcript.
 */
export const QA_DEDUCTION_CODES = ["late_disposition", "plan_misrepresented", "opening_line", "closing_line", "empathy_missing"] as const;
export type QaDeductionCode = (typeof QA_DEDUCTION_CODES)[number];

export const qaRuleSchema = z.object({
  code: z.enum(QA_DEDUCTION_CODES),
  label: z.string(),
  points: z.number().int().min(0).max(100),
  /** What the auditor looks for. */
  detail: z.string(),
});
export type QaRule = z.infer<typeof qaRuleSchema>;

export const scenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** What the agent is told before the call. */
  brief: z.string(),
  objective: z.string(),
  defaultMerchantId: z.string(),
  defaultPersonaId: z.string(),
  /** The standard lines QA checks. {agentName} is filled with the agent's name. */
  script: z.object({
    greeting: z.string(),
    nonOwnerQuestion: z.string(),
    timeline: z.string(),
    closing: z.string(),
    empathy: z.array(z.string()),
  }),
  policies: z.array(policySchema),
  qaRules: z.array(qaRuleSchema),
  /** Random delay before the auto-dialled call starts ringing. */
  ringDelayMs: z.tuple([z.number().int(), z.number().int()]),
  dispositionSec: z.number().int(),
  softLimitSec: z.number().int(),
  hardLimitSec: z.number().int(),
});
export type Scenario = z.infer<typeof scenarioSchema>;
