import type { Policy } from "@onfloor/contracts";
import { DEFAULT_POLICIES } from "@onfloor/contracts/fixtures";

/**
 * Guardrail policies for live calls. Scoring uses the same list (share changes with Ashwath).
 * TODO(tushar): extend; tune the fast-path patterns on real Hinglish transcripts.
 */
export const LIVE_POLICIES: Policy[] = DEFAULT_POLICIES;

/**
 * Regex fast paths, run on AGENT PARTIALS so the warning can land before the sentence
 * finishes. The LLM check on finals catches the subtler ones.
 */
export const FAST_PATHS: Array<{ policyId: string; pattern: RegExp; message: string }> = [
  {
    policyId: "pol_activation",
    pattern: /\b(kal tak|tomorrow|next[- ]day|by tomorrow)\b.*\b(activ|chalu|live|start)/i,
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
];
