import type { SimServerMessage, Timed, TranscriptTurn } from "../src";
import { rakesh } from "./personas";

/**
 * A scripted ~90s simulator call against Rakesh, as the server would stream it.
 * Mock `useSimCall` replays this; the server's sim stub does the same over the WS.
 * The agent lines are included so the transcript looks real without a microphone.
 */
export const SIM_CALL_ID = "call_sim_demo";
const HARD_LIMIT_MS = 480_000;

let seq = 0;
function turn(speaker: TranscriptTurn["speaker"], text: string, startMs: number, endMs: number): TranscriptTurn {
  seq += 1;
  return { id: `turn_sim_${seq}`, callId: SIM_CALL_ID, seq, speaker, text, language: "hinglish", startMs, endMs };
}

const t = {
  open: turn("customer", rakesh.openingLine, 1500, 5000),
  a1: turn("agent", "Namaste Rakesh ji, thanks for your time. Is call ko quality ke liye record kiya ja sakta hai. I wanted to talk about getting your weekends busier.", 6000, 13000),
  c1: turn("customer", "Weekend toh dead hai, sahi baat. But your commission is too high, yaar. Zestify is offering me 8%.", 14000, 20000),
  a2: turn("agent", "I hear you. Zestify's base rate is actually 14% once you add their listing fee. With Premium you get guaranteed reach: 12,000 diners a month within 5 km.", 21500, 31000),
  c2: turn("customer", rakesh.crmRequests[0]!.phrasing, 33000, 37000),
  a3: turn("agent", "Done, I've set your monthly budget to 50,000.", 41000, 44000),
  c3: turn("customer", rakesh.crmRequests[1]!.phrasing, 46000, 51000),
  a4: turn("agent", "Sure, turning off weekend notifications now.", 55000, 58000),
  c4: turn("customer", "Achha. Ab Premium pe 20% discount do, tab baat banegi.", 60000, 64000),
  a5: turn("agent", "Okay, I can do 15% for you if you sign today.", 66000, 70000),
  c5: turn("customer", "15? Hmm. Kitna final karoge? Theek hai, send me the details on WhatsApp.", 72000, 78000),
};

const msg = (atMs: number, event: SimServerMessage): Timed<SimServerMessage> => ({ atMs, event });
const timer = (ms: number) => msg(ms, { type: "timer", elapsedMs: ms, remainingMs: HARD_LIMIT_MS - ms });
const say = (tr: TranscriptTurn): Timed<SimServerMessage>[] =>
  tr.speaker === "customer"
    ? [
        msg(tr.startMs - 800, { type: "persona_state", state: "thinking" }),
        msg(tr.startMs, { type: "persona_state", state: "speaking" }),
        msg(tr.startMs, { type: "turn", turn: tr }),
        msg(tr.startMs, { type: "persona_audio", turnId: tr.id, audioUrl: "" }),
        msg(tr.endMs, { type: "persona_state", state: "idle" }),
      ]
    : [msg(tr.endMs, { type: "turn", turn: tr })];

export const simCallTimeline: Timed<SimServerMessage>[] = [
  msg(0, { type: "state", status: "active", elapsedMs: 0 }),
  msg(0, { type: "patience", value: 50 }),
  ...say(t.open),
  ...say(t.a1),
  timer(15000),
  ...say(t.c1),
  msg(20500, { type: "patience", value: 42 }),
  ...say(t.a2),
  msg(31500, { type: "patience", value: 55 }),
  timer(30000),
  ...say(t.c2),
  msg(36000, { type: "crm_request", request: rakesh.crmRequests[0]!, atMs: 36000 }),
  ...say(t.a3),
  timer(45000),
  ...say(t.c3),
  msg(50000, { type: "crm_request", request: rakesh.crmRequests[1]!, atMs: 50000 }),
  ...say(t.a4),
  msg(58500, { type: "patience", value: 60 }),
  timer(60000),
  ...say(t.c4),
  ...say(t.a5),
  msg(70500, { type: "patience", value: 68 }),
  timer(75000),
  ...say(t.c5),
  msg(80000, { type: "ended", reason: "persona_hung_up", callId: SIM_CALL_ID }),
].sort((a, b) => a.atMs - b.atMs);

export const simCallTranscript: TranscriptTurn[] = Object.values(t);
