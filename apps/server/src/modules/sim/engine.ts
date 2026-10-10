import type {
  Agent,
  CrmAction,
  CrmRequest,
  Persona,
  Scenario,
  SimClientMessage,
  SimServerMessage,
  SimSessionStart,
  StartSim,
  TranscriptTurn,
} from "@onfloor/contracts";
import { applyPersonaTuning } from "@onfloor/contracts";
import { SIM_CALL_ID, simCallTimeline } from "@onfloor/contracts/fixtures";
import { calls } from "../../core/calls";
import { AppError } from "../../core/errors";
import { services } from "../../core/services";
import type { ChatMessage } from "../../core/services/llm";
import type { SynthesizedAudio } from "../../core/services/tts";
import { replayTimeline, swapId } from "../../core/timeline";
import { ENV } from "../../env.server";
import { agentWeakSpots } from "../knowledge";
import { translateTurn } from "../translation";
import { getPersona } from "../personas";
import { getScenario, listScenarios } from "../scenarios";
import { scoreInBackground } from "../scoring";
import { buildSystemPrompt, NUDGES, openingInstruction, parseReply, turnNote } from "./prompt";

/**
 * Pillar 1: the simulator engine. Server-authoritative: it owns the clock, the
 * transcript and the persona. One in-memory Session per active call; every turn is
 * persisted as it happens.
 *
 * Turn loop: the browser streams STT commits (`agent_turn`) → we wait AGENT_SETTLE_MS
 * for the agent to finish (more commits or `agent_activity` push it back) → one LLM
 * reply (job "roleplay") → control tags parsed → TTS → `turn` + `persona_audio`.
 *
 * STUB_ENGINES=true replays the fixture call instead (frontend dev without keys).
 */

type Send = (msg: SimServerMessage) => void;

/**
 * Pause after the last STT commit before the persona answers (STT VAD already waits 0.6s).
 * Long enough to bridge the pause between two sentences; measured: 700ms made the persona
 * answer every sentence fragment separately. Must stay above the client's activity ping.
 */
const AGENT_SETTLE_MS = 1100;
const DEAD_AIR_MS = 7000;
const MONOLOGUE_MS = 25_000;
const INTERRUPT_AFTER_MS = 20_000;
const MAX_NUDGES = 3;
const HISTORY_TURNS = 24;

interface RequestState {
  request: CrmRequest;
  status: "not_asked" | "pending" | "done";
  askedAt?: number;
}

interface Session {
  callId: string;
  agentId: string;
  persona: Persona;
  scenario: Scenario;
  language: StartSim["language"];
  system: string;
  sockets: Set<Send>;
  started: boolean;
  finished: boolean;
  /** Epoch ms of the call clock's zero. */
  startedAt: number;
  history: ChatMessage[];
  patience: number;
  requests: Map<string, RequestState>;
  crm: Record<string, unknown>;
  /** Bumped to cancel an in-flight reply (barge-in, new agent speech). */
  gen: number;
  replying: boolean;
  personaSpeakingUntil: number;
  /** The persona turn whose audio may still be playing, so its real end can be recorded. */
  speakingTurn: { id: string; startMs: number } | null;
  lastActivityAt: number;
  agentBuffer: { text: string; startMs: number; endMs: number }[];
  settleTimer: ReturnType<typeof setTimeout> | null;
  agentTalkStartedAt: number | null;
  nudges: number;
  wrapUp: boolean;
  hangingUp: boolean;
  tick: ReturnType<typeof setInterval> | null;
  lastTimerAt: number;
  stubCancel: (() => void) | null;
}

const sessions = new Map<string, Session>();

/** Persona audio, served by GET /api/sim/sessions/:callId/audio/:turnId. Kept 10 min. */
const audioStore = new Map<string, SynthesizedAudio>();
const audioKey = (callId: string, turnId: string) => `${callId}:${turnId}`;
export const getAudio = (callId: string, turnId: string) => audioStore.get(audioKey(callId, turnId)) ?? null;

