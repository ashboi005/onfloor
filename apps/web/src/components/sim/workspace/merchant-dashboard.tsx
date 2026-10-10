"use client";

import { Button } from "@onfloor/ui/components/button";
import { Input } from "@onfloor/ui/components/input";
import { Search } from "lucide-react";
import { useState } from "react";

import type { SimCall } from "@/hooks/use-sim-call";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Merchant Dashboard tab: paste the UID from Nugget, confirm the details with the merchant. */
export function MerchantDashboardTab({ call }: { call: SimCall }) {
  const [uid, setUid] = useState("");
  const result = call.dashboard;
  const m = result?.merchant;
  return (
    <div className="space-y-4 p-4 text-sm">
      <form
        className="flex gap-2"
        data-guide="dashboard.search"
        onSubmit={(e) => {
          e.preventDefault();
          if (uid.trim()) call.lookup(uid.trim());
        }}
      >
        <Input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="Merchant UID (8 digits)" inputMode="numeric" />
        <Button type="submit" size="sm"><Search className="size-3.5" /> Search</Button>
      </form>
      {result && !m && <p className="text-xs text-red-300">No merchant found for UID {result.uid}.</p>}
      {m && (
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold">{m.restaurantName}</h3>
            <p className="text-xs text-muted-foreground">UID {m.uid} · {m.cuisines.join(", ")} · {m.outletType.replaceAll("_", " ")} · on Tomato since {m.onTomatoSince.slice(0, 4)}</p>
          </div>
          <dl data-guide="dashboard.contact" className="grid grid-cols-2 gap-x-4 gap-y-2 border border-border/70 p-3 text-xs">
            <div><dt className="text-muted-foreground">Owner</dt><dd>{m.ownerName}</dd></div>
            <div><dt className="text-muted-foreground">Phone</dt><dd className="font-mono">{m.phone}</dd></div>
            <div className="col-span-2"><dt className="text-muted-foreground">Email</dt><dd className="font-mono">{m.email}</dd></div>
            <div className="col-span-2"><dt className="text-muted-foreground">Address</dt><dd>{m.address}</dd></div>
          </dl>
          <dl className="grid grid-cols-3 gap-2 text-xs">
            <div><dt className="text-muted-foreground">DRR</dt><dd className="font-mono">{rupees(m.drr)}/day</dd></div>
            <div><dt className="text-muted-foreground">Orders/day</dt><dd className="font-mono">{m.ordersPerDay}</dd></div>
            <div><dt className="text-muted-foreground">Avg order</dt><dd className="font-mono">{rupees(m.avgOrderValue)}</dd></div>
            <div><dt className="text-muted-foreground">Rating</dt><dd>{m.rating} ({m.ratingCount.toLocaleString("en-IN")})</dd></div>
            <div><dt className="text-muted-foreground">Menu photos</dt><dd>{m.menu.itemsWithPhotos} of {m.menu.items} items</dd></div>
            <div><dt className="text-muted-foreground">Rejections (30d)</dt><dd>{m.orderRejectionPct}%</dd></div>
          </dl>
          <div className="text-xs">
            <p className="mb-1 text-muted-foreground">Top items</p>
            <ul className="space-y-1">{m.topItems.map((i) => <li key={i.name} className="flex justify-between"><span>{i.name} · {rupees(i.price)}</span><span className="font-mono">{rupees(i.dailySales)}/day</span></li>)}</ul>
          </div>
          <p className="text-[10px] text-muted-foreground">Payout {m.payoutCycle} · active campaigns: {m.activeCampaigns.length ? m.activeCampaigns.join(", ") : "none"}</p>
        </div>
      )}
    </div>
  );
}
