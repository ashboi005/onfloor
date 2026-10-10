/** Client-side runtime config. NEXT_PUBLIC_* are inlined at build time. */
export const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === "true";

export const SERVER_URL = (process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** ws(s):// form of the API origin, for /ws/sim and /ws/live. */
export const WS_URL = SERVER_URL.replace(/^http/, "ws");
