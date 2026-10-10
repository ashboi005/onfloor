"use client";

/**
 * Scenario + persona picker. OWNER: Harnoor. Spec: docs/specs/04-harnoor-frontend.md (Screen 1).
 * Placeholder wired to real hooks. Restyle freely; keep the data flow.
 */
import { ARCHETYPE_LABELS, type Language, LANGUAGE_LABELS, LANGUAGES } from "@onfloor/contracts";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { usePersonas, useScenarios, useStartSim } from "@/lib/api";
import { saveSimSession } from "@/lib/sim-session";

export default function SimulatorPicker() {
  const router = useRouter();
  const scenarios = useScenarios();
  const personas = usePersonas();
  const startSim = useStartSim();
  const [personaId, setPersonaId] = useState<string>();
  const [language, setLanguage] = useState<Language>("hinglish");

  const scenario = scenarios.data?.[0];

  async function start() {
    if (!scenario) return;
    const session = await startSim.mutateAsync({ scenarioId: scenario.id, personaId, language });
    saveSimSession(session);
    router.push(`/simulator/${session.callId}` as Route);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <h1 className="text-2xl font-semibold">Flight Simulator</h1>
      {scenarios.isPending && <p>Loading scenarios…</p>}
      {scenario && (
        <section className="rounded-lg border p-5">
          <h2 className="font-medium">{scenario.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{scenario.brief}</p>
          <p className="mt-2 text-sm">
            <b>Objective:</b> {scenario.objective}
          </p>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        {personas.data?.map((p) => {
          const selected = (personaId ?? scenario?.defaultPersonaId) === p.id;
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => setPersonaId(p.id)}
              className={`rounded-lg border p-4 text-left ${selected ? "border-primary ring-1 ring-primary" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.name}</span>
                {p.source === "live_call" && <span className="text-xs text-emerald-500">From live call</span>}
              </div>
              <div className="text-sm text-muted-foreground">{p.role}</div>
              <div className="mt-2 text-xs">{ARCHETYPE_LABELS[p.archetype]}</div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] text-muted-foreground">
                {Object.entries(p.traits).map(([k, v]) => (
                  <div key={k}>
                    {k}
                    <div className="h-1 rounded bg-muted">
                      <div className="h-1 rounded bg-primary" style={{ width: `${v * 10}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </button>
          );
        })}
      </section>

      <div className="flex items-center gap-3">
        <select
          className="rounded-md border bg-background px-3 py-2"
          value={language}
          onChange={(e) => setLanguage(e.target.value as Language)}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_LABELS[l]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={start}
          disabled={!scenario || startSim.isPending}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {startSim.isPending ? "Connecting…" : "Start call"}
        </button>
        {startSim.error && <span className="text-sm text-red-500">{startSim.error.message}</span>}
      </div>
    </div>
  );
}
