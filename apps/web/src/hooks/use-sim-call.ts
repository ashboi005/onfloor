"use client";

import type {
  ApiError,
  Campaign,
  CampaignDraft,
  CallbackSlot,
  CrmRequest,
  DispositionInput,
  DispositionSuggestion,
  EmailTemplateId,
  GuidanceState,
  MerchantDashboard,
  PersonaState,
  SimClientMessage,
  SimPhase,
  SimServerMessage,
  SimSessionStart,
  TranscriptTurn,
  WorkspaceAction,
  WorkspaceResult,
  WorkspaceTab,
} from "@onfloor/contracts";
import { renderEmail, simServerMessageSchema, toMerchantDashboard, validateCampaign } from "@onfloor/contracts";
import { merchants, simCallTimeline, simRingTimeline, simWrapUpTimeline } from "@onfloor/contracts/fixtures";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { api } from "@/lib/api";
import { isEcho } from "@/lib/audio/echo";
import { ECHO_TAIL_MS } from "@onfloor/contracts";
import { downsampleTo16k, PCM_TARGET_RATE, toPcm16Base64 } from "@/lib/audio/pcm";
import { SERVER_URL, USE_MOCKS, WS_URL } from "@/lib/config";
import { playTimeline } from "./timeline";

/**
 * useSimCall: the ONLY thing the simulator UI talks to (owner: Ashwath).
 *
 *   const call = useSimCall(start);      // start = result of useStartSim().mutateAsync(...)
 *
 *   call.phase           "dialing" (show start.ticket in Nugget) → "ringing" (auto-answered after
 *                        ~1.2s; call.answer() picks up at once) → "connected" → call.end() / customer hangs up → "wrap_up" → dispose → "done"
 *   call.turns, call.personaState, call.patience, call.micLevel, call.requests (what the customer asked for)
 *   turn.translation     English subtitle (render with `subtitleText(turn, mode)` from "@/lib/subtitles")
 *
 *   Tools (each answered by a result in state, never thrown):
 *   call.openTab("merchant_dashboard" | "ad_studio")
 *   call.lookup(uid)                → call.dashboard = { uid, merchant | null }
 *   call.launchCampaign(draft)      → call.campaign, or call.launchError ("Minimum campaign duration is 1 month.")
 *   call.sendEmail(template, slot?) → call.email (wrap-up only)
 *   call.dispose({ outcome, callback }) → phase "done", then navigate to /calls/:callId
 *   call.dispositionRemainingMs     wrap-up countdown (90s)
 *
 *   Guidance on (start.guidance): call.guidance = { steps, next: { text, target }, tips },
 *   call.suggestion = the AI's disposition suggestion, ~2-3s into wrap-up.
 *
 * Mock mode replays fixtures/sim-call.ts (ring → conversation after answer → wrap-up) and answers
 * the tools locally with the same pure functions the server uses.
 * Real mode: /ws/sim/:callId for the call, the mic streamed to ElevenLabs realtime STT once the
 * call is connected (single-use URL from the server), persona audio fetched and played with a live
 * level meter, barge-in when the agent talks over the persona, echo rejection for the persona's
 * own voice leaking back into the mic.
 */

export type SimCallStatus = "connecting" | "live" | "ending" | "ended" | "error";
export type MicStatus = "idle" | "connecting" | "listening" | "denied" | "error";

export interface SimCallState {
  phase: SimPhase;
  /** Connection/conversation status (kept for the terminal): live = connected and talking. */
  status: SimCallStatus;
  mic: MicStatus;
  turns: TranscriptTurn[];
  /** What the agent has said that the server hasn't committed as a turn yet, plus the live partial. */
  partialAgentText: string;
  personaState: PersonaState;
  /** 0–100. The persona hangs up at 0. */
  patience: number;
  elapsedMs: number;
  remainingMs: number;
  /** What the customer asked for during the call (new email, start date, duration, callback), oldest first. */
  requests: (CrmRequest & { atMs: number })[];
  endReason: "agent" | "persona_hung_up" | "time" | "missed" | null;
  /** 0–1, for visualisers. */
  micLevel: number;
  personaLevel: number;
  muted: boolean;
  error: ApiError | null;
  // --- Tools ---
  /** Last Merchant Dashboard lookup. merchant = null: no merchant with that UID. */
  dashboard: { uid: string; merchant: MerchantDashboard | null } | null;
  campaign: Campaign | null;
  launchError: string | null;
  email: { to: string; subject: string; body: string } | null;
  /** Email / dispose refusals (e.g. "Pick the callback date and time first."). */
  wrapUpError: string | null;
  dispositionRemainingMs: number | null;
  // --- Guidance ---
  guidance: GuidanceState | null;
  suggestion: DispositionSuggestion | null;
}

