"use client";

import { Bot, PhoneCall, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Landing-page diagram of the replay loop: live call → persona extracted → practice replay,
 * with a pulse travelling around the ring and the current step lit. Loops; holds still with
 * reduced motion.
 */

const STEPS = [
  { Icon: PhoneCall, title: "Live call", caption: "Real Telegram call, transcribed and coached live" },
  { Icon: Sparkles, title: "Persona extracted", caption: "Traits, objections and verbatim lines from that customer" },
  { Icon: Bot, title: "Practice replay", caption: "The same customer, back in the simulator, scored again" },
] as const;
const PERIOD_MS = 9000;
const R = 30; // ring radius, % of the box (leaves room for the labels outside the ring)
// Nodes at 12, 4 and 8 o'clock.
const ANGLES = [-90, 30, 150];
const pos = (deg: number) => ({ x: 50 + R * Math.cos((deg * Math.PI) / 180), y: 50 + R * Math.sin((deg * Math.PI) / 180) });

export function ReplayLoop() {
  const [t, setT] = useState(0);
  const [still, setStill] = useState(false);
  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setStill(true);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setT((Date.now() - start) % PERIOD_MS), 50);
    return () => clearInterval(id);
  }, []);

  const progress = t / PERIOD_MS; // 0..1 around the ring, starting at 12 o'clock
  const active = Math.floor(progress * 3) % 3;
  const dot = pos(-90 + progress * 360);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-md" aria-label="The replay loop: live call, persona extracted, practice replay">
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="loop-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--foreground)" />
            <stop offset="100%" stopColor="var(--foreground)" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={R} fill="none" className="stroke-border" strokeWidth="0.6" strokeDasharray="1.2 1.6" />
        {/* Progress arc */}
        <circle
          cx="50"
          cy="50"
          r={R}
          fill="none"
          stroke="url(#loop-grad)"
          strokeWidth="1.1"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${(still ? 0.66 : progress) * 100} 100`}
          transform="rotate(-90 50 50)"
        />
        {!still && (
          <>
            <rect x={dot.x - 2} y={dot.y - 2} width="4" height="4" fill="var(--foreground)" />
            <circle cx={dot.x} cy={dot.y} r="1.3" fill="url(#loop-grad)" />
          </>
        )}
      </svg>

      {/* Centre */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="max-w-[7.5rem] text-center sm:max-w-[9rem]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Every call</p>
          <p className="mt-1 text-base font-bold leading-tight text-info sm:text-lg">becomes practice</p>
          <p className="mt-2 text-[10px] text-muted-foreground">scored · replayed · scored again</p>
        </div>
      </div>

      {/* Nodes: icon on the ring, label pointing outward (above the top node, below the others). */}
      {STEPS.map(({ Icon, title, caption }, i) => {
        const p = pos(ANGLES[i]!);
        const on = still ? i === 1 : i === active;
        return (
          <div key={title} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <div
              className={`flex size-11 items-center justify-center rounded-full border-2 bg-card shadow-sm transition-all duration-500 sm:size-12 ${
                on ? "scale-110 border-primary text-info shadow-md shadow-primary/15" : "border-border text-muted-foreground"
              }`}
            >
              <Icon className="size-5" />
            </div>
            <div className={`absolute left-1/2 w-28 -translate-x-1/2 text-center sm:w-36 ${i === 0 ? "bottom-full mb-2" : "top-full mt-2"}`}>
              <p className={`text-xs font-semibold transition-colors duration-500 sm:text-sm ${on ? "text-foreground" : "text-muted-foreground"}`}>
                <span className="mr-1 font-mono text-[10px] text-muted-foreground sm:text-xs">{i + 1}</span>
                {title}
              </p>
              <p className={`mt-0.5 hidden text-[11px] leading-snug text-muted-foreground transition-opacity duration-500 sm:block ${on ? "opacity-100" : "opacity-60"}`}>{caption}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
