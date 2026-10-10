import type { Policy } from "@onfloor/contracts";
import { DEFAULT_POLICIES } from "@onfloor/contracts/fixtures";

/**
 * Guardrail policies for live calls. Scoring uses the same list (share changes with Ashwath).
 * The partial matcher intentionally avoids quoted objections and approval requests;
 * the structured final check handles policy context beyond these fast paths.
 */
export const LIVE_POLICIES: Policy[] = [
  ...DEFAULT_POLICIES,
  { id: "pol_refund", severity: "critical", rule: "Do not promise or guarantee a refund without explicit manager approval.",
    goldenLine: "I'll ask our support team to review refund eligibility and confirm the outcome." },
];

export function detectViolations(text: string): Policy[] {
  const normalized = text.replace(/[०-९]/g, (digit) => String(digit.charCodeAt(0) - 0x0966));
  const clauses = normalized.split(/[!?;]|\.(?!\d)|\b(?:but|lekin|magar)\b/i).filter((clause) =>
    !/\b(?:cannot|can't|can not|won't|will not|not|never|nahi|nahin|mat|you said|you mentioned|competitor|they offer)\b|नहीं|नही/i.test(clause) &&
    !/\b(?:need|needs|require|requires|seek|request|ask|pending|after|subject to|unless|without)\b.{0,50}\b(?:approval|approved|manager)\b|manager.{0,30}(?:has approved|approved it)/i.test(clause));
  const ids = new Set<string>();
  for (const clause of clauses) {
    const discounted = /discount|offer|give|de sakta|denge|दूंगा|देंगे|डिस्काउंट|छूट/i.test(clause);
    if (discounted && ([...clause.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:%|percent|pratishat|प्रतिशत|परसेंट)/gi)].some((m) => Number(m[1]) > 10) ||
      /\b(?:eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|pandrah|bees)\s*(?:percent|pratishat)|(?:पंद्रह|बीस|तीस)\s*(?:प्रतिशत|परसेंट)/i.test(clause))) ids.add("pol_discount");
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
    policyId: "pol_activation",
    pattern: /(?:kal tak|tomorrow|next[- ]day|कल\s*तक|अगले\s*दिन).*?(?:activ\w*|chalu|चालू|एक्टिव|live|start|शुरू)|(?:activ\w*|chalu|चालू|एक्टिव|live|start|शुरू).*?(?:kal tak|tomorrow|next[- ]day|कल\s*तक|अगले\s*दिन)/i,
    message: "Don't promise next-day activation without manager approval. Standard is 3 working days.",
  },
  {
    policyId: "pol_discount",
    pattern: /\b(1[1-9]|[2-9]\d)\s?(%|percent|pratishat|प्रतिशत|परसेंट)/i,
    message: "Discount above 10% needs manager approval.",
  },
  {
    policyId: "pol_guarantee",
    pattern: /(?:\bguarantee[d]?\b|गारंटी|पक्का).*?(?:\b(?:orders?|sales|revenue|customers)\b|ऑर्डर|बिक्री|कमाई)|(?:\b(?:orders?|sales|revenue|customers)\b|ऑर्डर|बिक्री|कमाई).*?(?:\bguarantee[d]?\b|गारंटी|पक्का)/i,
    message: "Only reach is guaranteed, never orders or revenue.",
  },
  { policyId: "pol_refund", pattern: /(?:\b(?:guarantee|promise|will|definitely|pakka)\b|गारंटी|पक्का|ज़रूर|जरूर).*?(?:\b(?:refund|money back)\b|रिफंड|पैसे\s*वापस)|(?:\brefund\b|रिफंड|पैसे\s*वापस).*?(?:\b(?:guaranteed|pakka)\b|गारंटी|पक्का|देंगे)/i,
    message: "Do not promise a refund without explicit manager approval." },
];
