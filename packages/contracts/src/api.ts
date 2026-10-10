import { z } from "zod";
import { LANGUAGES } from "./domain";
import { personaSchema } from "./persona";
import { scenarioSchema } from "./scenario";

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

export const startSimSchema = z.object({
  scenarioId: z.string(),
  /** Defaults to the scenario's default persona. */
  personaId: z.string().optional(),
  language: z.enum(LANGUAGES),
  replayOfCallId: z.string().optional(),
});
export type StartSim = z.infer<typeof startSimSchema>;

export const simSessionStartSchema = z.object({
  callId: z.string(),
  scenario: scenarioSchema,
  persona: personaSchema,
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
