import { z } from "zod";
import { crmRequestSchema } from "./tomato";
import { ARCHETYPES, LANGUAGES, PERSONA_SOURCES } from "./domain";

/**
 * The Pillar 1 ⇄ Pillar 2 seam: HOW a customer behaves.
 *
 * Seed personas are behaviour presets (archetype, traits, objections, tactics) that the picker
 * pairs with a merchant profile (`Merchant`: WHO they are and their restaurant's data). Live-call
 * personas come from Tushar's extraction and carry their own identity; the simulator derives a
 * merchant profile for them on replay. The simulator plays any row of this shape.
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
  /** Asks they make during the call (email change, start date, duration, callback slot). Audited against the tools. */
  crmRequests: z.array(crmRequestSchema),
  openingLine: z.string(),
  source: z.enum(PERSONA_SOURCES),
  sourceCallId: z.string().nullable(),
  createdAt: z.string(),
});
export type Persona = z.infer<typeof personaSchema>;

export const createPersonaSchema = personaSchema.omit({ id: true, createdAt: true });
export type CreatePersona = z.infer<typeof createPersonaSchema>;

/**
 * Knobs the UI can turn on any persona before a call (all optional). Applied for that one
 * session via `startSim({ tuning })`, or saved as a new persona (`source: "custom"`) with
 * `POST /api/personas` after `applyPersonaTuning()`.
 *
 * Tone follows `traits.aggression`: 0–3 polite, 4–6 firm but civil, 7–8 blunt, 9–10 confrontational.
 */
export const personaTuningSchema = z.object({
  archetype: z.enum(ARCHETYPES).optional(),
  traits: z
    .object({ patience: trait, aggression: trait, priceSensitivity: trait, talkativeness: trait })
    .partial()
    .optional(),
  speechStyle: z
    .object({ pace: z.enum(["slow", "normal", "fast"]), interrupts: z.boolean() })
    .partial()
    .optional(),
  voiceId: z.string().regex(/^(elevenlabs|sarvam):.+/).optional(),
});
export type PersonaTuning = z.infer<typeof personaTuningSchema>;

/** Pure: the persona as it will behave with `tuning` applied. Safe to call in the browser for previews. */
export function applyPersonaTuning<P extends CreatePersona>(persona: P, tuning?: PersonaTuning | null): P {
  if (!tuning) return persona;
  return {
    ...persona,
    ...(tuning.archetype && { archetype: tuning.archetype }),
    ...(tuning.voiceId && { voiceId: tuning.voiceId }),
    traits: { ...persona.traits, ...tuning.traits },
    speechStyle: { ...persona.speechStyle, ...tuning.speechStyle },
  };
}
