"use client";

import type { SentimentPoint } from "@/hooks/use-live-call";

type SentimentRadarProps = {
  sentiment: SentimentPoint & { history: SentimentPoint[] };
};

const metrics = [
  { key: "patience", label: "Patience", color: "#34d399" },
  { key: "frustration", label: "Frustration", color: "#fb7185" },
  { key: "engagement", label: "Engagement", color: "#60a5fa" },
] as const;

function Gauge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div className="relative size-16 rounded-full p-1" style={{ background: `conic-gradient(${color} ${value * 3.6}deg, rgb(255 255 255 / 0.08) 0deg)` }}>
        <div className="flex size-full items-center justify-center rounded-full bg-card text-sm font-semibold tabular-nums">{Math.round(value)}</div>
      </div>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function Sparkline({ points }: { points: SentimentPoint[] }) {
  if (points.length < 2) return <div className="flex h-10 items-center justify-center text-[10px] text-muted-foreground">Waiting for sentiment history…</div>;
  const width = 240;
  const height = 40;
  const max = Math.max(100, ...points.map((point) => Math.max(point.patience, point.frustration, point.engagement)));
  const min = Math.min(0, ...points.map((point) => Math.min(point.patience, point.frustration, point.engagement)));
  const path = (key: keyof Pick<SentimentPoint, "patience" | "frustration" | "engagement">) => points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = height - ((point[key] - min) / Math.max(1, max - min)) * height;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-10 w-full overflow-visible" preserveAspectRatio="none" aria-label="Sentiment history sparkline" role="img">
      <path d={path("patience")} fill="none" stroke="#34d399" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path d={path("frustration")} fill="none" stroke="#fb7185" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path d={path("engagement")} fill="none" stroke="#60a5fa" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function recommendation(sentiment: Pick<SentimentPoint, "patience" | "frustration" | "engagement">) {
  if (sentiment.frustration > 65) return "DE-ESCALATE";
  if (sentiment.engagement > 70 && sentiment.patience > 50) return "CLOSE";
  return "DISCOVER";
}

export function SentimentRadar({ sentiment }: SentimentRadarProps) {
  return (
    <section className="border border-border/70 bg-card/75 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Sentiment radar</p><h2 className="mt-1 text-sm font-semibold">Read the room</h2></div>
        <span className={`border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${recommendation(sentiment) === "DE-ESCALATE" ? "border-rose-400/30 bg-rose-400/10 text-rose-300" : recommendation(sentiment) === "CLOSE" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-sky-400/30 bg-sky-400/10 text-sky-300"}`}>{recommendation(sentiment)}</span>
      </div>
      <div className="flex gap-2">
        {metrics.map((metric) => <Gauge key={metric.key} label={metric.label} color={metric.color} value={sentiment[metric.key]} />)}
      </div>
      <div className="mt-4 border-t border-border/50 pt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground"><span>Live trend</span><span>last {sentiment.history.length} signals</span></div>
        <Sparkline points={sentiment.history} />
        <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground"><span className="text-emerald-300">● patience</span><span className="text-rose-300">● frustration</span><span className="text-sky-300">● engagement</span></div>
      </div>
    </section>
  );
}
