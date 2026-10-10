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
import { USE_MOCKS, WS_URL } from "@/lib/config";
import { playTimeline } from "./timeline";

/**
 * useSimCall: the ONLY thing the simulator UI talks to (owner: Ashwath).
 *
 *   const call = useSimCall(start);   // start = result of useStartSim().mutateAsync(...)
 *   call.turns, call.personaState, call.patience, call.pendingCrmRequests, ...
 *   call.reportCrmAction({ field, from, to });
 *   const { callId } = await call.end();
 *
 * Mock mode replays fixtures/sim-call.ts. Real mode opens /ws/sim/:callId.
 * TODO(ashwath), real mode: mic capture + ElevenLabs realtime STT via `start.sttUrl`
 * (AudioWorklet capture → 16 kHz PCM frames), persona
 * audio playback from `persona_audio`, barge-in → `interrupt`.
 */

export type SimCallStatus = "connecting" | "live" | "ending" | "ended" | "error";

export interface SimCallState {
  status: SimCallStatus;
  turns: TranscriptTurn[];
  /** The agent's in-flight words (from STT partials). */
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
    case "crm_done":
      return { ...s, pendingCrmRequests: s.pendingCrmRequests.filter((r) => r.field !== a.field) };
    case "server": {
      const m = a.msg;
      switch (m.type) {
        case "state":
          return { ...s, status: m.status === "active" ? "live" : s.status, elapsedMs: m.elapsedMs };
        case "turn":
          return {
            ...s,
            status: s.status === "connecting" ? "live" : s.status,
            turns: [...s.turns.filter((t) => t.id !== m.turn.id), m.turn].sort((x, y) => x.seq - y.seq),
            partialAgentText: m.turn.speaker === "agent" ? "" : s.partialAgentText,
          };
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
          return { ...s, error: { code: m.code, message: m.message, retryable: m.retryable }, status: m.retryable ? s.status : "error" };
        case "persona_audio":
          return s; // TODO(ashwath): play audio
      }
    }
  }
}

export function useSimCall(start: SimSessionStart | null) {
  const [state, dispatch] = useReducer(reducer, start, initial);
  const wsRef = useRef<WebSocket | null>(null);
  const startedAtRef = useRef(0);
  const personaStateRef = useRef<PersonaState>("idle");
  /** True once the call has ended on either side, so end() doesn't end it twice. */
  const endedRef = useRef(false);
  personaStateRef.current = state.personaState;

  const send = useCallback((msg: SimClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    dispatch({ type: "reset", start });
    endedRef.current = false;
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
          // The server ends + scores the call itself on hang-up; the mock API needs telling.
          if (msg.type === "ended") {
            endedRef.current = true;
            void api.endSim(start.callId);
          }
          onMsg(msg);
        },
        600,
      );
    }

    const ws = new WebSocket(`${WS_URL}/ws/sim/${start.callId}`);
    wsRef.current = ws;
    ws.onmessage = (e) => {
      const parsed = simServerMessageSchema.safeParse(JSON.parse(String(e.data)));
      if (parsed.success) onMsg(parsed.data);
    };
    ws.onerror = () =>
      onMsg({ type: "error", code: "WS_ERROR", message: "Lost connection to the call.", retryable: true });
    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [start]);

  // Fake audio levels until real mic/playback lands. Persona level follows personaState.
  useEffect(() => {
    if (!start) return;
    const id = setInterval(() => {
      const speaking = personaStateRef.current === "speaking";
      dispatch({
        type: "levels",
        mic: speaking ? Math.random() * 0.1 : 0.15 + Math.random() * 0.5,
        persona: speaking ? 0.3 + Math.random() * 0.6 : 0,
      });
    }, 120);
    return () => clearInterval(id);
  }, [start]);

  const reportCrmAction = useCallback(
    (action: Omit<CrmAction, "atMs">) => {
      send({ type: "crm_action", action: { ...action, atMs: Date.now() - startedAtRef.current } });
      dispatch({ type: "crm_done", field: action.field });
    },
    [send],
  );

  const end = useCallback(async () => {
    if (!start) throw new Error("No call in progress");
    if (endedRef.current) return { callId: start.callId };
    endedRef.current = true;
    dispatch({ type: "status", status: "ending" });
    send({ type: "end" });
    const res = await api.endSim(start.callId);
    dispatch({ type: "status", status: "ended" });
    return { callId: res.callId };
  }, [send, start]);

  const setMuted = useCallback((muted: boolean) => dispatch({ type: "muted", muted }), []);

  return { ...state, reportCrmAction, end, setMuted };
}

export type SimCall = ReturnType<typeof useSimCall>;
