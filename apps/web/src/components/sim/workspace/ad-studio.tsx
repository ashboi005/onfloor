"use client";

import { addMonths, CAMPAIGN_TYPE_LABELS, CAMPAIGN_TYPES, type CampaignType, spokenDate } from "@onfloor/contracts";
import { Button } from "@onfloor/ui/components/button";
import { Input } from "@onfloor/ui/components/input";
import { Rocket } from "lucide-react";
import { useState } from "react";

import type { SimCall } from "@/hooks/use-sim-call";

/** Ad Studio tab: UID, email, Max Grow, dates (min 1 month), launch. Ad Studio itself refuses bad input. */
export function AdStudioTab({ call, callDate }: { call: SimCall; callDate: string }) {
  const [uid, setUid] = useState("");
  const [email, setEmail] = useState("");
  const [type, setType] = useState<CampaignType | "">("");
  const [startDate, setStartDate] = useState(callDate);
  const [endDate, setEndDate] = useState(addMonths(callDate, 1));
  const c = call.campaign;
  const field = "mt-1 block w-full";
  return (
    <div className="space-y-4 p-4 text-sm">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (type) call.launchCampaign({ uid: uid.trim(), email: email.trim(), campaignType: type, startDate, endDate });
        }}
      >
        <label className="text-xs" data-guide="ad_studio.uid">Merchant UID<Input className={field} value={uid} onChange={(e) => setUid(e.target.value)} placeholder="8 digits" /></label>
        <label className="text-xs" data-guide="ad_studio.email">Email<Input className={field} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="merchant@example.in" /></label>
        <label className="text-xs sm:col-span-2" data-guide="ad_studio.campaign_type">
          Campaign
          <select className={`${field} h-9 border border-input bg-background px-2`} value={type} onChange={(e) => setType(e.target.value as CampaignType)}>
            <option value="">Select a campaign…</option>
            {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{CAMPAIGN_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2" data-guide="ad_studio.dates">
          <label className="text-xs">Start date<Input className={field} type="date" value={startDate} min={callDate} onChange={(e) => setStartDate(e.target.value)} /></label>
          <label className="text-xs">End date (min 1 month)<Input className={field} type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        </div>
        <div className="sm:col-span-2">
          <Button type="submit" data-guide="ad_studio.launch" disabled={!type}><Rocket className="size-3.5" /> Launch campaign</Button>
        </div>
      </form>
      {call.launchError && <p className="text-xs text-red-300">Ad Studio: {call.launchError}</p>}
      {c && (
        <div className="border border-emerald-400/30 bg-emerald-400/10 p-3 text-xs">
          <p className="font-semibold text-emerald-300">{CAMPAIGN_TYPE_LABELS[c.campaignType]} {c.status} for {c.restaurantName}</p>
          <p className="mt-1">UID {c.uid} · {c.email}</p>
          <p className="mt-1">Dictate: “Your campaign starts {c.startDate === callDate ? "today, " : ""}{spokenDate(c.startDate)}, and runs through {spokenDate(c.endDate)}.”</p>
        </div>
      )}
    </div>
  );
}