const elapsed = (s: Session) => Date.now() - s.startedAt;
const broadcast = (s: Session, msg: SimServerMessage) => {
  for (const send of s.sockets) send(msg);
};
/** Rough spoken duration, for timers only (the browser reports the real end via playback_ended). */
const estimateMs = (text: string) => Math.max(1200, text.split(/\s+/).length * 380 + 400);

function newSession(
  callId: string,
  agentId: string,
  persona: Persona,
  scenario: Scenario,
  language: StartSim["language"],
  weakSpots: string[] = [],
): Session {
  return {
    callId,
    agentId,
    persona,
    scenario,
    language,
    system: buildSystemPrompt(persona, scenario, language, weakSpots),
    sockets: new Set(),
    started: false,
    finished: false,
    startedAt: Date.now(),
    history: [],
    patience: persona.traits.patience * 10,
    requests: new Map(persona.crmRequests.map((r) => [r.id, { request: r, status: "not_asked" }])),
    crm: { ...scenario.initialCrm },
    gen: 0,
    replying: false,
    personaSpeakingUntil: 0,
    speakingTurn: null,
    lastActivityAt: Date.now(),
    agentBuffer: [],
    settleTimer: null,
    agentTalkStartedAt: null,
    nudges: 0,
    wrapUp: false,
    hangingUp: false,
    tick: null,
    lastTimerAt: 0,
    stubCancel: null,
  };
}

// --- Session lifecycle ---------------------------------------------------------

export async function startSim(agent: Agent, input: StartSim): Promise<SimSessionStart> {
  const scenario = await getScenario(input.scenarioId);
  // Per-call tweaks from the picker (traits, archetype, pace, voice) on top of the stored persona.
  const persona = applyPersonaTuning(await getPersona(input.personaId ?? scenario.defaultPersonaId), input.tuning);
  const call = await calls.create({
    kind: "sim",
    agentId: agent.id,
    language: input.language,
    customerLabel: persona.name,
    scenarioId: scenario.id,
    personaId: persona.id,
    replayOfCallId: input.replayOfCallId ?? null,
  });
  // RAG: this agent's past mistakes on similar ground, fetched alongside the STT token.
  const [weak, sttUrl] = await Promise.all([
    agentWeakSpots(agent.id, `${scenario.objective} ${persona.objections.join(" ")} ${persona.tactics.join(" ")}`, 3),
    sttUrlFor(call.id, input.language),
  ]);
  const weakSpots = weak.map((w) => w.text.replace(/\s+/g, " ").slice(0, 300));
  if (weakSpots.length) console.log(`[sim] ${call.id}: pressing on ${weakSpots.length} weak spot(s) from ${agent.name}'s past calls`);
  sessions.set(call.id, newSession(call.id, agent.id, persona, scenario, input.language, weakSpots));
  return { callId: call.id, scenario, persona, sttUrl };
}

/** A fresh single-use STT URL ("" when ElevenLabs isn't configured). */
async function sttUrlFor(_callId: string, language: StartSim["language"]): Promise<string> {
  if (!ENV.ELEVENLABS_API_KEY) return "";
  const token = await services.stt.mintRealtimeToken();
  return services.stt.realtimeUrl({ language, keyTerms: ["OnFloor", "Premium", "Basic", "budget", "discount", "campaign"] }, token);
}

export async function refreshSttUrl(agent: Agent, callId: string): Promise<{ url: string }> {
  const call = await calls.getOwned(callId, agent);
  return { url: await sttUrlFor(callId, call.language) };
}

/** Replay a (live) call's extracted persona in the simulator. */
export async function replayCall(agent: Agent, sourceCallId: string): Promise<SimSessionStart> {
  const source = await calls.getOwned(sourceCallId, agent);
  if (!source.personaId) throw new AppError("BAD_REQUEST", { message: "No persona has been extracted from that call yet." });
  const persona = await getPersona(source.personaId);
  const scenarioId = source.scenarioId ?? (await listScenarios())[0]?.id;
  if (!scenarioId) throw new AppError("NOT_FOUND", { message: "No scenarios seeded." });
  return startSim(agent, { scenarioId, personaId: persona.id, language: persona.language, replayOfCallId: source.id });
}

