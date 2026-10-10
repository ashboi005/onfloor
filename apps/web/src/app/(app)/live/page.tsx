"use client";

/**
 * Live HUD. OWNER: Harnoor. Spec: docs/specs/04-harnoor-frontend.md (Screen 3).
 * PLACEHOLDER: every field of `useLiveCall` rendered plainly. Build the real widgets in
 * components/hud/ (sentiment radar, hint stack, guardrail banner, talk metrics, mini transcript).
 */
import type { Route } from "next";
import Link from "next/link";

import { useLiveCall } from "@/hooks/use-live-call";
import { useSimulateLiveCall } from "@/lib/api";
import { USE_MOCKS } from "@/lib/config";

function recommendation(s: { patience: number; frustration: number; engagement: number }) {
  if (s.frustration > 65) return "DE-ESCALATE";
  if (s.engagement > 70 && s.patience > 50) return "CLOSE";
  return "DISCOVER";
}

export default function LiveHud() {
  const live = useLiveCall("active");
  const simulate = useSimulateLiveCall();

  if (live.status === "waiting") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="h-3 w-3 animate-ping rounded-full bg-emerald-500" />
        <p>Waiting for a call on the OnFloor line…</p>
        {!USE_MOCKS && (
          <button type="button" className="rounded-md border px-3 py-2 text-sm" onClick={() => simulate.mutate()}>
            Simulate a call (dev)
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[1fr_2fr_1fr] gap-4 p-4 text-sm">
      <section className="space-y-3">
        <div className="font-semibold">{live.call?.customerLabel}</div>
        {(["patience", "frustration", "engagement"] as const).map((k) => (
          <div key={k}>
            {k} {live.sentiment[k]}
            <div className="h-2 rounded bg-muted">
              <div className="h-2 rounded bg-primary transition-all" style={{ width: `${live.sentiment[k]}%` }} />
            </div>
          </div>
        ))}
        <div className="text-2xl font-bold">{recommendation(live.sentiment)}</div>
        <div>
          Agent talk {live.talk.agentTalkPct}% · silence {(live.talk.currentSilenceMs / 1000).toFixed(0)}s
          {live.talk.alert && <div className="font-semibold text-amber-500">⚠ {live.talk.alert}</div>}
        </div>
      </section>

      <section className="space-y-3">
        {live.guardrails.map((g) => (
          <div key={g.id} className={`rounded-md p-3 ${g.severity === "critical" ? "bg-red-600 text-white" : "bg-amber-500/20"}`}>
            {g.message}
            <button type="button" className="ml-2 underline" onClick={() => live.dismissGuardrail(g.id)}>
              dismiss
            </button>
          </div>
        ))}
        {live.hints.map((h, i) => (
          <div key={h.id} className={`rounded-lg border p-4 ${i === 0 ? "text-lg" : "opacity-60"}`}>
            <div className="text-xs uppercase text-muted-foreground">{h.kind}</div>
            <div className="font-semibold">{h.title}</div>
            <div>{h.body}</div>
            <div className="mt-2 flex gap-2 text-xs">
              <button type="button" onClick={() => live.pinHint(h.id)}>{h.pinned ? "unpin" : "pin"}</button>
              <button type="button" onClick={() => live.dismissHint(h.id)}>dismiss</button>
            </div>
          </div>
        ))}
        {live.status === "ended" && (
          <div className="space-y-2 rounded-lg border p-4">
            <div>Call ended. {live.scorecardReady ? "" : "Scoring…"}</div>
            {live.scorecardReady && live.call && (
              <Link className="underline" href={`/calls/${live.call.id}` as Route}>View scorecard</Link>
            )}
            {live.personaId && live.call && (
              <div>
                Persona created from this call →{" "}
                <Link className="underline" href={`/simulator/new?replay=${live.call.id}` as Route}>
                  Replay in simulator
                </Link>
              </div>
            )}
            {USE_MOCKS && (
              <button type="button" className="text-xs underline" onClick={live.restart}>replay mock call</button>
            )}
          </div>
        )}
      </section>

      <section className="space-y-2 overflow-y-auto">
        {live.turns.slice(-6).map((t) => (
          <p key={t.id} className={t.speaker === "agent" ? "text-sky-400" : ""}>
            <b>{t.speaker}:</b> {t.text}
          </p>
        ))}
        {(["customer", "agent"] as const).map((s) =>
          live.partial[s] ? (
            <p key={s} className="text-muted-foreground">
              {s}: {live.partial[s]}…
            </p>
          ) : null,
        )}
      </section>
    </div>
  );
}
