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
  const clauses = text.split(/[!?;]|\.(?!\d)|\b(?:but|lekin|magar)\b/i).filter((clause) =>
    !/\b(?:cannot|can't|can not|won't|will not|not|never|nahi|nahin|mat|you said|you mentioned|competitor|they offer)\b|नहीं|नही/i.test(clause) &&
    !/\b(?:need|needs|require|requires|seek|request|ask|pending|after|subject to|unless|without)\b.{0,50}\b(?:approval|approved|manager)\b|manager.{0,30}(?:has approved|approved it)/i.test(clause));
  const ids = new Set<string>();
  for (const clause of clauses) {
    const discounted = /discount|offer|give|de sakta|denge|दूंगा|डिस्काउंट/i.test(clause);
    if (discounted && ([...clause.matchAll(/\b(\d+(?:\.\d+)?)\s*(?:%|percent|pratishat)/gi)].some((m) => Number(m[1]) > 10) ||
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
    pattern: /(?:\b(?:kal tak|tomorrow|next[- ]day)\b.*\b(?:activ\w*|chalu|live|start)|\b(?:activ\w*|chalu|live|start)\b.*\b(?:kal tak|tomorrow|next[- ]day)\b|कल.*(?:चालू|एक्टिव))/i,
    message: "Don't promise next-day activation without manager approval. Standard is 3 working days.",
  },
  {
    policyId: "pol_discount",
    pattern: /\b(1[1-9]|[2-9]\d)\s?(%|percent|pratishat)/i,
    message: "Discount above 10% needs manager approval.",
  },
  {
    policyId: "pol_guarantee",
    pattern: /\bguarantee[d]?\b.*\b(orders?|sales|revenue|customers)\b/i,
    message: "Only reach is guaranteed, never orders or revenue.",
  },
  { policyId: "pol_refund", pattern: /\b(?:guarantee|promise|will|definitely|pakka)\b.*\b(?:refund|money back)\b|\brefund\b.*\b(?:guaranteed|pakka)\b|पैसे.*(?:वापस|रिफंड)/i,
    message: "Do not promise a refund without explicit manager approval." },
];
