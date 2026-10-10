import type {
  Agent,
  Campaign,
  CrmRequest,
  Disposition,
  DispositionSuggestion,
  GuidanceState,
  Merchant,
  Persona,
  Scenario,
  SimClientMessage,
  SimPhase,
  SimServerMessage,
  SimSessionStart,
  StartSim,
  TranscriptTurn,
  WorkspaceAction,
  WorkspaceResult,
} from "@onfloor/contracts";
import {
  addMonths,
  applyPersonaTuning,
  ECHO_TAIL_MS,
  isEcho,
  callbackSlotSchema,
  renderEmail,
  resolveRequest,
  spokenDate,
  startSimSchema,
  toMerchantDashboard,
  toMerchantSummary,
  toNuggetTicket,
  todayIst,
  validateCampaign,
} from "@onfloor/contracts";
import { SIM_CALL_ID, simCallTimeline, simWrapUpTimeline } from "@onfloor/contracts/fixtures";
import { newId } from "@onfloor/db/schema";
import { calls } from "../../core/calls";
import { AppError } from "../../core/errors";
import { services } from "../../core/services";
import type { ChatMessage } from "../../core/services/llm";
import type { SynthesizedAudio } from "../../core/services/tts";
import { replayTimeline, swapId } from "../../core/timeline";
import { ENV } from "../../env.server";
import { agentWeakSpots } from "../knowledge";
import { ensureMerchantForPersona, findMerchantByUid, getMerchant } from "../merchants";
import { getPersona } from "../personas";
import { getScenario, listScenarios } from "../scenarios";
import { scoreInBackground } from "../scoring";
import { translateTurn } from "../translation";
import { Coach, suggestDisposition } from "./guidance";
import { buildSystemPrompt, NUDGES, openingInstruction, parseReply, requestsFor, turnNote } from "./prompt";

/**
 * Pillar 1: the simulator engine, for Tomato's outbound Max Grow calls. Server-authoritative:
 * it owns the phases, clocks, transcript, the tools' state and the persona. One in-memory
 * Session per active call; every turn and workspace action is persisted as it happens.
 *
 * Phases: dialing (Nugget ticket shown) → ringing after the scenario's random 2–5s delay →
 * connected on the agent's `answer` → wrap_up when the conversation ends (the agent has
 * `scenario.dispositionSec` to send the email and dispose) → done (scored in the background).
 *
 * Turn loop: the browser streams STT commits (`agent_turn`) → we wait AGENT_SETTLE_MS
 * for the agent to finish (more commits or `agent_activity` push it back) → one LLM
 * reply (job "roleplay") → control tags parsed → TTS → `turn` + `persona_audio`.
 *
 * STUB_ENGINES=true replays the fixture conversation after `answer` (frontend dev without keys);
 * phases, tools and wrap-up stay real.
 */

type Send = (msg: SimServerMessage) => void;

/**
 * Pause after the last STT commit before the persona answers (STT VAD already waits 0.6s).
 * Long enough to bridge the pause between two sentences; measured: 700ms made the persona
 * answer every sentence fragment separately. Must stay above the client's activity ping.
 */
const AGENT_SETTLE_MS = 1100;
/**
 * Silence before the customer says "Hello? Are you there?". Generous: agents pause to read the
 * dashboard or think, and a persona that pipes up after a few seconds feels like it's talking to
 * itself. Each further nudge needs another full stretch of silence.
 */
const DEAD_AIR_MS = 12_000;
const MONOLOGUE_MS = 25_000;
const INTERRUPT_AFTER_MS = 20_000;
const MAX_NUDGES = 3;
const HISTORY_TURNS = 24;
/** Ringing this long without `answer` → missed call. */
const MISSED_AFTER_MS = 45_000;
/** The disposition suggestion never lands sooner than this after hang-up. */
const SUGGESTION_MIN_MS = 2000;

interface RequestState {
  request: CrmRequest;
  status: "not_asked" | "pending" | "done";
  askedAt?: number;
}

