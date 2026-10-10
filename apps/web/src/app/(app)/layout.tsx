import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/shell/app-shell";
import { authClient } from "@/lib/auth-client";
import { USE_MOCKS } from "@/lib/config";

/** Every app route requires a signed-in agent, except in mock mode. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!USE_MOCKS) {
    const session = await authClient.getSession({ fetchOptions: { headers: await headers() } });
    if (!session.data?.user) redirect("/login");
  }
  return <AppShell>{children}</AppShell>;
}
