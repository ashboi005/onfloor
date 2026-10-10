import type { Scorecard } from "../src";
import { thaliScorecard } from "./history";
import { LIVE_CALL_ID, liveCallTranscript } from "./live-call";
import { SIM_CALL_ID, simCallTranscript } from "./sim-call";

const sim = (i: number) => simCallTranscript[i]!;
const live = (i: number) => liveCallTranscript[i]!;

export const simScorecard: Scorecard = {
  callId: SIM_CALL_ID,
  kind: "sim",
  overall: 88,
  grade: "A",
  summary:
    "Clean opening, verified ownership and explained Max Grow with Rajesh's own numbers, including the no-deduction case; campaign launched with the corrected email. Soft skills cost him: one long billing monologue and a gap while setting up Ad Studio.",
  dimensions: [
    {
      key: "objectionHandling",
      score: 86,
      weight: 0.35,
      verdict: "Answered the visibility and 'what if sales don't grow' questions directly with his numbers.",
      evidence: [sim(9).id, sim(11).id],
    },
    {
      key: "toolAccuracy",
      score: 100,
      weight: 0.25,
      verdict: "9/9 checks correct: lookup, campaign (with the corrected email) and disposition, all in time.",
      evidence: [],
    },
    {
      key: "compliance",
      score: 88,
      weight: 0.25,
      verdict: "Commission, no-risk, weekly billing and stop-anytime all stated correctly.",
      evidence: [sim(11).id, sim(13).id],
    },
    {
      key: "softSkills",
      score: 70,
      weight: 0.15,
      verdict: "Warm and clear, but a long monologue on billing and dead air during setup.",
      evidence: [sim(11).id, sim(13).id],
    },
  ],
  moments: [
    {
      id: "m_1",
      atMs: sim(1).startMs,
      turnId: sim(1).id,
      severity: "good",
      title: "Standard opening, identity confirmed",
      detail: "Greeting, name, 'calling from the Tomato team' and the merchant's name and restaurant in one line.",
      goldenLine: null,
    },
    {
      id: "m_2",
      atMs: sim(9).startMs,
      turnId: sim(9).id,
      severity: "good",
      title: "Used his menu data for visibility",
      detail: "Gave all three visibility levers and quoted 11 of 42 items with photos from the dashboard.",
      goldenLine: null,
    },
    {
      id: "m_3",
      atMs: sim(11).startMs,
      turnId: sim(11).id,
      severity: "warning",
      title: "16-second billing monologue",
      detail: "All correct, but packed into one long turn; checking in halfway keeps the merchant engaged.",
      goldenLine:
        "Sir, 20% sirf extra sales pe lagta hai. Jaise aapki sales ₹14,200 se ₹18,200 ho gayi, toh ₹800 per day. Samajh aa raha hai? Aur agar sales nahi badhi, toh kuch nahi katega.",
    },
    {
      id: "m_4",
      atMs: sim(13).startMs,
      turnId: sim(13).id,
      severity: "good",
      title: "Dictated the exact timeline",
      detail: "Start and end dates said out loud and matched what was entered in Ad Studio.",
      goldenLine: null,
    },
  ],
  crmAudit: [
    { requestId: "lookup", field: "Merchant Dashboard · UID looked up", expected: "21847390", actual: "21847390", correct: true, latencyMs: 24500 },
    { requestId: "campaign_uid", field: "Ad Studio · UID", expected: "21847390", actual: "21847390", correct: true, latencyMs: null },
    { requestId: "req_email", field: "Ad Studio · email (updated on the call)", expected: "orders@sharmajichholebhature.in", actual: "orders@sharmajichholebhature.in", correct: true, latencyMs: 68000 },
    { requestId: "campaign_type", field: "Ad Studio · campaign", expected: "max_grow", actual: "max_grow", correct: true, latencyMs: null },
    { requestId: "campaign_start", field: "Ad Studio · start date", expected: "2026-10-10", actual: "2026-10-10", correct: true, latencyMs: null },
    { requestId: "campaign_end", field: "Ad Studio · end date (min 1 month)", expected: "≥ 2026-11-10", actual: "2026-11-10", correct: true, latencyMs: null },
    { requestId: "disposition_outcome", field: "Nugget · disposition", expected: "accepted", actual: "accepted", correct: true, latencyMs: null },
    { requestId: "email_template", field: "Nugget · email template", expected: "campaign_accepted", actual: "campaign_accepted", correct: true, latencyMs: null },
    { requestId: "disposition_time", field: "Nugget · disposed within 90s", expected: "≤ 90s", actual: "41s", correct: true, latencyMs: 41000 },
  ],
  deductions: [],
  wrapUp: {
    outcome: "accepted",
    emailTemplate: "campaign_accepted",
    callback: null,
    secondsTaken: 41,
    withinLimit: true,
    customerDecision: "accepted",
  },
  stats: {
    durationMs: 131500,
    agentTalkPct: 63,
    interruptions: 0,
    deadAirCount: 1,
    longestMonologueMs: 16500,
    wpm: 118,
  },
  createdAt: "2026-10-10T08:34:00.000Z",
};

export const liveScorecard: Scorecard = {
  callId: LIVE_CALL_ID,
  kind: "live",
  overall: 58,
  grade: "D",
  summary:
    "Recovered well with the reach pitch and closed at an approved 10%, but promised next-day activation and let 9 seconds of dead air build after the discount question.",
  dimensions: [
    { key: "objectionHandling", score: 68, weight: 0.35, verdict: "Good discovery question, late value pivot.", evidence: [live(3).id, live(7).id] },
    { key: "toolAccuracy", score: null, weight: 0.25, verdict: "Not applicable for live calls.", evidence: [] },
    { key: "compliance", score: 40, weight: 0.25, verdict: "Promised next-day activation without approval; no recording disclosure.", evidence: [live(5).id] },
    { key: "softSkills", score: 66, weight: 0.15, verdict: "Warm tone; 9s dead air after a direct question.", evidence: [live(6).id] },
  ],
  moments: [
    {
      id: "m_live_1",
      atMs: live(5).startMs,
      turnId: live(5).id,
      severity: "mistake",
      title: "Promised next-day activation",
      detail: "Standard activation is 3 working days; next-day needs manager approval.",
      goldenLine: "Standard activation is 3 working days. I'll flag it as priority and confirm a date with you today.",
    },
    {
      id: "m_live_2",
      atMs: live(6).endMs,
      turnId: live(6).id,
      severity: "warning",
      title: "9 seconds of dead air",
      detail: "Customer asked about discount; the agent went silent while (likely) checking pricing.",
      goldenLine: "Good question, let me pull up the best I can do for you. Give me five seconds.",
    },
    {
      id: "m_live_3",
      atMs: live(7).startMs,
      turnId: live(7).id,
      severity: "good",
      title: "Value before discount",
      detail: "Led with guaranteed reach before quoting an in-policy 10%.",
      goldenLine: null,
    },
  ],
  crmAudit: [],
  deductions: [],
  wrapUp: null,
  stats: { durationMs: 74000, agentTalkPct: 50, interruptions: 0, deadAirCount: 1, longestMonologueMs: 9000, wpm: 128 },
  createdAt: "2026-10-10T09:01:20.000Z",
};

export const scorecards: Scorecard[] = [simScorecard, liveScorecard, thaliScorecard];
