"use client";

import type { SimSessionStart } from "@onfloor/contracts";
import { Button } from "@onfloor/ui/components/button";
import { Card, CardContent } from "@onfloor/ui/components/card";
import { ArrowLeft, Headphones, Radio } from "lucide-react";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { CallTerminal } from "@/components/sim/terminal/call-terminal";
import { SimWorkspace as Tools } from "@/components/sim/workspace/workspace";
import { useSimCall } from "@/hooks/use-sim-call";
import { loadSimSession } from "@/lib/sim-session";

export default function SimWorkspacePage() {
  const { callId } = useParams<{ callId: string }>();
  const [start, setStart] = useState<SimSessionStart | null | undefined>(undefined);
  useEffect(() => setStart(loadSimSession(callId)), [callId]);

  if (start === undefined) return null;
  if (!start) return <div className="flex min-h-full items-center justify-center p-8"><Card className="w-full max-w-md"><CardContent className="p-6"><h1 className="text-lg font-semibold">Session not found</h1><p className="mt-2 text-sm text-muted-foreground">Start a call from the simulator before opening this workspace.</p><Button type="button" className="mt-5" onClick={() => window.location.assign("/simulator") }><ArrowLeft className="size-4" /> Back to simulator</Button></CardContent></Card></div>;
  return <SimWorkspace start={start} />;
}

function SimWorkspace({ start }: { start: SimSessionStart }) {
  const callId = start.callId;
  const router = useRouter();
  const call = useSimCall(start);
  // The terminal shows who's on the line (the restaurant), not the behaviour preset's label.
  const onLine = useMemo(
    () => ({ ...start.persona, name: start.merchant.restaurantName, role: `Tomato merchant · UID ${start.ticket.uid}`, business: { ...start.persona.business, city: start.merchant.city } }),
    [start],
  );

  // Disposed (or the 90s ran out): on to the scorecard.
  useEffect(() => {
    if (call.phase === "done") {
      const t = setTimeout(() => router.push(`/calls/${callId}` as Route), 1200);
      return () => clearTimeout(t);
    }
  }, [call.phase, callId, router]);

  async function endCall() {
    if (!window.confirm("Hang up? You'll have 90 seconds in Nugget to send the email and dispose.")) return;
    try {
      await call.end();
    } catch {
      // The hook exposes the server error when the end request fails.
    }
  }

  const label = { dialing: "Dialling", ringing: "Ringing", connected: "Live practice", wrap_up: "Wrap-up: dispose in Nugget", done: "Done" }[call.phase];
  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-card/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><div className="flex size-8 items-center justify-center bg-primary/10 text-primary"><Headphones className="size-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">{start.scenario.title}</p><p className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground"><Radio className="size-3 text-emerald-300" /> {label}{start.guidance ? " · guidance on" : ""}</p></div></div>
        <Button type="button" size="sm" variant="ghost" onClick={() => router.push("/simulator" as Route)} disabled={call.phase === "connected" || call.phase === "wrap_up"}><ArrowLeft className="size-3.5" /> Exit workspace</Button>
      </header>
      <main className="grid min-h-0 flex-1 lg:grid-cols-[3fr_2fr]">
        <section className="min-h-0 overflow-hidden border-b border-border/70 lg:border-b-0 lg:border-r"><Tools start={start} call={call} /></section>
        <section className="min-h-0 overflow-hidden"><CallTerminal persona={onLine} call={call} onEnd={endCall} onScorecard={() => router.push(`/calls/${callId}` as Route)} onRetry={() => window.location.reload()} /></section>
      </main>
    </div>
  );
}
