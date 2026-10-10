"use client";

import type {
  ApiError,
  CrmAction,
  CrmRequest,
  PersonaState,
  SimClientMessage,
  SimServerMessage,
  SimSessionStart,
  TranscriptTurn,
} from "@onfloor/contracts";
import { simServerMessageSchema } from "@onfloor/contracts";
import { simCallTimeline } from "@onfloor/contracts/fixtures";
import { useCallback, useEffect, useReducer, useRef } from "react";
import { api } from "@/lib/api";
import { isEcho } from "@/lib/audio/echo";
import { downsampleTo16k, PCM_TARGET_RATE, toPcm16Base64 } from "@/lib/audio/pcm";
import { SERVER_URL, USE_MOCKS, WS_URL } from "@/lib/config";
import { playTimeline } from "./timeline";

/**
 * useSimCall: the ONLY thing the simulator UI talks to (owner: Ashwath).
 *
 *   const call = useSimCall(start);   // start = result of useStartSim().mutateAsync(...)
 *   call.turns, call.personaState, call.patience, call.pendingCrmRequests, call.micLevel, ...
 *   turn.translation: English subtitle, arrives a bit after the turn for Hindi/Hinglish
 *   (render with `subtitleText(turn, mode)` from "@/lib/subtitles")
 *   call.reportCrmAction({ field, from, to });
 *   const { callId } = await call.end();
 *
 * Mock mode replays fixtures/sim-call.ts with fake audio levels.
 * Real mode: /ws/sim/:callId for the call, the mic streamed to ElevenLabs realtime STT
 * (single-use URL from the server), persona audio fetched and played with a live level
 * meter, barge-in when the agent talks over the persona, echo rejection for the
 * persona's own voice leaking back into the mic.
 */

export type SimCallStatus = "connecting" | "live" | "ending" | "ended" | "error";
export type MicStatus = "idle" | "connecting" | "listening" | "denied" | "error";

export interface SimCallState {
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
  /** Requests the persona has voiced that the agent hasn't actioned in the CRM yet. */
  pendingCrmRequests: (CrmRequest & { atMs: number })[];
  endReason: "agent" | "persona_hung_up" | "time" | null;
  /** 0–1, for visualisers. */
  micLevel: number;
  personaLevel: number;
  muted: boolean;
  error: ApiError | null;
}

const initial = (start: SimSessionStart | null): SimCallState => ({
  status: "connecting",
  mic: "idle",
  turns: [],
  partialAgentText: "",
  personaState: "idle",
  patience: start ? start.persona.traits.patience * 10 : 50,
  elapsedMs: 0,
  remainingMs: (start?.scenario.hardLimitSec ?? 480) * 1000,
  pendingCrmRequests: [],
  endReason: null,
  micLevel: 0,
  personaLevel: 0,
  muted: false,
  error: null,
});