interface Session {
  callId: string;
  agentId: string;
  agentName: string;
  persona: Persona;
  merchant: Merchant;
  scenario: Scenario;
  language: StartSim["language"];
  callDate: string;
  system: string;
  sockets: Set<Send>;
  phase: SimPhase;
  started: boolean;
  /** The conversation is being ended (set synchronously, before any await). */
  ending: boolean;
  finished: boolean;
  /** Epoch ms of the call clock's zero (set again at `answer`). */
  startedAt: number;
  history: ChatMessage[];
  patience: number;
  requests: Map<string, RequestState>;
  /** What the customer decided, from their <decision/> tag. The disposition is audited against it. */
  decision: Disposition | null;
  campaign: Campaign | null;
  emailTemplate: string | null;
  /** Bumped to cancel an in-flight reply (barge-in, new agent speech). */
  gen: number;
  replying: boolean;
  personaSpeakingUntil: number;
  /** The persona's recent lines, for the echo guard. */
  recentPersonaLines: string[];
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
  ringTimer: ReturnType<typeof setTimeout> | null;
  missedTimer: ReturnType<typeof setTimeout> | null;
  wrapUpEndsAt: number;
  wrapUpTimer: ReturnType<typeof setTimeout> | null;
  wrapUpTick: ReturnType<typeof setInterval> | null;
  guidanceOn: boolean;
  /** The live coach (null with guidance off, and in stub mode, where the fixture streams guidance). */
  coach: Coach | null;
  guidance: GuidanceState | null;
  suggestion: DispositionSuggestion | null;
  /** Last results, re-sent on reconnect so the tools restore their state. */
  lastLookup: WorkspaceResult | null;
  stubCancel: (() => void) | null;
}

const sessions = new Map<string, Session>();

/** Persona audio, served by GET /api/sim/sessions/:callId/audio/:turnId. Kept 10 min. */
const audioStore = new Map<string, SynthesizedAudio>();
const audioKey = (callId: string, turnId: string) => `${callId}:${turnId}`;
export const getAudio = (callId: string, turnId: string) => audioStore.get(audioKey(callId, turnId)) ?? null;

const elapsed = (s: Session) => (s.phase === "dialing" || s.phase === "ringing" ? 0 : Date.now() - s.startedAt);
const broadcast = (s: Session, msg: SimServerMessage) => {
  for (const send of s.sockets) send(msg);
};
/** Rough spoken duration, for timers only (the browser reports the real end via playback_ended). */
const estimateMs = (text: string) => Math.max(1200, text.split(/\s+/).length * 380 + 400);
const rand = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

function newSession(input: {
  callId: string;
  agent: Agent;
  persona: Persona;
  merchant: Merchant;
  scenario: Scenario;
  language: StartSim["language"];
  callDate: string;
  guidance: boolean;
  weakSpots?: string[];
}): Session {
  const { persona, merchant } = input;
  const s: Session = {
    callId: input.callId,
    agentId: input.agent.id,
    agentName: input.agent.name,
    persona,
    merchant,
    scenario: input.scenario,
    language: input.language,
    callDate: input.callDate,
    system: buildSystemPrompt({ persona, merchant, language: input.language, callDate: input.callDate, weakSpots: input.weakSpots }),
    sockets: new Set(),
    phase: "dialing",
    started: false,
    ending: false,
    finished: false,
    startedAt: Date.now(),
    history: [],
    patience: persona.traits.patience * 10,
    requests: new Map(requestsFor(merchant, persona).map((r) => [r.id, { request: r, status: "not_asked" }])),
    decision: null,
    campaign: null,
    emailTemplate: null,
    gen: 0,
    replying: false,
    personaSpeakingUntil: 0,
    recentPersonaLines: [],
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
    ringTimer: null,
    missedTimer: null,
    wrapUpEndsAt: 0,
    wrapUpTimer: null,
    wrapUpTick: null,
    guidanceOn: input.guidance,
    coach: null,
    guidance: null,
    suggestion: null,
    lastLookup: null,
    stubCancel: null,
  };
  if (input.guidance && !ENV.STUB_ENGINES) {
    s.coach = new Coach(
      { merchant, scenario: input.scenario, agentName: input.agent.name, callDate: input.callDate },
      (g) => {
        s.guidance = g;
        broadcast(s, { type: "guidance", guidance: g });
      },
      () => elapsed(s),
    );
  }
  return s;
}

// --- Session lifecycle ---------------------------------------------------------

/**
 * The picker's choices → the merchant on the line + the behaviour to play.
 * A live-call persona brings its own identity (a merchant profile is derived for it).
 */
async function resolveCast(scenario: Scenario, input: StartSim): Promise<{ merchant: Merchant; persona: Persona }> {
  const picked = input.personaId ? await getPersona(input.personaId) : null;
  const merchant = input.merchantId
    ? await getMerchant(input.merchantId)
    : picked?.source === "live_call"
      ? await ensureMerchantForPersona(picked)
      : await getMerchant(scenario.defaultMerchantId);
  const base = picked ?? (await getPersona(merchant.defaultPersonaId).catch(() => getPersona(scenario.defaultPersonaId)));
  const tuned = applyPersonaTuning(base, input.tuning);
  // The voice belongs to the person on the line: the merchant's, unless replaying a live caller or tuned.
  const voiceId = input.tuning?.voiceId ?? (base.source === "live_call" ? base.voiceId : merchant.voiceId);
  return { merchant, persona: { ...tuned, voiceId } };
}