export async function attachSocket(agent: Agent, callId: string, send: Send): Promise<() => void> {
  const call = await calls.getOwned(callId, agent);
  let s = sessions.get(callId);
  if (!s) {
    // Server restarted mid-call, or a session created elsewhere: rebuild from the DB.
    if (call.status !== "active" || !call.scenarioId || !call.personaId) {
      throw new AppError("BAD_REQUEST", { message: "That call has ended." });
    }
    s = newSession(callId, agent.id, await getPersona(call.personaId), await getScenario(call.scenarioId), call.language);
    sessions.set(callId, s);
  }
  const session = s;
  session.sockets.add(send);

  if (ENV.STUB_ENGINES) {
    if (!session.stubCancel) startStub(session);
  } else if (!session.started) {
    void begin(session);
  } else {
    // Reconnect: catch the client up.
    send({ type: "state", status: "active", elapsedMs: elapsed(session) });
    for (const turn of await calls.transcript(callId)) send({ type: "turn", turn });
    send({ type: "patience", value: Math.round(session.patience) });
  }
  return () => session.sockets.delete(send);
}

async function begin(s: Session) {
  s.started = true;
  s.startedAt = Date.now();
  s.lastActivityAt = Date.now();
  broadcast(s, { type: "state", status: "active", elapsedMs: 0 });
  broadcast(s, { type: "patience", value: Math.round(s.patience) });
  s.tick = setInterval(() => void tick(s), 1000);
  // The model sees the rep pick up first (Gemini wants a user turn before the model's).
  s.history.push({ role: "user", content: "Hello?" });

  // Rendered by the model so it matches the language rule and script (stored opening lines
  // are often Romanised Hinglish, which neither voice reads well in another language).
  await reply(s, openingInstruction(s.persona), { opening: true });
}

// --- Persona speech --------------------------------------------------------------

async function speak(s: Session, text: string) {
  if (s.finished || !text) return;
  const startMs = elapsed(s);
  const durationMs = estimateMs(text);
  let audio: SynthesizedAudio | null = null;
  try {
    audio = await services.tts.synthesize({
      text,
      voiceId: s.persona.voiceId,
      language: s.language,
      speed: { slow: 0.92, normal: 1, fast: 1.08 }[s.persona.speechStyle.pace],
    });
  } catch (err) {
    console.error("[sim] TTS failed", err);
    broadcast(s, { type: "error", code: "VOICE_FAILED", message: "Couldn't voice that line; it's in the transcript.", retryable: true });
  }
  if (s.finished) return;

  const turn = await calls.appendTurn(s.callId, {
    speaker: "customer",
    text,
    language: s.language,
    startMs,
    endMs: startMs + durationMs,
  });
  s.history.push({ role: "assistant", content: text });
  if (audio) {
    const key = audioKey(s.callId, turn.id);
    audioStore.set(key, audio);
    setTimeout(() => audioStore.delete(key), 10 * 60_000);
  }
  s.personaSpeakingUntil = Date.now() + durationMs;
  s.speakingTurn = { id: turn.id, startMs };
  broadcast(s, { type: "persona_state", state: "speaking" });
  broadcast(s, { type: "turn", turn });
  subtitle(s, turn);
  broadcast(s, {
    type: "persona_audio",
    turnId: turn.id,
    audioUrl: audio ? `/api/sim/sessions/${s.callId}/audio/${turn.id}` : "",
  });
}

/** English subtitle for a Hindi/Hinglish turn, pushed when Merge returns it (may lag the turn). */
function subtitle(s: Session, turn: TranscriptTurn) {
  if (turn.translation) return; // English call: already its own subtitle
  void translateTurn(turn).then((translation) => {
    if (translation) broadcast(s, { type: "turn_translation", turnId: turn.id, translation });
  });
}

function setPatience(s: Session, value: number) {
  const next = Math.max(0, Math.min(100, value));
  if (Math.round(next) === Math.round(s.patience)) return;
  s.patience = next;
  broadcast(s, { type: "patience", value: Math.round(next) });
}

