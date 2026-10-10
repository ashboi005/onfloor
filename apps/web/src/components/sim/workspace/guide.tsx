"use client";

import type { GuidanceState, GuidanceTarget } from "@onfloor/contracts";
import { Lightbulb, ListChecks, MessageSquareQuote, TriangleAlert } from "lucide-react";
import { useEffect } from "react";

/**
 * Guidance-on helpers. Put `data-guide="<target>"` on an element; the one named in
 * `guidance.next.target` gets the `guide-highlight` ring (styles in this file).
 */
export function useGuideHighlight(target: GuidanceTarget | null | undefined) {
  useEffect(() => {
    if (!target) return;
    const els = document.querySelectorAll<HTMLElement>(`[data-guide="${target}"]`);
    els.forEach((el) => el.classList.add("guide-highlight"));
    return () => els.forEach((el) => el.classList.remove("guide-highlight"));
  }, [target]);
}

export const GUIDE_CSS = `
.guide-highlight { position: relative; outline: 2px solid rgb(250 204 21); outline-offset: 3px; border-radius: 4px; animation: guide-pulse 1.4s ease-in-out infinite; }
@keyframes guide-pulse { 0%, 100% { outline-color: rgb(250 204 21 / 0.95); } 50% { outline-color: rgb(250 204 21 / 0.35); } }
`;

const TIP_ICON = { answer: MessageSquareQuote, objection: MessageSquareQuote, warning: TriangleAlert, info: Lightbulb } as const;

/** Next step + the latest tips (several can be on screen at once). */
export function GuidanceBar({ guidance }: { guidance: GuidanceState | null }) {
  useGuideHighlight(guidance?.next?.target);
  if (!guidance) return null;
  const done = guidance.steps.filter((s) => s.status !== "todo").length;
  return (
    <div className="space-y-2 border-b border-border/70 bg-amber-300/[0.06] px-4 py-3">
      <style>{GUIDE_CSS}</style>
      {guidance.next && (
        <div className="flex items-start gap-2 text-sm">
          <ListChecks className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              Next · step {Math.min(done + 1, guidance.steps.length)} of {guidance.steps.length}
            </p>
            <p className="leading-snug">{guidance.next.text}</p>
          </div>
        </div>
      )}
      {guidance.tips.map((tip) => {
        const Icon = TIP_ICON[tip.kind];
        return (
          <div key={tip.id} className={`flex items-start gap-2 border px-3 py-2 text-xs ${tip.kind === "warning" ? "border-red-400/30 bg-red-400/10" : "border-border/60 bg-background/40"}`}>
            <Icon className="mt-0.5 size-3.5 shrink-0 text-amber-200" />
            <span>{tip.text}</span>
          </div>
        );
      })}
    </div>
  );
}