export async function startSim(agent: Agent, raw: StartSim): Promise<SimSessionStart> {
  const input = startSimSchema.parse(raw);
  const scenario = input.scenarioId ? await getScenario(input.scenarioId) : (await listScenarios())[0];
  if (!scenario) throw new AppError("NOT_FOUND", { message: "No scenarios seeded. Run bun run db:seed." });
  const { merchant, persona } = await resolveCast(scenario, input);
  const callDate = todayIst();
  const call = await calls.create({
    kind: "sim",
    agentId: agent.id,
    language: input.language,
    customerLabel: `${merchant.answerer.name} · ${merchant.restaurantName}`,
    scenarioId: scenario.id,
    personaId: persona.id,
    merchantId: merchant.id,
    guidance: input.guidance,
    replayOfCallId: input.replayOfCallId ?? null,
  });
  // RAG: this agent's past mistakes on similar ground, fetched alongside the STT token.
  const [weak, sttUrl] = await Promise.all([
    agentWeakSpots(agent.id, `${scenario.objective} ${merchant.concerns.join(" ")} ${persona.objections.join(" ")}`, 3),
    sttUrlFor(call.id, input.language),
  ]);
  const weakSpots = weak.map((w) => w.text.replace(/\s+/g, " ").slice(0, 300));
  if (weakSpots.length) console.log(`[sim] ${call.id}: pressing on ${weakSpots.length} weak spot(s) from ${agent.name}'s past calls`);
  sessions.set(
    call.id,
    newSession({ callId: call.id, agent, persona, merchant, scenario, language: input.language, callDate, guidance: input.guidance, weakSpots }),
  );
  return {
    callId: call.id,
    scenario,
    persona,
    merchant: toMerchantSummary(merchant),
    ticket: toNuggetTicket(merchant),
    agentName: agent.name,
    guidance: input.guidance,
    callDate,
    sttUrl,
  };
}

/** A fresh single-use STT URL ("" when ElevenLabs isn't configured). */
async function sttUrlFor(_callId: string, language: StartSim["language"]): Promise<string> {
  if (!ENV.ELEVENLABS_API_KEY) return "";
  const token = await services.stt.mintRealtimeToken();
  return services.stt.realtimeUrl({ language, keyTerms: ["Tomato", "Max Grow", "DRR", "commission", "incremental", "payout", "campaign", "Ad Studio"] }, token);
}

export async function refreshSttUrl(agent: Agent, callId: string): Promise<{ url: string }> {
  const call = await calls.getOwned(callId, agent);
  return { url: await sttUrlFor(callId, call.language) };
}

/** Replay a (live) call's extracted persona in the simulator. */
export async function replayCall(agent: Agent, sourceCallId: string, guidance = true): Promise<SimSessionStart> {
  const source = await calls.getOwned(sourceCallId, agent);
  if (!source.personaId) throw new AppError("BAD_REQUEST", { message: "No persona has been extracted from that call yet." });
  const persona = await getPersona(source.personaId);
  return startSim(agent, { personaId: persona.id, language: persona.language, guidance, replayOfCallId: source.id });
}

/** After a server restart: rebuild the session from the DB (the conversation so far becomes history). */
async function rebuild(agent: Agent, callId: string): Promise<Session> {
  const call = await calls.getOwned(callId, agent);
  if (call.status !== "active" || !call.scenarioId || !call.personaId || !call.merchantId) {
    throw new AppError("BAD_REQUEST", { message: "That call has ended." });
  }
  const [persona, merchant, scenario, turns] = await Promise.all([
    getPersona(call.personaId),
    getMerchant(call.merchantId),
    getScenario(call.scenarioId),
    calls.transcript(callId),
  ]);
  const s = newSession({ callId, agent, persona, merchant, scenario, language: call.language, callDate: todayIst(new Date(call.startedAt)), guidance: call.guidance });
  if (turns.length) {
    s.phase = "connected";
    s.started = true;
    s.startedAt = Date.now() - (turns.at(-1)?.endMs ?? 0);
    s.history = turns.map((t) => ({ role: t.speaker === "customer" ? "assistant" : "user", content: t.text }) as ChatMessage);
    s.tick = setInterval(() => void tick(s), 1000);
  }
  return s;
}