const initial = (start: SimSessionStart | null): SimCallState => ({
  phase: "dialing",
  status: "connecting",
  mic: "idle",
  turns: [],
  partialAgentText: "",
  personaState: "idle",
  patience: start ? start.persona.traits.patience * 10 : 50,
  elapsedMs: 0,
  remainingMs: (start?.scenario.hardLimitSec ?? 600) * 1000,
  requests: [],
  endReason: null,
  micLevel: 0,
  personaLevel: 0,
  muted: false,
  error: null,
  dashboard: null,
  campaign: null,
  launchError: null,
  email: null,
  wrapUpError: null,
  dispositionRemainingMs: null,
  guidance: null,
  suggestion: null,
});

type Action =
  | { type: "server"; msg: SimServerMessage }
  | { type: "levels"; mic: number; persona: number }
  | { type: "muted"; muted: boolean }
  | { type: "status"; status: SimCallStatus }
  | { type: "mic"; mic: MicStatus }
  | { type: "partial"; text: string }
  | { type: "persona_state"; state: PersonaState }
  | { type: "local_error"; error: ApiError }
  | { type: "reset"; start: SimSessionStart | null };

function applyResult(s: SimCallState, r: WorkspaceResult): SimCallState {
  switch (r.kind) {
    case "tab_opened":
      return s;
    case "dashboard_lookup":
      return { ...s, dashboard: { uid: r.uid, merchant: r.merchant } };
    case "campaign_launch":
      return r.ok ? { ...s, campaign: r.campaign, launchError: null } : { ...s, launchError: r.error };
    case "email_sent":
      return r.ok ? { ...s, email: r.email, wrapUpError: null } : { ...s, wrapUpError: r.error };
    case "dispose":
      return r.ok ? { ...s, wrapUpError: null } : { ...s, wrapUpError: r.error };
  }
}

function reducer(s: SimCallState, a: Action): SimCallState {
  switch (a.type) {
    case "reset":
      return initial(a.start);
    case "levels":
      return { ...s, micLevel: s.muted ? 0 : a.mic, personaLevel: a.persona };
    case "muted":
      return { ...s, muted: a.muted };
    case "status":
      return { ...s, status: a.status };
    case "mic":
      return { ...s, mic: a.mic };
    case "partial":
      return { ...s, partialAgentText: a.text };
    case "persona_state":
      return { ...s, personaState: a.state };
    case "local_error":
      return { ...s, error: a.error };
    case "server": {
      const m = a.msg;
      switch (m.type) {
        case "phase":
          // "done" is final: a late countdown tick must not reopen the wrap-up.
          if (s.phase === "done") return s;
          return {
            ...s,
            phase: m.phase,
            status: m.phase === "connected" ? "live" : m.phase === "wrap_up" || m.phase === "done" ? "ended" : s.status,
            dispositionRemainingMs: m.phase === "wrap_up" ? m.remainingMs : m.phase === "done" ? 0 : s.dispositionRemainingMs,
          };
        case "state":
          return { ...s, elapsedMs: m.elapsedMs };
        case "turn": {
          // Keep a subtitle that raced ahead of a re-sent turn (reconnect catch-up).
          const prev = s.turns.find((t) => t.id === m.turn.id);
          const turn = prev?.translation && !m.turn.translation ? { ...m.turn, translation: prev.translation } : m.turn;
          return { ...s, turns: [...s.turns.filter((t) => t.id !== m.turn.id), turn].sort((x, y) => x.seq - y.seq) };
        }
        case "turn_translation":
          return { ...s, turns: s.turns.map((t) => (t.id === m.turnId ? { ...t, translation: m.translation } : t)) };
        case "persona_state":
          return { ...s, personaState: m.state };
        case "patience":
          return { ...s, patience: m.value };
        case "timer":
          return { ...s, elapsedMs: m.elapsedMs, remainingMs: m.remainingMs };
        case "crm_request":
          return s.requests.some((r) => r.id === m.request.id) ? s : { ...s, requests: [...s.requests, { ...m.request, atMs: m.atMs }] };
        case "workspace_result":
          return applyResult(s, m.result);
        case "guidance":
          return { ...s, guidance: m.guidance };
        case "disposition_suggestion":
          return { ...s, suggestion: m.suggestion };
        case "ended":
          return { ...s, status: "ended", endReason: m.reason, personaState: "idle" };
        case "error":
          return {
            ...s,
            error: { code: m.code, message: m.message, retryable: m.retryable },
            status: m.retryable ? s.status : "error",
          };
        case "persona_audio":
          return s; // played by the effect below
      }
    }
  }
}

