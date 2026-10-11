"use client";

import {
  addDays,
  DISPOSITION_LABELS,
  DISPOSITION_TEMPLATE,
  DISPOSITIONS,
  type Disposition,
  EMAIL_TEMPLATE_IDS,
  EMAIL_TEMPLATES,
  type EmailTemplateId,
  type SimSessionStart,
} from "@onfloor/contracts";
import { Button } from "@onfloor/ui/components/button";
import { Input } from "@onfloor/ui/components/input";
import { Copy, Mail, PhoneCall, PhoneIncoming, Sparkles, Timer } from "lucide-react";
import { useEffect, useState } from "react";

import type { SimCall } from "@/hooks/use-sim-call";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Nugget: the ticket while dialling/ringing/on the call, the disposition panel after hang-up. */
export function Nugget({ start, call }: { start: SimSessionStart; call: SimCall }) {
  const t = start.ticket;
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4 text-sm">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-info">Nugget</p>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{call.phase.replace("_", "-")}</span>
      </div>

      <div data-guide="nugget.ticket" className="space-y-3 rounded-xl border border-border bg-card p-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold">{t.restaurantName}</p>
            <p className="text-xs text-muted-foreground">Merchant: {t.merchantName}</p>
          </div>
          <span className="text-right text-xs"><span className="block text-[10px] text-muted-foreground">DRR</span><strong className="font-mono">{rupees(t.drr)}</strong></span>
        </div>
        <button
          type="button"
          data-guide="nugget.uid"
          className="flex w-full items-center justify-between rounded-lg border border-dashed border-border bg-background px-2 py-2 font-mono text-xs transition-colors hover:border-primary hover:bg-accent"
          onClick={() => {
            void navigator.clipboard?.writeText(t.uid);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <span>UID {t.uid}</span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><Copy className="size-3" /> {copied ? "Copied" : "Copy"}</span>
        </button>
        <div className="text-xs">
          <p className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Top-selling items</p>
          <ul className="space-y-0.5">{t.topItems.map((i) => <li key={i.name} className="flex justify-between"><span>{i.name}</span><span className="font-mono text-muted-foreground">{rupees(i.dailySales)}/day</span></li>)}</ul>
        </div>
      </div>

      {call.phase === "dialing" && <p className="flex items-center gap-2 text-xs text-muted-foreground"><PhoneCall className="size-3.5 animate-pulse" /> Auto-dialling the merchant…</p>}
      {call.phase === "ringing" && <p className="flex items-center gap-2 text-xs font-semibold text-success"><PhoneIncoming className="size-3.5 animate-pulse" /> Merchant picked up · connecting…</p>}
      {call.requests.length > 0 && call.phase !== "dialing" && (
        <div className="space-y-1 text-xs">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Customer asked</p>
          {call.requests.map((r) => <p key={r.id} className="border-l-2 border-warning pl-2">{r.kind.replace("_", " ")}: <span className="font-mono">{r.value}</span></p>)}
        </div>
      )}
      {(call.phase === "wrap_up" || call.phase === "done") && <Disposition start={start} call={call} />}
    </div>
  );
}

function Disposition({ start, call }: { start: SimSessionStart; call: SimCall }) {
  const [template, setTemplate] = useState<EmailTemplateId | "">("");
  const [outcome, setOutcome] = useState<Disposition | "">("");
  const [date, setDate] = useState(addDays(start.callDate, 1));
  const [time, setTime] = useState("11:00");
  const s = call.suggestion;
  // Pre-fill the callback slot from the suggestion (the agent still chooses).
  useEffect(() => {
    if (s?.callback) {
      setDate(s.callback.date);
      setTime(s.callback.time);
    }
  }, [s]);
  const secs = Math.ceil((call.dispositionRemainingMs ?? 0) / 1000);
  const callback = outcome === "callback" || template === "callback" ? { date, time } : null;
  const done = call.phase === "done";
  return (
    <div className="space-y-3 border border-primary bg-card p-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold">Disposition</p>
        <span className={`flex items-center gap-1 font-mono text-xs ${secs <= 20 ? "text-destructive" : "text-muted-foreground"}`}><Timer className="size-3.5" /> {done ? "done" : `${secs}s`}</span>
      </div>
      {s && !done && (
        <div className="flex items-start gap-2 border border-warning bg-card p-2 text-xs">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <div>
            <p><strong>Suggested: {DISPOSITION_LABELS[s.outcome]}</strong> · {EMAIL_TEMPLATES[s.template].label} email{s.callback ? ` · ${s.callback.date} ${s.callback.time}` : ""}</p>
            <p className="mt-1 text-muted-foreground">{s.reason}</p>
          </div>
        </div>
      )}
      <label className="block text-xs" data-guide="disposition.email">
        Email template
        <select className="mt-1 h-9 w-full border border-input bg-background px-2" value={template} disabled={done} onChange={(e) => setTemplate(e.target.value as EmailTemplateId)}>
          <option value="">Select…</option>
          {EMAIL_TEMPLATE_IDS.map((id) => <option key={id} value={id}>{EMAIL_TEMPLATES[id].label}</option>)}
        </select>
      </label>
      <label className="block text-xs" data-guide="disposition.outcome">
        Outcome
        <select
          className="mt-1 h-9 w-full border border-input bg-background px-2"
          value={outcome}
          disabled={done}
          onChange={(e) => {
            const o = e.target.value as Disposition;
            setOutcome(o);
            if (!template && o) setTemplate(DISPOSITION_TEMPLATE[o]);
          }}
        >
          <option value="">Select…</option>
          {DISPOSITIONS.map((d) => <option key={d} value={d}>{DISPOSITION_LABELS[d]}</option>)}
        </select>
      </label>
      {callback && (
        <div className="grid grid-cols-2 gap-2" data-guide="disposition.callback">
          <label className="text-xs">Callback date<Input type="date" value={date} min={start.callDate} disabled={done} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="text-xs">Time<Input type="time" value={time} disabled={done} onChange={(e) => setTime(e.target.value)} /></label>
        </div>
      )}
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!template || done} onClick={() => template && call.sendEmail(template, callback)}><Mail className="size-3.5" /> Send email</Button>
        <Button type="button" size="sm" data-guide="disposition.submit" disabled={!outcome || done} onClick={() => outcome && call.dispose({ outcome, callback: outcome === "callback" ? callback : null })}>Dispose</Button>
      </div>
      {call.email && <details className="text-xs"><summary className="cursor-pointer text-success">Sent to {call.email.to}: {call.email.subject}</summary><pre className="mt-2 whitespace-pre-wrap font-sans text-muted-foreground">{call.email.body}</pre></details>}
      {call.wrapUpError && <p className="text-xs text-destructive">{call.wrapUpError}</p>}
      {done && <p className="text-xs text-success">Disposed. Opening your scorecard…</p>}
    </div>
  );
}
