"use client";

/** Persona library. OWNER: Mansukh. Spec: docs/specs/05-mansukh-design.md §6. Placeholder. */
import { ARCHETYPE_LABELS, LANGUAGE_LABELS } from "@onfloor/contracts";
import type { Route } from "next";
import Link from "next/link";

import { usePersonas } from "@/lib/api";

export default function PersonasPage() {
  const personas = usePersonas();
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Personas</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {personas.data?.map((p) => (
          <div key={p.id} className="space-y-2 rounded-lg border p-4">
            <div className="flex justify-between">
              <span className="font-medium">{p.name}</span>
              <span className="text-xs">{p.source === "live_call" ? "From live call" : "Seed"}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {p.role} · {ARCHETYPE_LABELS[p.archetype]} · {LANGUAGE_LABELS[p.language]}
            </div>
            <div className="flex flex-wrap gap-1">
              {p.speechStyle.catchphrases.map((c) => (
                <span key={c} className="rounded-full bg-muted px-2 py-0.5 text-xs">“{c}”</span>
              ))}
            </div>
            {p.sourceCallId ? (
              <Link className="text-sm underline" href={`/simulator/new?replay=${p.sourceCallId}` as Route}>
                Practice with {p.name.split(" ")[0]}
              </Link>
            ) : (
              <Link className="text-sm underline" href="/simulator">
                Practice with {p.name.split(" ")[0]}
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
