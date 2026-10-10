"use client";

import type { ActiveHint } from "@/hooks/use-live-call";
import { Bookmark, Lightbulb, MessageCircleQuestion, ShoppingBag, Target, X } from "lucide-react";

type HintStackProps = {
  hints: ActiveHint[];
  now: number;
  onPin: (id: string) => void;
  onDismiss: (id: string) => void;
};

const icons = { pitch: Target, objection: MessageCircleQuestion, upsell: ShoppingBag, close: Lightbulb } as const;

/** Shows every active hint, newest first, with independent expiry and controls. */
export function HintStack({ hints, now, onPin, onDismiss }: HintStackProps) {
  if (!hints.length) return <div className="flex min-h-48 items-center justify-center border border-dashed border-border/70 text-center text-xs text-muted-foreground"><div><Lightbulb className="mx-auto mb-3 size-5" /><p>Copilot hints will appear here</p><p className="mt-1 text-[10px]">Keep listening. The next useful move is never far away.</p></div></div>;

  return (
    <section aria-label="Active copilot hints" className="space-y-3">
      {hints.map((hint, i) => <HintCard key={hint.id} hint={hint} now={now} primary={i === 0} onPin={onPin} onDismiss={onDismiss} />)}
    </section>
  );
}

function HintCard({ hint, now, primary, onPin, onDismiss }: {
  hint: ActiveHint;
  now: number;
  primary: boolean;
  onPin: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const Icon = icons[hint.kind];
  const remaining = Math.max(0, hint.ttlMs - (now - hint.receivedAt));
  const progress = hint.pinned ? 100 : hint.ttlMs > 0 ? Math.max(0, Math.min(100, (remaining / hint.ttlMs) * 100)) : 0;

  return (
    <article className={primary ? "border border-sky-300/30 bg-sky-300/[0.07] p-5 shadow-[0_0_40px_rgba(56,189,248,0.08)]" : "border border-border/60 bg-card/70 p-4"}>
      <div className="flex items-start justify-between gap-4">
        <div className={`flex items-center gap-2 font-bold uppercase tracking-[0.18em] ${primary ? "text-[10px] text-sky-300" : "text-[9px] text-muted-foreground"}`}><Icon className={primary ? "size-4" : "size-3.5"} /> {hint.kind} assist</div>
        <div className="flex items-center gap-1">
          <button type="button" title={hint.pinned ? "Unpin hint" : "Pin hint"} aria-label={`${hint.pinned ? "Unpin" : "Pin"} ${hint.title}`} onClick={() => onPin(hint.id)} className={`p-1.5 transition hover:bg-sky-300/10 ${hint.pinned ? "text-amber-300" : "text-muted-foreground"}`}><Bookmark className="size-4" fill={hint.pinned ? "currentColor" : "none"} /></button>
          <button type="button" title="Dismiss hint" aria-label={`Dismiss ${hint.title}`} onClick={() => onDismiss(hint.id)} className="p-1.5 text-muted-foreground transition hover:bg-sky-300/10 hover:text-foreground"><X className="size-4" /></button>
        </div>
      </div>
      <h2 className={primary ? "mt-4 text-xl font-semibold tracking-tight" : "mt-2 text-sm font-semibold"}>{hint.title}</h2>
      <p className={primary ? "mt-2 text-sm leading-relaxed text-foreground/80" : "mt-1 text-xs leading-relaxed text-muted-foreground"}>{hint.body}</p>
      {hint.sources?.length ? <div className="mt-3 flex flex-wrap gap-1.5">{hint.sources.map((source) => <span key={source} className="border border-sky-300/20 bg-sky-300/10 px-2 py-1 text-[10px] text-sky-200">📘 {source}</span>)}</div> : null}
      <div className={`h-1 overflow-hidden bg-sky-300/10 ${primary ? "mt-5" : "mt-3"}`}><div className="h-full bg-sky-300 transition-all duration-500" style={{ width: `${progress}%` }} /></div>
      <div className="mt-2 text-[10px] text-muted-foreground">{hint.pinned ? "Pinned until dismissed" : `${Math.ceil(remaining / 1000)}s remaining`}</div>
    </article>
  );
}
