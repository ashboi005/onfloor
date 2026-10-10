"use client";

/**
 * App shell. OWNER: Mansukh (placeholder; restyle freely).
 * Full-bleed on /simulator/<callId> and /live so Harnoor's screens get the viewport.
 */
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Activity, Phone, Users, PhoneCall } from "lucide-react";

import { ModeToggle } from "@/components/mode-toggle";
import UserMenu from "@/components/user-menu";
import { USE_MOCKS } from "@/lib/config";

const NAV: { href: Route; label: string; icon: React.ReactNode }[] = [
  { href: "/simulator", label: "Simulator", icon: <Bot className="h-4 w-4" /> },
  { href: "/live", label: "Live", icon: <Activity className="h-4 w-4" /> },
  { href: "/calls", label: "Calls", icon: <Phone className="h-4 w-4" /> },
  { href: "/personas", label: "Personas", icon: <Users className="h-4 w-4" /> },
];

const isFullBleed = (path: string) => path === "/live" || /^\/simulator\/(?!new)[^/]+$/.test(path);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isFullBleed(pathname)) return <div className="h-svh overflow-hidden">{children}</div>;

  return (
    <div className="grid h-svh grid-cols-[260px_1fr] bg-background text-foreground">
      <aside className="flex flex-col border-r bg-muted/10 shadow-sm">
        <div className="flex h-16 items-center border-b px-6">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight hover:opacity-80 transition-opacity">
            <img src="/icon.png" alt="OnFloor Logo" className="h-8 w-8 object-contain drop-shadow-sm" />
            <span className="text-xl">OnFloor</span>
          </Link>
        </div>
        
        <nav className="flex-1 space-y-1 p-4">
          <div className="mb-4 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Menu
          </div>
          {NAV.map(({ href, label, icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {icon}
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t bg-muted/30 p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 truncate">
              {USE_MOCKS ? (
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-amber-500/20 bg-amber-500/10 text-xs font-medium text-amber-500">
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  MOCK DATA
                </div>
              ) : (
                <UserMenu />
              )}
            </div>
            <ModeToggle />
          </div>
        </div>
      </aside>
      <main className="flex flex-col overflow-hidden relative">
        <header className="flex h-16 items-center justify-between border-b px-8 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
          <h1 className="text-xl font-semibold tracking-tight">
            {NAV.find(n => pathname.startsWith(n.href))?.label || "Dashboard"}
          </h1>
        </header>
        <div className="flex-1 overflow-y-auto p-8">{children}</div>
      </main>
    </div>
  );
}