function note(s: Session, extra?: string) {
  const now = Date.now();
  return turnNote({
    patience: s.patience,
    elapsedSec: Math.round(elapsed(s) / 1000),
    wrapUp: s.wrapUp,
    requests: [...s.requests.values()].map((r) => ({
      request: r.request,
      status: r.status,
      ...(r.askedAt && { askedSecAgo: Math.round((now - r.askedAt) / 1000) }),
    })),
    extra,
  });
}

/**
 * One persona reply. `instruction` is appended as the last user message (used for the
 * opening line and for interruptions); otherwise the call note rides on the agent's
 * latest message.
 */
async function reply(s: Session, instruction?: string, opts: { opening?: boolean } = {}) {
  if (s.finished || s.hangingUp) return;
  const gen = ++s.gen;
  s.replying = true;
  broadcast(s, { type: "persona_state", state: "thinking" });

  const recent = s.history.slice(-HISTORY_TURNS);
  const last = recent.at(-1);
  const messages: ChatMessage[] = [{ role: "system", content: s.system }, ...recent];
  if (instruction) messages.push({ role: "user", content: instruction });
  else if (last?.role === "user") messages[messages.length - 1] = { role: "user", content: `${last.content}\n\n${note(s)}` };

  try {
    const ask = (m: ChatMessage[]) =>
      services.llm.chat({ job: "roleplay", messages: m, temperature: 0.8, maxTokens: 220, timeoutMs: 20_000 });
    let parsed = parseReply(await ask(messages));
    // Lite models occasionally answer with tags only. One cheap retry for an actual line.
    if (!parsed.text && !parsed.hangUp && gen === s.gen) {
      const retry = parseReply(
        await ask([...messages, { role: "user", content: "[call note: you must SAY something out loud now, one short line, then the tags.]" }]),
      );
      parsed = { ...retry, crmRequestIds: [...parsed.crmRequestIds, ...retry.crmRequestIds], patienceDelta: parsed.patienceDelta ?? retry.patienceDelta };
    }
    if (gen !== s.gen || s.finished) return; // superseded by barge-in or newer speech

    for (const id of parsed.crmRequestIds) {
      const r = s.requests.get(id);
      if (!r || r.status !== "not_asked") continue;
      r.status = "pending";
      r.askedAt = Date.now();
      const atMs = elapsed(s);
      broadcast(s, { type: "crm_request", request: r.request, atMs });
      void calls.recordCrmRequestVoiced(s.callId, id, atMs).catch((e) => console.error("[sim] voiced", e));
    }
    if (!opts.opening && parsed.patienceDelta !== null) setPatience(s, s.patience + parsed.patienceDelta);

    const hangUp = parsed.hangUp || s.patience <= 0;
    if (hangUp) s.hangingUp = true;
    const line = parsed.text || (hangUp ? NUDGES[s.language][2]! : "");
    if (!line) {
      broadcast(s, { type: "persona_state", state: "idle" });
      return;
    }
    await speak(s, line);
    if (hangUp) {
      const wait = Math.max(0, s.personaSpeakingUntil - Date.now()) + 600;
      setTimeout(() => void endCall(s, "persona_hung_up"), wait);
    }
  } catch (err) {
    if (gen !== s.gen) return;
    console.error("[sim] reply failed", err);
    broadcast(s, { type: "persona_state", state: "idle" });
    broadcast(s, {
      type: "error",
      code: "LLM_FAILED",
      message: "The customer didn't catch that. Say it again.",
      retryable: true,
    });
  } finally {
    if (gen === s.gen) s.replying = false;
  }
}

// --- Agent input -----------------------------------------------------------------

function scheduleFlush(s: Session) {
  if (s.settleTimer) clearTimeout(s.settleTimer);
  s.settleTimer = setTimeout(() => void flushAgent(s), AGENT_SETTLE_MS);
}

async function flushAgent(s: Session, extra?: string) {
  if (s.settleTimer) clearTimeout(s.settleTimer);
  s.settleTimer = null;
  const parts = s.agentBuffer.splice(0);
  s.agentTalkStartedAt = null;
  s.nudges = 0;

  if (parts.length) {
    const text = parts.map((p) => p.text).join(" ");
    const startMs = parts[0]!.startMs;
    const endMs = parts.at(-1)!.endMs;
    const turn = await calls.appendTurn(s.callId, { speaker: "agent", text, language: s.language, startMs, endMs });
    broadcast(s, { type: "turn", turn });
    subtitle(s, turn);
    s.history.push({ role: "user", content: text });
    if (endMs - startMs > MONOLOGUE_MS) setPatience(s, s.patience - 10);
  } else if (extra) {
    s.history.push({ role: "user", content: "(the rep keeps talking at length)" });
  } else {
    return;
  }
  await reply(s, extra ? note(s, extra) : undefined);
}

