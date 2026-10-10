import { z } from "zod";
import { LANGUAGES } from "./domain";
import { personaSchema, personaTuningSchema } from "./persona";
import { scenarioSchema } from "./scenario";
import { merchantSummarySchema, nuggetTicketSchema } from "./tomato";

/** Every non-2xx body from the API. */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>["error"];

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.enum(["agent", "manager"]),
});
export type Agent = z.infer<typeof agentSchema>;

// --- Simulator --------------------------------------------------------------

/**
 * The picker, in order: pick the PERSON (a seed merchant, or a live-call persona to replay) →
 * for a merchant, pick/tune the behaviour persona → guidance on/off → start.
 */
export const startSimSchema = z.object({
  /** Defaults to the first scenario. */
  scenarioId: z.string().optional(),
  /**
   * The merchant profile to call. Omit when `personaId` is a live-call persona (its merchant
   * profile is derived from the persona). Otherwise defaults to the scenario's default merchant.
   */
  merchantId: z.string().optional(),
  /** Behaviour preset (or a live-call persona). Defaults to the merchant's default persona. */
  personaId: z.string().optional(),
  language: z.enum(LANGUAGES),
  /** Guidance on: the UI highlights the next step, the server streams `guidance` + a disposition suggestion. */
  guidance: z.boolean().default(true),
  replayOfCallId: z.string().optional(),
  /** Per-call persona tweaks (traits, archetype, pace, voice). Not saved to the persona. */
  tuning: personaTuningSchema.optional(),
});
export type StartSim = z.input<typeof startSimSchema>;

export const simSessionStartSchema = z.object({
  callId: z.string(),
  scenario: scenarioSchema,
  /** The behaviour being played (with tuning applied). Identity on the call comes from the merchant. */
  persona: personaSchema,
  merchant: merchantSummarySchema,
  /** What Nugget pops up while the call is being dialled. */
  ticket: nuggetTicketSchema,
  /** The agent's name, for the scripted greeting. */
  agentName: z.string(),
  guidance: z.boolean(),
  /** Today's date on the call (Asia/Kolkata), the reference for campaign and callback dates. */
  callDate: z.string(),
  /** Ready-to-open ElevenLabs realtime STT URL with a single-use token. "" in mock mode. */
  sttUrl: z.string(),
});
export type SimSessionStart = z.infer<typeof simSessionStartSchema>;

export const endSimResponseSchema = z.object({
  callId: z.string(),
  status: z.string(),
});
export type EndSimResponse = z.infer<typeof endSimResponseSchema>;

// --- Live -------------------------------------------------------------------

export const replayFileResponseSchema = z.object({ callId: z.string() });
