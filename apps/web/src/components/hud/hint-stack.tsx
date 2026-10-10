"use client";

import type { ActiveHint } from "@/hooks/use-live-call";
import { Bookmark, ChevronDown, ChevronUp, Lightbulb, MessageCircleQuestion, ShoppingBag, Target, X } from "lucide-react";
import { useState } from "react";

type HintStackProps = {
  hints: ActiveHint[];
  now: number;
  onPin: (id: string) => void;
  onDismiss: (id: string) => void;
};

const icons = { pitch: Target, objection: MessageCircleQuestion, upsell: ShoppingBag, close: Lightbulb } as const;

export function HintStack({ hints, now, onPin, onDismiss }: HintStackProps) {
  const [showOlder, setShowOlder] = useState(false);
  const [primary, ...older] = hints;
  if (!primary) return <div className="flex min-h-48 items-center justify-center border border-dashed border-border/70 text-center text-xs text-muted-foreground"><div><Lightbulb className="mx-auto mb-3 size-5" /><p>Copilot hints will appear here</p><p className="mt-1 text-[10px]">Keep listening. The next useful move is never far away.</p></div></div>;

  const Icon = icons[primary.kind];
  const remaining = Math.max(0, primary.ttlMs - (now - primary.receivedAt));
  const progress = primary.pinned ? 100 : Math.max(0, Math.min(100, (remaining / primary.ttlMs) * 100));

  return (
    <section className="space-y-3">
      <div className="border border-sky-300/30 bg-sky-300/[0.07] p-5 shadow-[0_0_40px_rgba(56,189,248,0.08)]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-300"><Icon className="size-4" /> {primary.kind} assist</div>
          <div className="flex items-center gap-1"><button type="button" title={primary.pinned ? "Unpin hint" : "Pin hint"} aria-label={primary.pinned ? "Unpin hint" : "Pin hint"} onClick={() => onPin(primary.id)} className={`p-1.5 transition hover:bg-sky-300/10 ${primary.pinned ? "text-amber-300" : "text-muted-foreground"}`}><Bookmark className="size-4" fill={primary.pinned ? "currentColor" : "none"} /></button><button type="button" title="Dismiss hint" aria-label="Dismiss hint" onClick={() => onDismiss(primary.id)} className="p-1.5 text-muted-foreground transition hover:bg-sky-300/10 hover:text-foreground"><X className="size-4" /></button></div>
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">{primary.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-foreground/80">{primary.body}</p>
        {primary.sources?.length ? <div className="mt-4 flex flex-wrap gap-1.5">{primary.sources.map((source) => <span key={source} className="border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-[10px] text-sky-200">📘 {source}</span>)}</div> : null}
        <div className="mt-5 h-1 overflow-hidden bg-sky-300/10"><div className="h-full bg-sky-300 transition-all duration-500" style={{ width: `${progress}%` }} /></div>
        <div className="mt-2 text-[10px] text-muted-foreground">{primary.pinned ? "Pinned until dismissed" : `${Math.ceil(remaining / 1000)}s remaining`}</div>
      </div>
      {older.length > 0 && <div className="border border-border/60 bg-card/60"><button type="button" onClick={() => setShowOlder((value) => !value)} className="flex w-full items-center justify-between px-4 py-3 text-xs text-muted-foreground hover:text-foreground"><span>{older.length} older hint{older.length === 1 ? "" : "s"}</span>{showOlder ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</button>{showOlder && <div className="space-y-2 border-t border-border/50 p-3">{older.map((hint) => <div key={hint.id} className="border border-border/50 p-3"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{hint.kind}</span><button type="button" onClick={() => onDismiss(hint.id)} className="text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button></div><p className="mt-1 text-xs font-medium">{hint.title}</p><p className="mt-1 text-xs text-muted-foreground">{hint.body}</p></div>)}</div>}</div>}
    </section>
  );
}
