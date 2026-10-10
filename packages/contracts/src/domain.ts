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

/** wrap_up = the call has ended and the agent is in Nugget's disposition window. */
export const CALL_STATUSES = ["active", "wrap_up", "scoring", "scored", "failed", "abandoned"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

export const ARCHETYPES = ["curious", "skeptic", "price_squeezer", "impatient", "complainer", "undecided", "custom"] as const;
export type Archetype = (typeof ARCHETYPES)[number];
export const ARCHETYPE_LABELS: Record<Archetype, string> = {
  curious: "Curious & Open",
  skeptic: "Commission Skeptic",
  price_squeezer: "Hard Bargainer",
  impatient: "Busy & Impatient",
  complainer: "Frustrated Complainer",
  undecided: "Hesitant / Not Sure",
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
  toolAccuracy: "Tools & Disposition",
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

// --- Tomato (the demo company) -------------------------------------------------------------

/** seed = shipped demo merchants; live_call = derived from a live call's persona; custom = future "custom client". */
export const MERCHANT_SOURCES = ["seed", "live_call", "custom"] as const;
export type MerchantSource = (typeof MERCHANT_SOURCES)[number];

/** Who picks up the merchant's phone. Only the owner (or someone they authorise) can say yes. */
export const ANSWERER_RELATIONS = ["owner", "manager", "family"] as const;
export type AnswererRelation = (typeof ANSWERER_RELATIONS)[number];

/** Nugget disposition outcomes. not_interested covers "not interested / not sure". */
export const DISPOSITIONS = ["accepted", "rejected", "not_interested", "callback"] as const;
export type Disposition = (typeof DISPOSITIONS)[number];
export const DISPOSITION_LABELS: Record<Disposition, string> = {
  accepted: "Accepted",
  rejected: "Rejected",
  not_interested: "Not interested / Not sure",
  callback: "Callback",
};

export const EMAIL_TEMPLATE_IDS = ["campaign_accepted", "rejection", "follow_up", "callback"] as const;
export type EmailTemplateId = (typeof EMAIL_TEMPLATE_IDS)[number];

/** The browser-style tabs of the agent's workspace. Nugget is always visible beside them. */
export const WORKSPACE_TABS = ["merchant_dashboard", "ad_studio"] as const;
export type WorkspaceTab = (typeof WORKSPACE_TABS)[number];

/** Sim call phases: auto-dialling → ringing (agent picks up) → connected → wrap_up (disposition) → done. */
export const SIM_PHASES = ["dialing", "ringing", "connected", "wrap_up", "done"] as const;
export type SimPhase = (typeof SIM_PHASES)[number];
