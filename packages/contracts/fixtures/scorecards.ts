import type { Scorecard } from "../src";
import { LIVE_CALL_ID, liveCallTranscript } from "./live-call";
import { SIM_CALL_ID, simCallTranscript } from "./sim-call";

const sim = (i: number) => simCallTranscript[i]!;
const live = (i: number) => liveCallTranscript[i]!;

export const simScorecard: Scorecard = {
  callId: SIM_CALL_ID,
  kind: "sim",
  overall: 66,
  grade: "C",
  summary:
    "Strong rebuttal on the competitor rate and both account changes made quickly. Lost marks for conceding a 15% discount without approval and never confirming the Premium upgrade.",
  dimensions: [
    {
      key: "objectionHandling",
      score: 72,
      weight: 0.35,
      verdict: "Countered the fake 8% claim with facts, but folded on discount.",
      evidence: [sim(3).id, sim(9).id],
    },
    {
      key: "toolAccuracy",
      score: 88,
      weight: 0.25,
      verdict: "Both CRM requests actioned correctly; weekend toggle was slow.",
      evidence: [sim(5).id, sim(7).id],
    },
    {
      key: "compliance",
      score: 35,
      weight: 0.25,
      verdict: "Offered 15% discount, above the 10% approval limit.",
      evidence: [sim(9).id],
    },
    {
      key: "softSkills",
      score: 70,
      weight: 0.15,
      verdict: "Good pace and recording disclosure; one long monologue.",
      evidence: [sim(1).id, sim(3).id],
    },
  ],
  moments: [
    {
      id: "m_sim_1",
      atMs: sim(1).startMs,
      turnId: sim(1).id,
      severity: "good",
      title: "Recording disclosure given",
      detail: "Mentioned the call may be recorded within the first 10 seconds.",
      goldenLine: null,
    },
    {
      id: "m_sim_2",
      atMs: sim(3).startMs,
      turnId: sim(3).id,
      severity: "good",
      title: "Debunked the competitor rate",
      detail: "Corrected the 8% claim with the real 14% figure and pivoted to guaranteed reach.",
      goldenLine: null,
    },
    {
      id: "m_sim_3",
      atMs: sim(9).startMs,
      turnId: sim(9).id,
      severity: "mistake",
      title: "Offered unapproved 15% discount",
      detail: "Policy allows max 10% without manager approval. Conceded 5 points more under pressure without getting anything back.",
      goldenLine:
        "I can't go beyond 10% on my own, Rakesh ji, but at 50,000 a month Premium pays for itself in two weekends. Shall I lock 10% for the first quarter?",
    },
    {
      id: "m_sim_4",
      atMs: sim(10).endMs,
      turnId: sim(10).id,
      severity: "warning",
      title: "Didn't close",
      detail: "Customer asked for details on WhatsApp. The agent never confirmed the plan change or a follow-up time.",
      goldenLine: "I'll send it now. Can I switch you to Premium today so it's live before Saturday?",
    },
  ],
  crmAudit: [
    { requestId: "req_budget", field: "monthlyBudget", expected: 50000, actual: 50000, correct: true, latencyMs: 4800 },
    { requestId: "req_weekend", field: "weekendNotifications", expected: false, actual: false, correct: true, latencyMs: 7600 },
  ],
  stats: {
    durationMs: 80000,
    agentTalkPct: 48,
    interruptions: 1,
    deadAirCount: 0,
    longestMonologueMs: 9500,
    wpm: 142,
  },
  createdAt: "2026-10-10T08:32:00.000Z",
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
  stats: { durationMs: 74000, agentTalkPct: 50, interruptions: 0, deadAirCount: 1, longestMonologueMs: 9000, wpm: 128 },
  createdAt: "2026-10-10T09:01:20.000Z",
};

export const scorecards: Scorecard[] = [simScorecard, liveScorecard];
