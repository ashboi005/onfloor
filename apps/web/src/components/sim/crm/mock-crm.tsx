"use client";

import type { CrmFieldKey, CrmState, Persona } from "@onfloor/contracts";
import { CRM_FIELDS } from "@onfloor/contracts";
import { Button } from "@onfloor/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@onfloor/ui/components/card";
import { Input } from "@onfloor/ui/components/input";
import { Label } from "@onfloor/ui/components/label";
import { Textarea } from "@onfloor/ui/components/textarea";
import { BriefcaseBusiness, Check, FileText, LayoutDashboard, Receipt, Save, Sparkles } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { SimCall } from "@/hooks/use-sim-call";

type MockCrmProps = {
  persona: Persona;
  initialCrm: CrmState;
  call: SimCall;
};

const categoryLabels: Record<CrmState["adCategories"][number], string> = {
  dine_in: "Dine-in",
  delivery: "Delivery",
  catering: "Catering",
  offers: "Offers",
};

const planLabels: Record<CrmState["plan"], string> = {
  basic: "Basic",
  premium: "Premium",
  premium_plus: "Premium +",
};

const tabs = [
  { value: "overview", label: "Campaign overview", Icon: LayoutDashboard },
  { value: "leads", label: "Leads", Icon: FileText },
  { value: "invoices", label: "Invoices", Icon: Receipt },
] as const;

const crmFieldKeys = Object.keys(CRM_FIELDS) as CrmFieldKey[];

const statusLabels: Record<CrmState["campaignStatus"], string> = {
  active: "Active",
  paused: "Paused",
};

function sameValue(a: unknown, b: unknown) {
  return Array.isArray(a) && Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : Object.is(a, b);
}

function formatRupees(value: number) {
  return `₹${value.toLocaleString("en-IN")}`;
}