export async function attachSocket(agent: Agent, callId: string, send: Send): Promise<() => void> {
  await calls.getOwned(callId, agent);
  let s = sessions.get(callId);
  if (!s) {
    s = await rebuild(agent, callId);
    sessions.set(callId, s);
  }
  const session = s;
  session.sockets.add(send);

  if (session.phase === "dialing" && !session.ringTimer) {
    send({ type: "phase", phase: "dialing", remainingMs: null });
    const [min, max] = session.scenario.ringDelayMs;
    session.ringTimer = setTimeout(() => ring(session), rand(min, max));
  } else {
    // Reconnect: catch the client up.
    send({ type: "phase", phase: session.phase, remainingMs: session.phase === "wrap_up" ? Math.max(0, session.wrapUpEndsAt - Date.now()) : null });
    if (session.phase !== "dialing" && session.phase !== "ringing") {
      send({ type: "state", status: session.phase === "wrap_up" ? "wrap_up" : "active", elapsedMs: elapsed(session) });
      for (const turn of await calls.transcript(callId)) send({ type: "turn", turn });
      send({ type: "patience", value: Math.round(session.patience) });
    }
    if (session.lastLookup) send({ type: "workspace_result", result: session.lastLookup });
    if (session.campaign) send({ type: "workspace_result", result: { kind: "campaign_launch", ok: true, error: null, campaign: session.campaign } });
    if (session.guidance) send({ type: "guidance", guidance: session.guidance });
    if (session.suggestion) send({ type: "disposition_suggestion", suggestion: session.suggestion });
  }
  return () => session.sockets.delete(send);
}

function setPhase(s: Session, phase: SimPhase, remainingMs: number | null = null) {
  s.phase = phase;
  broadcast(s, { type: "phase", phase, remainingMs });
}

function ring(s: Session) {
  s.ringTimer = null;
  if (s.finished || s.phase !== "dialing") return;
  setPhase(s, "ringing");
  s.missedTimer = setTimeout(() => void endConversation(s, "missed"), MISSED_AFTER_MS);
}

async function answer(s: Session) {
  if (s.phase !== "ringing" && s.phase !== "dialing") return;
  if (s.ringTimer) clearTimeout(s.ringTimer);
  if (s.missedTimer) clearTimeout(s.missedTimer);
  s.ringTimer = s.missedTimer = null;
  s.startedAt = Date.now();
  s.lastActivityAt = Date.now();
  setPhase(s, "connected");
  await calls.markConnected(s.callId);
  s.coach?.start();
  if (ENV.STUB_ENGINES) startStub(s);
  else await begin(s);
}

async function begin(s: Session) {
  s.started = true;
  broadcast(s, { type: "state", status: "active", elapsedMs: 0 });
  broadcast(s, { type: "patience", value: Math.round(s.patience) });
  s.tick = setInterval(() => void tick(s), 1000);
  // The model needs a user turn before its own: the phone ringing is it.
  s.history.push({ role: "user", content: "(the phone rings; you pick up)" });

  // Rendered by the model so it matches the language rule (stored opening lines are often
  // Romanised Hinglish, which neither voice reads well in another language).
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
  if (s.finished || s.phase !== "connected") return;

  const turn = await calls.appendTurn(s.callId, {
    speaker: "customer",
    text,
    language: s.language,
    startMs,
    endMs: startMs + durationMs,
  });
  s.history.push({ role: "assistant", content: text });
  s.recentPersonaLines = [text, ...s.recentPersonaLines].slice(0, 2);
  if (audio) {
    const key = audioKey(s.callId, turn.id);
    audioStore.set(key, audio);
    setTimeout(() => audioStore.delete(key), 10 * 60_000);
  }
  s.personaSpeakingUntil = Date.now() + durationMs;
  s.speakingTurn = { id: turn.id, startMs };
  broadcast(s, { type: "persona_state", state: "speaking" });
  broadcast(s, { type: "turn", turn });
  onNewTurn(s, turn);
  broadcast(s, {
    type: "persona_audio",
    turnId: turn.id,
    audioUrl: audio ? `/api/sim/sessions/${s.callId}/audio/${turn.id}` : "",
  });
}

/** Every committed turn: subtitle it, and let the coach re-read the call. */
function onNewTurn(s: Session, turn: TranscriptTurn) {
  subtitle(s, turn);
  if (s.coach) void calls.transcript(s.callId).then((turns) => s.coach?.onTurns(turns));
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
    decision: s.decision,
    requests: [...s.requests.values()].map((r) => ({
      request: r.request,
      status: r.status,
      ...(r.askedAt && { askedSecAgo: Math.round((now - r.askedAt) / 1000) }),
    })),
    extra,
  });
}