export async function handleClientMessage(callId: string, msg: SimClientMessage) {
  const s = sessions.get(callId);
  if (!s || s.finished) return;
  const now = Date.now();

  switch (msg.type) {
    case "crm_action":
      await onCrmAction(s, msg.action);
      return;
    case "end":
      await endCall(s, "agent");
      return;
  }
  if (ENV.STUB_ENGINES) return; // the fixture already contains the conversation

  switch (msg.type) {
    case "agent_turn": {
      s.lastActivityAt = now;
      s.agentTalkStartedAt ??= now;
      // New speech supersedes a reply still being generated.
      if (s.replying) s.gen++;
      const endMs = Math.min(msg.endMs, elapsed(s));
      s.agentBuffer.push({ text: msg.text, startMs: Math.min(msg.startMs, endMs), endMs });
      scheduleFlush(s);
      return;
    }
    case "agent_activity": {
      s.lastActivityAt = now;
      s.agentTalkStartedAt ??= now;
      // Still talking: a reply being generated would cut them off mid-sentence. Drop it;
      // the next settle answers everything they said.
      if (s.replying && now >= s.personaSpeakingUntil) {
        s.gen++;
        s.replying = false;
        broadcast(s, { type: "persona_state", state: "idle" });
      }
      if (s.settleTimer) scheduleFlush(s);
      const talking = now - s.agentTalkStartedAt;
      if (s.persona.speechStyle.interrupts && talking > INTERRUPT_AFTER_MS && !s.replying) {
        s.agentTalkStartedAt = now; // at most one cut-off per stretch
        setPatience(s, s.patience - 8);
        await flushAgent(s, "the rep has been talking for over 20 seconds without stopping. Cut them off mid-sentence.");
      }
      return;
    }
    case "interrupt": {
      if (s.speakingTurn && now < s.personaSpeakingUntil) closeSpeakingTurn(s);
      if (now < s.personaSpeakingUntil || s.replying) {
        s.gen++;
        s.replying = false;
        s.personaSpeakingUntil = now;
        broadcast(s, { type: "persona_state", state: "idle" });
        if (s.persona.archetype === "impatient") setPatience(s, s.patience - 3);
      }
      s.lastActivityAt = now;
      return;
    }
    case "playback_ended": {
      if (s.speakingTurn?.id === msg.turnId) closeSpeakingTurn(s);
      s.personaSpeakingUntil = Math.min(s.personaSpeakingUntil, now);
      s.lastActivityAt = now;
      if (!s.replying) broadcast(s, { type: "persona_state", state: "idle" });
      return;
    }
  }
}

/** Replace the estimated end of the persona's current line with the real one. */
function closeSpeakingTurn(s: Session) {
  const t = s.speakingTurn;
  if (!t) return;
  s.speakingTurn = null;
  void calls.setTurnEnd(t.id, Math.max(t.startMs + 300, elapsed(s))).catch((e) => console.error("[sim] turn end", e));
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) return JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  return a === b || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 1e-9);
}

async function onCrmAction(s: Session, action: CrmAction) {
  await calls.recordCrmAction(s.callId, action);
  s.crm[action.field] = action.to;
  for (const r of s.requests.values()) {
    if (r.request.field !== action.field || r.status === "not_asked") continue;
    r.status = sameValue(action.to, r.request.value) ? "done" : "pending";
  }
}

// --- Clock -----------------------------------------------------------------------

