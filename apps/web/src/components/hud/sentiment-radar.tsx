"use client";

import type { SentimentPoint } from "@/hooks/use-live-call";

type SentimentRadarProps = {
  sentiment: SentimentPoint & { history: SentimentPoint[] };
};

const metrics = [
  { key: "patience", label: "Patience", color: "var(--success)" },
  { key: "frustration", label: "Frustration", color: "var(--destructive)" },
  { key: "engagement", label: "Engagement", color: "var(--info)" },
] as const;

function Gauge({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <div className="relative size-16 border border-border bg-card">
        <div className="flex size-full items-center justify-center text-sm font-semibold tabular-nums">{Math.round(value)}</div>
        <div className="pixel-meter-track absolute inset-x-1 bottom-1 h-1.5">
          <div className="h-full" style={{ backgroundColor: color, width: `${value}%` }} />
        </div>
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
      <path d={path("patience")} fill="none" stroke="var(--success)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <path d={path("frustration")} fill="none" stroke="var(--destructive)" strokeWidth="1.5" strokeDasharray="6 3" vectorEffect="non-scaling-stroke" />
      <path d={path("engagement")} fill="none" stroke="var(--info)" strokeWidth="1.5" strokeDasharray="1 3" vectorEffect="non-scaling-stroke" />
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
    <section className="hud-panel border border-border bg-card p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Sentiment radar</p><h2 className="mt-1 text-sm font-semibold">Read the room</h2></div>
        <span className={`rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${recommendation(sentiment) === "DE-ESCALATE" ? "border-destructive bg-card text-destructive" : recommendation(sentiment) === "CLOSE" ? "border-success bg-card text-success" : "border-primary bg-card text-info"}`}>{recommendation(sentiment)}</span>
      </div>
      <div className="flex gap-2">
        {metrics.map((metric) => <Gauge key={metric.key} label={metric.label} color={metric.color} value={sentiment[metric.key]} />)}
      </div>
      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground"><span>Live trend</span><span>last {sentiment.history.length} signals</span></div>
        <Sparkline points={sentiment.history} />
        <div className="mt-1 flex gap-3 text-[10px] text-muted-foreground"><span className="text-success">● patience</span><span className="text-destructive">● frustration</span><span className="text-info">● engagement</span></div>
      </div>
    </section>
  );
}
