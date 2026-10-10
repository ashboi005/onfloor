import { z } from "zod";

/**
 * The Mock CRM: a merchant ad portal. Fields are fixed for the MVP.
 * `CRM_FIELDS` drives both Harnoor's form controls and the scoring CRM audit.
 */
export const CRM_FIELDS = {
  monthlyBudget: { type: "number", label: "Monthly budget (₹)", min: 5000, max: 500000, step: 1000 },
  campaignStatus: { type: "enum", label: "Campaign status", values: ["active", "paused"] },
  plan: { type: "enum", label: "Plan", values: ["basic", "premium", "premium_plus"] },
  /** Policy: anything above 10 needs manager approval. The UI must NOT block it. */
  discountPct: { type: "number", label: "Discount (%)", min: 0, max: 30, step: 1, approvalAbove: 10 },
  weekendNotifications: { type: "boolean", label: "Weekend notifications" },
  targetRadiusKm: { type: "number", label: "Target radius (km)", min: 1, max: 25, step: 1 },
  adCategories: {
    type: "multi",
    label: "Ad categories",
    values: ["dine_in", "delivery", "catering", "offers"],
  },
  notes: { type: "text", label: "Notes" },
} as const;

export const CRM_FIELD_KEYS = [
  "monthlyBudget",
  "campaignStatus",
  "plan",
  "discountPct",
  "weekendNotifications",
  "targetRadiusKm",
  "adCategories",
  "notes",
] as const satisfies readonly (keyof typeof CRM_FIELDS)[];
export type CrmFieldKey = (typeof CRM_FIELD_KEYS)[number];

export const crmStateSchema = z.object({
  monthlyBudget: z.number().int().min(5000).max(500000),
  campaignStatus: z.enum(CRM_FIELDS.campaignStatus.values),
  plan: z.enum(CRM_FIELDS.plan.values),
  discountPct: z.number().int().min(0).max(30),
  weekendNotifications: z.boolean(),
  targetRadiusKm: z.number().int().min(1).max(25),
  adCategories: z.array(z.enum(CRM_FIELDS.adCategories.values)),
  notes: z.string(),
});
export type CrmState = z.infer<typeof crmStateSchema>;

/** An account change a persona will ask for mid-call. `phrasing` is what the customer says. */
export const crmRequestSchema = z.object({
  id: z.string(),
  field: z.enum(CRM_FIELD_KEYS),
  value: z.unknown(),
  phrasing: z.string(),
});
export type CrmRequest = z.infer<typeof crmRequestSchema>;

/** Sent on every COMMITTED change (slider release, toggle, blur), not per keystroke. */
export const crmActionSchema = z.object({
  field: z.enum(CRM_FIELD_KEYS),
  from: z.unknown(),
  to: z.unknown(),
  atMs: z.number().int().min(0),
});
export type CrmAction = z.infer<typeof crmActionSchema>;
