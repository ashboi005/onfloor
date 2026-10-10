"use client";

/**
 * Simulator workspace: Mock CRM (Pane A) + Call Terminal (Pane B).
 * OWNER: Harnoor. Spec: docs/specs/04-harnoor-frontend.md (Screen 2).
 *
 * PLACEHOLDER: proves the wiring. Build the real panes in components/sim/crm and
 * components/sim/terminal against `useSimCall`. Only two CRM fields are wired here
 * as an example of `reportCrmAction`; CRM_FIELDS in @onfloor/contracts lists them all.
 */
import { CRM_FIELDS, type CrmState, type SimSessionStart } from "@onfloor/contracts";
import type { Route } from "next";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useSimCall } from "@/hooks/use-sim-call";
import { loadSimSession } from "@/lib/sim-session";

const fmt = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export default function SimWorkspacePage() {
  const { callId } = useParams<{ callId: string }>();
  const [start, setStart] = useState<SimSessionStart | null | undefined>(undefined);
  useEffect(() => setStart(loadSimSession(callId)), [callId]);

  if (start === undefined) return null;
  if (!start) return <p className="p-8">Session not found. Start a call from the simulator.</p>;
  return <SimWorkspace start={start} />;
}

function SimWorkspace({ start }: { start: SimSessionStart }) {
  const callId = start.callId;
  const router = useRouter();
  const call = useSimCall(start);
  const [crm, setCrm] = useState<CrmState>(start.scenario.initialCrm);

  useEffect(() => {
    if (call.status === "ended") {
      const t = setTimeout(() => router.push(`/calls/${callId}` as Route), 2500);
      return () => clearTimeout(t);
    }
  }, [call.status, callId, router]);

  function commit<K extends keyof CrmState>(field: K, to: CrmState[K]) {
    if (crm[field] === to) return;
    call.reportCrmAction({ field, from: crm[field], to });
    setCrm({ ...crm, [field]: to });
  }
  const pending = (field: keyof CrmState) => call.pendingCrmRequests.some((r) => r.field === field);

  return (
    <div className="grid h-full grid-cols-[3fr_2fr]">
      {/* Pane A: Mock CRM */}
      <section className="space-y-6 overflow-y-auto border-r p-6">
        <h2 className="text-lg font-semibold">{start.persona.business.type} portal · {start.persona.name}</h2>
        <label className={`block rounded-md p-3 ${pending("monthlyBudget") ? "animate-pulse bg-amber-500/10" : ""}`}>
          <div className="text-sm">{CRM_FIELDS.monthlyBudget.label}: ₹{crm.monthlyBudget.toLocaleString("en-IN")}</div>
          <input
            type="range"
            className="w-full"
            min={CRM_FIELDS.monthlyBudget.min}
            max={CRM_FIELDS.monthlyBudget.max}
            step={CRM_FIELDS.monthlyBudget.step}
            defaultValue={crm.monthlyBudget}
            onPointerUp={(e) => commit("monthlyBudget", Number((e.target as HTMLInputElement).value))}
          />
        </label>
        <label className={`flex items-center gap-3 rounded-md p-3 ${pending("weekendNotifications") ? "animate-pulse bg-amber-500/10" : ""}`}>
          <input
            type="checkbox"
            checked={crm.weekendNotifications}
            onChange={(e) => commit("weekendNotifications", e.target.checked)}
          />
          <span className="text-sm">{CRM_FIELDS.weekendNotifications.label}</span>
        </label>
        {call.pendingCrmRequests.length > 0 && (
          <p className="text-sm text-amber-500">Customer requested a change ({call.pendingCrmRequests.length})</p>
        )}
        <p className="text-xs text-muted-foreground">TODO(harnoor): every field in CRM_FIELDS, fake Leads/Invoices tabs.</p>
      </section>

      {/* Pane B: Call terminal */}
      <section className="flex flex-col gap-4 overflow-hidden p-6">
        <div>
          <div className="font-semibold">{start.persona.name}</div>
          <div className="text-sm text-muted-foreground">{start.persona.role}</div>
          <div className="mt-1 text-xs">
            {call.status} · {fmt(call.elapsedMs)} elapsed · {fmt(call.remainingMs)} left · persona {call.personaState}
          </div>
        </div>
        <div>
          <div className="text-xs">Patience {call.patience}</div>
          <div className="h-2 rounded bg-muted">
            <div className="h-2 rounded bg-emerald-500 transition-all" style={{ width: `${call.patience}%` }} />
          </div>
        </div>
        <div className="flex gap-4 text-xs">
          <span>mic {"▮".repeat(Math.round(call.micLevel * 10))}</span>
          <span>persona {"▮".repeat(Math.round(call.personaLevel * 10))}</span>
        </div>
        <div className="flex-1 space-y-2 overflow-y-auto text-sm">
          {call.turns.map((t) => (
            <p key={t.id} className={t.speaker === "agent" ? "text-right" : ""}>
              <span className="text-xs text-muted-foreground">{fmt(t.startMs)} </span>
              {t.text}
            </p>
          ))}
          {call.partialAgentText && <p className="text-right text-muted-foreground">{call.partialAgentText}</p>}
        </div>
        {call.status === "ended" && (
          <p className="text-sm">
            {call.endReason === "persona_hung_up" ? `${start.persona.name} hung up.` : "Call ended."} Opening your scorecard…
          </p>
        )}
        {call.error && <p className="text-sm text-red-500">{call.error.message}</p>}
        <div className="flex gap-2">
          <button type="button" className="rounded-md border px-3 py-2" onClick={() => call.setMuted(!call.muted)}>
            {call.muted ? "Unmute" : "Mute"}
          </button>
          <button
            type="button"
            className="rounded-md bg-red-600 px-3 py-2 text-white"
            disabled={call.status === "ended" || call.status === "ending"}
            onClick={async () => {
              const { callId: id } = await call.end();
              router.push(`/calls/${id}` as Route);
            }}
          >
            End call
          </button>
        </div>
      </section>
    </div>
  );
}
