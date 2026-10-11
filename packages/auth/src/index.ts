import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@onfloor/db";
import * as schema from "@onfloor/db/schema/auth";
import { betterAuth } from "better-auth";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
  CORS_ORIGIN: string;
  /** Parent domain for the session cookie, e.g. "ashwathsoni.dev". Derived when unset. */
  AUTH_COOKIE_DOMAIN?: string;
};

/**
 * The web app checks the session on its own server, forwarding the cookies the browser sent to
 * the WEB domain. When the API and the web app live on different subdomains
 * (onfloor-api.example.dev / onfloor.example.dev), a host-only cookie set by the API never reaches
 * the web app, so every page bounces back to /login. Scope the cookie to the shared parent domain.
 * localhost (cookies ignore ports) and unrelated domains need nothing.
 */
/**
 * Shared-hosting suffixes (on the Public Suffix List): browsers reject a cookie scoped to them, and
 * two apps under one of them are different sites anyway. Use a custom domain (or the override).
 */
const SHARED_HOSTING = ["vercel.app", "netlify.app", "onrender.com", "herokuapp.com", "fly.dev", "railway.app", "up.railway.app", "pages.dev", "workers.dev", "github.io", "web.app", "firebaseapp.com", "appspot.com", "azurewebsites.net", "cloudfront.net", "amplifyapp.com", "koyeb.app", "deno.dev", "replit.app", "ngrok.app", "ngrok-free.app", "trycloudflare.com"];

export function sessionCookieDomain(apiUrl: string, webOrigin: string, override?: string): string | null {
  if (override?.trim()) return override.trim().replace(/^\./, "");
  try {
    const a = new URL(apiUrl).hostname.split(".");
    const b = new URL(webOrigin).hostname.split(".");
    if (a.length < 2 || b.length < 2 || a.join(".") === b.join(".")) return null;
    const common: string[] = [];
    while (a.length && b.length && a.at(-1) === b.at(-1)) {
      common.unshift(a.pop()!);
      b.pop();
    }
    // Needs at least a registrable domain (name + TLD); never a bare TLD or a shared-hosting suffix.
    const domain = common.join(".");
    return common.length >= 2 && !SHARED_HOSTING.includes(domain) ? domain : null;
  } catch {
    return null;
  }
}

export function createAuth(
  env: AuthConfig,
  database: Database,
  desktopOrigins: readonly string[] = [],
) {
  const cookieDomain = sessionCookieDomain(env.BETTER_AUTH_URL, env.CORS_ORIGIN, env.AUTH_COOKIE_DOMAIN);
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN, ...desktopOrigins],
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        // OnFloor: "agent" | "manager". Not settable at sign-up; seeded or changed in the DB.
        role: { type: "string", required: false, defaultValue: "agent", input: false },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    advanced: {
      ...(cookieDomain && { crossSubDomainCookies: { enabled: true, domain: cookieDomain } }),
      defaultCookieAttributes: {
        sameSite: "none",
        secure: true,
        httpOnly: true,
      },
    },
    plugins: [],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
