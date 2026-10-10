import { z } from "zod";
import { ANSWERER_RELATIONS, DISPOSITIONS, type Disposition, type EmailTemplateId, LANGUAGES, MERCHANT_SOURCES } from "./domain";

/**
 * Tomato: the demo company (a food-delivery marketplace; B2B sales of ad campaigns to its
 * restaurant merchants). Everything the simulator knows about the business lives here, as data
 * and pure functions, so the server, the mock client and the UI compute the same numbers.
 *
 * The product: Max Grow. Billing is 20% of INCREMENTAL daily sales above the merchant's DRR
 * (Daily Run Rate, average daily sales before the campaign). At or below the DRR: no deduction.
 * Billed weekly, settled from the Tomato payout. Commission is non-negotiable. The merchant can
 * stop the campaign whenever they want. Minimum campaign duration: one month.
 */

export const COMPANY_NAME = "Tomato";

export const MAX_GROW = {
  name: "Max Grow",
  commissionPct: 20,
  minDurationMonths: 1,
  billing: "weekly",
  settledFrom: "Tomato payout",
  negotiable: false,
  stopAnytime: true,
} as const;

/** Max Grow billing for a given average daily sales figure. Pure; drive the calculator with it. */
export function maxGrowBill(input: { drr: number; avgDailySales: number; days?: number }) {
  const days = input.days ?? 7;
  const incrementalPerDay = Math.max(0, Math.round(input.avgDailySales - input.drr));
  const commissionPerDay = Math.round((incrementalPerDay * MAX_GROW.commissionPct) / 100);
  return {
    baselinePerDay: input.drr,
    avgDailySales: input.avgDailySales,
    incrementalPerDay,
    commissionPerDay,
    /** What the merchant keeps of the extra sales, per day. */
    merchantGainPerDay: incrementalPerDay - commissionPerDay,
    days,
    commissionForPeriod: commissionPerDay * days,
    /** true when sales stayed at or below the DRR (nothing is deducted). */
    noDeduction: incrementalPerDay === 0,
  };
}
export type MaxGrowBill = ReturnType<typeof maxGrowBill>;

// --- Merchants ---------------------------------------------------------------------------

export const topItemSchema = z.object({
  name: z.string(),
  price: z.number().int().positive(),
  /** ₹ of this item sold per day, on average. */
  dailySales: z.number().int().nonnegative(),
});

/** An ask the customer voices during the call; audited against what the agent did in the tools. */
export const SIM_REQUEST_KINDS = ["email_update", "start_date", "duration", "callback"] as const;
export type SimRequestKind = (typeof SIM_REQUEST_KINDS)[number];

/**
 * `value` formats (strings, so an LLM can extract them):
 *   email_update  "name@domain.com"     the correct email; the dashboard one is outdated
 *   start_date    "+N" days from the call date, or "YYYY-MM-DD"
 *   duration      "N" months
 *   callback      "+N HH:MM" (days from the call date, 24h time), or "YYYY-MM-DD HH:MM"
 * `phrasing` may contain {date} / {time}, filled in with the resolved value at call time.
 */
export const crmRequestSchema = z.object({
  id: z.string(),
  kind: z.enum(SIM_REQUEST_KINDS),
  value: z.string(),
  phrasing: z.string(),
});
export type CrmRequest = z.infer<typeof crmRequestSchema>;

