"use client";

import { MAX_GROW, maxGrowBill } from "@onfloor/contracts";
import { useState } from "react";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/** Max Grow billing, live: drag the expected daily sales and read the commission off. */
export function MaxGrowCalculator({ drr }: { drr: number }) {
  const [sales, setSales] = useState(Math.round((drr * 1.25) / 100) * 100);
  const bill = maxGrowBill({ drr, avgDailySales: sales });
  return (
    <div data-guide="calculator" className="space-y-3 border border-border/70 bg-card/60 p-4 text-sm">
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Max Grow calculator</p>
        <p className="text-[10px] text-muted-foreground">{MAX_GROW.commissionPct}% on incremental only</p>
      </div>
      <label className="block text-xs">
        Average daily sales with Max Grow: <strong>{rupees(sales)}</strong>
        <input
          type="range"
          className="mt-2 w-full"
          min={Math.round(drr * 0.7)}
          max={Math.round(drr * 2)}
          step={100}
          value={sales}
          onChange={(e) => setSales(Number(e.target.value))}
        />
      </label>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-muted-foreground">Baseline (DRR)</dt><dd className="font-mono">{rupees(drr)}/day</dd></div>
        <div><dt className="text-muted-foreground">Incremental</dt><dd className="font-mono">{rupees(bill.incrementalPerDay)}/day</dd></div>
        <div><dt className="text-muted-foreground">Commission (20%)</dt><dd className="font-mono">{rupees(bill.commissionPerDay)}/day · {rupees(bill.commissionForPeriod)}/week</dd></div>
        <div><dt className="text-muted-foreground">Merchant keeps</dt><dd className="font-mono">{rupees(bill.merchantGainPerDay)}/day extra</dd></div>
      </dl>
      <p className={`text-xs ${bill.noDeduction ? "text-emerald-300" : "text-muted-foreground"}`}>
        {bill.noDeduction
          ? `At or below ${rupees(drr)}/day: zero deduction.`
          : `Say it: "20% only on the extra ${rupees(bill.incrementalPerDay)} a day, so ${rupees(bill.commissionPerDay)}. Nothing if sales stay at ${rupees(drr)}."`}{" "}
        Billed weekly from the payout · stop anytime.
      </p>
    </div>
  );
}
