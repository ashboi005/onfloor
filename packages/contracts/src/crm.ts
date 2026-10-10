import { z } from "zod";
import { EMAIL_TEMPLATE_IDS, WORKSPACE_TABS } from "./domain";
import { callbackSlotSchema, campaignDraftSchema, campaignSchema, dispositionSchema, merchantDashboardSchema } from "./tomato";

/**
 * The agent's "CRM": the three Tomato tools in the simulator workspace.
 *
 *   Nugget              incoming-ticket pop-up (UID, merchant, restaurant, top items, DRR) and,
 *                       after hang-up, the disposition panel (email template + outcome, 90s timer)
 *   Merchant Dashboard  look up a UID → full merchant details to confirm on the call
 *   Ad Studio           configure and launch the campaign (UID, email, Max Grow, start/end dates)
 *
 * The UI reports each committed action over /ws/sim (`{ type: "workspace", action }`); the server
 * answers with a `workspace_result`, logs the action, and the scoring audit replays the log.
 */
export const workspaceActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tab_opened"), tab: z.enum(WORKSPACE_TABS) }),
  z.object({ kind: z.literal("dashboard_lookup"), uid: z.string().trim() }),
  z.object({ kind: z.literal("campaign_launch"), campaign: campaignDraftSchema }),
  /** Wrap-up only. */
  z.object({ kind: z.literal("email_sent"), template: z.enum(EMAIL_TEMPLATE_IDS) }),
  /** Wrap-up only. Closes the call and sends it for scoring. */
  z.object({ kind: z.literal("dispose"), disposition: dispositionSchema }),
]);
export type WorkspaceAction = z.infer<typeof workspaceActionSchema>;
export type WorkspaceActionKind = WorkspaceAction["kind"];

export const workspaceResultSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tab_opened"), ok: z.literal(true) }),
  /** merchant = null: no merchant with that UID. */
  z.object({ kind: z.literal("dashboard_lookup"), ok: z.boolean(), uid: z.string(), merchant: merchantDashboardSchema.nullable() }),
  /** ok = false: Ad Studio refused it (`error` says why, e.g. "Minimum campaign duration is 1 month."). */
  z.object({ kind: z.literal("campaign_launch"), ok: z.boolean(), error: z.string().nullable(), campaign: campaignSchema.nullable() }),
  z.object({
    kind: z.literal("email_sent"),
    ok: z.boolean(),
    error: z.string().nullable(),
    email: z.object({ to: z.string(), subject: z.string(), body: z.string() }).nullable(),
  }),
  z.object({ kind: z.literal("dispose"), ok: z.boolean(), error: z.string().nullable() }),
]);
export type WorkspaceResult = z.infer<typeof workspaceResultSchema>;

/** A logged workspace action (agent), or a fact the persona established (persona). Stored per call. */
export const workspaceLogEntrySchema = z.object({
  actor: z.enum(["agent", "persona"]),
  kind: z.string(),
  body: z.record(z.string(), z.unknown()),
  atMs: z.number().int(),
});
export type WorkspaceLogEntry = z.infer<typeof workspaceLogEntrySchema>;

// --- Guidance (the "guidance on" toggle) -----------------------------------------------------

/** The call flow, in order. `tool` steps are ticked by workspace actions, `script` steps by what was said. */
export const GUIDANCE_STEPS = [
  { id: "greeting", kind: "script", label: "Greet: name + calling from the Tomato team" },
  { id: "verify_identity", kind: "script", label: "Confirm their name and restaurant" },
  { id: "verify_owner", kind: "script", label: "Check they're the owner / can make financial decisions" },
  { id: "lookup", kind: "tool", label: "Paste the UID from Nugget into Merchant Dashboard" },
  { id: "confirm_details", kind: "script", label: "Confirm email, phone and restaurant details" },
  { id: "pitch", kind: "script", label: "Pitch Max Grow: 20% only on sales above their DRR" },
  { id: "campaign", kind: "tool", label: "Ad Studio: UID, email, Max Grow, dates (min 1 month), launch" },
  { id: "dictate_timeline", kind: "script", label: "Dictate the timeline: starts …, runs through …" },
  { id: "closing", kind: "script", label: "Close: thank them, ask if there's anything else" },
  { id: "disposition", kind: "tool", label: "Send the email template and dispose within 90s" },
] as const;
export type GuidanceStepId = (typeof GUIDANCE_STEPS)[number]["id"];
export const GUIDANCE_STEP_IDS = GUIDANCE_STEPS.map((s) => s.id) as [GuidanceStepId, ...GuidanceStepId[]];

/**
 * UI elements guidance can point at. The frontend puts `data-guide="<target>"` on each and
 * highlights the one in `guidance.next.target`.
 */
export const GUIDANCE_TARGETS = [
  "nugget.ticket",
  "nugget.uid",
  "tab.merchant_dashboard",
  "dashboard.search",
  "dashboard.contact",
  "calculator",
  "tab.ad_studio",
  "ad_studio.uid",
  "ad_studio.email",
  "ad_studio.campaign_type",
  "ad_studio.dates",
  "ad_studio.launch",
  "disposition.email",
  "disposition.outcome",
  "disposition.callback",
  "disposition.submit",
] as const;
export type GuidanceTarget = (typeof GUIDANCE_TARGETS)[number];

export const guidanceTipSchema = z.object({
  id: z.string(),
  atMs: z.number().int(),
  /** answer = what to say to the customer's question; warning = something the agent just got wrong. */
  kind: z.enum(["answer", "objection", "warning", "info"]),
  text: z.string(),
});
export type GuidanceTip = z.infer<typeof guidanceTipSchema>;

export const guidanceStateSchema = z.object({
  steps: z.array(z.object({ id: z.enum(GUIDANCE_STEP_IDS), status: z.enum(["todo", "done", "skipped"]) })),
  /** The one thing to do now. */
  next: z.object({ stepId: z.enum(GUIDANCE_STEP_IDS), text: z.string(), target: z.enum(GUIDANCE_TARGETS).nullable() }).nullable(),
  /** Newest first, at most 3. Several can be on screen at once. */
  tips: z.array(guidanceTipSchema),
});
export type GuidanceState = z.infer<typeof guidanceStateSchema>;

/** Guidance-on only: the AI's read of the call, a couple of seconds after hang-up. */
export const dispositionSuggestionSchema = z.object({
  outcome: dispositionSchema.shape.outcome,
  template: z.enum(EMAIL_TEMPLATE_IDS),
  callback: callbackSlotSchema.nullable(),
  reason: z.string(),
});
export type DispositionSuggestion = z.infer<typeof dispositionSuggestionSchema>;
