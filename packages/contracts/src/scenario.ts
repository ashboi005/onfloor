import { z } from "zod";
import { crmStateSchema } from "./crm";
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

export const scenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** What the agent is told before the call. */
  brief: z.string(),
  objective: z.string(),
  defaultPersonaId: z.string(),
  initialCrm: crmStateSchema,
  policies: z.array(policySchema),
  softLimitSec: z.number().int(),
  hardLimitSec: z.number().int(),
});
export type Scenario = z.infer<typeof scenarioSchema>;
