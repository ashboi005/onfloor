"use client";

import { BookOpen, Lightbulb, MessageCircleQuestion, ShieldAlert, Target } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Landing-page product visual: a self-playing mock of the live HUD during a Tomato Max Grow call
 * (the rehearsal script in docs/demo/02-live-call-script.md). Static data, no API. Loops.
 */

type Hint = { id: string; kind: "objection" | "pitch" | "close"; title: string; body: string; source: string };
type Line = { id: string; who: "agent" | "customer"; text: string; en?: string };
type Frame = {
  at: number;
  line?: Line;
  hint?: Hint;
  guardrail?: boolean;
  clearGuardrail?: boolean;
  mood?: [number, number, number];
  talk?: number;
};

const SOURCE = "Tomato Live Call Guide";
const SCRIPT: Frame[] = [
  { at: 400, line: { id: "l1", who: "agent", text: "Good morning sir, Ashwath from the Tomato team. Vikas Gupta ji, Gupta Sweets & Snacks?" }, mood: [62, 22, 48], talk: 70 },
  { at: 2200, line: { id: "l2", who: "customer", text: "Haan ji. Achha, isme kitna katega?", en: "Yes. So how much will be cut?" }, mood: [60, 28, 58], talk: 58 },
  { at: 2900, hint: { id: "h1", kind: "pitch", title: "How much is cut", body: "20% only on sales above their DRR. ₹100 → ₹200 a day = ₹20/day.", source: SOURCE } },
  { at: 4600, line: { id: "l3", who: "agent", text: "Sirf 20%, aur woh bhi sirf extra sales pe. Sales nahi badhi toh zero deduction." }, mood: [68, 20, 66], talk: 55 },
  { at: 6600, line: { id: "l4", who: "customer", text: "Bees bahut hai, das percent kar do. Mere dost ko kam mila.", en: "Twenty is too much, make it ten. My friend got less." }, mood: [52, 44, 61], talk: 50 },
  { at: 7300, hint: { id: "h2", kind: "objection", title: "Asks for a lower rate", body: "Hold the 20%: same for every partner, and only on sales they wouldn't have had otherwise.", source: SOURCE } },
  { at: 9000, line: { id: "l5", who: "agent", text: "Theek hai sir, commission 15% kar deta hoon…" }, guardrail: true, mood: [55, 38, 60], talk: 54 },
  { at: 11000, line: { id: "l6", who: "agent", text: "Sorry sir, correction: 20% hi hai, sabke liye same." }, clearGuardrail: true, mood: [61, 30, 63], talk: 56 },
  { at: 12800, line: { id: "l7", who: "customer", text: "Theek hai, laga do. Campaign start karo.", en: "Okay, put it on. Start the campaign." }, mood: [72, 15, 80], talk: 52 },
  { at: 13400, hint: { id: "h3", kind: "close", title: "Buying signal: close now", body: "Dictate it: starts today, runs through next month. Then thank them and ask if there's anything else.", source: SOURCE } },
];
const LOOP_MS = 17_500;
const HINT_TTL = 12_000;

const icons = { pitch: Target, objection: MessageCircleQuestion, close: Lightbulb } as const;
const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

interface State {
  lines: Line[];
  hints: (Hint & { at: number })[];
  guardrail: boolean;
  mood: [number, number, number];
  talk: number;
}

function stateAt(t: number): State {
  const s: State = { lines: [], hints: [], guardrail: false, mood: [60, 25, 45], talk: 60 };
  for (const f of SCRIPT) {
    if (f.at > t) break;
    if (f.line) s.lines.push(f.line);
    if (f.hint) s.hints.unshift({ ...f.hint, at: f.at });
    if (f.guardrail) s.guardrail = true;
    if (f.clearGuardrail) s.guardrail = false;
    if (f.mood) s.mood = f.mood;
    if (f.talk) s.talk = f.talk;
  }
  s.hints = s.hints.filter((h) => t - h.at < HINT_TTL).slice(0, 3);
  return s;
}

