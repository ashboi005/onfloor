"use client";

import type { Call, GuardrailAlert, Hint, LiveEvent, Speaker, TranscriptTurn } from "@onfloor/contracts";
import { liveEventSchema } from "@onfloor/contracts";
import { liveCallTimeline } from "@onfloor/contracts/fixtures";
import { useCallback, useEffect, useReducer, useState } from "react";
import { USE_MOCKS, WS_URL } from "@/lib/config";
import { playTimeline } from "./timeline";

/**
 * useLiveCall: the ONLY thing the Live HUD talks to (owner: Ashwath; events: Tushar).
 *
 *   const live = useLiveCall("active");   // or a specific callId
 *   live.hints, live.guardrails, live.sentiment, live.talk, live.turns, live.partial
 *
 * Mock mode replays fixtures/live-call.ts after a short "waiting" period (call
 * `restart()` to replay). Real mode subscribes to /ws/live/:callId and reconnects.
 */

export type LiveStatus = "waiting" | "live" | "ended";

export interface ActiveHint extends Hint {
  receivedAt: number;
  pinned: boolean;
}

export interface SentimentPoint {
  atMs: number;
  patience: number;
  frustration: number;
  engagement: number;
}

export interface LiveCallState {
  call: Call | null;
  status: LiveStatus;
  turns: TranscriptTurn[];
  /** In-flight text per speaker; cleared when that speaker's final arrives. */
  partial: Record<Speaker, string>;
  /** Newest first. Expired, unpinned hints are dropped automatically. */
  hints: ActiveHint[];
  /** Newest first. Stay until dismissed. */
  guardrails: GuardrailAlert[];
  sentiment: SentimentPoint & { history: SentimentPoint[] };
  talk: { agentTalkPct: number; currentSilenceMs: number; alert: "dead_air" | "monologue" | null };
  durationMs: number | null;
  scorecardReady: boolean;
  personaId: string | null;
  error: string | null;
}

const initial: LiveCallState = {
  call: null,
  status: "waiting",
  turns: [],
  partial: { agent: "", customer: "" },
  hints: [],
  guardrails: [],
  sentiment: { atMs: 0, patience: 50, frustration: 0, engagement: 50, history: [] },
  talk: { agentTalkPct: 0, currentSilenceMs: 0, alert: null },
  durationMs: null,
  scorecardReady: false,
  personaId: null,
  error: null,
};

type Action =
  | { type: "event"; event: LiveEvent }
  | { type: "tick"; now: number }
  | { type: "dismissHint"; id: string }
  | { type: "pinHint"; id: string }
  | { type: "dismissGuardrail"; id: string }
  | { type: "reset" };

/** Exported so Tushar can unit-check his event stream against what the HUD does with it. */
export function liveReducer(s: LiveCallState, a: Action): LiveCallState {
  switch (a.type) {
    case "reset":
      return initial;
    case "tick": {
      const hints = s.hints.filter((h) => h.pinned || a.now - h.receivedAt < h.ttlMs);
      return hints.length === s.hints.length ? s : { ...s, hints };
    }
    case "dismissHint":
      return { ...s, hints: s.hints.filter((h) => h.id !== a.id) };
    case "pinHint":
      return { ...s, hints: s.hints.map((h) => (h.id === a.id ? { ...h, pinned: !h.pinned } : h)) };
    case "dismissGuardrail":
      return { ...s, guardrails: s.guardrails.filter((g) => g.id !== a.id) };
    case "event": {
      const e = a.event;
      switch (e.type) {
        case "call_started":
          return { ...initial, call: e.call, status: "live" };
        case "transcript_partial":
          return { ...s, partial: { ...s.partial, [e.speaker]: e.text } };
        case "transcript_final":
          return {
            ...s,
            turns: [...s.turns.filter((t) => t.id !== e.turn.id), e.turn].sort((x, y) => x.seq - y.seq),
            partial: { ...s.partial, [e.turn.speaker]: "" },
          };
        case "hint":
          if (s.hints.some((h) => h.id === e.hint.id)) return s;
          return { ...s, hints: [{ ...e.hint, receivedAt: Date.now(), pinned: false }, ...s.hints] };
        case "guardrail":
          if (s.guardrails.some((g) => g.id === e.alert.id)) return s;
          return { ...s, guardrails: [e.alert, ...s.guardrails] };
        case "sentiment": {
          const point = { atMs: e.atMs, patience: e.patience, frustration: e.frustration, engagement: e.engagement };
          return { ...s, sentiment: { ...point, history: [...s.sentiment.history, point].slice(-60) } };
        }
        case "talk_metrics":
          return { ...s, talk: { agentTalkPct: e.agentTalkPct, currentSilenceMs: e.currentSilenceMs, alert: e.alert } };
        case "call_ended":
          return { ...s, status: "ended", durationMs: e.durationMs, partial: { agent: "", customer: "" } };
        case "scorecard_ready":
          return { ...s, scorecardReady: true };
        case "persona_ready":
          return { ...s, personaId: e.personaId };
        case "error":
          return { ...s, error: e.message };
      }
    }
  }
}

export function useLiveCall(callId: string | "active") {
  const [state, dispatch] = useReducer(liveReducer, initial);
  const [run, setRun] = useState(0);

  useEffect(() => {
    dispatch({ type: "reset" });
    const onEvent = (event: LiveEvent) => dispatch({ type: "event", event });

    if (USE_MOCKS) return playTimeline(liveCallTimeline, onEvent, 2500);

    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const connect = (attempt: number) => {
      ws = new WebSocket(`${WS_URL}/ws/live/${callId}`);
      ws.onmessage = (m) => {
        const parsed = liveEventSchema.safeParse(JSON.parse(String(m.data)));
        if (parsed.success) onEvent(parsed.data);
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(() => connect(attempt + 1), Math.min(5000, 500 * 2 ** attempt));
      };
    };
    connect(0);
    // Keepalive so idle periods (waiting for a call) don't hit the server's socket timeout.
    const ping = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "ping" }));
    }, 30_000);
    return () => {
      closed = true;
      clearInterval(ping);
      clearTimeout(retry);
      ws?.close();
    };
  }, [callId, run]);

  useEffect(() => {
    const id = setInterval(() => dispatch({ type: "tick", now: Date.now() }), 500);
    return () => clearInterval(id);
  }, []);

  return {
    ...state,
    dismissHint: useCallback((id: string) => dispatch({ type: "dismissHint", id }), []),
    pinHint: useCallback((id: string) => dispatch({ type: "pinHint", id }), []),
    dismissGuardrail: useCallback((id: string) => dispatch({ type: "dismissGuardrail", id }), []),
    /** Replays the mock call / reconnects the socket. */
    restart: useCallback(() => setRun((n) => n + 1), []),
  };
}

export type LiveCall = ReturnType<typeof useLiveCall>;
