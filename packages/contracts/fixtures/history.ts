import type { Scorecard, TranscriptTurn, WorkspaceLogEntry } from "../src";
import { royalThali } from "./merchants";

/**
 * A weak past practice call (guidance off), seeded into each demo agent's history so the
 * calls list, the penalised report card and the agent's RAG weak spots have something real in
 * them: no name in the opening, "15%" offered to a haggler, the 2-month ask ignored, no closing,
 * disposed late. Pairs with the strong call in sim-call.ts.
 */
export const THALI_CALL_ID = "call_hist_thali";

let seq = 0;
function turn(speaker: TranscriptTurn["speaker"], text: string, startMs: number, endMs: number): TranscriptTurn {
  seq += 1;
  return { id: `turn_thali_${seq}`, callId: THALI_CALL_ID, seq, speaker, text, language: "hinglish", startMs, endMs };
}

const durationReq = royalThali.requests[0]!;

export const thaliCallTranscript: TranscriptTurn[] = [
  turn("customer", "Haan bolo, kya hai?", 1000, 2200),
  turn("agent", "Hello sir, Tomato se bol raha hoon. Aapke liye ek ads ka plan hai, Max Grow.", 3000, 7500),
  turn("customer", "Achha, kya plan hai? Jaldi batao.", 8500, 10500),
  turn("agent", "Sir isme aapka restaurant search mein upar aayega, aur hum sirf 20% commission lete hain extra sales pe.", 11500, 18000),
  turn("customer", "Twenty percent bahut hai, das percent karo.", 19000, 21500),
  turn("agent", "Sir das toh nahi hoga, par aapke liye 15% kar deta hoon, special case.", 29500, 34000),
  turn("customer", "Pandrah? Theek hai, chalo. Par isme kitna katega agar sales nahi badhi?", 35000, 39500),
  turn("agent", "Sir woh thoda bahut katega hi, minimum charges hote hain.", 40500, 44000),
  turn("customer", durationReq.phrasing, 45000, 49500),
  turn("agent", "Haan haan, set kar diya sir. Ho gaya.", 62000, 64500),
  turn("customer", "Theek hai. Chalo bye.", 65500, 67000),
];

export const thaliCallTranslations: Record<string, string> = {
  turn_thali_1: "Yes, tell me, what is it?",
  turn_thali_2: "Hello sir, I'm calling from Tomato. There's an ads plan for you, Max Grow.",
  turn_thali_3: "Okay, what's the plan? Tell me quickly.",
  turn_thali_4: "Sir, with this your restaurant will come up in search, and we only take 20% commission on the extra sales.",
  turn_thali_5: "Twenty percent is too much, make it ten percent.",
  turn_thali_6: "Sir, ten won't happen, but I'll do 15% for you, special case.",
  turn_thali_7: "Fifteen? Fine, let's go. But how much will be cut if sales don't go up?",
  turn_thali_8: "Sir, something will be cut anyway, there are minimum charges.",
  turn_thali_9: "You can't tell anything in one month, put it on for two months.",
  turn_thali_10: "Yes yes, I've set it sir. Done.",
  turn_thali_11: "Okay. Bye.",
};

/** What the agent did in the tools (and what the customer decided). Dates are relative to the call date. */
export const thaliWorkspaceLog = (callDate: string, endDate: string): WorkspaceLogEntry[] => [
  { actor: "agent", kind: "tab_opened", body: { tab: "ad_studio" }, atMs: 50000 },
  { actor: "persona", kind: "decision", body: { value: "accepted" }, atMs: 35000 },
  {
    actor: "agent",
    kind: "campaign_launch",
    body: { ok: true, error: null, campaign: { uid: royalThali.uid, email: royalThali.email, campaignType: "max_grow", startDate: callDate, endDate } },
    atMs: 61000,
  },
  { actor: "agent", kind: "email_sent", body: { template: "campaign_accepted", callback: null, to: royalThali.email }, atMs: 67000 },
  { actor: "agent", kind: "dispose", body: { outcome: "accepted", callback: null, secondsTaken: 118 }, atMs: 67000 },
];
export const thaliVoiced = [{ requestId: durationReq.id, atMs: 47000 }];

const t = (i: number) => thaliCallTranscript[i]!;