async function tick(s: Session) {
  if (s.finished) return;
  const now = Date.now();
  const ms = elapsed(s);
  const hardMs = s.scenario.hardLimitSec * 1000;

  if (now - s.lastTimerAt >= 5000) {
    s.lastTimerAt = now;
    broadcast(s, { type: "timer", elapsedMs: ms, remainingMs: Math.max(0, hardMs - ms) });
  }
  if (!s.wrapUp && ms >= s.scenario.softLimitSec * 1000) s.wrapUp = true;
  if (ms >= hardMs) return endCall(s, "time");

  // Agent went quiet mid-stretch without a commit: stop counting it as talking.
  if (s.agentTalkStartedAt && now - s.lastActivityAt > 2500 && !s.settleTimer) s.agentTalkStartedAt = null;

  const quietSince = Math.max(s.lastActivityAt, s.personaSpeakingUntil);
  const idle = !s.replying && !s.hangingUp && !s.settleTimer && !s.agentTalkStartedAt && s.agentBuffer.length === 0;
  if (idle && s.history.length > 0 && now - quietSince > DEAD_AIR_MS) {
    s.nudges += 1;
    s.lastActivityAt = now;
    setPatience(s, s.patience - 10);
    if (s.nudges >= MAX_NUDGES || s.patience <= 0) {
      s.hangingUp = true;
      await speak(s, NUDGES[s.language][2]!);
      setTimeout(() => void endCall(s, "persona_hung_up"), Math.max(0, s.personaSpeakingUntil - Date.now()) + 600);
    } else {
      await speak(s, NUDGES[s.language][s.nudges - 1]!);
    }
  }
}

// --- End -------------------------------------------------------------------------

async function endCall(s: Session, reason: "agent" | "persona_hung_up" | "time") {
  if (s.finished) return;
  broadcast(s, { type: "persona_state", state: "idle" });
  broadcast(s, { type: "ended", reason, callId: s.callId });
  await finishSim(s.callId);
}

function cleanup(s: Session) {
  s.finished = true;
  s.gen++;
  if (s.tick) clearInterval(s.tick);
  if (s.settleTimer) clearTimeout(s.settleTimer);
  s.stubCancel?.();
  sessions.delete(s.callId);
}

/** Idempotent. Ends the call, then scores it in the background. */
export async function finishSim(callId: string): Promise<{ callId: string; status: string }> {
  const s = sessions.get(callId);
  if (s) {
    // Persist anything the agent said that hasn't settled yet.
    if (s.agentBuffer.length && !s.finished) {
      const parts = s.agentBuffer.splice(0);
      await calls.appendTurn(callId, {
        speaker: "agent",
        text: parts.map((p) => p.text).join(" "),
        language: s.language,
        startMs: parts[0]!.startMs,
        endMs: parts.at(-1)!.endMs,
      });
    }
    cleanup(s);
  }
  const call = await calls.get(callId);
  if (call.status !== "active") return { callId, status: call.status };

  const agentTurns = (await calls.transcript(callId)).filter((t) => t.speaker === "agent").length;
  // Fewer than 2 agent turns isn't enough conversation to judge fairly.
  if (agentTurns < 2) {
    await calls.end(callId, "abandoned");
    return { callId, status: "abandoned" };
  }
  await calls.end(callId, "scoring");
  scoreInBackground(callId);
  return { callId, status: "scoring" };
}

// --- Stub (STUB_ENGINES=true) --------------------------------------------------------

function startStub(s: Session) {
  s.startedAt = Date.now();
  s.started = true;
  s.stubCancel = replayTimeline(
    simCallTimeline,
    (msg) => {
      broadcast(s, msg);
      void persistStubEvent(s, msg);
    },
    { rewrite: (m) => swapId(m, SIM_CALL_ID, s.callId), speed: ENV.STUB_SPEED },
  );
}

async function persistStubEvent(s: Session, msg: SimServerMessage) {
  try {
    if (msg.type === "turn") {
      const { speaker, text, language, startMs, endMs } = msg.turn;
      await calls.appendTurn(s.callId, { speaker, text, language, startMs, endMs });
    } else if (msg.type === "crm_request") {
      await calls.recordCrmRequestVoiced(s.callId, msg.request.id, msg.atMs);
    } else if (msg.type === "ended") {
      await finishSim(s.callId);
    }
  } catch (err) {
    console.error("[sim stub] persist failed", err);
  }
}
