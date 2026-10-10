import type { Policy, Scenario } from "../src";

/**
 * LIVE placeholder: the live-call guardrails (Tushar extends these in modules/live/policies.ts).
 * They still describe the old placeholder product and are replaced when the live company docs
 * arrive. The simulator uses MAX_GROW_POLICIES below.
 */
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

/** Tomato's Max Grow rules, from the sales team's guidelines. Used by the simulator's judge. */
export const MAX_GROW_POLICIES: Policy[] = [
  {
    id: "pol_commission",
    rule: "Max Grow charges exactly 20%, and only on incremental sales above the merchant's DRR (current average daily sales). Never quote another percentage (15%, 30%…) or say it applies to total sales.",
    severity: "critical",
    goldenLine: "It's 20%, and only on the extra sales above your current daily average. Your existing sales are never charged.",
  },
  {
    id: "pol_non_negotiable",
    rule: "The 20% commission is non-negotiable. Never offer a lower rate, a discount or a waiver.",
    severity: "critical",
    goldenLine: "The 20% is the same for every partner, sir, and it only ever applies to sales you wouldn't have had otherwise.",
  },
  {
    id: "pol_no_risk",
    rule: "If sales stay at or below the DRR, there is zero deduction. Say so when the merchant asks about risk or cost.",
    severity: "warn",
    goldenLine: "If your sales stay at or below your current daily average, nothing is deducted at all.",
  },
  {
    id: "pol_billing",
    rule: "Deductions are billed weekly and settled directly from the merchant's Tomato payout. No upfront payment, no separate invoice.",
    severity: "warn",
    goldenLine: "Nothing upfront. It's settled weekly from your Tomato payout.",
  },
  {
    id: "pol_stop_anytime",
    rule: "The merchant can stop Max Grow whenever they want. Never claim a lock-in.",
    severity: "warn",
    goldenLine: "You can stop it whenever you want, sir.",
  },
  {
    id: "pol_decision_maker",
    rule: "Pitch and set up campaigns only with the owner or someone who confirms they can make financial decisions. Otherwise ask when the owner is available and schedule a callback.",
    severity: "critical",
    goldenLine: "Are you the right person to make financial decisions for this restaurant?",
  },
  {
    id: "pol_timeline",
    rule: "Campaigns run for at least one month. Clearly dictate the exact start and end dates to the merchant.",
    severity: "warn",
    goldenLine: "Your campaign starts today, October 10th, and runs through November 10th for one month.",
  },
  {
    id: "pol_empathy",
    rule: "If the merchant complains, acknowledge it with empathy before anything else (\"I am really sorry to hear that\", \"I can understand your concern\").",
    severity: "warn",
    goldenLine: "I am really sorry to hear that, sir. I can understand your concern, and I will definitely help you with this.",
  },
];

export const maxGrowOutbound: Scenario = {
  id: "scn_max_grow",
  title: "Outbound: pitch Max Grow to a Tomato restaurant partner",
  brief:
    "Nugget auto-dials a Tomato restaurant partner and pops their ticket. Verify who you're speaking to, pull the merchant up in Merchant Dashboard with the UID, confirm their details and pitch Max Grow. If they accept, set the campaign up in Ad Studio and dictate the dates. After hang-up you have 90 seconds in Nugget to send the right email template and dispose the call.",
  objective:
    "Verify the decision maker, pitch Max Grow accurately (20% only on sales above the DRR, nothing if sales don't grow, billed weekly from the payout, stop anytime), then either launch a correct campaign or set up the right follow-up, and dispose within 90 seconds.",
  defaultMerchantId: "mer_sharma_ji",
  defaultPersonaId: "persona_curious",
  script: {
    greeting: "Good morning, sir. My name is {agentName}. I am calling from the Tomato team.",
    nonOwnerQuestion: "Are you the right person to make financial decisions for this restaurant?",
    timeline: "Your campaign starts today, {startDate}, and runs through {endDate} for one month.",
    closing: "Thank you for selecting our plan. Is there anything else I can help you with today?",
    empathy: ["I am really sorry to hear that.", "I can understand your concern.", "I will definitely help you out of this problem."],
  },
  policies: MAX_GROW_POLICIES,
  qaRules: [
    {
      code: "late_disposition",
      label: "Call not disposed in time",
      points: 10,
      detail: "The call was not disposed in Nugget within the 90-second disposition window.",
    },
    {
      code: "plan_misrepresented",
      label: "Plan terms misrepresented",
      points: 15,
      detail:
        "The agent stated Max Grow terms wrongly: a commission other than 20%, commission on total sales, a deduction when sales don't grow, a negotiable rate, a lock-in, or billing other than weekly from the payout.",
    },
    {
      code: "opening_line",
      label: "Opening skipped or incorrect",
      points: 5,
      detail:
        "The standard opening was skipped or wrong: greeting (good morning/afternoon/evening), the agent's name, 'calling from the Tomato team', and confirming the merchant's name, restaurant and ownership.",
    },
    {
      code: "closing_line",
      label: "Closing skipped or incorrect",
      points: 5,
      detail: "The standard closing was skipped: thanking the merchant and asking if there is anything else they can help with.",
    },
    {
      code: "empathy_missing",
      label: "No empathy on a complaint",
      points: 5,
      detail: "The merchant complained and the agent did not acknowledge it with empathy before moving on.",
    },
  ],
  ringDelayMs: [2000, 5000],
  dispositionSec: 90,
  softLimitSec: 360,
  hardLimitSec: 600,
};

export const scenarios: Scenario[] = [maxGrowOutbound];