export const thaliScorecard: Scorecard = {
  callId: THALI_CALL_ID,
  kind: "sim",
  overall: 17,
  grade: "F",
  summary:
    "Offered a 15% commission to a haggling owner and told him something is deducted even when sales don't grow, both against Max Grow's terms. The opening had no greeting or name, the 2-month request was set up as one month, and the call was disposed late.",
  dimensions: [
    { key: "objectionHandling", score: 55, weight: 0.35, verdict: "Explained incremental billing once, then caved on the rate.", evidence: [t(3).id, t(5).id] },
    { key: "toolAccuracy", score: 57, weight: 0.25, verdict: "4/7 tool checks correct (no lookup, 1 month instead of 2, late disposition).", evidence: [] },
    { key: "compliance", score: 35, weight: 0.25, verdict: "Negotiated the non-negotiable commission and denied the no-risk rule.", evidence: [t(5).id, t(7).id] },
    { key: "softSkills", score: 62, weight: 0.15, verdict: "Short and polite, but an 8-second silence before the counter-offer.", evidence: [t(5).id] },
  ],
  moments: [
    {
      id: "m_1",
      atMs: t(1).startMs,
      turnId: t(1).id,
      severity: "warning",
      title: "Opening without greeting or name",
      detail: "Skipped 'Good morning', the agent's name and confirming Hitesh is the owner.",
      goldenLine: "Good morning, sir. My name is Ashwath. I am calling from the Tomato team. Kya meri baat Hitesh Patel ji se ho rahi hai, Royal Thali House se?",
    },
    {
      id: "m_2",
      atMs: t(5).startMs,
      turnId: t(5).id,
      severity: "mistake",
      title: "Offered 15% instead of the fixed 20%",
      detail: "Max Grow's 20% commission is non-negotiable; offering 15% misrepresents the plan.",
      goldenLine: "Sir, 20% sabke liye same hai. Par yeh sirf extra sales pe hai: jo sales aap abhi karte ho, us pe kuch nahi lagta.",
    },
    {
      id: "m_3",
      atMs: t(7).startMs,
      turnId: t(7).id,
      severity: "mistake",
      title: "Said there are minimum charges",
      detail: "If sales stay at or below the DRR there is zero deduction; the agent said the opposite.",
      goldenLine: "Agar aapki sales ₹22,800 ya usse kam rahi, toh zero deduction, sir.",
    },
    {
      id: "m_4",
      atMs: t(9).startMs,
      turnId: t(9).id,
      severity: "mistake",
      title: "Two-month ask set up as one month",
      detail: "He asked for two months; Ad Studio got a one-month campaign and no dates were dictated.",
      goldenLine: "Done sir. Aapka campaign aaj se start hoke do mahine tak chalega. Thank you for selecting our plan. Is there anything else I can help you with today?",
    },
  ],
  crmAudit: [
    { requestId: "lookup", field: "Merchant Dashboard · UID looked up", expected: royalThali.uid, actual: "not looked up", correct: false, latencyMs: null },
    { requestId: "campaign_uid", field: "Ad Studio · UID", expected: royalThali.uid, actual: royalThali.uid, correct: true, latencyMs: null },
    { requestId: "campaign_email", field: "Ad Studio · email", expected: royalThali.email, actual: royalThali.email, correct: true, latencyMs: null },
    { requestId: "campaign_type", field: "Ad Studio · campaign", expected: "max_grow", actual: "max_grow", correct: true, latencyMs: null },
    { requestId: durationReq.id, field: "Ad Studio · end date (2 months, asked on the call)", expected: "2 months", actual: "1 month", correct: false, latencyMs: null },
    { requestId: "email_template", field: "Nugget · email template", expected: "campaign_accepted", actual: "campaign_accepted", correct: true, latencyMs: null },
    { requestId: "disposition_time", field: "Nugget · disposed within 90s", expected: "≤ 90s", actual: "118s", correct: false, latencyMs: 118000 },
  ],
  deductions: [
    { code: "plan_misrepresented", label: "Plan terms misrepresented", points: 15, turnId: t(5).id, detail: "Offered a 15% commission and said there are minimum charges when sales don't grow." },
    { code: "opening_line", label: "Opening skipped or incorrect", points: 5, turnId: t(1).id, detail: "No greeting, no name, no ownership check." },
    { code: "closing_line", label: "Closing skipped or incorrect", points: 5, turnId: null, detail: "Never thanked him or asked if there was anything else." },
    { code: "late_disposition", label: "Call not disposed in time", points: 10, turnId: null, detail: "Disposed after 118s (limit 90s)." },
  ],
  wrapUp: { outcome: "accepted", emailTemplate: "campaign_accepted", callback: null, secondsTaken: 118, withinLimit: false, customerDecision: "accepted" },
  stats: { durationMs: 67000, agentTalkPct: 44, interruptions: 0, deadAirCount: 2, longestMonologueMs: 6500, wpm: 124 },
  createdAt: "2026-10-09T15:06:00.000Z",
};
