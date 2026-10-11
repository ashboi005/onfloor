"use client";

/**
 * Simulator picker: WHO you call (a Tomato merchant, or a customer from a live call to replay) →
 * HOW they behave (a behaviour preset + sliders; live-call customers keep their own) → guidance
 * on/off → start. Barebones reference wired end to end (Ashwath); Mansukh owns the look.
 */
import {
  ARCHETYPE_LABELS,
  type Language,
  LANGUAGE_LABELS,
  LANGUAGES,
  type MerchantSummary,
  type Persona,
  type PersonaTuning,
} from "@onfloor/contracts";
import { Button } from "@onfloor/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@onfloor/ui/components/card";
import { Skeleton } from "@onfloor/ui/components/skeleton";
import { ArrowRight, Compass, Play, Radio, Sparkles, Store, UserRound } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useMerchants, usePersonas, useScenarios, useStartSim } from "@/lib/api";
import { saveSimSession } from "@/lib/sim-session";

const TRAITS = ["patience", "aggression", "priceSensitivity", "talkativeness"] as const;
type Traits = Persona["traits"];
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const RELATION = { owner: "Owner answers", manager: "Manager answers", family: "Family member answers" } as const;

type Pick = { kind: "merchant"; merchant: MerchantSummary } | { kind: "live"; persona: Persona };

