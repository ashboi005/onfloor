import type { HintKind } from "@onfloor/contracts";

/**
 * Objection → counter pairs and closing cues. Injected into the copilot prompt AND
 * used as keyword fast paths so common objections hint instantly, with no LLM wait.
 * TODO(tushar): grow this from real calls.
 *
 * [updated by Ashwath, 2026-10-10] Tomato Max Grow content (the live demo is a Tomato call). Facts
 * here must match apps/server/knowledge/tomato-live-call-guide.md, which the copilot retrieves
 * for everything these keywords don't cover.
 */
export const PLAYBOOK_SOURCE = "Tomato Max Grow playbook";

export const PLAYBOOK: Array<{ kind: HintKind; triggers: RegExp; title: string; body: string }> = [
  {
    kind: "objection",
    triggers: /\b(?:10|15|ten|fifteen|das|pandrah)\s*(?:%|percent|pratishat)|kam karo|discount|lower (?:the )?(?:rate|commission)|negotiat|dusre ko|friend.{0,20}(?:got|mila)|कम कर|डिस्काउंट|दस (?:परसेंट|प्रतिशत)|बीस (?:परसेंट|प्रतिशत).{0,15}ज़्यादा/i,
    title: "Asks for a lower rate",
    body: "Hold the 20%: it's the same for every partner and only applies to extra sales above their DRR. Never discount.",
  },
  {
    kind: "objection",
    triggers: /sales (?:nahi|na|don'?t|do not) (?:badh|grow|increase)|no (?:growth|increase)|risk|nuksaan|loss|waise hi|anyway|नहीं बढ़|रिस्क|नुकसान/i,
    title: "Worried about paying without growth",
    body: "Zero deduction if sales stay at or below the DRR. Only sales above it are charged, at 20%.",
  },
  {
    kind: "objection",
    triggers: /commission|kitna (?:katega|lagega)|how much (?:will you|do you) (?:cut|charge|take)|charges?\b|fees?\b|कितना (?:कटेगा|लगेगा)|कमीशन/i,
    title: "How much is cut",
    body: "20% of incremental sales only. Example: DRR ₹12,000 → sales ₹15,000 → 20% of ₹3,000 = ₹600/day. Nothing if sales don't grow.",
  },
  {
    kind: "pitch",
    triggers: /kab (?:katega|kategi|cut)|when (?:is it|will it be|do you) (?:deduct|cut|charge)|payment|payout|upfront|invoice|कब (?:कटेगा|कटेंगे)|पेआउट/i,
    title: "When it's deducted",
    body: "Billed weekly, settled straight from the Tomato payout. Nothing upfront, no separate invoice.",
  },
  {
    kind: "pitch",
    triggers: /\bstop\b|band kar|cancel|lock[- ]?in|beech mein|in between|exit|बंद कर|बीच में/i,
    title: "Can they stop it",
    body: "Yes, they can stop Max Grow whenever they want. Campaigns are set up for at least one month.",
  },
  {
    kind: "pitch",
    triggers: /visib|search|rank|upar|neeche|top (?:par|pe|of)|dikh|new places|naye|सर्च|ऊपर|दिखते|नए/i,
    title: "How to get more visibility",
    body: "Improve menu quality, add photos to menu items, reject fewer orders. Max Grow then puts them at the top of search.",
  },
  {
    kind: "objection",
    triggers: /koi sunta nahi|problem|issue|pareshan|gussa|complain|bekaar|paisa doob|wasted|frustrat|कोई सुनता नहीं|परेशान|शिकायत/i,
    title: "Complaint: empathy first",
    body: "\"I am really sorry to hear that. I can understand your concern. I will definitely help you.\" Then the no-risk point.",
  },
  {
    kind: "pitch",
    triggers: /manager|owner nahi|not the owner|papa|bhai(?:ya)? decide|sir (?:nahi|are not)|decide nahi|मैनेजर|पापा/i,
    title: "Not the decision maker",
    body: "Ask: \"Are you the right person to make financial decisions?\" If not, ask when the owner is free and book a callback.",
  },
  {
    kind: "close",
    triggers: /laga do|kar do|let'?s do it|go ahead|start (?:it|kar)|theek hai,? (?:chalo|karo)|sounds good|i'?m in|okay,? do it|लगा दो|कर दो|शुरू करो/i,
    title: "Buying signal: close now",
    body: "Dictate it: \"Your campaign starts today and runs for one month.\" Then: \"Thank you for selecting our plan. Anything else?\"",
  },
];
