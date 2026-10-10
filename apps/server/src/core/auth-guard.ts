import type { Agent } from "@onfloor/contracts";
import { Elysia } from "elysia";
import { auth } from "../services";
import { AppError } from "./errors";

export async function agentFromHeaders(headers: Headers): Promise<Agent | null> {
  const session = await auth.api.getSession({ headers });
  if (!session) return null;
  const u = session.user as typeof session.user & { role?: string };
  return { id: u.id, name: u.name, email: u.email, role: u.role === "manager" ? "manager" : "agent" };
}

/**
 * `{ authed: true }` on a route resolves `agent` or answers 401.
 * WebSockets check the session themselves in `open` (see `requireAgentWs`).
 */
export const authGuard = new Elysia({ name: "auth-guard" }).macro({
  authed: {
    async resolve({ request }) {
      const agent = await agentFromHeaders(request.headers);
      if (!agent) throw new AppError("UNAUTHORIZED");
      return { agent };
    },
  },
});

/** For `.ws()` handlers: `ws.data.headers` is a plain record. */
export function requireAgentWs(headers: Record<string, string | undefined>): Promise<Agent | null> {
  const h = new Headers();
  for (const [k, v] of Object.entries(headers)) if (v) h.set(k, v);
  return agentFromHeaders(h);
}
