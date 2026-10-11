"use client";

/** Persona library. OWNER: Mansukh. Spec: docs/specs/05-mansukh-design.md §6. Placeholder. */
import { ARCHETYPE_LABELS, LANGUAGE_LABELS } from "@onfloor/contracts";
import type { Route } from "next";
import Link from "next/link";

import { usePersonas } from "@/lib/api";

export default function PersonasPage() {
  const personas = usePersonas();
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
      <h1 className="pixel-accent py-2 text-3xl font-semibold tracking-tight">Personas</h1>
      <div className="grid gap-4 lg:grid-cols-2">
        {personas.data?.map((p) => (
          <Link
            key={p.id}
            href={p.sourceCallId ? `/simulator/new?replay=${p.sourceCallId}` as Route : "/simulator"}
            className="interactive-card block space-y-4 border p-5 no-underline sm:p-6"
          >
            <div className="flex items-start justify-between gap-3">
              <span className="font-semibold tracking-tight">{p.name}</span>
              <span className="interactive-card-chip shrink-0 rounded-md bg-accent px-2 py-1 text-[10px] font-medium text-info">{p.source === "live_call" ? "From Live Call" : "Seed"}</span>
            </div>
            <div className="text-sm text-muted-foreground">
              {p.role} · {ARCHETYPE_LABELS[p.archetype]} · {LANGUAGE_LABELS[p.language]}
            </div>
            <div className="flex flex-wrap gap-1">
              {p.speechStyle.catchphrases.map((c) => (
                <span key={c} className="interactive-card-chip rounded-full bg-muted px-2 py-0.5 text-xs transition-colors">“{c}”</span>
              ))}
            </div>
            <span className="persona-action inline-flex w-fit items-center rounded-lg border px-3 py-2 text-xs font-semibold transition-colors">
              Practice With {p.name.split(" ")[0]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
