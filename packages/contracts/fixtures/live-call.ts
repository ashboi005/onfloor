import type { Call, LiveEvent, Timed, TranscriptTurn } from "../src";

/**
 * A scripted ~2 min live Telegram call. This is the REFERENCE stream for Pillar 2:
 * - Harnoor builds the HUD against it (mock `useLiveCall`).
 * - Tushar's real `/ws/live` output should look like it.
 * Includes customer memory (RAG), partials, cited hints, a critical guardrail, sentiment swings, a dead-air alert,
 * and ends with scorecard_ready + persona_ready.
 */
export const LIVE_CALL_ID = "call_live_demo";
export const LIVE_PERSONA_ID = "persona_suresh_live";

export const liveCall: Call = {
  id: LIVE_CALL_ID,
  kind: "live",
  status: "active",
  agentId: "agent_ashwath",
  scenarioId: null,
  personaId: null,
  replayOfCallId: null,
  language: "hinglish",
  customerLabel: "Suresh Patil",
  startedAt: "2026-10-10T09:00:00.000Z",
  endedAt: null,
  durationMs: null,
  recordingUrl: null,
  overallScore: null,
};

let seq = 0;
function turn(speaker: TranscriptTurn["speaker"], text: string, startMs: number, endMs: number): TranscriptTurn {
  seq += 1;
  return { id: `turn_live_${seq}`, callId: LIVE_CALL_ID, seq, speaker, text, language: "hinglish", startMs, endMs };
}

const t = {
  a0: turn("agent", "Hello, OnFloor Ads se Ashwath bol raha hoon. How can I help?", 1000, 4500),
  c1: turn("customer", "Haan hello, main Suresh bol raha hoon, Patil Misal se. Commission ke baare mein baat karni thi.", 5500, 11000),
  c2: turn("customer", "Commission bahut zyada hai, bhai. Doosre wale 8% bol rahe hain.", 12000, 17000),
  a1: turn("agent", "Samajh sakta hoon. Can I ask what results you're seeing on weekends right now?", 19000, 24000),
  c3: turn("customer", "Weekend pe theek hai, but mujhe Premium chahiye agar rate theek hai. Aur kal tak chalu karo warna main cancel karta hoon.", 25000, 33000),
  a2: turn("agent", "Haan bilkul, kal tak activation ho jayega, I promise.", 35000, 39000),
  c4: turn("customer", "Pakka? Aur discount kitna doge?", 40000, 43000),
  a3: turn("agent", "Premium pe you get guaranteed reach, 12,000 local diners every month. I can offer 10% on the first three months.", 52000, 61000),
  c5: turn("customer", "10%... theek hai. Send karo details, main dekhta hoon.", 62000, 67000),
  a4: turn("agent", "Perfect, sending it on WhatsApp now. Thank you Suresh ji.", 68000, 72000),
};

const e = (atMs: number, event: LiveEvent): Timed<LiveEvent> => ({ atMs, event });
const final = (tr: TranscriptTurn): Timed<LiveEvent> => e(tr.endMs, { type: "transcript_final", turn: tr });
const partial = (tr: TranscriptTurn, words: number): Timed<LiveEvent> =>
  e(tr.startMs + Math.round(((tr.endMs - tr.startMs) * words) / tr.text.split(" ").length), {
    type: "transcript_partial",
    speaker: tr.speaker,
    text: tr.text.split(" ").slice(0, words).join(" "),
  });
const spoken = (tr: TranscriptTurn) => [partial(tr, 3), partial(tr, 7), final(tr)];
const talk = (atMs: number, agentTalkPct: number, currentSilenceMs = 0, alert: "dead_air" | "monologue" | null = null) =>
  e(atMs, { type: "talk_metrics", agentTalkPct, currentSilenceMs, alert });
const mood = (atMs: number, patience: number, frustration: number, engagement: number) =>
  e(atMs, { type: "sentiment", patience, frustration, engagement, atMs });

export const liveCallTimeline: Timed<LiveEvent>[] = [
  e(0, { type: "call_started", call: liveCall }),
  e(400, {
    type: "customer_memory",
    customerLabel: "Suresh Patil",
    items: [
      {
        text: "3 Oct: complained that weekend orders are flat; was promised a callback with Premium pricing, which never happened.",
        source: "call:call_live_prev1",
        at: "2026-10-03T11:20:00.000Z",
      },
      {
        text: "3 Oct: quoted Zestify's 8% commission; asked twice whether reach is guaranteed.",
        source: "call:call_live_prev1",
        at: "2026-10-03T11:20:00.000Z",
      },
    ],
  }),
  mood(0, 60, 30, 50),
  ...spoken(t.a0),
  ...spoken(t.c1),
  ...spoken(t.c2),
  mood(17500, 45, 62, 55),
  e(18000, {
    type: "hint",
    hint: {
      id: "hint_1",
      kind: "objection",
      title: "Commission pushback",
      body: "Don't defend the rate. Pivot to guaranteed reach: 12k diners/month within 5 km. Competitor's 8% excludes their 6% listing fee.",
      triggerTurnId: t.c2.id,
      ttlMs: 20000,
      sources: ["OnFloor Ads playbook › Competitor facts"],
    },
  }),
  talk(20000, 38),
  ...spoken(t.a1),
  ...spoken(t.c3),
  mood(33500, 35, 70, 65),
  e(34000, {
    type: "hint",
    hint: {
      id: "hint_2",
      kind: "upsell",
      title: "Buying signal: Premium",
      body: "He asked for Premium. Confirm the weekend goal, then quote Premium with reach numbers.",
      triggerTurnId: t.c3.id,
      ttlMs: 20000,
      sources: ["OnFloor Ads playbook › Upsell and closing signals"],
    },
  }),
  partial(t.a2, 4),
  e(36500, {
    type: "guardrail",
    alert: {
      id: "guard_1",
      severity: "critical",
      policyId: "pol_activation",
      message: "Don't promise next-day activation without manager approval. Standard is 3 working days.",
      triggerTurnId: null,
    },
  }),
  final(t.a2),
  ...spoken(t.c4),
  talk(44000, 45),
  talk(48000, 45, 4000),
  talk(50000, 45, 6000, "dead_air"),
  mood(50000, 28, 74, 50),
  ...spoken(t.a3),
  talk(61500, 52),
  ...spoken(t.c5),
  mood(67500, 55, 40, 72),
  e(68000, {
    type: "hint",
    hint: {
      id: "hint_3",
      kind: "close",
      title: "Close now",
      body: "He's agreed in principle. Confirm the start date and send the Premium summary while he's on the line.",
      triggerTurnId: t.c5.id,
      ttlMs: 15000,
    },
  }),
  ...spoken(t.a4),
  talk(72500, 50),
  e(74000, { type: "call_ended", callId: LIVE_CALL_ID, durationMs: 74000 }),
  e(80000, { type: "scorecard_ready", callId: LIVE_CALL_ID }),
  e(86000, { type: "persona_ready", personaId: LIVE_PERSONA_ID, callId: LIVE_CALL_ID }),
].sort((a, b) => a.atMs - b.atMs);

export const liveCallTranscript: TranscriptTurn[] = Object.values(t);