function recordDecision(s: Session, decision: Disposition) {
  if (s.decision) return;
  s.decision = decision;
  void calls.recordWorkspace(s.callId, { actor: "persona", kind: "decision", body: { value: decision }, atMs: elapsed(s) }).catch((e) => console.error("[sim] decision", e));
}

/**
 * One persona reply. `instruction` is appended as the last user message (used for the
 * opening line and for interruptions); otherwise the call note rides on the agent's
 * latest message.
 */
async function reply(s: Session, instruction?: string, opts: { opening?: boolean } = {}) {
  if (s.finished || s.hangingUp || s.phase !== "connected") return;
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
      parsed = {
        ...retry,
        crmRequestIds: [...parsed.crmRequestIds, ...retry.crmRequestIds],
        patienceDelta: parsed.patienceDelta ?? retry.patienceDelta,
        decision: parsed.decision ?? retry.decision,
      };
    }
    if (gen !== s.gen || s.finished || s.phase !== "connected") return; // superseded by barge-in or newer speech

    for (const id of parsed.crmRequestIds) {
      const r = s.requests.get(id);
      if (!r || r.status !== "not_asked") continue;
      r.status = "pending";
      r.askedAt = Date.now();
      const atMs = elapsed(s);
      broadcast(s, { type: "crm_request", request: r.request, atMs });
      s.coach?.noteRequest(r.request);
      void calls.recordCrmRequestVoiced(s.callId, id, atMs).catch((e) => console.error("[sim] voiced", e));
    }
    if (parsed.decision) recordDecision(s, parsed.decision);
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
      setTimeout(() => void endConversation(s, "persona_hung_up"), wait);
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

async function persistAgentBuffer(s: Session): Promise<TranscriptTurn | null> {
  const parts = s.agentBuffer.splice(0);
  if (!parts.length) return null;
  return calls.appendTurn(s.callId, {
    speaker: "agent",
    text: parts.map((p) => p.text).join(" "),
    language: s.language,
    startMs: parts[0]!.startMs,
    endMs: parts.at(-1)!.endMs,
  });
}

