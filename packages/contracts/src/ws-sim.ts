import { z } from "zod";
import { transcriptTurnSchema } from "./call";
import { crmActionSchema, crmRequestSchema } from "./crm";
import { CALL_STATUSES, PERSONA_STATES } from "./domain";

/**
 * `/ws/sim/:callId`. The server is authoritative: it owns the turn loop, clock and
 * transcript. UI code never touches this directly; it goes through `useSimCall()`.
 */

export const simClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("agent_turn"),
    text: z.string().trim().min(1).max(5000),
    startMs: z.number().int(),
    endMs: z.number().int(),
  }),
  z.object({ type: z.literal("crm_action"), action: crmActionSchema }),
  /** The agent talked over the persona. */
  z.object({ type: z.literal("interrupt") }),
  z.object({ type: z.literal("end") }),
]);
export type SimClientMessage = z.infer<typeof simClientMessageSchema>;

export const simServerMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), status: z.enum(CALL_STATUSES), elapsedMs: z.number().int() }),
  z.object({ type: z.literal("turn"), turn: transcriptTurnSchema }),
  z.object({ type: z.literal("persona_audio"), turnId: z.string(), audioUrl: z.string() }),
  z.object({ type: z.literal("persona_state"), state: z.enum(PERSONA_STATES) }),
  /** The persona just asked for an account change. */
  z.object({ type: z.literal("crm_request"), request: crmRequestSchema, atMs: z.number().int() }),
  z.object({ type: z.literal("patience"), value: z.number().min(0).max(100) }),
  z.object({ type: z.literal("timer"), elapsedMs: z.number().int(), remainingMs: z.number().int() }),
  z.object({
    type: z.literal("ended"),
    reason: z.enum(["agent", "persona_hung_up", "time"]),
    callId: z.string(),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
]);
export type SimServerMessage = z.infer<typeof simServerMessageSchema>;