/** Mock mode: what the server would answer to a workspace action. */
function mockResult(start: SimSessionStart, s: SimCallState, action: WorkspaceAction, atMs: number): WorkspaceResult {
  const byUid = (uid: string) => merchants.find((m) => m.uid === uid.trim()) ?? null;
  switch (action.kind) {
    case "tab_opened":
      return { kind: "tab_opened", ok: true };
    case "dashboard_lookup": {
      const m = byUid(action.uid);
      return { kind: "dashboard_lookup", ok: !!m, uid: action.uid, merchant: m ? toMerchantDashboard(m) : null };
    }
    case "campaign_launch": {
      const target = byUid(action.campaign.uid);
      const error = validateCampaign(action.campaign, { today: start.callDate, uidExists: !!target });
      if (error || !target) return { kind: "campaign_launch", ok: false, error: error ?? "No merchant found.", campaign: null };
      return {
        kind: "campaign_launch",
        ok: true,
        error: null,
        campaign: { ...action.campaign, id: `cmp_mock_${atMs}`, restaurantName: target.restaurantName, status: action.campaign.startDate === start.callDate ? "live" : "scheduled", launchedAtMs: atMs },
      };
    }
    case "email_sent": {
      if (s.phase !== "wrap_up") return { kind: "email_sent", ok: false, error: "Send the email from Nugget after the call ends.", email: null };
      const m = byUid(start.ticket.uid);
      const email = renderEmail(action.template, {
        ownerName: start.ticket.merchantName,
        restaurantName: start.ticket.restaurantName,
        uid: start.ticket.uid,
        drr: start.ticket.drr,
        agentName: start.agentName,
        campaign: s.campaign,
        callback: action.callback,
      });
      return { kind: "email_sent", ok: true, error: null, email: { to: s.campaign?.email ?? m?.email ?? "", ...email } };
    }
    case "dispose": {
      if (s.phase !== "wrap_up") return { kind: "dispose", ok: false, error: "You can dispose the call once it has ended." };
      if (action.disposition.outcome === "callback" && !action.disposition.callback) return { kind: "dispose", ok: false, error: "Pick the callback date and time first." };
      return { kind: "dispose", ok: true, error: null };
    }
  }
}

/** How long "ringing" shows before the call connects on its own. */
const AUTO_ANSWER_MS = 1200;

/** Partials shorter than this don't count as the agent interrupting (echo leaks start small). */
const BARGE_IN_MIN_CHARS = 6;
const FRAME_SAMPLES = PCM_TARGET_RATE / 10; // ~100ms per STT frame
/** Must stay well under the server's AGENT_SETTLE_MS (1100ms). */
const ACTIVITY_THROTTLE_MS = 300;

