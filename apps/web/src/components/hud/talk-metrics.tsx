"use client";

import type { LiveCallState } from "@/hooks/use-live-call";
import { MessageCircle, Pause, Radio } from "lucide-react";

export function TalkMetrics({ talk }: { talk: LiveCallState["talk"] }) {
  const silenceSeconds = Math.ceil(talk.currentSilenceMs / 1000);
  return (
    <section className="hud-panel border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Talk metrics</p><h2 className="mt-1 text-sm font-semibold">Keep the rhythm</h2></div><Radio className={`size-4 ${talk.alert ? "animate-pulse text-warning" : "text-success"}`} /></div>
      <div className="mt-4 flex items-center justify-between text-xs"><span className="flex items-center gap-2 text-info"><MessageCircle className="size-3.5" /> You {Math.round(talk.agentTalkPct)}%</span><span className="text-muted-foreground">Customer {Math.round(100 - talk.agentTalkPct)}%</span></div>
      <div className="mt-2 flex h-2 overflow-hidden bg-card"><div className="bg-primary transition-all duration-500" style={{ width: `${talk.agentTalkPct}%` }} /></div>
      <div className={`mt-4 flex items-center justify-between border-t border-border pt-3 text-xs ${talk.currentSilenceMs >= 4000 ? "text-warning" : "text-muted-foreground"}`}><span className="flex items-center gap-2"><Pause className="size-3.5" /> Silence</span><strong className="font-mono">{silenceSeconds}s</strong></div>
      {talk.alert === "dead_air" && <p className="mt-3 border-l-2 border-warning pl-3 text-xs font-semibold text-warning">Say something — dead air</p>}
      {talk.alert === "monologue" && <p className="mt-3 border-l-2 border-primary pl-3 text-xs font-semibold text-info">Pause and ask a question</p>}
    </section>
  );
}