async function flushAgent(s: Session, extra?: string) {
  if (s.settleTimer) clearTimeout(s.settleTimer);
  s.settleTimer = null;
  s.agentTalkStartedAt = null;
  s.nudges = 0;

  const turn = await persistAgentBuffer(s);
  if (turn) {
    broadcast(s, { type: "turn", turn });
    onNewTurn(s, turn);
    acknowledgeRequests(s, turn.text);
    s.history.push({ role: "user", content: turn.text });
    if (turn.endMs - turn.startMs > MONOLOGUE_MS) setPatience(s, s.patience - 10);
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
    case "answer":
      await answer(s);
      return;
    case "workspace":
      await onWorkspace(s, msg.action);
      return;
    case "end":
      await endConversation(s, s.phase === "connected" ? "agent" : "missed");
      return;
    case "ping":
      return;
  }
  if (ENV.STUB_ENGINES || s.phase !== "connected") return; // the fixture already contains the conversation

  switch (msg.type) {
    case "agent_turn": {
      // Echo guard (the browser checks too): the persona's own voice leaking back through the
      // speakers, transcribed and committed as if the agent said it. Answering it is the persona
      // "talking to itself". Only speech that overlaps its playback (or the tail) can be an echo.
      const segmentStartedAt = s.startedAt + msg.startMs;
      if (segmentStartedAt <= s.personaSpeakingUntil + ECHO_TAIL_MS && isEcho(msg.text, s.recentPersonaLines)) {
        console.log(`[sim] ${s.callId}: dropped echo "${msg.text.slice(0, 60)}"`);
        return;
      }
      s.lastActivityAt = now;
      s.agentTalkStartedAt ??= now;
      // New speech supersedes a reply still being generated.
      if (s.replying) s.gen++;
      const endMs = Math.min(msg.endMs, elapsed(s));
      s.agentBuffer.push({ text: msg.text, startMs: Math.max(0, Math.min(msg.startMs, endMs)), endMs });
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

// --- Workspace (Nugget / Merchant Dashboard / Ad Studio) -------------------------------

const fail = <K extends WorkspaceResult["kind"]>(kind: K, error: string) =>
  ({ kind, ok: false, error, ...(kind === "campaign_launch" ? { campaign: null } : kind === "email_sent" ? { email: null } : {}) }) as WorkspaceResult;

/** The email the customer wants used: the corrected one if they gave it, else the one on record. */
function currentEmail(s: Session): string {
  const update = [...s.requests.values()].find((r) => r.request.kind === "email_update" && r.status !== "not_asked");
  return update ? resolveRequest(update.request, s.callDate).email! : s.merchant.email;
}

/**
 * The rep repeating an ask back ("noted, orders@…", "two months", "4 PM tomorrow") settles it in
 * the persona's eyes, so it stops re-asking. The tools audit still checks what was actually set.
 */
function acknowledgeRequests(s: Session, said: string) {
  const text = said.toLowerCase();
  for (const r of s.requests.values()) {
    if (r.status !== "pending") continue;
    const v = resolveRequest(r.request, s.callDate);
    const [, month = "", day = ""] = (v.date ? spokenDate(v.date) : "").toLowerCase().match(/^(\w+) (\d+)/) ?? [];
    const hour = v.time ? String(Number(v.time.split(":")[0]) % 12 || 12) : "";
    const ok =
      r.request.kind === "email_update" ? text.includes(v.email!.split("@")[0]!)
        : r.request.kind === "duration" ? new RegExp(`\\b(${v.months}|${MONTH_WORDS[v.months!] ?? "_"})\\s*(months?|mahine)`).test(text)
          : r.request.kind === "start_date" ? (!!month && text.includes(month) && text.includes(day)) || /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(text)
            : !!hour && new RegExp(`\\b${hour}\\b`).test(text);
    if (ok) r.status = "done";
  }
}
const MONTH_WORDS: Record<number, string> = { 1: "one", 2: "two", 3: "three", 4: "four", 6: "six", 12: "twelve" };

/** A launched campaign settles the requests it reflects, so the persona stops asking. */
function settleRequests(s: Session, c: Campaign) {
  for (const r of s.requests.values()) {
    if (r.status === "not_asked") continue;
    const v = resolveRequest(r.request, s.callDate);
    const ok =
      r.request.kind === "email_update" ? c.email.toLowerCase() === v.email
        : r.request.kind === "start_date" ? c.startDate === v.date
          : r.request.kind === "duration" ? c.endDate >= addMonths(c.startDate, v.months!)
            : false;
    if (ok) r.status = "done";
  }
}
async function onWorkspace(s: Session, action: WorkspaceAction) {
  const atMs = elapsed(s);
  const log = (body: Record<string, unknown>) =>
    calls.recordWorkspace(s.callId, { actor: "agent", kind: action.kind, body, atMs }).catch((e) => console.error("[sim] workspace log", e));
  const result = (r: WorkspaceResult) => broadcast(s, { type: "workspace_result", result: r });
  const live = s.phase === "connected" || s.phase === "wrap_up";

  switch (action.kind) {
    case "tab_opened": {
      void log({ tab: action.tab });
      if (action.tab === "merchant_dashboard") s.coach?.dashboardOpened();
      return result({ kind: "tab_opened", ok: true });
    }
    case "dashboard_lookup": {
      const found = await findMerchantByUid(action.uid);
      void log({ uid: action.uid, found: !!found, matchesTicket: action.uid.trim() === s.merchant.uid });
      const r: WorkspaceResult = { kind: "dashboard_lookup", ok: !!found, uid: action.uid, merchant: found ? toMerchantDashboard(found) : null };
      s.lastLookup = r;
      if (found?.id === s.merchant.id) s.coach?.markTool("lookup");
      return result(r);
    }
    case "campaign_launch": {
      if (!live) return result(fail("campaign_launch", "Pick up the call first."));
      const target = await findMerchantByUid(action.campaign.uid);
      const error = validateCampaign(action.campaign, { today: s.callDate, uidExists: !!target });
      void log({ campaign: action.campaign, ok: !error, error });
      if (error || !target) return result(fail("campaign_launch", error ?? "No merchant found."));
      const campaign: Campaign = {
        ...action.campaign,
        email: action.campaign.email.toLowerCase(),
        id: newId("cmp"),
        restaurantName: target.restaurantName,
        status: action.campaign.startDate === s.callDate ? "live" : "scheduled",
        launchedAtMs: atMs,
      };
      s.campaign = campaign;
      settleRequests(s, campaign);
      s.coach?.setCampaign(campaign);
      return result({ kind: "campaign_launch", ok: true, error: null, campaign });
    }
    case "email_sent": {
      if (s.phase !== "wrap_up") return result(fail("email_sent", "Send the email from Nugget after the call ends."));
      const email = renderEmail(action.template, {
        ownerName: s.merchant.ownerName,
        restaurantName: s.merchant.restaurantName,
        uid: s.merchant.uid,
        drr: s.merchant.drr,
        agentName: s.agentName,
        campaign: s.campaign,
        callback: action.callback,
      });
      const to = s.campaign?.email ?? currentEmail(s);
      s.emailTemplate = action.template;
      void log({ template: action.template, callback: action.callback, to });
      return result({ kind: "email_sent", ok: true, error: null, email: { to, ...email } });
    }
    case "dispose": {
      if (s.phase !== "wrap_up") return result(fail("dispose", "You can dispose the call once it has ended."));
      const { outcome, callback } = action.disposition;
      if (outcome === "callback" && (!callback || !callbackSlotSchema.safeParse(callback).success)) {
        return result(fail("dispose", "Pick the callback date and time first."));
      }
      if (callback && callback.date < s.callDate) return result(fail("dispose", "The callback can't be in the past."));
      const secondsTaken = Math.round((Date.now() - (s.wrapUpEndsAt - s.scenario.dispositionSec * 1000)) / 1000);
      await calls.recordWorkspace(s.callId, {
        actor: "agent",
        kind: "dispose",
        body: { outcome, callback: outcome === "callback" ? callback : null, secondsTaken },
        atMs,
      });
      result({ kind: "dispose", ok: true, error: null });
      s.coach?.markTool("disposition");
      return finalize(s);
    }
  }
}

// --- Clock -----------------------------------------------------------------------

async function tick(s: Session) {
  if (s.finished || s.phase !== "connected") return;
  const now = Date.now();
  const ms = elapsed(s);
  const hardMs = s.scenario.hardLimitSec * 1000;

  if (now - s.lastTimerAt >= 5000) {
    s.lastTimerAt = now;
    broadcast(s, { type: "timer", elapsedMs: ms, remainingMs: Math.max(0, hardMs - ms) });
  }
  if (!s.wrapUp && ms >= s.scenario.softLimitSec * 1000) s.wrapUp = true;
  if (ms >= hardMs) return endConversation(s, "time");

  // Agent went quiet mid-stretch without a commit: stop counting it as talking.
  if (s.agentTalkStartedAt && now - s.lastActivityAt > 2500 && !s.settleTimer) s.agentTalkStartedAt = null;

  const quietSince = Math.max(s.lastActivityAt, s.personaSpeakingUntil);
  const idle = !s.replying && !s.hangingUp && !s.settleTimer && !s.agentTalkStartedAt && s.agentBuffer.length === 0;
  if (idle && s.history.length > 1 && now - quietSince > DEAD_AIR_MS) {
    s.nudges += 1;
    s.lastActivityAt = now;
    setPatience(s, s.patience - 10);
    if (s.nudges >= MAX_NUDGES || s.patience <= 0) {
      s.hangingUp = true;
      await speak(s, NUDGES[s.language][2]!);
      setTimeout(() => void endConversation(s, "persona_hung_up"), Math.max(0, s.personaSpeakingUntil - Date.now()) + 600);
    } else {
      await speak(s, NUDGES[s.language][s.nudges - 1]!);
    }
  }
}

// --- End: conversation over → wrap-up → scoring ------------------------------------

/** The conversation is over. Enough of a call → wrap-up (disposition window); otherwise abandoned. */
async function endConversation(s: Session, reason: "agent" | "persona_hung_up" | "time" | "missed") {
  // Synchronous guard: the socket's "end" and REST /end can arrive together, and the awaits below
  // would otherwise let both through (two wrap-ups, two countdowns).
  if (s.finished || s.ending || s.phase === "wrap_up" || s.phase === "done") return;
  s.ending = true;
  const wasConnected = s.phase === "connected";
  s.gen++;
  if (s.tick) clearInterval(s.tick);
  if (s.settleTimer) clearTimeout(s.settleTimer);
  if (s.ringTimer) clearTimeout(s.ringTimer);
  if (s.missedTimer) clearTimeout(s.missedTimer);
  s.tick = s.settleTimer = s.ringTimer = s.missedTimer = null;
  s.stubCancel?.();
  s.stubCancel = null;
  if (wasConnected) {
    const turn = await persistAgentBuffer(s); // what the agent said that hadn't settled yet
    if (turn) broadcast(s, { type: "turn", turn });
  }
  broadcast(s, { type: "persona_state", state: "idle" });
  broadcast(s, { type: "ended", reason, callId: s.callId });

  const agentTurns = wasConnected ? (await calls.transcript(s.callId)).filter((t) => t.speaker === "agent").length : 0;
  // Fewer than 2 agent turns isn't enough conversation to judge (or to dispose).
  if (agentTurns < 2) {
    await calls.end(s.callId, "abandoned");
    setPhase(s, "done");
    cleanup(s);
    return;
  }

  await calls.end(s.callId, "wrap_up");
  const windowMs = s.scenario.dispositionSec * 1000;
  s.wrapUpEndsAt = Date.now() + windowMs;
  broadcast(s, { type: "state", status: "wrap_up", elapsedMs: elapsed(s) });
  setPhase(s, "wrap_up", windowMs);
  s.coach?.callEnded();
  s.wrapUpTick = setInterval(() => broadcast(s, { type: "phase", phase: "wrap_up", remainingMs: Math.max(0, s.wrapUpEndsAt - Date.now()) }), 5000);
  // Timer ran out without a disposition: scored as late (QA deduction).
  s.wrapUpTimer = setTimeout(() => void finalize(s), windowMs);
  if (s.guidanceOn) void suggest(s);
}

async function suggest(s: Session) {
  const startedAt = Date.now();
  let suggestion: DispositionSuggestion;
  if (ENV.STUB_ENGINES) {
    const fixture = simWrapUpTimeline.find((m) => m.event.type === "disposition_suggestion")?.event;
    suggestion = fixture?.type === "disposition_suggestion" ? fixture.suggestion : { outcome: "not_interested", template: "follow_up", callback: null, reason: "" };
  } else {
    suggestion = await suggestDisposition({
      merchant: s.merchant,
      callDate: s.callDate,
      turns: await calls.transcript(s.callId),
      campaign: s.campaign,
      fallback: s.decision,
      fallbackCallback: (() => {
        const asked = [...s.requests.values()].find((r) => r.request.kind === "callback" && r.status !== "not_asked");
        if (!asked) return null;
        const v = resolveRequest(asked.request, s.callDate);
        return { date: v.date!, time: v.time! };
      })(),
    });
  }
  await new Promise((r) => setTimeout(r, Math.max(0, SUGGESTION_MIN_MS - (Date.now() - startedAt))));
  if (s.finished) return;
  console.log(`[sim] ${s.callId}: disposition suggestion (${suggestion.outcome}) after ${Date.now() - startedAt}ms`);
  s.suggestion = suggestion;
  broadcast(s, { type: "disposition_suggestion", suggestion });
}

/** Disposed (or the timer ran out): score it in the background. Idempotent. */
async function finalize(s: Session) {
  if (s.finished) return;
  cleanup(s);
  await calls.setStatus(s.callId, "scoring");
  broadcast(s, { type: "state", status: "scoring", elapsedMs: 0 });
  setPhase(s, "done");
  scoreInBackground(s.callId);
}

function cleanup(s: Session) {
  s.finished = true;
  s.gen++;
  for (const t of [s.ringTimer, s.missedTimer, s.settleTimer, s.wrapUpTimer]) if (t) clearTimeout(t);
  for (const t of [s.tick, s.wrapUpTick]) if (t) clearInterval(t);
  s.stubCancel?.();
  // Keep the sockets a moment so the final messages reach the client.
  setTimeout(() => sessions.delete(s.callId), 5000);
}

/**
 * REST `POST /api/sim/sessions/:callId/end`: the agent hung up. A connected call goes to wrap-up
 * (dispose in Nugget, then it's scored); a call never picked up is abandoned. Idempotent.
 */
export async function finishSim(callId: string): Promise<{ callId: string; status: string }> {
  const s = sessions.get(callId);
  if (s && !s.finished) {
    if (s.phase !== "wrap_up") await endConversation(s, s.phase === "connected" ? "agent" : "missed");
    return { callId, status: (await calls.get(callId)).status };
  }
  const call = await calls.get(callId);
  if (call.status === "wrap_up") {
    // Server restarted during wrap-up: nobody can dispose any more, so score it as is.
    await calls.setStatus(callId, "scoring");
    scoreInBackground(callId);
    return { callId, status: "scoring" };
  }
  if (call.status !== "active") return { callId, status: call.status };
  const agentTurns = (await calls.transcript(callId)).filter((t) => t.speaker === "agent").length;
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
  s.started = true;
  s.stubCancel = replayTimeline(
    simCallTimeline.filter((m) => m.event.type !== "phase" && (s.guidanceOn || m.event.type !== "guidance")),
    (msg) => {
      if (msg.type === "ended") {
        // The fixture customer accepts; the engine's own wrap-up takes it from here.
        recordDecision(s, "accepted");
        void endConversation(s, msg.reason);
        return;
      }
      if (msg.type === "guidance") s.guidance = msg.guidance;
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
      const r = s.requests.get(msg.request.id);
      if (r) r.status = "pending";
      await calls.recordCrmRequestVoiced(s.callId, msg.request.id, msg.atMs);
    }
  } catch (err) {
    console.error("[sim stub] persist failed", err);
  }
}
