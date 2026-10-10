"use client";

import type { CustomerMemoryItem } from "@/hooks/use-live-call";
import { ChevronDown, History, Sparkles } from "lucide-react";
import { useState } from "react";

export function CustomerMemory({ customerLabel, items }: { customerLabel: string; items: CustomerMemoryItem[] }) {
  const [open, setOpen] = useState(true);
  const visible = items.slice(0, 3);
  return (
    <section className="border border-amber-300/20 bg-amber-300/[0.05] p-4">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3 text-left">
        <span className="flex items-center gap-2 text-xs font-semibold"><History className="size-3.5 text-amber-300" /> Last time with {customerLabel.split(" ")[0]}</span>
        <ChevronDown className={`size-4 text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (visible.length ? <div className="mt-3 space-y-2">{visible.map((item, index) => <div key={`${item.source}-${index}`} className="border-l-2 border-amber-300/40 pl-3"><p className="text-xs leading-relaxed text-foreground/85">{item.text}</p><p className="mt-1 text-[10px] text-muted-foreground">{item.at ? new Date(item.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "Previous call"} · {item.source.startsWith("call:") ? "call memory" : item.source}</p></div>)}</div> : <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Sparkles className="size-3.5" /> First call with this customer</div>)}
    </section>
  );
}