const WORKLET_SOURCE = `
class PcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(new Float32Array(channel));
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

function rms(analyser: AnalyserNode, buf: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (const v of buf) sum += v * v;
  return Math.min(1, Math.sqrt(sum / buf.length) * 4);
}

export function useSimCall(start: SimSessionStart | null) {
  const [state, dispatch] = useReducer(reducer, start, initial);
  const wsRef = useRef<WebSocket | null>(null);
  /** Epoch ms of the call clock's zero (set when the call connects). */
  const startedAtRef = useRef(0);
  const phaseRef = useRef<SimPhase>("dialing");
  const stateRef = useRef(state);
  const personaStateRef = useRef<PersonaState>("idle");
  const mutedRef = useRef(false);
  const mockRef = useRef<{ cancel: () => void; wrapTimer?: ReturnType<typeof setInterval> }>({ cancel: () => {} });
  personaStateRef.current = state.personaState;
  phaseRef.current = state.phase;
  stateRef.current = state;
  const connected = state.phase === "connected";

  // Real-mode audio plumbing.
  const ctxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const personaAnalyserRef = useRef<AnalyserNode | null>(null);
  const playingRef = useRef<{ source: AudioBufferSourceNode; turnId: string; text: string } | null>(null);
  const lastPersonaTextRef = useRef("");
  /** Epoch ms the persona's audio last stopped (0 = never played). Echo only leaks around playback. */
  const personaEndedAtRef = useRef(0);
  const committedRef = useRef(""); // committed by STT, not yet a server turn
  const lastActivityRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);

  const send = useCallback((msg: SimClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);
  const callMs = () => (startedAtRef.current ? Math.max(0, Date.now() - startedAtRef.current) : 0);
  const callMsAt = (epochMs: number) => (startedAtRef.current && epochMs ? Math.max(0, epochMs - startedAtRef.current) : -1);

  const stopPersonaAudio = useCallback(() => {
    const playing = playingRef.current;
    if (!playing) return;
    playingRef.current = null;
    try {
      playing.source.onended = null;
      playing.source.stop();
    } catch {}
  }, []);

  /** Mock: the server's wrap-up (90s countdown, suggestion, timer-out → scored). */
  const mockWrapUp = useCallback(() => {
    if (!start) return;
    const ends = Date.now() + start.scenario.dispositionSec * 1000;
    const tick = () => {
      const remainingMs = Math.max(0, ends - Date.now());
      dispatch({ type: "server", msg: { type: "phase", phase: "wrap_up", remainingMs } });
      if (remainingMs === 0) {
        clearInterval(mockRef.current.wrapTimer);
        dispatch({ type: "server", msg: { type: "phase", phase: "done", remainingMs: null } });
        void api.endSim(start.callId);
      }
    };
    tick();
    mockRef.current.wrapTimer = setInterval(tick, 1000);
    if (start.guidance) {
      const cancel = playTimeline(simWrapUpTimeline, (msg) => dispatch({ type: "server", msg }));
      const prev = mockRef.current.cancel;
      mockRef.current.cancel = () => (prev(), cancel());
    }
  }, [start]);

  // --- Call socket (or mock timeline) ---------------------------------------------
  useEffect(() => {
    dispatch({ type: "reset", start });
    committedRef.current = "";
    startedAtRef.current = 0;
    if (!start) return;

    if (USE_MOCKS) {
      mockRef.current.cancel = playTimeline(simRingTimeline, (msg) => dispatch({ type: "server", msg }));
      return () => {
        mockRef.current.cancel();
        clearInterval(mockRef.current.wrapTimer);
      };
    }

    let closed = false;
    let attempts = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const ping = setInterval(() => send({ type: "ping" }), 30_000);

    const connect = () => {
      const ws = new WebSocket(`${WS_URL}/ws/sim/${start.callId}`);
      wsRef.current = ws;
      ws.onopen = () => {
        attempts = 0;
      };
      ws.onclose = () => {
        // Reconnect until the call is done; the server replays phase, transcript and tools on attach.
        if (closed || phaseRef.current === "done") return;
        if (attempts++ >= 5) {
          dispatch({ type: "server", msg: { type: "error", code: "WS_CLOSED", message: "Lost connection to the call.", retryable: false } });
          return;
        }
        retry = setTimeout(connect, Math.min(4000, 500 * 2 ** attempts));
      };
      ws.onmessage = (e) => {
        const parsed = simServerMessageSchema.safeParse(JSON.parse(String(e.data)));
        if (!parsed.success) return;
        const msg = parsed.data;
        if (msg.type === "phase" && msg.phase === "connected" && !startedAtRef.current) startedAtRef.current = Date.now();
        if (msg.type === "state" && msg.status === "active" && startedAtRef.current) startedAtRef.current = Date.now() - msg.elapsedMs;
        if (msg.type === "turn" && msg.turn.speaker === "agent") {
          // The server committed what we sent; drop it from the pending text.
          committedRef.current = "";
          dispatch({ type: "partial", text: "" });
        }
        if (msg.type === "turn" && msg.turn.speaker === "customer") lastPersonaTextRef.current = msg.turn.text;
        if (msg.type === "persona_audio") void playPersona(msg.turnId, msg.audioUrl);
        if (msg.type === "ended") stopPersonaAudio();
        dispatch({ type: "server", msg });
      };
    };
    connect();

    async function playPersona(turnId: string, audioUrl: string) {
      const ctx = ctxRef.current;
      const done = () => send({ type: "playback_ended", turnId });
      if (!audioUrl || !ctx) return done();
      try {
        const res = await fetch(`${SERVER_URL}${audioUrl}`, { credentials: "include" });
        if (!res.ok) throw new Error(`audio ${res.status}`);
        const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
        stopPersonaAudio(); // a newer line supersedes whatever is playing
        if (ctx.state === "suspended") await ctx.resume();
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(personaAnalyserRef.current ?? ctx.destination);
        source.onended = () => {
          personaEndedAtRef.current = Date.now();
          if (playingRef.current?.source === source) playingRef.current = null;
          dispatch({ type: "persona_state", state: "idle" });
          done();
        };
        playingRef.current = { source, turnId, text: lastPersonaTextRef.current };
        source.start();
      } catch (err) {
        console.warn("[sim] persona audio failed", err);
        done();
      }
    }

    return () => {
      closed = true;
      clearInterval(ping);
      clearTimeout(retry);
      stopPersonaAudio();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [start, send, stopPersonaAudio]);

  // --- Microphone → ElevenLabs realtime STT (real mode) ------------------------------
  useEffect(() => {
    // The mic and STT open once the agent picks up, and close at hang-up.
    if (!start || USE_MOCKS || !connected) return;
    let cancelled = false;
    let stt: WebSocket | null = null;
    let node: AudioWorkletNode | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let pending: number[] = [];

    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const personaAnalyser = ctx.createAnalyser();
    personaAnalyser.fftSize = 512;
    personaAnalyser.connect(ctx.destination);
    personaAnalyserRef.current = personaAnalyser;

    function onPartial(text: string) {
      if (!text) return;
      segmentStartRef.current ??= callMs();
      const playing = playingRef.current;
      // The persona's own voice leaking into the mic is not the agent talking.
      if (playing && isEcho(text, playing.text)) return;
      dispatch({ type: "partial", text: `${committedRef.current} ${text}`.trim() });
      const now = Date.now();
      if (now - lastActivityRef.current > ACTIVITY_THROTTLE_MS) {
        lastActivityRef.current = now;
        send({ type: "agent_activity" });
      }
      // Barge-in: the agent talks over the persona.
      if (playing && text.length >= BARGE_IN_MIN_CHARS) {
        stopPersonaAudio();
        dispatch({ type: "persona_state", state: "idle" });
        send({ type: "interrupt" });
      }
    }

    function onCommitted(text: string) {
      const startMs = segmentStartRef.current ?? callMs();
      segmentStartRef.current = null;
      // An echo can only be a segment that began while the persona was audible (or just after).
      const nearPlayback = !!playingRef.current || startMs <= callMsAt(personaEndedAtRef.current + ECHO_TAIL_MS);
      if (!text || (nearPlayback && isEcho(text, lastPersonaTextRef.current))) return;
      committedRef.current = `${committedRef.current} ${text}`.trim();
      dispatch({ type: "partial", text: committedRef.current });
      send({ type: "agent_turn", text, startMs, endMs: callMs() });
    }

    async function connect(first: boolean) {
      dispatch({ type: "mic", mic: "connecting" });
      try {
        if (!micStreamRef.current) {
          micStreamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          });
        }
        if (cancelled) return;
        const url = first && start!.sttUrl ? start!.sttUrl : (await api.simSttUrl(start!.callId)).url;
        if (!url) {
          dispatch({ type: "mic", mic: "error" });
          dispatch({ type: "local_error", error: { code: "VOICE_UNAVAILABLE", message: "Speech-to-text isn't configured on the server.", retryable: false } });
          return;
        }
        if (cancelled) return;

        stt = new WebSocket(url);
        stt.onmessage = (event) => {
          const frame = JSON.parse(String(event.data)) as { message_type: string; text?: string };
          if (frame.message_type === "session_started") dispatch({ type: "mic", mic: "listening" });
          else if (frame.message_type === "partial_transcript") onPartial(frame.text?.trim() ?? "");
          else if (frame.message_type === "committed_transcript") onCommitted(frame.text?.trim() ?? "");
          else if (frame.message_type.endsWith("_error")) dispatch({ type: "mic", mic: "error" });
        };
        stt.onclose = () => {
          // Tokens are single-use: reconnect with a fresh URL while the call is live.
          if (!cancelled && phaseRef.current === "connected") setTimeout(() => void connect(false), 800);
        };

        if (!node) {
          const moduleUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: "text/javascript" }));
          await ctx.audioWorklet.addModule(moduleUrl);
          URL.revokeObjectURL(moduleUrl);
          if (cancelled) return;
          source = ctx.createMediaStreamSource(micStreamRef.current);
          const micAnalyser = ctx.createAnalyser();
          micAnalyser.fftSize = 512;
          micAnalyserRef.current = micAnalyser;
          node = new AudioWorkletNode(ctx, "pcm-capture");
          node.port.onmessage = (event: MessageEvent<Float32Array>) => {
            if (!stt || stt.readyState !== WebSocket.OPEN) return;
            const samples = mutedRef.current ? new Float32Array(event.data.length) : event.data;
            for (const v of downsampleTo16k(samples, ctx.sampleRate)) pending.push(v);
            while (pending.length >= FRAME_SAMPLES) {
              const frame = Float32Array.from(pending.slice(0, FRAME_SAMPLES));
              pending = pending.slice(FRAME_SAMPLES);
              stt.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: toPcm16Base64(frame), commit: false }));
            }
          };
          source.connect(micAnalyser);
          source.connect(node);
          const silent = ctx.createGain();
          silent.gain.value = 0;
          node.connect(silent).connect(ctx.destination);
        }
        if (ctx.state === "suspended") await ctx.resume();
      } catch (err) {
        if (cancelled) return;
        const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
        dispatch({ type: "mic", mic: denied ? "denied" : "error" });
        if (denied) {
          dispatch({ type: "local_error", error: { code: "MIC_DENIED", message: "Microphone access was blocked. Allow it in the browser and rejoin.", retryable: false } });
        }
      }
    }
    void connect(true);

    return () => {
      cancelled = true;
      if (stt && stt.readyState <= WebSocket.OPEN) stt.close();
      node?.port.close();
      node?.disconnect();
      source?.disconnect();
      for (const track of micStreamRef.current?.getTracks() ?? []) track.stop();
      micStreamRef.current = null;
      micAnalyserRef.current = null;
      personaAnalyserRef.current = null;
      ctxRef.current = null;
      void ctx.close().catch(() => {});
    };
  }, [start, connected, send, stopPersonaAudio]);

  // --- Levels (real analysers, or fake ones in mock mode) ----------------------------
  useEffect(() => {
    if (!start) return;
    const buf = new Float32Array(512);
    const id = setInterval(() => {
      if (USE_MOCKS) {
        const speaking = personaStateRef.current === "speaking";
        dispatch({
          type: "levels",
          mic: speaking ? Math.random() * 0.1 : 0.15 + Math.random() * 0.5,
          persona: speaking ? 0.3 + Math.random() * 0.6 : 0,
        });
        return;
      }
      const mic = micAnalyserRef.current ? rms(micAnalyserRef.current, buf) : 0;
      const persona = personaAnalyserRef.current && playingRef.current ? rms(personaAnalyserRef.current, buf) : 0;
      dispatch({ type: "levels", mic, persona });
    }, 100);
    return () => clearInterval(id);
  }, [start]);

  // --- Actions ------------------------------------------------------------------------

  /** Pick up the ringing call. Call it from the click handler (it unlocks audio). */
  const answer = useCallback(() => {
    if (!start || (phaseRef.current !== "ringing" && phaseRef.current !== "dialing")) return;
    if (USE_MOCKS) {
      mockRef.current.cancel();
      startedAtRef.current = Date.now();
      const timeline = simCallTimeline.filter((m) => start.guidance || m.event.type !== "guidance");
      mockRef.current.cancel = playTimeline(timeline, (msg) => {
        dispatch({ type: "server", msg });
        if (msg.type === "phase" && msg.phase === "wrap_up") mockWrapUp();
      });
      return;
    }
    send({ type: "answer" });
  }, [start, send, mockWrapUp]);

  // The auto-dialled call connects by itself: ringing shows for a beat, then it's picked up.
  useEffect(() => {
    if (state.phase !== "ringing") return;
    const t = setTimeout(answer, AUTO_ANSWER_MS);
    return () => clearTimeout(t);
  }, [state.phase, answer]);

  const workspace = useCallback(
    (action: WorkspaceAction) => {
      if (!start) return;
      if (USE_MOCKS) {
        const result = mockResult(start, stateRef.current, action, callMs());
        setTimeout(() => {
          dispatch({ type: "server", msg: { type: "workspace_result", result } });
          if (result.kind === "dispose" && result.ok) {
            mockRef.current.cancel();
            clearInterval(mockRef.current.wrapTimer);
            dispatch({ type: "server", msg: { type: "phase", phase: "done", remainingMs: null } });
            void api.endSim(start.callId);
          }
        }, 150);
        return;
      }
      send({ type: "workspace", action });
    },
    [start, send],
  );

  const openTab = useCallback((tab: WorkspaceTab) => workspace({ kind: "tab_opened", tab }), [workspace]);
  const lookup = useCallback((uid: string) => workspace({ kind: "dashboard_lookup", uid }), [workspace]);
  const launchCampaign = useCallback((campaign: CampaignDraft) => workspace({ kind: "campaign_launch", campaign }), [workspace]);
  const sendEmail = useCallback(
    (template: EmailTemplateId, callback: CallbackSlot | null = null) => workspace({ kind: "email_sent", template, callback }),
    [workspace],
  );
  /** Closes the call; phase becomes "done" and it's scored. Navigate to /calls/:callId then. */
  const dispose = useCallback((disposition: DispositionInput) => workspace({ kind: "dispose", disposition }), [workspace]);

  /** Hang up. A connected call moves to wrap-up (dispose next); a call not picked up is abandoned. */
  const end = useCallback(async () => {
    if (!start) throw new Error("No call in progress");
    if (phaseRef.current === "wrap_up" || phaseRef.current === "done") return { callId: start.callId };
    stopPersonaAudio();
    if (USE_MOCKS) {
      const wasConnected = phaseRef.current === "connected";
      mockRef.current.cancel();
      dispatch({ type: "server", msg: { type: "ended", reason: wasConnected ? "agent" : "missed", callId: start.callId } });
      if (wasConnected) mockWrapUp();
      else dispatch({ type: "server", msg: { type: "phase", phase: "done", remainingMs: null } });
      await api.endSim(start.callId);
      return { callId: start.callId };
    }
    dispatch({ type: "status", status: "ending" });
    send({ type: "end" });
    const res = await api.endSim(start.callId);
    return { callId: res.callId };
  }, [send, start, stopPersonaAudio, mockWrapUp]);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    dispatch({ type: "muted", muted });
  }, []);

  return { ...state, answer, openTab, lookup, launchCampaign, sendEmail, dispose, end, setMuted };
}

export type SimCall = ReturnType<typeof useSimCall>;
