/**
 * Every domain enumeration, once. Drizzle columns, Zod schemas and UI labels all
 * derive from these tuples, so adding a value here is the only edit required.
 */

export const LANGUAGES = ["en", "hi", "hinglish"] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_LABELS: Record<Language, string> = {
  en: "English",
  hi: "हिन्दी (Hindi)",
  hinglish: "Hinglish",
};

export const SPEAKERS = ["agent", "customer"] as const;
export type Speaker = (typeof SPEAKERS)[number];

export const CALL_KINDS = ["sim", "live"] as const;
export type CallKind = (typeof CALL_KINDS)[number];

export const CALL_STATUSES = ["active", "scoring", "scored", "failed", "abandoned"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const ARCHETYPES = ["impatient", "price_squeezer", "skeptic", "custom"] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  impatient: "Impatient Decision-Maker",
  price_squeezer: "Price-Squeezer",
  skeptic: "High-Maintenance Skeptic",
  custom: "Custom",
};

/** seed = shipped; live_call = extracted from a real call; custom = tuned and saved by a user. */
export const PERSONA_SOURCES = ["seed", "live_call", "custom"] as const;
export type PersonaSource = (typeof PERSONA_SOURCES)[number];

export const SCORE_DIMENSIONS = [
  "objectionHandling",
  "toolAccuracy",
  "compliance",
  "softSkills",
] as const;
export type ScoreDimension = (typeof SCORE_DIMENSIONS)[number];
export const SCORE_DIMENSION_LABELS: Record<ScoreDimension, string> = {
  objectionHandling: "Objection Handling",
  toolAccuracy: "Tool & CRM Accuracy",
  compliance: "Compliance & Policy",
  softSkills: "Soft Skills",
};
/** Renormalised over the applicable dimensions when one is null (toolAccuracy on live calls). */
export const SCORE_WEIGHTS: Record<ScoreDimension, number> = {
  objectionHandling: 0.35,
  toolAccuracy: 0.25,
  compliance: 0.25,
  softSkills: 0.15,
};

export const GRADES = ["A", "B", "C", "D", "F"] as const;
export type Grade = (typeof GRADES)[number];

export const MOMENT_SEVERITIES = ["mistake", "warning", "good"] as const;
export const HINT_KINDS = ["pitch", "objection", "upsell", "close"] as const;
export type HintKind = (typeof HINT_KINDS)[number];
export const POLICY_SEVERITIES = ["warn", "critical"] as const;
export const PERSONA_STATES = ["idle", "thinking", "speaking"] as const;
export type PersonaState = (typeof PERSONA_STATES)[number];
