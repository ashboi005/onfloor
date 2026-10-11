"use client";

/**
 * App shell. OWNER: Mansukh (placeholder; restyle freely).
 * Full-bleed on /simulator/<callId> and /live so Harnoor's screens get the viewport.
 */
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Activity, Phone, Users } from "lucide-react";

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
    <div className="grid h-svh grid-cols-[72px_minmax(0,1fr)] bg-background text-foreground md:grid-cols-[224px_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
        <div className="flex h-20 items-center justify-center border-b border-sidebar-border px-3 md:justify-start md:px-5">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight hover:opacity-80 transition-opacity">
            <img src="/icon.png" alt="OnFloor Logo" className="h-10 w-10 rounded-xl border border-border bg-white p-1 object-contain" />
            <span className="hidden text-xl md:inline">OnFloor</span>
          </Link>
        </div>
        
        <nav className="flex-1 space-y-2 p-3 md:p-4">
          <div className="mb-5 hidden px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground md:block">
            Menu
          </div>
          {NAV.map(({ href, label, icon }) => {
            const isActive = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={isActive ? "page" : undefined}
                title={label}
                className={`flex items-center justify-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors md:justify-start ${
                  isActive
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm shadow-primary/20"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                {icon}
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t border-sidebar-border bg-card p-3 md:p-4">
          <div className="flex flex-col items-center justify-between gap-3 md:flex-row">
            <div className="min-w-0 max-w-full truncate md:flex-1">
              {USE_MOCKS ? (
                <div aria-label="Mock data" className="flex items-center justify-center gap-2 rounded-lg border border-primary bg-card px-3 py-2 text-[10px] font-semibold tracking-wide text-info md:justify-start">
                  <div className="h-1.5 w-1.5 rounded-sm bg-primary" />
                  <span className="hidden md:inline">MOCK DATA</span>
                </div>
              ) : (
                <UserMenu />
              )}
            </div>
            <ModeToggle />
          </div>
        </div>
      </aside>
      <main className="relative flex min-w-0 flex-col overflow-hidden">
        <header className="workspace-header pixel-accent sticky top-0 z-10 flex h-20 shrink-0 items-center justify-between border-b bg-card px-5 md:px-8">
          <h1 className="text-lg font-semibold tracking-tight">
            {NAV.find(n => pathname.startsWith(n.href))?.label || "Dashboard"}
          </h1>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  );
}
