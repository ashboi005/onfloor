"use client";

import type { LiveCallState } from "@/hooks/use-live-call";
import { subtitleText, useSubtitleMode } from "@/lib/subtitles";
import { Languages } from "lucide-react";
import { useEffect, useRef } from "react";

function timestamp(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MiniTranscript({ turns, partial }: Pick<LiveCallState, "turns" | "partial">) {
  const ref = useRef<HTMLDivElement>(null);
  const [subtitleMode, setSubtitleMode] = useSubtitleMode();
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [turns.length, partial.agent, partial.customer]);
  return (
    <section className="flex min-h-0 flex-1 flex-col hud-panel border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Live transcript</p>
          <h2 className="mt-1 text-sm font-semibold">Last six turns</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden border border-border text-[10px]">
            <button type="button" onClick={() => setSubtitleMode("raw")} className={`flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${subtitleMode === "raw" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              <Languages className="size-3" /> Original
            </button>
            <button type="button" onClick={() => setSubtitleMode("english")} className={`rounded-md px-2 py-1 font-medium transition ${subtitleMode === "english" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              English
            </button>
          </div>
          <span className="text-[10px] text-muted-foreground">{turns.length} total</span>
        </div>
      </div>
      <div ref={ref} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1" aria-live="polite">
        {turns.slice(-6).map((turn) => {
          const { text, pending } = subtitleText(turn, subtitleMode);
          return (
            <div key={turn.id} className={`border-l-2 pl-3 ${turn.speaker === "agent" ? "border-primary" : "border-input"}`}>
              <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                <span className={turn.speaker === "agent" ? "text-info" : "text-muted-foreground"}>{turn.speaker === "agent" ? "You" : "Customer"}</span>
                <span>{timestamp(turn.startMs)}</span>
              </div>
              <p className={`mt-1 text-xs leading-relaxed ${pending ? "italic text-foreground" : "text-foreground"}`}>
                {text}
                {pending && <span className="ml-1.5 text-[10px] not-italic text-muted-foreground">translating…</span>}
              </p>
            </div>
          );
        })}
        {/* Partials are always raw (never translated) */}
        {(["customer", "agent"] as const).map((speaker) => partial[speaker] ? <div key={speaker} className="border-l-2 border-dashed border-muted-foreground pl-3 opacity-60"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{speaker === "agent" ? "You" : "Customer"} · listening…</p><p className="mt-1 text-xs italic">{partial[speaker]}…</p></div> : null)}
        {!turns.length && !partial.agent && !partial.customer && <p className="py-8 text-center text-xs text-muted-foreground">Transcript will appear as the call progresses.</p>}
      </div>
    </section>
  );
}