export const merchantSchema = z.object({
  id: z.string(),
  /** Tomato merchant UID: shown in Nugget, pasted into Merchant Dashboard and Ad Studio. */
  uid: z.string().regex(/^\d{8}$/),
  restaurantName: z.string(),
  /** The merchant (owner) on record. */
  ownerName: z.string(),
  email: z.string(),
  phone: z.string(),
  city: z.string(),
  locality: z.string(),
  address: z.string(),
  cuisines: z.array(z.string()),
  outletType: z.enum(["dine_in_delivery", "delivery_only", "cloud_kitchen"]),
  onTomatoSince: z.string(),
  rating: z.number().min(1).max(5),
  ratingCount: z.number().int(),
  costForTwo: z.number().int(),
  /** Daily Run Rate: average daily sales (₹) before any campaign. Max Grow's baseline. */
  drr: z.number().int().min(100),
  avgOrderValue: z.number().int(),
  ordersPerDay: z.number().int(),
  topItems: z.array(topItemSchema).min(1),
  menu: z.object({ items: z.number().int(), itemsWithPhotos: z.number().int() }),
  /** Last 30 days. */
  orderRejectionPct: z.number().min(0).max(100),
  payoutCycle: z.literal("weekly"),
  activeCampaigns: z.array(z.string()),
  /** Who actually picks up the phone. The ticket only shows the owner on record. */
  answerer: z.object({
    name: z.string(),
    relation: z.enum(ANSWERER_RELATIONS),
    isDecisionMaker: z.boolean(),
    /** Non-decision-makers: when the owner can be reached, in their words. null = they don't know. */
    ownerAvailability: z.string().nullable(),
  }),
  language: z.enum(LANGUAGES),
  voiceId: z.string().regex(/^(elevenlabs|sarvam):.+/),
  /** For the AI customer only (never shown in the tools): their situation, in a few sentences. */
  background: z.string(),
  /** Questions / worries they bring up, in their own words. */
  concerns: z.array(z.string()),
  requests: z.array(crmRequestSchema),
  /** Behaviour preset the picker pre-selects for this merchant. */
  defaultPersonaId: z.string(),
  /** One line for the picker card. */
  tagline: z.string(),
  /** The merchant we demo (owner, curious, asks how to increase visibility). */
  demo: z.boolean(),
  source: z.enum(MERCHANT_SOURCES),
  /** live_call: the extracted persona this merchant profile was derived from. */
  sourcePersonaId: z.string().nullable(),
  createdAt: z.string(),
});
export type Merchant = z.infer<typeof merchantSchema>;
export const createMerchantSchema = merchantSchema.omit({ createdAt: true });
export type CreateMerchant = z.infer<typeof createMerchantSchema>;

/** The picker card. No dashboard data: the agent finds that in the tools during the call. */
export const merchantSummarySchema = merchantSchema.pick({
  id: true,
  restaurantName: true,
  ownerName: true,
  city: true,
  locality: true,
  cuisines: true,
  drr: true,
  rating: true,
  defaultPersonaId: true,
  tagline: true,
  demo: true,
  source: true,
  sourcePersonaId: true,
  language: true,
}).extend({ answeredBy: z.enum(ANSWERER_RELATIONS) });
export type MerchantSummary = z.infer<typeof merchantSummarySchema>;

export const toMerchantSummary = (m: Merchant): MerchantSummary => ({
  id: m.id,
  restaurantName: m.restaurantName,
  ownerName: m.ownerName,
  city: m.city,
  locality: m.locality,
  cuisines: m.cuisines,
  drr: m.drr,
  rating: m.rating,
  defaultPersonaId: m.defaultPersonaId,
  tagline: m.tagline,
  demo: m.demo,
  source: m.source,
  sourcePersonaId: m.sourcePersonaId,
  language: m.language,
  answeredBy: m.answerer.relation,
});

/** Nugget's incoming-ticket pop-up. */
export const nuggetTicketSchema = z.object({
  uid: z.string(),
  merchantName: z.string(),
  restaurantName: z.string(),
  topItems: z.array(topItemSchema),
  drr: z.number().int(),
});
export type NuggetTicket = z.infer<typeof nuggetTicketSchema>;

export const toNuggetTicket = (m: Merchant): NuggetTicket => ({
  uid: m.uid,
  merchantName: m.ownerName,
  restaurantName: m.restaurantName,
  topItems: m.topItems,
  drr: m.drr,
});

/** What Merchant Dashboard shows after a UID lookup. */
export const merchantDashboardSchema = merchantSchema.pick({
  uid: true,
  restaurantName: true,
  ownerName: true,
  email: true,
  phone: true,
  city: true,
  locality: true,
  address: true,
  cuisines: true,
  outletType: true,
  onTomatoSince: true,
  rating: true,
  ratingCount: true,
  costForTwo: true,
  drr: true,
  avgOrderValue: true,
  ordersPerDay: true,
  topItems: true,
  menu: true,
  orderRejectionPct: true,
  payoutCycle: true,
  activeCampaigns: true,
});
export type MerchantDashboard = z.infer<typeof merchantDashboardSchema>;

