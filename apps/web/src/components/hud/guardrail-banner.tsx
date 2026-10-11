"use client";

import type { GuardrailAlert } from "@onfloor/contracts";
import { AlertOctagon, AlertTriangle, Volume2, X } from "lucide-react";
import { useEffect, useRef } from "react";

export function GuardrailBanner({ guardrails, onDismiss }: { guardrails: GuardrailAlert[]; onDismiss: (id: string) => void }) {
  const announced = useRef(new Set<string>());
  useEffect(() => {
    const critical = guardrails.find((alert) => alert.severity === "critical" && !announced.current.has(alert.id));
    if (!critical) return;
    announced.current.add(critical.id);
    try {
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.06, context.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.2);
      oscillator.addEventListener("ended", () => void context.close());
    } catch {
      // Audio can be blocked until the first user gesture; the visual banner remains authoritative.
    }
  }, [guardrails]);

  const critical = guardrails.find((alert) => alert.severity === "critical");
  const warnings = guardrails.filter((alert) => alert.severity === "warn");
  return <div className="space-y-2">
    {critical && <div role="alert" className="sticky top-0 z-10 flex items-start gap-3 rounded-xl border border-destructive bg-card px-4 py-3 text-destructive shadow-sm"><AlertOctagon className="mt-0.5 size-5 shrink-0" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]"><span>Critical guardrail</span><Volume2 className="size-3" /></div><p className="mt-1 text-sm font-semibold">{critical.message}</p></div><button type="button" aria-label="Dismiss critical guardrail" onClick={() => onDismiss(critical.id)} className="rounded-md p-1 text-destructive hover:text-destructive"><X className="size-4" /></button></div>}
    {warnings.map((warning) => <div role="status" key={warning.id} className="flex items-start gap-3 rounded-xl border border-warning bg-card px-4 py-3 text-warning"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /><p className="flex-1 text-xs">{warning.message}</p><button type="button" aria-label="Dismiss warning" onClick={() => onDismiss(warning.id)} className="text-warning hover:text-warning"><X className="size-3.5" /></button></div>)}
  </div>;
}
