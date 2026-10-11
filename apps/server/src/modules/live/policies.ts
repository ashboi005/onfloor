import type { Policy } from "@onfloor/contracts";
import { MAX_GROW_POLICIES } from "@onfloor/contracts/fixtures";

/**
 * Guardrail policies for live calls. Scoring uses the same list (share changes with Ashwath).
 * The partial matcher intentionally avoids quoted objections and approval requests;
 * the structured final check handles policy context beyond these fast paths.
 *
 * [updated by Ashwath, 2026-10-10] The live demo is a Tomato Max Grow call too: the Max Grow rules
 * (20% on incremental only, non-negotiable, no deduction without growth, weekly from payout, stop
 * anytime, decision maker, timeline, empathy) replace the placeholder discount/activation rules.
 * pol_discount / pol_guarantee / pol_refund keep their detectors, reworded for Tomato.
 * Source of truth for agents: apps/server/knowledge/tomato-live-call-guide.md (RAG).
 */
export const LIVE_POLICIES: Policy[] = [
  ...MAX_GROW_POLICIES,
  { id: "pol_discount", severity: "critical", rule: "Never offer a discount, a lower commission or a waiver: Max Grow's 20% is fixed for every partner.",
    goldenLine: "The 20% is the same for every partner, sir, and it only applies to sales you wouldn't have had otherwise." },
  { id: "pol_guarantee", severity: "warn", rule: "Never guarantee orders or sales. Max Grow increases visibility; nothing is deducted unless sales actually grow.",
    goldenLine: "I can't promise a number, but if your sales don't grow, nothing is deducted at all." },
  { id: "pol_refund", severity: "critical", rule: "Do not promise or guarantee a refund without explicit manager approval.",
    goldenLine: "I'll ask our support team to review refund eligibility and confirm the outcome." },
];

/** The agent offering a discount / waiver / lower rate, with or without a number. */
const DISCOUNT_OFFER = /(?:\b(?:discount|waiver|waive|chhoot|chhut|concession)\b|छूट|डिस्काउंट|रियायत).{0,25}(?:\b(?:de (?:deta|dunga|denge|sakta|doonga)|de dete|dunga|doonga|denge|kar deta|kar dunga|kar denge|give|offer|can do|i'?ll do)\b|दे देता|दूंगा|देंगे|कर देता|कर दूंगा)|(?:\b(?:give|offer|de deta|de dunga|kar deta|kar dunga)\b|दे देता|दूंगा|देंगे).{0,25}(?:\bdiscount\b|छूट|डिस्काउंट)|\b(?:kam kar (?:deta|dunga|denge)|lower (?:it|the rate|the commission) (?:for you|to))\b/i;

/** "20% on the extra sales" is the correct rate, never a discount. */
const COMMISSION_CONTEXT = /commission|incremental|extra|growth|baseline|drr|कमीशन|एक्स्ट्रा/i;

export function detectViolations(text: string): Policy[] {
  const normalized = text.replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966));
  const clauses = normalized.split(/[!?;]|\.(?!\d)|\b(?:but|lekin|magar)\b/i).filter((clause) =>
    !/\b(?:cannot|can't|can not|won't|will not|not|never|nahi|nahin|mat|you said|you mentioned|competitor|they offer)\b|नहीं|नही/i.test(clause) &&
    !/\b(?:need|needs|require|requires|seek|request|ask|pending|after|subject to|unless|without)\b.{0,50}\b(?:approval|approved|manager)\b|manager.{0,30}(?:has approved|approved it)/i.test(clause));
  const ids = new Set<string>();
  for (const clause of clauses) {
    const discounted = /discount|offer|give|de sakta|denge|दूंगा|देंगे|डिस्काउंट|छूट/i.test(clause);
    const rateIsTheCommission = (n: number) => n === 20 && COMMISSION_CONTEXT.test(clause);
    if (discounted && ([...clause.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:%|percent|pratishat|प्रतिशत|परसेंट)/gi)].some((m) => Number(m[1]) > 10 && !rateIsTheCommission(Number(m[1]))) ||
      /\b(?:eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|pandrah|bees)\s*(?:percent|pratishat)|(?:पंद्रह|बीस|तीस)\s*(?:प्रतिशत|परसेंट)/i.test(clause))) ids.add("pol_discount");
    // [added by Ashwath] Offering a discount at all, number or not ("main aapko discount de deta hoon").
    if (DISCOUNT_OFFER.test(clause)) ids.add("pol_discount");
    for (const rule of FAST_PATHS) if (rule.policyId !== "pol_discount" && rule.pattern.test(clause)) ids.add(rule.policyId);
  }
  return LIVE_POLICIES.filter((p) => ids.has(p.id));
}

/**
 * Regex fast paths, run on AGENT PARTIALS so the warning can land before the sentence
 * finishes. The LLM check on finals catches the subtler ones.
 */
export const FAST_PATHS: Array<{ policyId: string; pattern: RegExp; message: string }> = [
  {
    // [added by Ashwath] Any commission other than 20%, or commission on total sales.
    policyId: "pol_commission",
    pattern: /(?:commission|charge|deduct\w*|\bcut\b|katega|kategi|lagega|कमीशन|कटेगा|लगेगा)\D{0,25}\b(?!20\b)\d{1,2}(?:\.\d+)?\s?(?:%|percent|pratishat|प्रतिशत|परसेंट)|\b(?!20\b)\d{1,2}(?:\.\d+)?\s?(?:%|percent|pratishat|प्रतिशत|परसेंट)\D{0,25}(?:commission|charge|deduct\w*|\bcut\b|katega|lagega|कमीशन|कटेगा|लगेगा)|(?:20\s?%|twenty percent|commission)[^.]{0,40}(?:total sales|all (?:of )?(?:your )?sales|poori sales|saari sales|पूरी sales|सारी sales)/i,
    message: "Max Grow is exactly 20%, and only on sales above the DRR.",
  },
  {
    policyId: "pol_discount",
    pattern: /\b(1[1-9]|[2-9]\d)\s?(%|percent|pratishat|प्रतिशत|परसेंट)/i,
    message: "No discounts: the 20% commission is non-negotiable.",
  },
  {
    policyId: "pol_guarantee",
    pattern: /(?:\bguarantee[d]?\b|गारंटी|पक्का).*?(?:\b(?:orders?|sales|revenue|customers)\b|ऑर्डर|बिक्री|कमाई)|(?:\b(?:orders?|sales|revenue|customers)\b|ऑर्डर|बिक्री|कमाई).*?(?:\bguarantee[d]?\b|गारंटी|पक्का)/i,
    message: "Never guarantee orders or sales. Say: nothing is deducted unless sales grow.",
  },
  { policyId: "pol_refund", pattern: /(?:\b(?:guarantee|promise|will|definitely|pakka)\b|गारंटी|पक्का|ज़रूर|जरूर).*?(?:\b(?:refund|money back)\b|रिफंड|पैसे\s*वापस)|(?:\brefund\b|रिफंड|पैसे\s*वापस).*?(?:\b(?:guaranteed|pakka)\b|गारंटी|पक्का|देंगे)/i,
    message: "Do not promise a refund without explicit manager approval." },
];
