import type { HintKind } from "@onfloor/contracts";

/**
 * Objection → counter pairs and upsell triggers. Injected into the copilot prompt AND
 * used as keyword fast paths so common objections hint instantly, with no LLM wait.
 * TODO(tushar): grow this from real calls.
 */
export const PLAYBOOK: Array<{ kind: HintKind; triggers: RegExp; title: string; body: string }> = [
  {
    kind: "objection",
    triggers: /commission|zyada|too (high|expensive)|mehenga/i,
    title: "Commission pushback",
    body: "Don't defend the rate. Pivot to guaranteed reach: 12k diners/month within 5 km.",
  },
  {
    kind: "objection",
    triggers: /\b\d{1,2}\s?%|competitor|doosre|zestify|cheaper|sasta/i,
    title: "Competitor rate claim",
    body: "Ask what's included. Competitor headline rates usually exclude listing fees (≈6%).",
  },
  {
    kind: "upsell",
    triggers: /weekend|footfall|rush|busy/i,
    title: "Weekend goal → Premium",
    body: "Premium boosts Fri–Sun visibility. Tie the upgrade to his weekend problem.",
  },
  {
    kind: "close",
    triggers: /send (me )?(the )?details|whatsapp|theek hai|okay fine|let'?s do it/i,
    title: "Buying signal: close now",
    body: "Confirm the plan and start date while they're on the line.",
  },
];
