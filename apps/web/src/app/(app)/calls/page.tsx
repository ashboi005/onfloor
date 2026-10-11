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
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Calls</h1>
      <div className="flex gap-2 text-sm">
        {([undefined, "sim", "live"] as const).map((k) => (
          <button
            type="button"
            key={k ?? "all"}
            onClick={() => setKind(k)}
            className={`rounded-md border px-3 py-1 ${kind === k ? "bg-muted" : ""}`}
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
            className="interactive-card flex flex-wrap items-center gap-x-5 gap-y-2 border px-4 py-3 no-underline sm:flex-nowrap"
            href={`/calls/${c.id}` as Route}
          >
            <span className="min-w-48 flex-1 font-medium">{c.customerLabel}</span>
            <span>{titleCase(c.kind)}</span>
            <span>{titleCase(c.status)}</span>
            <span>{c.overallScore ?? "–"}</span>
            <span>{c.durationMs ? `${Math.round(c.durationMs / 1000)}s` : "–"}</span>
            <span className="text-muted-foreground">{new Date(c.startedAt).toLocaleString()}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