export default function SimulatorPicker() {
  const router = useRouter();
  const scenarios = useScenarios();
  const merchants = useMerchants("seed");
  const personas = usePersonas();
  const startSim = useStartSim();

  const [pick, setPick] = useState<Pick | null>(null);
  const [personaId, setPersonaId] = useState<string>();
  const [traits, setTraits] = useState<Traits | null>(null);
  const [guidance, setGuidance] = useState(true);
  const [language, setLanguage] = useState<Language>("hinglish");

  const scenario = scenarios.data?.[0];
  const presets = personas.data?.filter((p) => p.source !== "live_call") ?? [];
  const liveCustomers = personas.data?.filter((p) => p.source === "live_call") ?? [];
  const merchantList = [...(merchants.data ?? [])].sort((a, b) => Number(b.demo) - Number(a.demo));
  const preset = pick?.kind === "merchant" ? presets.find((p) => p.id === (personaId ?? pick.merchant.defaultPersonaId)) : undefined;

  function choose(p: Pick) {
    setPick(p);
    setPersonaId(undefined);
    setTraits(null);
    setLanguage(p.kind === "merchant" ? p.merchant.language : p.persona.language);
  }

  async function start() {
    if (!pick) return;
    const tuning: PersonaTuning | undefined = traits ? { traits } : undefined;
    try {
      const session = await startSim.mutateAsync(
        pick.kind === "merchant"
          ? { scenarioId: scenario?.id, merchantId: pick.merchant.id, personaId: preset?.id, language, guidance, tuning }
          : { scenarioId: scenario?.id, personaId: pick.persona.id, language, guidance, replayOfCallId: pick.persona.sourceCallId ?? undefined },
      );
      saveSimSession(session);
      router.push(`/simulator/${session.callId}` as Route);
    } catch {
      // The mutation error is rendered below.
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-5 sm:p-8">
      <header className="border-b border-border/70 pb-6">
        <div className="mb-3 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-primary"><Sparkles className="size-3.5" /> Practice room</div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Flight Simulator</h1>
        {scenario && <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{scenario.brief}</p>}
      </header>

      {(scenarios.error || merchants.error || personas.error) && (
        <div className="border border-red-400/30 bg-red-400/10 p-5 text-sm text-red-200">We couldn’t load the practice room. {scenarios.error?.message ?? merchants.error?.message ?? personas.error?.message}</div>
      )}

      {/* 1. Who */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Store className="size-4 text-primary" /> 1. Who are you calling?</h2>
        {merchants.isPending && <div className="grid gap-3 md:grid-cols-4"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {merchantList.map((m) => {
            const selected = pick?.kind === "merchant" && pick.merchant.id === m.id;
            return (
              <button key={m.id} type="button" onClick={() => choose({ kind: "merchant", merchant: m })} aria-pressed={selected} className="interactive-card-trigger text-left">
                <Card className={`interactive-card h-full ${selected ? "border-primary ring-1 ring-primary/50" : ""}`}>
                  <CardHeader className="p-4">
                    <CardTitle className="text-base">{m.restaurantName}</CardTitle>
                    <CardDescription>{m.ownerName} · {m.locality}, {m.city}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-1 p-4 pt-0 text-xs text-muted-foreground">
                    <p>{m.cuisines.join(", ")} · DRR {rupees(m.drr)}/day</p>
                    <p>{RELATION[m.answeredBy]} · {LANGUAGE_LABELS[m.language]}</p>
                    <p className="text-foreground/80">{m.tagline}</p>
                  </CardContent>
                </Card>
              </button>
            );
          })}
        </div>
        {liveCustomers.length > 0 && (
          <>
            <p className="flex items-center gap-2 pt-2 text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-300"><Radio className="size-3.5" /> From live calls (replay the real customer)</p>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {liveCustomers.map((p) => {
                const selected = pick?.kind === "live" && pick.persona.id === p.id;
                return (
                  <button key={p.id} type="button" onClick={() => choose({ kind: "live", persona: p })} aria-pressed={selected} className="interactive-card-trigger text-left">
                    <Card className={`interactive-card h-full ${selected ? "border-emerald-400 ring-1 ring-emerald-400/50" : ""}`}>
                      <CardHeader className="p-4"><CardTitle className="text-base">{p.name}</CardTitle><CardDescription>{p.role}</CardDescription></CardHeader>
                      <CardContent className="p-4 pt-0 text-xs text-muted-foreground">{ARCHETYPE_LABELS[p.archetype]} · “{p.openingLine}”</CardContent>
                    </Card>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* 2. How they behave */}
      {pick && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold"><UserRound className="size-4 text-primary" /> 2. How do they behave?</h2>
          {pick.kind === "live" ? (
            <p className="text-sm text-muted-foreground">Replaying {pick.persona.name} exactly as they behaved on the live call ({ARCHETYPE_LABELS[pick.persona.archetype]}).</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {presets.map((p) => {
                  const selected = preset?.id === p.id;
                  return (
                    <button key={p.id} type="button" onClick={() => { setPersonaId(p.id); setTraits(null); }} aria-pressed={selected} className="interactive-card-trigger text-left">
                      <Card className={`interactive-card h-full ${selected ? "border-primary ring-1 ring-primary/50" : ""}`}>
                        <CardHeader className="p-4"><CardTitle className="text-sm">{p.name}{p.id === pick.merchant.defaultPersonaId ? " · suggested" : ""}</CardTitle><CardDescription className="line-clamp-3 text-xs">{p.backstory}</CardDescription></CardHeader>
                      </Card>
                    </button>
                  );
                })}
              </div>
              {preset && (
                <Card>
                  <CardHeader className="p-4 pb-2"><CardTitle className="text-sm">Fine-tune {preset.name}</CardTitle><CardDescription className="text-xs">Aggression drives the tone: 0–3 polite, 4–6 firm, 7–8 blunt, 9–10 confrontational.</CardDescription></CardHeader>
                  <CardContent className="space-y-3 p-4 pt-2">
                    {TRAITS.map((k) => {
                      const value = (traits ?? preset.traits)[k];
                      return (
                        <label key={k} className="block text-xs">
                          <span className="flex justify-between"><span>{k.replace(/([A-Z])/g, " $1").replace(/^\w/, (letter) => letter.toUpperCase())}</span><span className="font-mono">{value}/10</span></span>
                          <input type="range" min={0} max={10} value={value} className="w-full" onChange={(e) => setTraits({ ...(traits ?? preset.traits), [k]: Number(e.target.value) })} />
                        </label>
                      );
                    })}
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </section>
      )}

      {/* 3. Guidance + start */}
      {pick && (
        <Card className="border-border/70 bg-card/70">
          <CardContent className="flex flex-col justify-between gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm font-semibold">
                <input type="checkbox" checked={guidance} onChange={(e) => setGuidance(e.target.checked)} className="size-4" />
                <Compass className="size-4 text-amber-300" /> Guidance {guidance ? "on" : "off"}
              </label>
              <p className="max-w-xl text-xs text-muted-foreground">{guidance ? "Highlights the next step and the field to use, tips you on the customer's questions, and suggests the disposition after the call." : "No help: you run the call, the tools and the disposition on your own."}</p>
              <label className="flex items-center gap-2 text-xs">Language
                <select className="h-8 border border-input bg-background px-2" value={language} onChange={(e) => setLanguage(e.target.value as Language)}>{LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>)}</select>
              </label>
            </div>
            <Button type="button" size="lg" disabled={startSim.isPending || !scenario} onClick={start}>
              {startSim.isPending ? "Starting…" : <><Play className="size-4" /> Start simulation <ArrowRight className="size-4" /></>}
            </Button>
          </CardContent>
        </Card>
      )}
      {startSim.error && <p role="alert" className="text-sm text-red-300">Couldn’t start the call: {startSim.error.message}</p>}
    </div>
  );
}
