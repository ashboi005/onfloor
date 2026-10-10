import { z } from "zod";
import { callSchema, transcriptTurnSchema } from "./call";
import { HINT_KINDS, POLICY_SEVERITIES, SPEAKERS } from "./domain";

/**
 * `/ws/live/:callId` (or `/ws/live/active`). Tushar's server → the HUD.
 * UI code consumes these only through `useLiveCall()`.
 * `fixtures/live-call.ts` is the reference stream: real output should look like it.
 */

export const hintSchema = z.object({
  id: z.string(),
  kind: z.enum(HINT_KINDS),
  /** "Commission pushback" */
  title: z.string(),
  /** "Pivot to guaranteed reach: 12k diners/month in 5 km" */
  body: z.string(),
  triggerTurnId: z.string().nullable(),
  /** The HUD hides it after this unless pinned. */
  ttlMs: z.number().int(),
  /** Knowledge-base titles the hint was grounded in (RAG), e.g. ["OnFloor Ads playbook"]. */
  sources: z.array(z.string()).optional(),
});
export type Hint = z.infer<typeof hintSchema>;

export const guardrailAlertSchema = z.object({
  id: z.string(),
  severity: z.enum(POLICY_SEVERITIES),
  policyId: z.string(),
  message: z.string(),
  triggerTurnId: z.string().nullable(),
});
export type GuardrailAlert = z.infer<typeof guardrailAlertSchema>;

const pct = z.number().min(0).max(100);

export const liveEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("call_started"), call: callSchema }),
  /**
   * What OnFloor remembers about this customer from earlier calls (RAG, customer scope).
   * Sent right after call_started; `items` is empty for a first-time caller.
   */
  z.object({
    type: z.literal("customer_memory"),
    customerLabel: z.string(),
    items: z.array(z.object({ text: z.string(), source: z.string(), at: z.string().nullable() })),
  }),
  /** In-flight text; overwrite per speaker. */
  z.object({ type: z.literal("transcript_partial"), speaker: z.enum(SPEAKERS), text: z.string() }),
  z.object({ type: z.literal("transcript_final"), turn: transcriptTurnSchema }),
  /** The English subtitle for an earlier final (arrives after it, Hindi/Hinglish calls). */
  z.object({ type: z.literal("transcript_translation"), turnId: z.string(), translation: z.string() }),
  z.object({ type: z.literal("hint"), hint: hintSchema }),
  z.object({ type: z.literal("guardrail"), alert: guardrailAlertSchema }),
  z.object({
    type: z.literal("sentiment"),
    patience: pct,
    frustration: pct,
    engagement: pct,
    atMs: z.number().int(),
  }),
  z.object({
    type: z.literal("talk_metrics"),
    agentTalkPct: pct,
    currentSilenceMs: z.number().int(),
    alert: z.enum(["dead_air", "monologue"]).nullable(),
  }),
  z.object({ type: z.literal("call_ended"), callId: z.string(), durationMs: z.number().int() }),
  z.object({ type: z.literal("scorecard_ready"), callId: z.string() }),
  z.object({ type: z.literal("persona_ready"), personaId: z.string(), callId: z.string() }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
]);
export type LiveEvent = z.infer<typeof liveEventSchema>;

/** A scripted event at a time offset. Fixtures and server-side stubs replay these. */
export interface Timed<T> {
  atMs: number;
  event: T;
}
