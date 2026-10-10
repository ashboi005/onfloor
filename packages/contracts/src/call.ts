import { z } from "zod";
import { CALL_KINDS, CALL_STATUSES, LANGUAGES, SPEAKERS } from "./domain";

/** One shape for sim and live. Times are ms offsets from call start. */
export const transcriptTurnSchema = z.object({
  id: z.string(),
  callId: z.string(),
  seq: z.number().int(),
  speaker: z.enum(SPEAKERS),
  text: z.string(),
  language: z.enum(LANGUAGES).optional(),
  startMs: z.number().int().min(0),
  endMs: z.number().int().min(0),
  /**
   * English subtitle. Same as `text` for English calls; for Hindi/Hinglish it's filled in a
   * second or two later (Merge, never Gemini) and announced by a `turn_translation` (sim) /
   * `transcript_translation` (live) event. Absent until then.
   */
  translation: z.string().optional(),
});
export type TranscriptTurn = z.infer<typeof transcriptTurnSchema>;

export const callSchema = z.object({
  id: z.string(),
  kind: z.enum(CALL_KINDS),
  status: z.enum(CALL_STATUSES),
  agentId: z.string(),
  /** null for live calls. */
  scenarioId: z.string().nullable(),
  /** sim: the persona played. live: the persona extracted afterwards. */
  personaId: z.string().nullable(),
  /** sim: the merchant profile on the other end. null for live calls. */
  merchantId: z.string().nullable(),
  /** sim: the "guidance on" toggle. */
  guidance: z.boolean(),
  /** Set on a sim call that replays a live call. */
  replayOfCallId: z.string().nullable(),
  language: z.enum(LANGUAGES),
  /** Persona name, or the Telegram display name. */
  customerLabel: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  recordingUrl: z.string().nullable(),
  overallScore: z.number().int().nullable(),
});
export type Call = z.infer<typeof callSchema>;

export const callWithTranscriptSchema = callSchema.extend({
  transcript: z.array(transcriptTurnSchema),
});
export type CallWithTranscript = z.infer<typeof callWithTranscriptSchema>;
