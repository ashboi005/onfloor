import { z } from "zod";
import { crmRequestSchema } from "./crm";
import { ARCHETYPES, LANGUAGES, PERSONA_SOURCES } from "./domain";

/**
 * The Pillar 1 ⇄ Pillar 2 seam.
 *
 * Seed personas are written by Ashwath; live-call personas by Tushar's extraction
 * step. The simulator plays any row of this shape, which is the whole replay feature.
 */
const trait = z.number().min(0).max(10);

export const personaSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role: z.string(),
  business: z.object({
    type: z.string(),
    city: z.string().optional(),
    currentPlan: z.string().optional(),
  }),
  archetype: z.enum(ARCHETYPES),
  language: z.enum(LANGUAGES),
  /** "elevenlabs:<voiceId>" | "sarvam:<speaker>". The prefix picks the TTS provider. */
  voiceId: z.string().regex(/^(elevenlabs|sarvam):.+/),
  traits: z.object({
    patience: trait,
    aggression: trait,
    priceSensitivity: trait,
    talkativeness: trait,
  }),
  backstory: z.string(),
  goals: z.array(z.string()),
  /** The pushbacks they raise, in their own words. */
  objections: z.array(z.string()),
  /** e.g. "claims a competitor charges 8%", "threatens to hang up". */
  tactics: z.array(z.string()),
  speechStyle: z.object({
    pace: z.enum(["slow", "normal", "fast"]),
    interrupts: z.boolean(),
    /** Verbatim lines. For live-call personas these come straight from the transcript. */
    catchphrases: z.array(z.string()),
  }),
  crmRequests: z.array(crmRequestSchema),
  openingLine: z.string(),
  source: z.enum(PERSONA_SOURCES),
  sourceCallId: z.string().nullable(),
  createdAt: z.string(),
});
export type Persona = z.infer<typeof personaSchema>;

export const createPersonaSchema = personaSchema.omit({ id: true, createdAt: true });
export type CreatePersona = z.infer<typeof createPersonaSchema>;
