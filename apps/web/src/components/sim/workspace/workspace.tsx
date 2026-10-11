"use client";

import type { SimSessionStart, WorkspaceTab } from "@onfloor/contracts";
import { useState } from "react";

import type { SimCall } from "@/hooks/use-sim-call";
import { AdStudioTab } from "./ad-studio";
import { MaxGrowCalculator } from "./calculator";
import { GuidanceBar } from "./guide";
import { MerchantDashboardTab } from "./merchant-dashboard";
import { Nugget } from "./nugget";

const TABS: { id: WorkspaceTab; label: string }[] = [
  { id: "merchant_dashboard", label: "Merchant Dashboard" },
  { id: "ad_studio", label: "Ad Studio" },
];

/**
 * The agent's screen: Nugget on the left, the browser-style tabs (Merchant Dashboard, Ad Studio)
 * on the right, the Max Grow calculator under them. Reference implementation (Ashwath) on
 * useSimCall: Harnoor owns the look (docs/specs/04-harnoor-frontend.md, Screen 2).
 */
export function SimWorkspace({ start, call }: { start: SimSessionStart; call: SimCall }) {
  const [tab, setTab] = useState<WorkspaceTab | null>(null);
  const open = (t: WorkspaceTab) => {
    setTab(t);
    call.openTab(t);
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      {start.guidance && <GuidanceBar guidance={call.guidance} />}
      <div className="grid min-h-0 flex-1 md:grid-cols-[280px_1fr]">
        <aside className="min-h-0 border-b border-border md:border-b-0 md:border-r"><Nugget start={start} call={call} /></aside>
        <section className="flex min-h-0 flex-col">
          <div className="flex shrink-0 gap-1 border-b border-border bg-card px-2 pt-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                data-guide={`tab.${t.id}`}
                onClick={() => open(t.id)}
                className={`rounded-t-lg border border-b-0 px-4 py-2 text-xs transition-colors ${tab === t.id ? "border-border bg-card font-semibold text-info" : "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === null && <p className="p-6 text-sm text-muted-foreground">Open Merchant Dashboard to look the merchant up, or Ad Studio to set up the campaign.</p>}
            <div hidden={tab !== "merchant_dashboard"}><MerchantDashboardTab call={call} /></div>
            <div hidden={tab !== "ad_studio"}><AdStudioTab call={call} callDate={start.callDate} /></div>
            <div className="p-4 pt-0"><MaxGrowCalculator drr={start.ticket.drr} /></div>
          </div>
        </section>
      </div>
    </div>
  );
}
