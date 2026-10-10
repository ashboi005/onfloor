"use client";

import { ARCHETYPE_LABELS, type Language, LANGUAGE_LABELS, LANGUAGES } from "@onfloor/contracts";
import { Button } from "@onfloor/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@onfloor/ui/components/card";
import { Skeleton } from "@onfloor/ui/components/skeleton";
import { ArrowRight, Clock3, Languages, Play, ShieldCheck, Sparkles, Target, UsersRound } from "lucide-react";
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
  const selectedPersonaId = personaId ?? scenario?.defaultPersonaId;
  const selectedPersona = personas.data?.find((persona) => persona.id === selectedPersonaId);

  async function start() {
    if (!scenario || !selectedPersonaId) return;
    try {
      const session = await startSim.mutateAsync({ scenarioId: scenario.id, personaId: selectedPersonaId, language });
      saveSimSession(session);
      router.push(`/simulator/${session.callId}` as Route);
    } catch {
      // TanStack mutation state renders the actionable error below.
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-5 sm:p-8">
      <header className="flex flex-col justify-between gap-5 border-b border-border/70 pb-7 lg:flex-row lg:items-end">
        <div>
          <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"><Sparkles className="size-3.5" /> Practice room 01</div>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Flight Simulator</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Pick a customer, understand the objective, and practice the call with the merchant CRM open beside you.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground"><UsersRound className="size-4" /> {personas.data?.length ?? 0} customer profiles available</div>
      </header>

      {scenarios.isPending && <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]"><Skeleton className="h-64" /><Skeleton className="h-64" /></div>}
      {(scenarios.error || personas.error) && <div className="border border-red-400/30 bg-red-400/10 p-5 text-sm text-red-200">We couldn’t load the practice room. {scenarios.error?.message ?? personas.error?.message}</div>}
      {!scenarios.isPending && !scenario && <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No simulator scenarios are available yet.</div>}

      {scenario && (
        <>
          <Card className="overflow-hidden border-primary/20 bg-primary/[0.04]">
            <div className="grid lg:grid-cols-[1fr_auto]">
              <CardHeader className="p-6 sm:p-8">
                <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary"><Target className="size-3.5" /> Scenario brief</div>
                <CardTitle className="max-w-3xl text-2xl leading-tight sm:text-3xl">{scenario.title}</CardTitle>
                <CardDescription className="mt-3 max-w-3xl text-sm leading-relaxed">{scenario.brief}</CardDescription>
                <div className="mt-6 flex flex-wrap gap-2 text-xs"><span className="flex items-center gap-2 border border-border/70 bg-background/40 px-3 py-2"><ShieldCheck className="size-3.5 text-emerald-300" /> Objective: {scenario.objective}</span><span className="flex items-center gap-2 border border-border/70 bg-background/40 px-3 py-2"><Clock3 className="size-3.5 text-amber-300" /> Soft limit {Math.round(scenario.softLimitSec / 60)}m · hard limit {Math.round(scenario.hardLimitSec / 60)}m</span></div>
              </CardHeader>
              <div className="border-t border-border/70 bg-background/20 p-6 lg:border-l lg:border-t-0 lg:p-8"><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Watch the policy line</p><div className="mt-4 space-y-3">{scenario.policies.slice(0, 3).map((policy) => <div key={policy.id} className="flex gap-2 text-xs"><span className={`mt-1 size-1.5 shrink-0 rounded-full ${policy.severity === "critical" ? "bg-rose-400" : "bg-amber-300"}`} /><span className="leading-relaxed text-foreground/80">{policy.rule}</span></div>)}</div></div>
            </div>
          </Card>

          <div className="flex items-end justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Choose your customer</p><h2 className="mt-1 text-xl font-semibold">Who’s on the other end?</h2></div><span className="text-xs text-muted-foreground">Selected: {selectedPersona?.name ?? "Default customer"}</span></div>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {personas.data?.map((persona) => {
              const selected = selectedPersonaId === persona.id;
              return <button type="button" key={persona.id} onClick={() => setPersonaId(persona.id)} aria-pressed={selected} className={`group text-left transition ${selected ? "-translate-y-1" : "hover:-translate-y-1"}`}>
                <Card className={`h-full transition ${selected ? "border-primary bg-primary/[0.07] ring-1 ring-primary/50" : "hover:border-primary/40"}`}>
                  <CardHeader className="p-4"><div className="flex items-start justify-between gap-3"><div className={`flex size-10 items-center justify-center rounded-full text-sm font-semibold ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{persona.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</div>{persona.source === "live_call" && <span className="border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">From live call</span>}</div><CardTitle className="mt-4 text-base">{persona.name}</CardTitle><CardDescription>{persona.role}</CardDescription></CardHeader>
                  <CardContent className="space-y-4 p-4 pt-0"><div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-primary"><span>{ARCHETYPE_LABELS[persona.archetype]}</span><span>{persona.language}</span></div><div className="space-y-2">{(Object.entries(persona.traits) as [string, number][]).map(([key, value]) => <div key={key}><div className="mb-1 flex justify-between text-[10px] text-muted-foreground"><span>{key.replace(/([A-Z])/g, " $1")}</span><span>{value}/10</span></div><div className="h-1.5 bg-muted"><div className={`h-full ${selected ? "bg-primary" : "bg-muted-foreground/60"}`} style={{ width: `${value * 10}%` }} /></div></div>)}</div><p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">“{persona.openingLine}”</p></CardContent>
                </Card>
              </button>;
            })}
          </section>

          <Card className="border-border/70 bg-card/70"><CardContent className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center sm:p-6"><div><label htmlFor="sim-language" className="flex items-center gap-2 text-sm font-semibold"><Languages className="size-4 text-primary" /> Conversation language</label><p className="mt-1 text-xs text-muted-foreground">The customer’s language and voice will follow this selection.</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><select id="sim-language" className="h-9 border border-input bg-background px-3 text-xs outline-none focus-visible:border-ring" value={language} onChange={(event) => setLanguage(event.target.value as Language)}>{LANGUAGES.map((value) => <option key={value} value={value}>{LANGUAGE_LABELS[value]}</option>)}</select><Button type="button" size="lg" disabled={!selectedPersonaId || startSim.isPending} onClick={start}>{startSim.isPending ? "Opening call…" : <><Play className="size-4" /> Start call <ArrowRight className="size-4" /></>}</Button></div></CardContent></Card>
          {startSim.error && <p role="alert" className="text-sm text-red-300">Couldn’t start the call: {startSim.error.message}</p>}
        </>
      )}
    </div>
  );
}
