"use client";

/** Calls list. OWNER: Mansukh. Spec: docs/specs/05-mansukh-design.md §4. Placeholder. */
import type { CallKind } from "@onfloor/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { useCalls } from "@/lib/api";

const titleCase = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function CallsPage() {
  const [kind, setKind] = useState<CallKind | undefined>();
  const calls = useCalls(kind);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
      <h1 className="pixel-accent py-2 text-3xl font-semibold tracking-tight">Calls</h1>
      <div className="flex gap-2 text-sm">
        {([undefined, "sim", "live"] as const).map((k) => (
          <button
            type="button"
            key={k ?? "all"}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`rounded-lg border px-4 py-2 font-medium transition-colors ${kind === k ? "border-primary bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
          >
            {k ? titleCase(k) : "All"}
          </button>
        ))}
      </div>
      {calls.isPending && <p>Loading…</p>}
      <div className="space-y-2 text-sm">
        {calls.data?.map((c) => (
          <Link
            key={c.id}
            className="interactive-card grid grid-cols-2 items-center gap-3 border px-5 py-4 no-underline lg:grid-cols-[minmax(0,1fr)_3rem_6rem_3rem_4rem_11rem]"
            href={`/calls/${c.id}` as Route}
          >
            <span className="col-span-2 font-semibold lg:col-span-1">{c.customerLabel}</span>
            <span className="text-info">{titleCase(c.kind)}</span>
            <span>{titleCase(c.status)}</span>
            <span className="text-lg font-semibold tabular-nums text-info">{c.overallScore ?? "–"}</span>
            <span>{c.durationMs ? `${Math.round(c.durationMs / 1000)}s` : "–"}</span>
            <span className="text-muted-foreground">{new Date(c.startedAt).toLocaleString()}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
