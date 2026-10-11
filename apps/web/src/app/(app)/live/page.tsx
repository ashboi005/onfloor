"use client";

/** Live call dashboard (HUD). OWNER: Harnoor. Spec: docs/specs/04-harnoor-frontend.md (Screen 3). Events: Tushar. */

import type { Route } from "next";
import Link from "next/link";
import { Button } from "@onfloor/ui/components/button";
import { Card, CardContent } from "@onfloor/ui/components/card";
import { Clock3, Headphones, LoaderCircle, Radio, RotateCcw, Sparkles, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

import { CustomerMemory } from "@/components/hud/customer-memory";
import { GuardrailBanner } from "@/components/hud/guardrail-banner";
import { HintStack } from "@/components/hud/hint-stack";
import { MiniTranscript } from "@/components/hud/mini-transcript";
import { SentimentRadar } from "@/components/hud/sentiment-radar";
import { TalkMetrics } from "@/components/hud/talk-metrics";
import { useLiveCall } from "@/hooks/use-live-call";
import { useSimulateLiveCall } from "@/lib/api";
import { USE_MOCKS } from "@/lib/config";

function formatTime(ms: number) {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function LiveHud() {
  const live = useLiveCall("active");
  const simulate = useSimulateLiveCall();
  const [now, setNow] = useState(() => Date.now());
  const [activeSince, setActiveSince] = useState<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (live.call?.id) setActiveSince((value) => value ?? Date.now());
    if (live.status === "waiting") setActiveSince(null);
  }, [live.call?.id, live.status]);

  const elapsedMs = live.durationMs ?? (activeSince ? Math.max(0, now - activeSince) : 0);

  if (live.status === "waiting") {
    return (
      <div className="brand-mosaic flex h-full flex-col items-center justify-center bg-background p-8 text-center">
        <div className="mb-6 flex size-20 items-center justify-center rounded-2xl border border-primary bg-card"><div className="size-3 animate-ping rounded-sm bg-primary" /></div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-info">OnFloor line is ready</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Waiting for a call</h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">Keep this window open. The HUD will attach automatically when a customer calls the OnFloor line.</p>
        {!USE_MOCKS && <Button type="button" size="lg" className="mt-6 rounded-lg px-4 text-sm" onClick={() => simulate.mutate()} disabled={simulate.isPending}><Radio className="size-4" />{simulate.isPending ? "Starting call…" : "Simulate a call"}</Button>}
        {simulate.error && <p className="mt-4 text-xs text-destructive">{simulate.error.message}</p>}
        {live.error && <div className="mt-5 flex items-center gap-2 text-xs text-destructive"><RotateCcw className="size-3.5" /> {live.error}</div>}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto bg-background">
      <header className="shrink-0 border-b border-border bg-card px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3"><div className="flex size-10 items-center rounded-xl justify-center bg-card text-success"><Headphones className="size-5" /></div><div className="min-w-0"><div className="flex items-center gap-2"><h1 className="truncate text-lg font-semibold">{live.call?.customerLabel ?? "OnFloor customer"}</h1><span className={`flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider ${live.status === "live" ? "text-success" : "text-warning"}`}><span className={`size-1.5 rounded-full ${live.status === "live" ? "animate-pulse bg-success" : "bg-warning"}`} /> {live.status}</span></div><p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground"><span className="flex items-center gap-1"><Clock3 className="size-3.5" /> {formatTime(elapsedMs)}</span><span>Language: <strong className="uppercase text-foreground">{live.call?.language}</strong></span><span className="hidden sm:inline">Telegram line · OnFloor Ads</span></p></div></div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="hidden items-center gap-2 sm:flex"><span className="size-2 rounded-full bg-success" /> Connection stable</span>{USE_MOCKS && <Button type="button" size="xs" variant="outline" onClick={live.restart}><RotateCcw className="size-3" /> Replay mock</Button>}</div>
        </div>
      </header>
      <div className="shrink-0 px-4 pt-4 sm:px-6"><GuardrailBanner guardrails={live.guardrails} onDismiss={live.dismissGuardrail} /></div>
      <main className="grid min-h-0 flex-1 auto-rows-max gap-4 p-4 sm:p-6 xl:grid-cols-[280px_minmax(420px,1fr)_320px]">
        <aside className="flex min-h-0 flex-col gap-4"><SentimentRadar sentiment={live.sentiment} />{live.call && <CustomerMemory customerLabel={live.call.customerLabel} items={live.customerMemory} />}<TalkMetrics talk={live.talk} /></aside>
        <section className="flex min-h-0 flex-col gap-4"><HintStack hints={live.hints} now={now} onPin={live.pinHint} onDismiss={live.dismissHint} />{live.status === "ended" && <AfterCall live={live} />}{live.error && <div className="border border-destructive bg-card p-4 text-sm text-destructive">{live.error}</div>}</section>
        <aside className="flex min-h-[360px] min-h-0 flex-col"><MiniTranscript turns={live.turns} partial={live.partial} /></aside>
      </main>
    </div>
  );
}

function AfterCall({ live }: { live: ReturnType<typeof useLiveCall> }) {
  return <Card className="border-success bg-card"><CardContent className="p-5"><div className="flex items-start gap-3"><div className="flex size-9 items-center rounded-lg justify-center bg-card text-success"><Sparkles className="size-4" /></div><div><h2 className="font-semibold">Call complete</h2><p className="mt-1 text-xs text-muted-foreground">{live.scorecardReady ? "Your scorecard is ready to review." : "Scoring the call…"}</p></div></div><div className="mt-5 flex flex-wrap gap-2">{live.scorecardReady && live.call && <Link href={`/calls/${live.call.id}` as Route}><Button type="button" size="sm">View scorecard</Button></Link>}{live.personaId && live.call && <Link href={`/simulator/new?replay=${live.call.id}` as Route}><Button type="button" size="sm" variant="outline"><UserRound className="size-3.5" /> Replay this customer</Button></Link>}</div>{live.personaId && <p className="mt-4 flex items-center gap-2 text-xs text-success"><Sparkles className="size-3.5" /> Persona created from this call</p>}{!live.scorecardReady && <LoaderCircle className="mt-4 size-4 animate-spin text-muted-foreground" />}</CardContent></Card>;
}