export const toMerchantDashboard = (m: Merchant): MerchantDashboard => merchantDashboardSchema.parse(m);

// --- Dates (call dates are Asia/Kolkata calendar dates, "YYYY-MM-DD") ---------------------

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
};
const fmt = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parse(iso);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Calendar months, clamped (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(iso: string, months: number): string {
  const { y, m, d } = parse(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return fmt(ny, nm, Math.min(d, daysIn(ny, nm)));
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;

/** "2026-10-10" → "October 10th", the way the agent dictates it. */
export function spokenDate(iso: string): string {
  const { m, d } = parse(iso);
  return `${MONTHS[m - 1]} ${ordinal(d)}`;
}

/** "16:00" → "4 PM", "09:30" → "9:30 AM". */
export function spokenTime(time: string): string {
  const [h, min] = time.split(":").map(Number);
  const hour = h! % 12 || 12;
  return `${hour}${min ? `:${String(min).padStart(2, "0")}` : ""} ${h! < 12 ? "AM" : "PM"}`;
}

/** What a request's `value` means on a given call date. */
export function resolveRequest(req: CrmRequest, callDate: string): { date?: string; time?: string; email?: string; months?: number } {
  const v = req.value.trim();
  const day = (s: string) => (/^\+\d+$/.test(s) ? addDays(callDate, Number(s.slice(1))) : s);
  switch (req.kind) {
    case "email_update":
      return { email: v.toLowerCase() };
    case "start_date":
      return { date: day(v) };
    case "duration":
      return { months: Math.max(1, Number.parseInt(v, 10) || 1) };
    case "callback": {
      const [d = "+1", t = "11:00"] = v.split(/\s+/);
      return { date: day(d), time: t };
    }
  }
}

/** The request's phrasing with {date}/{time} filled in for this call. */
export function requestPhrasing(req: CrmRequest, callDate: string): string {
  const r = resolveRequest(req, callDate);
  return req.phrasing.replaceAll("{date}", r.date ? spokenDate(r.date) : "").replaceAll("{time}", r.time ? spokenTime(r.time) : "");
}

// --- Ad Studio ----------------------------------------------------------------------------

/** Ad Studio's campaign types. Only Max Grow is pitched on these calls; the others exist in the tool. */
export const CAMPAIGN_TYPES = ["max_grow", "smart_offers", "brand_spotlight"] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];
export const CAMPAIGN_TYPE_LABELS: Record<CampaignType, string> = {
  max_grow: "Max Grow",
  smart_offers: "Smart Offers",
  brand_spotlight: "Brand Spotlight",
};

export const campaignDraftSchema = z.object({
  uid: z.string().trim(),
  email: z.string().trim(),
  campaignType: z.enum(CAMPAIGN_TYPES),
  startDate: isoDate,
  endDate: isoDate,
});
export type CampaignDraft = z.infer<typeof campaignDraftSchema>;

export const campaignSchema = campaignDraftSchema.extend({
  id: z.string(),
  restaurantName: z.string(),
  status: z.enum(["scheduled", "live"]),
  launchedAtMs: z.number().int(),
});
export type Campaign = z.infer<typeof campaignSchema>;

/** Ad Studio's own validation (it blocks what the real tool would block). null = OK. */
export function validateCampaign(draft: CampaignDraft, ctx: { today: string; uidExists: boolean }): string | null {
  if (!/^\d{8}$/.test(draft.uid)) return "Merchant UID must be 8 digits.";
  if (!ctx.uidExists) return `No merchant found for UID ${draft.uid}.`;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email)) return "Enter a valid email address.";
  if (draft.startDate < ctx.today) return "Start date can't be in the past.";
  if (draft.endDate < addMonths(draft.startDate, MAX_GROW.minDurationMonths)) return "Minimum campaign duration is 1 month.";
  return null;
}

// --- Nugget disposition --------------------------------------------------------------------

/** Seconds the agent has after hang-up to send the email and dispose the call. */
export const DISPOSITION_SECONDS = 90;

