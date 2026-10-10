"use client";

/** Calls list. OWNER: Mansukh. Spec: docs/specs/05-mansukh-design.md §4. Placeholder. */
import type { CallKind } from "@onfloor/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useState } from "react";

import { useCalls } from "@/lib/api";

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
            {k ?? "all"}
          </button>
        ))}
      </div>
      {calls.isPending && <p>Loading…</p>}
      <table className="w-full text-sm">
        <tbody>
          {calls.data?.map((c) => (
            <tr key={c.id} className="border-b">
              <td className="py-2">
                <Link className="underline" href={`/calls/${c.id}` as Route}>
                  {c.customerLabel}
                </Link>
              </td>
              <td>{c.kind}</td>
              <td>{c.status}</td>
              <td>{c.overallScore ?? "–"}</td>
              <td>{c.durationMs ? `${Math.round(c.durationMs / 1000)}s` : "–"}</td>
              <td className="text-muted-foreground">{new Date(c.startedAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
