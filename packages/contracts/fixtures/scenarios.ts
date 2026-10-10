import type { Policy, Scenario } from "../src";

/** Also the default live-call guardrail set (Tushar extends it in modules/live/policies.ts). */
export const DEFAULT_POLICIES: Policy[] = [
  {
    id: "pol_discount",
    rule: "Never offer more than 10% discount without manager approval.",
    severity: "critical",
    goldenLine:
      "I can't go beyond 10% on my own, but let me show you why Premium pays for itself before we talk discounts.",
  },
  {
    id: "pol_activation",
    rule: "Do not promise next-day activation without manager approval. Standard activation is 3 business days.",
    severity: "critical",
    goldenLine: "Standard activation is 3 working days. I'll flag it as priority and confirm a date with you today.",
  },
  {
    id: "pol_guarantee",
    rule: "Never guarantee orders or revenue. Only reach (impressions) is guaranteed.",
    severity: "warn",
    goldenLine: "What we guarantee is reach: 12,000 local diners a month see your listing.",
  },
  {
    id: "pol_disclosure",
    rule: "State that the call may be recorded for quality purposes.",
    severity: "warn",
  },
];

export const premiumRestaurant: Scenario = {
  id: "scn_premium_restaurant",
  title: "Pitching Premium Ads to a Skeptical Restaurant Owner",
  brief:
    "Rakesh runs three restaurants on the Basic plan (₹30,000/mo). Weekends are flat. Your goal: upgrade him to Premium. He will push on price and ask for account changes during the call. Make them in the CRM as he asks.",
  objective: "Upgrade to Premium without exceeding a 10% discount, and action every account change he requests.",
  defaultPersonaId: "persona_rakesh",
  initialCrm: {
    monthlyBudget: 30000,
    campaignStatus: "active",
    plan: "basic",
    discountPct: 0,
    weekendNotifications: true,
    targetRadiusKm: 5,
    adCategories: ["dine_in", "delivery"],
    notes: "",
  },
  policies: DEFAULT_POLICIES,
  softLimitSec: 300,
  hardLimitSec: 480,
};

export const scenarios: Scenario[] = [premiumRestaurant];