export const DISPOSITION_TEMPLATE: Record<Disposition, EmailTemplateId> = {
  accepted: "campaign_accepted",
  rejected: "rejection",
  not_interested: "follow_up",
  callback: "callback",
};

export const callbackSlotSchema = z.object({ date: isoDate, time: hhmm });
export type CallbackSlot = z.infer<typeof callbackSlotSchema>;

export const dispositionSchema = z.object({
  outcome: z.enum(DISPOSITIONS),
  /** Required when outcome is "callback". */
  callback: callbackSlotSchema.nullable(),
});
export type DispositionInput = z.infer<typeof dispositionSchema>;

export interface EmailContext {
  ownerName: string;
  restaurantName: string;
  uid: string;
  drr: number;
  agentName: string;
  campaign?: Pick<CampaignDraft, "startDate" | "endDate"> | null;
  callback?: CallbackSlot | null;
}

export const EMAIL_TEMPLATES: Record<EmailTemplateId, { label: string; subject: string; body: string }> = {
  campaign_accepted: {
    label: "Campaign accepted",
    subject: "Your Max Grow campaign is confirmed, {restaurantName}",
    body: `Dear {ownerName},

Thank you for choosing Max Grow for {restaurantName} (UID {uid}).

Campaign: Max Grow
Starts: {startDate}
Runs through: {endDate}

How billing works:
- Your baseline is your current Daily Run Rate (DRR) of ₹{drr} per day.
- We charge 20% only on the incremental sales above that baseline.
- If your sales stay at or below ₹{drr} per day, nothing is deducted.
- Deductions are billed weekly and settled from your Tomato payout.
- You can stop the campaign whenever you want.

Regards,
{agentName}
Tomato Merchant Growth Team`,
  },
  rejection: {
    label: "Rejected",
    subject: "Thank you for your time, {restaurantName}",
    body: `Dear {ownerName},

Thank you for speaking with us today. We understand Max Grow isn't the right fit for {restaurantName} at the moment.

If anything changes, reply to this email or reach out to your Tomato account team and we'll be happy to help.

Regards,
{agentName}
Tomato Merchant Growth Team`,
  },
  follow_up: {
    label: "Not interested / Not sure (follow-up)",
    subject: "Max Grow details for {restaurantName}",
    body: `Dear {ownerName},

Thank you for your time today. As discussed, here is a quick summary of Max Grow:

- Your restaurant is shown at the top of search and top-selling lists for the dishes you sell.
- Your baseline is your current DRR of ₹{drr} per day. We charge 20% only on sales above it.
- No extra sales, no deduction. Billed weekly from your Tomato payout. Stop anytime.

Whenever you'd like to go ahead, reply to this email and we'll set it up for you.

Regards,
{agentName}
Tomato Merchant Growth Team`,
  },
  callback: {
    label: "Callback scheduled",
    subject: "Your callback with Tomato: {callbackDate}, {callbackTime}",
    body: `Dear {ownerName},

As requested, we have scheduled a callback for {restaurantName} on {callbackDate} at {callbackTime}.

We'll walk you through Max Grow: more visibility in search and top-selling lists, billed at 20% only on the sales above your current daily average.

Regards,
{agentName}
Tomato Merchant Growth Team`,
  },
};

export function renderEmail(id: EmailTemplateId, ctx: EmailContext): { subject: string; body: string } {
  const values: Record<string, string> = {
    ownerName: ctx.ownerName,
    restaurantName: ctx.restaurantName,
    uid: ctx.uid,
    drr: ctx.drr.toLocaleString("en-IN"),
    agentName: ctx.agentName,
    startDate: ctx.campaign ? spokenDate(ctx.campaign.startDate) : "[start date]",
    endDate: ctx.campaign ? spokenDate(ctx.campaign.endDate) : "[end date]",
    callbackDate: ctx.callback ? spokenDate(ctx.callback.date) : "[callback date]",
    callbackTime: ctx.callback ? spokenTime(ctx.callback.time) : "[callback time]",
  };
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => values[k] ?? `{${k}}`);
  const t = EMAIL_TEMPLATES[id];
  return { subject: fill(t.subject), body: fill(t.body) };
}