function fieldClass(pending: boolean) {
  return `rounded-none border p-4 transition ${pending ? "border-amber-400/70 bg-amber-400/[0.06] shadow-[0_0_24px_rgba(251,191,36,0.12)] animate-pulse" : "border-border/70 bg-background/20"}`;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{children}</div>;
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 text-left"
    >
      <span className="text-sm">{label}</span>
      <span className={`flex h-6 w-11 items-center rounded-full p-1 transition ${checked ? "bg-emerald-500" : "bg-muted"}`}>
        <span className={`size-4 rounded-full bg-white transition ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
  );
}

export function MockCrm({ persona, initialCrm, call }: MockCrmProps) {
  const searchParams = useSearchParams();
  const assist = searchParams.get("assist") === "1";
  const [crm, setCrm] = useState<CrmState>(initialCrm);
  const committedRef = useRef<CrmState>(initialCrm);
  const seenRequestsRef = useRef(new Set<string>());
  const [tab, setTab] = useState<"overview" | "leads" | "invoices">("overview");

  useEffect(() => {
    for (const request of call.pendingCrmRequests) {
      if (seenRequestsRef.current.has(request.id)) continue;
      seenRequestsRef.current.add(request.id);
      toast("Customer requested a change", {
        description: assist ? request.phrasing : "Listen for the request and update the CRM.",
      });
    }
  }, [assist, call.pendingCrmRequests]);

  function update<K extends keyof CrmState>(field: K, value: CrmState[K]) {
    setCrm((current) => ({ ...current, [field]: value }));
  }

  function commit<K extends CrmFieldKey>(field: K, value: CrmState[K]) {
    const from = committedRef.current[field];
    if (sameValue(from, value)) {
      update(field, value);
      return;
    }
    committedRef.current = { ...committedRef.current, [field]: value };
    update(field, value);
    call.reportCrmAction({ field, from, to: value });
  }

  function commitCurrent<K extends CrmFieldKey>(field: K) {
    commit(field, crm[field]);
  }

  function saveChanges() {
    let saved = 0;
    let nextCommitted = committedRef.current;

    for (const field of crmFieldKeys) {
      const from = committedRef.current[field];
      const to = crm[field];
      if (sameValue(from, to)) continue;
      nextCommitted = { ...nextCommitted, [field]: to };
      call.reportCrmAction({ field, from, to });
      saved += 1;
    }

    committedRef.current = nextCommitted;
    if (saved) {
      toast.success(`${saved} CRM change${saved === 1 ? "" : "s"} saved`, {
        description: "The customer can now see the updated account details.",
      });
    } else {
      toast("No unsaved CRM changes");
    }
  }

  const hasUnsavedChanges = crmFieldKeys.some((field) => !sameValue(committedRef.current[field], crm[field]));

  function toggleCategory(category: CrmState["adCategories"][number]) {
    const categories = crm.adCategories.includes(category)
      ? crm.adCategories.filter((item) => item !== category)
      : [...crm.adCategories, category];
    commit("adCategories", categories);
  }

  const pending = (field: CrmFieldKey) => call.pendingCrmRequests.some((request) => request.field === field);

  return (
    <Card className="h-full min-h-0 border-0 bg-transparent ring-0">
      <CardHeader className="border-b border-border/70 bg-card/90 px-5 py-4 backdrop-blur">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-none bg-primary/10 text-primary">
              <BriefcaseBusiness className="size-5" />
            </div>
            <div className="min-w-0">
              <CardDescription className="text-[10px] uppercase tracking-[0.18em]">Merchant Ads Portal</CardDescription>
              <CardTitle className="truncate text-base">{persona.business.type.replaceAll("_", " ")} · {persona.name}</CardTitle>
              <p className="truncate text-xs text-muted-foreground">{persona.business.city ?? "India"} · {persona.business.currentPlan ?? "Merchant account"}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary sm:inline-flex">
              {planLabels[crm.plan]}
            </span>
            <span className={`flex items-center gap-1 border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider ${crm.campaignStatus === "active" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-amber-400/30 bg-amber-400/10 text-amber-300"}`}>
              <span className={`size-1.5 rounded-full ${crm.campaignStatus === "active" ? "bg-emerald-400" : "bg-amber-400"}`} />
              {statusLabels[crm.campaignStatus]}
            </span>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-1 border-t border-border/50 pt-3">
          {tabs.map(({ value, label, Icon: TabIcon }) => {
            return (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value as typeof tab)}
                className={`flex items-center gap-2 px-3 py-2 text-xs transition ${tab === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
              >
                <TabIcon className="size-3.5" />
                {label}
              </button>
            );
          })}
          {assist && (
            <span className="ml-auto flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-amber-300">
              <Sparkles className="size-3" /> Assist on
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="min-h-0 flex-1 overflow-y-auto p-5">
        {tab === "leads" && <FakeTab title="Leads" text="Lead activity will appear here after your next campaign launch." />}
        {tab === "invoices" && <FakeTab title="Invoices" text="No outstanding invoices. Your next statement closes on 31 October." />}
        {tab === "overview" && (
          <div className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <div className={fieldClass(pending("monthlyBudget"))}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <SectionLabel>{CRM_FIELDS.monthlyBudget.label}</SectionLabel>
                    <p className="text-xl font-semibold tracking-tight">{formatRupees(crm.monthlyBudget)}</p>
                  </div>
                  <Input
                    aria-label="Monthly budget amount"
                    type="number"
                    min={CRM_FIELDS.monthlyBudget.min}
                    max={CRM_FIELDS.monthlyBudget.max}
                    step={CRM_FIELDS.monthlyBudget.step}
                    value={crm.monthlyBudget}
                    onChange={(event) => update("monthlyBudget", Number(event.target.value))}
                    onBlur={() => commitCurrent("monthlyBudget")}
                    className="w-32 text-right"
                  />
                </div>
                <input
                  aria-label="Monthly budget slider"
                  type="range"
                  min={CRM_FIELDS.monthlyBudget.min}
                  max={CRM_FIELDS.monthlyBudget.max}
                  step={CRM_FIELDS.monthlyBudget.step}
                  value={crm.monthlyBudget}
                  onChange={(event) => update("monthlyBudget", Number(event.target.value))}
                  onPointerUp={() => commitCurrent("monthlyBudget")}
                  onKeyUp={() => commitCurrent("monthlyBudget")}
                  className="mt-4 w-full accent-primary"
                />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>₹5k</span><span>₹5L</span>
                </div>
              </div>

              <div className={fieldClass(pending("campaignStatus"))}>
                <SectionLabel>{CRM_FIELDS.campaignStatus.label}</SectionLabel>
                <Toggle checked={crm.campaignStatus === "active"} onChange={(checked) => commit("campaignStatus", checked ? "active" : "paused")} label={crm.campaignStatus === "active" ? "Campaign is running" : "Campaign is paused"} />
                <p className="mt-3 text-xs text-muted-foreground">Changes apply to all active locations.</p>
              </div>
            </div>

            <div className={fieldClass(pending("plan"))}>
              <SectionLabel>{CRM_FIELDS.plan.label}</SectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(planLabels) as CrmState["plan"][]).map((plan) => (
                  <button
                    key={plan}
                    type="button"
                    onClick={() => commit("plan", plan)}
                    className={`border px-3 py-3 text-left transition ${crm.plan === plan ? "border-primary bg-primary/10 text-primary" : "border-border/70 hover:border-primary/50"}`}
                  >
                    <span className="block text-xs font-semibold">{planLabels[plan]}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">{plan === "basic" ? "Essential reach" : plan === "premium" ? "Priority reach" : "Maximise every outlet"}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className={fieldClass(pending("discountPct"))}>
                <div className="flex items-center justify-between gap-3">
                  <SectionLabel>{CRM_FIELDS.discountPct.label}</SectionLabel>
                  <span className="text-lg font-semibold">{crm.discountPct}%</span>
                </div>
                {crm.discountPct > 10 && <p className="mb-2 text-[11px] text-amber-300">Manager approval needed above 10% · you can still continue</p>}
                <input
                  aria-label="Discount percentage"
                  type="range"
                  min={CRM_FIELDS.discountPct.min}
                  max={CRM_FIELDS.discountPct.max}
                  step={CRM_FIELDS.discountPct.step}
                  value={crm.discountPct}
                  onChange={(event) => update("discountPct", Number(event.target.value))}
                  onPointerUp={() => commitCurrent("discountPct")}
                  onKeyUp={() => commitCurrent("discountPct")}
                  className="w-full accent-primary"
                />
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0%</span><span>10% policy line</span><span>30%</span></div>
              </div>

              <div className={fieldClass(pending("weekendNotifications"))}>
                <SectionLabel>{CRM_FIELDS.weekendNotifications.label}</SectionLabel>
                <Toggle checked={crm.weekendNotifications} onChange={(checked) => commit("weekendNotifications", checked)} label={crm.weekendNotifications ? "Notifications are on" : "Notifications are off"} />
                <p className="mt-3 text-xs text-muted-foreground">Weekend delivery alerts go to your store team.</p>
              </div>
            </div>

            <div className={fieldClass(pending("targetRadiusKm"))}>
              <div className="flex items-center justify-between gap-3">
                <SectionLabel>{CRM_FIELDS.targetRadiusKm.label}</SectionLabel>
                <span className="text-lg font-semibold">{crm.targetRadiusKm} km</span>
              </div>
              <input
                aria-label="Target radius"
                type="range"
                min={CRM_FIELDS.targetRadiusKm.min}
                max={CRM_FIELDS.targetRadiusKm.max}
                step={CRM_FIELDS.targetRadiusKm.step}
                value={crm.targetRadiusKm}
                onChange={(event) => update("targetRadiusKm", Number(event.target.value))}
                onPointerUp={() => commitCurrent("targetRadiusKm")}
                onKeyUp={() => commitCurrent("targetRadiusKm")}
                className="w-full accent-primary"
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>1 km</span><span>25 km</span></div>
            </div>

            <div className={fieldClass(pending("adCategories"))}>
              <SectionLabel>{CRM_FIELDS.adCategories.label}</SectionLabel>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(categoryLabels) as CrmState["adCategories"][number][]).map((category) => {
                  const selected = crm.adCategories.includes(category);
                  return (
                    <button
                      key={category}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => toggleCategory(category)}
                      className={`flex items-center gap-2 border px-3 py-2 text-xs transition ${selected ? "border-primary bg-primary/10 text-primary" : "border-border/70 text-muted-foreground hover:border-primary/50"}`}
                    >
                      {selected && <Check className="size-3" />}
                      {categoryLabels[category]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={fieldClass(pending("notes"))}>
              <Label htmlFor="crm-notes" className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{CRM_FIELDS.notes.label}</Label>
              <Textarea
                id="crm-notes"
                value={crm.notes}
                placeholder="Add a note for the next shift…"
                onChange={(event) => update("notes", event.target.value)}
                onBlur={() => commitCurrent("notes")}
              />
              <p className="mt-2 text-[10px] text-muted-foreground">Autosaves when you leave the field.</p>
            </div>
          </div>
        )}
      </CardContent>
       <div className="flex items-center justify-between gap-3 border-t border-border/70 bg-card/80 px-5 py-3 text-[10px] text-muted-foreground">
         <span>{call.pendingCrmRequests.length ? `${call.pendingCrmRequests.length} customer request${call.pendingCrmRequests.length === 1 ? "" : "s"} to action` : "Changes are tracked for your scorecard"}</span>
         <div className="flex items-center gap-2">
           <Button type="button" variant="ghost" size="xs" onClick={() => toast("CRM is ready", { description: "Keep listening for the next customer request." })}>Audit trail</Button>
           <Button type="button" size="xs" onClick={saveChanges} disabled={!hasUnsavedChanges}>
             <Save className="size-3" /> Save changes
           </Button>
         </div>
       </div>
    </Card>
  );
}

function FakeTab({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center border border-dashed border-border/70 text-center">
      <div className="mb-4 flex size-12 items-center justify-center bg-muted text-muted-foreground"><FileText className="size-5" /></div>
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 max-w-sm text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