export function HudDemo() {
  const [t, setT] = useState(0);
  useEffect(() => {
    // Reduced motion: hold a representative frame instead of looping.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setT(7800);
      return;
    }
    const start = Date.now();
    const id = setInterval(() => setT((Date.now() - start) % LOOP_MS), 200);
    return () => clearInterval(id);
  }, []);

  const s = stateAt(t);
  const [patience, frustration, engagement] = s.mood;
  return (
    <div className="relative w-full max-w-5xl overflow-hidden rounded-xl border bg-card/90 text-left shadow-2xl backdrop-blur-md" aria-label="Animated preview of the OnFloor live copilot">
      {/* Top strip */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-2.5 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="relative flex size-2"><span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex size-2 rounded-full bg-emerald-500" /></span>
          <span className="font-semibold">Live</span>
          <span className="truncate text-muted-foreground">Vikas Gupta · Gupta Sweets &amp; Snacks</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 font-mono text-muted-foreground"><span>Hinglish</span><span>{fmt(t * 4)}</span></div>
      </div>

      {/* Guardrail */}
      <div className={`overflow-hidden transition-all duration-300 ${s.guardrail ? "max-h-16 opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="flex items-center gap-2 bg-red-500/90 px-4 py-2 text-xs font-semibold text-white">
          <ShieldAlert className="size-4 shrink-0" /> Max Grow is exactly 20%, and only on sales above the DRR. No discounts.
        </div>
      </div>

      <div className="grid gap-4 p-4 md:grid-cols-[1.35fr_1fr]">
        {/* Hints */}
        <div className="flex min-h-[220px] flex-col gap-3">
          {s.hints.length === 0 && <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed text-xs text-muted-foreground">Listening for the next useful move…</div>}
          {s.hints.map((h, i) => {
            const Icon = icons[h.kind];
            const left = Math.max(0, 100 - ((t - h.at) / HINT_TTL) * 100);
            return (
              <div
                key={h.id}
                className={`animate-in fade-in slide-in-from-top-2 rounded-lg border p-3 duration-500 ${i === 0 ? "border-sky-400/40 bg-sky-400/[0.08]" : "bg-background/50 opacity-80"}`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-300"><Icon className="size-3.5" /> {h.kind} assist</div>
                <p className={`mt-1.5 font-semibold ${i === 0 ? "text-base" : "text-sm"}`}>{h.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{h.body}</p>
                <span className="mt-2 inline-flex items-center gap-1 rounded border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 text-[10px] text-sky-700 dark:text-sky-200"><BookOpen className="size-3" /> {h.source}</span>
                <div className="mt-2 h-0.5 overflow-hidden rounded bg-sky-400/15"><div className="h-full bg-sky-500 transition-[width] duration-200 ease-linear" style={{ width: `${left}%` }} /></div>
              </div>
            );
          })}
        </div>

        {/* Right rail */}
        <div className="flex flex-col gap-3">
          <div className="rounded-lg border bg-background/50 p-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Customer sentiment</p>
            {([["Patience", patience, "bg-emerald-500"], ["Frustration", frustration, "bg-rose-500"], ["Engagement", engagement, "bg-sky-500"]] as const).map(([label, v, color]) => (
              <div key={label} className="mb-1.5 last:mb-0">
                <div className="flex justify-between text-[10px] text-muted-foreground"><span>{label}</span><span className="font-mono">{v}</span></div>
                <div className="h-1.5 overflow-hidden rounded bg-muted"><div className={`h-full ${color} transition-[width] duration-700`} style={{ width: `${v}%` }} /></div>
              </div>
            ))}
            <div className="mt-2 flex items-center gap-2 text-[10px] text-muted-foreground">
              <span>Talk</span>
              <div className="flex h-1.5 flex-1 overflow-hidden rounded bg-violet-400/40"><div className="h-full bg-sky-500 transition-[width] duration-700" style={{ width: `${s.talk}%` }} /></div>
              <span className="font-mono">{s.talk}% you</span>
            </div>
          </div>
          <div className="flex min-h-[150px] flex-1 flex-col justify-end gap-2 overflow-hidden rounded-lg border bg-background/50 p-3">
            {s.lines.slice(-4).map((l) => (
              <div key={l.id} className={`animate-in fade-in slide-in-from-bottom-1 border-l-2 pl-2 duration-500 ${l.who === "agent" ? "border-sky-400" : "border-violet-400"}`}>
                <p className={`text-[9px] font-semibold uppercase tracking-wider ${l.who === "agent" ? "text-sky-600 dark:text-sky-300" : "text-violet-600 dark:text-violet-300"}`}>{l.who === "agent" ? "You" : "Customer"}</p>
                <p className="text-[11px] leading-snug">{l.en ?? l.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
