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
          <Link
            key={p.id}
            href={p.sourceCallId ? `/simulator/new?replay=${p.sourceCallId}` as Route : "/simulator"}
            className="interactive-card block space-y-2 border p-4 no-underline"
          >
            <div className="flex justify-between">
              <span className="font-medium">{p.name}</span>
              <span className="text-xs">{p.source === "live_call" ? "From Live Call" : "Seed"}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {p.role} · {ARCHETYPE_LABELS[p.archetype]} · {LANGUAGE_LABELS[p.language]}
            </div>
            <div className="flex flex-wrap gap-1">
              {p.speechStyle.catchphrases.map((c) => (
                <span key={c} className="interactive-card-chip rounded-full bg-muted px-2 py-0.5 text-xs transition-colors">“{c}”</span>
              ))}
            </div>
            <span className="inline-flex w-fit items-center rounded-md border px-3 py-1.5 text-sm font-medium">
              Practice With {p.name.split(" ")[0]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
