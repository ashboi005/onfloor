"use client";

/**
 * App shell. OWNER: Mansukh (placeholder; restyle freely).
 * Full-bleed on /simulator/<callId> and /live so Harnoor's screens get the viewport.
 */
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ModeToggle } from "@/components/mode-toggle";
import UserMenu from "@/components/user-menu";
import { USE_MOCKS } from "@/lib/config";

const NAV: { href: Route; label: string }[] = [
  { href: "/simulator", label: "Simulator" },
  { href: "/live", label: "Live" },
  { href: "/calls", label: "Calls" },
  { href: "/personas", label: "Personas" },
];

const isFullBleed = (path: string) => path === "/live" || /^\/simulator\/(?!new)[^/]+$/.test(path);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isFullBleed(pathname)) return <div className="h-svh overflow-hidden">{children}</div>;

  return (
    <div className="grid h-svh grid-cols-[220px_1fr]">
      <aside className="flex flex-col gap-1 border-r p-4">
        <Link href="/" className="mb-6 text-lg font-semibold">
          OnFloor
        </Link>
        {NAV.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`rounded-md px-3 py-2 text-sm ${pathname.startsWith(href) ? "bg-muted font-medium" : "hover:bg-muted/60"}`}
          >
            {label}
          </Link>
        ))}
        <div className="mt-auto flex items-center gap-2">
          {USE_MOCKS ? <span className="text-xs text-amber-500">MOCK DATA</span> : <UserMenu />}
          <ModeToggle />
        </div>
      </aside>
      <main className="overflow-y-auto">{children}</main>
    </div>
  );
}
