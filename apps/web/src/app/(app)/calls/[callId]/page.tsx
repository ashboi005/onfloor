"use client";

/**
 * Scorecard. OWNER: Mansukh. Spec: docs/specs/05-mansukh-design.md §5 (demo beats 3 & 4).
 * PLACEHOLDER: renders every field plainly. Build the real widgets in components/report/.
 */
import { SCORE_DIMENSION_LABELS } from "@onfloor/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useParams } from "next/navigation";

import { useCall, useScorecard } from "@/lib/api";

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export default function ScorecardPage() {
  const { callId } = useParams<{ callId: string }>();
  const call = useCall(callId);
  const card = useScorecard(callId);

  if (card.isPending || call.isPending) return <p className="p-8">Loading…</p>;
  if (call.error) return <p className="p-8 text-red-500">{call.error.message}</p>;
  if (card.data === null) {
    return (
      <div className="p-8">
        {call.data?.status === "abandoned" ? "Too short to score." : "Scoring your call…"}
      </div>
    );
  }
  const sc = card.data!;
  const c = call.data!;
  const momentFor = (turnId: string) => sc.moments.find((m) => m.turnId === turnId);

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <header>
        <div className="text-sm text-muted-foreground">
          {c.kind} · {c.customerLabel} · {fmt(sc.stats.durationMs)}
        </div>
        <h1 className="text-4xl font-semibold">
          {sc.overall} <span className="text-2xl">{sc.grade}</span>
        </h1>
        <p className="mt-2">{sc.summary}</p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        {sc.dimensions.map((d) => (
          <div key={d.key} className="rounded-lg border p-4">
            <div className="text-sm text-muted-foreground">{SCORE_DIMENSION_LABELS[d.key]}</div>
            <div className="text-2xl font-semibold">{d.score ?? "N/A"}</div>
            <div className="text-sm">{d.verdict}</div>
          </div>
        ))}
      </section>

      {sc.crmAudit.length > 0 && (
        <table className="w-full text-sm">
          <tbody>
            {sc.crmAudit.map((r) => (
              <tr key={r.requestId} className="border-b">
                <td className="py-1">{r.field}</td>
                <td>expected {String(r.expected)}</td>
                <td>actual {String(r.actual)}</td>
                <td>{r.correct ? "✓" : "✗"}</td>
                <td>{r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <section className="space-y-2 text-sm">
        {c.transcript.map((t) => {
          const m = momentFor(t.id);
          return (
            <div key={t.id} className={m ? `rounded-md p-2 ${m.severity === "mistake" ? "bg-red-500/10" : m.severity === "warning" ? "bg-amber-500/10" : "bg-emerald-500/10"}` : ""}>
              <span className="text-muted-foreground">{fmt(t.startMs)} {t.speaker}: </span>
              {t.text}
              {m && (
                <div className="mt-1 text-xs">
                  <b>{m.title}</b>. {m.detail}
                  {m.goldenLine && <div className="mt-1 italic">A top rep would say: “{m.goldenLine}”</div>}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <div className="text-sm">
        talk {sc.stats.agentTalkPct}% · interruptions {sc.stats.interruptions} · dead air {sc.stats.deadAirCount} · {sc.stats.wpm} wpm
      </div>
      {c.kind === "live" && c.personaId && (
        <Link className="underline" href={`/simulator/new?replay=${c.id}` as Route}>
          Replay this customer in the simulator
        </Link>
      )}
    </div>
  );
}
