"use client";

import type { SimSessionStart } from "@onfloor/contracts";
import { Button } from "@onfloor/ui/components/button";
import { Card, CardContent } from "@onfloor/ui/components/card";
import { ArrowLeft, Headphones, Radio } from "lucide-react";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { CallTerminal } from "@/components/sim/terminal/call-terminal";
import { MockCrm } from "@/components/sim/crm/mock-crm";
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

  async function endCall() {
    if (!window.confirm("End this call and send it for scoring?")) return;
    try {
      const { callId: endedCallId } = await call.end();
      router.push(`/calls/${endedCallId}` as Route);
    } catch {
      // The hook exposes the server error when the end request fails.
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border/70 bg-card/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="flex min-w-0 items-center gap-3"><div className="flex size-8 items-center justify-center bg-primary/10 text-primary"><Headphones className="size-4" /></div><div className="min-w-0"><p className="truncate text-sm font-semibold">Simulator workspace</p><p className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground"><Radio className="size-3 text-emerald-300" /> {call.status === "live" ? "Live practice" : call.status}</p></div></div>
        <Button type="button" size="sm" variant="ghost" onClick={() => router.push("/simulator" as Route)} disabled={call.status === "live" || call.status === "ending"}><ArrowLeft className="size-3.5" /> Exit workspace</Button>
      </header>
      <main className="grid min-h-0 flex-1 lg:grid-cols-[3fr_2fr]">
        <section className="min-h-0 overflow-hidden border-b border-border/70 lg:border-b-0 lg:border-r"><MockCrm persona={start.persona} initialCrm={start.scenario.initialCrm} call={call} /></section>
        <section className="min-h-0 overflow-hidden"><CallTerminal persona={start.persona} call={call} onEnd={endCall} onScorecard={() => router.push(`/calls/${callId}` as Route)} onRetry={() => window.location.reload()} /></section>
      </main>
    </div>
  );
}