type Action =
  | { type: "server"; msg: SimServerMessage }
  | { type: "crm_done"; field: CrmAction["field"] }
  | { type: "levels"; mic: number; persona: number }
  | { type: "muted"; muted: boolean }
  | { type: "status"; status: SimCallStatus }
  | { type: "mic"; mic: MicStatus }
  | { type: "partial"; text: string }
  | { type: "persona_state"; state: PersonaState }
  | { type: "local_error"; error: ApiError }
  | { type: "reset"; start: SimSessionStart | null };

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
    case "crm_done":
      return { ...s, pendingCrmRequests: s.pendingCrmRequests.filter((r) => r.field !== a.field) };
    case "server": {
      const m = a.msg;
      switch (m.type) {
        case "state":
          return { ...s, status: m.status === "active" ? "live" : s.status, elapsedMs: m.elapsedMs };
        case "turn": {
          // Keep a subtitle that raced ahead of a re-sent turn (reconnect catch-up).
          const prev = s.turns.find((t) => t.id === m.turn.id);
          const turn = prev?.translation && !m.turn.translation ? { ...m.turn, translation: prev.translation } : m.turn;
          return {
            ...s,
            status: s.status === "connecting" ? "live" : s.status,
            turns: [...s.turns.filter((t) => t.id !== m.turn.id), turn].sort((x, y) => x.seq - y.seq),
          };
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
          return { ...s, pendingCrmRequests: [...s.pendingCrmRequests, { ...m.request, atMs: m.atMs }] };
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
  const startedAtRef = useRef(0);
  const endedRef = useRef(false);
  const personaStateRef = useRef<PersonaState>("idle");
  const mutedRef = useRef(false);
  personaStateRef.current = state.personaState;

  // Real-mode audio plumbing.
  const ctxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const personaAnalyserRef = useRef<AnalyserNode | null>(null);
  const playingRef = useRef<{ source: AudioBufferSourceNode; turnId: string; text: string } | null>(null);
  const lastPersonaTextRef = useRef("");
  const committedRef = useRef(""); // committed by STT, not yet a server turn
  const lastActivityRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);

  const send = useCallback((msg: SimClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);
  const callMs = () => Math.max(0, Date.now() - startedAtRef.current);

  const stopPersonaAudio = useCallback(() => {
    const playing = playingRef.current;
    if (!playing) return;
    playingRef.current = null;
    try {
      playing.source.onended = null;
      playing.source.stop();
    } catch {}
  }, []);

  // --- Call socket (or mock timeline) ---------------------------------------------
  useEffect(() => {
    dispatch({ type: "reset", start });
    endedRef.current = false;
    committedRef.current = "";
    if (!start) return;
    startedAtRef.current = Date.now();
    const onMsg = (msg: SimServerMessage) => {
      if (msg.type === "ended") endedRef.current = true;
      dispatch({ type: "server", msg });
    };

    if (USE_MOCKS) {
      dispatch({ type: "status", status: "live" });
      return playTimeline(
        simCallTimeline,
        (msg) => {
          // The real server ends + scores the call itself on hang-up; the mock API needs telling.
          if (msg.type === "ended") void api.endSim(start.callId);
          onMsg(msg);
        },
        600,
      );
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
        // Reconnect while the call is live; the server replays the transcript on attach.
        if (closed || endedRef.current) return;
        if (attempts++ >= 5) {
          onMsg({ type: "error", code: "WS_CLOSED", message: "Lost connection to the call.", retryable: false });
          return;
        }
        retry = setTimeout(connect, Math.min(4000, 500 * 2 ** attempts));
      };
      ws.onmessage = (e) => {
        const parsed = simServerMessageSchema.safeParse(JSON.parse(String(e.data)));
        if (!parsed.success) return;
        const msg = parsed.data;
        if (msg.type === "turn" && msg.turn.speaker === "agent") {
          // The server committed what we sent; drop it from the pending text.
          committedRef.current = "";
          dispatch({ type: "partial", text: "" });
        }
        if (msg.type === "turn" && msg.turn.speaker === "customer") lastPersonaTextRef.current = msg.turn.text;
        if (msg.type === "persona_audio") void playPersona(msg.turnId, msg.audioUrl);
        if (msg.type === "ended") stopPersonaAudio();
        onMsg(msg);
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
    if (!start || USE_MOCKS) return;
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
      if (!text || isEcho(text, lastPersonaTextRef.current)) return;
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
          if (!cancelled && !endedRef.current) setTimeout(() => void connect(false), 800);
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
  }, [start, send, stopPersonaAudio]);

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

  const reportCrmAction = useCallback(
    (action: Omit<CrmAction, "atMs">) => {
      send({ type: "crm_action", action: { ...action, atMs: callMs() } });
      dispatch({ type: "crm_done", field: action.field });
    },
    [send],
  );

  const end = useCallback(async () => {
    if (!start) throw new Error("No call in progress");
    if (endedRef.current) return { callId: start.callId };
    endedRef.current = true;
    dispatch({ type: "status", status: "ending" });
    stopPersonaAudio();
    send({ type: "end" });
    const res = await api.endSim(start.callId);
    dispatch({ type: "status", status: "ended" });
    return { callId: res.callId };
  }, [send, start, stopPersonaAudio]);

  const setMuted = useCallback((muted: boolean) => {
    mutedRef.current = muted;
    dispatch({ type: "muted", muted });
  }, []);

  return { ...state, reportCrmAction, end, setMuted };
}

export type SimCall = ReturnType<typeof useSimCall>;
