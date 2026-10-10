import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { z } from "zod";
import { authGuard } from "./core/auth-guard";
import { errorPlugin } from "./core/errors";
import { services } from "./core/services";
import { llmKeyStatus } from "./core/services/llm";
import { ENV } from "./env.server";
import { callRoutes } from "./modules/calls/routes";
import { knowledgeRoutes } from "./modules/knowledge/routes";
import { liveRoutes } from "./modules/live/routes";
import { merchantRoutes } from "./modules/merchants";
import { personaRoutes } from "./modules/personas/routes";
import { scenarioRoutes } from "./modules/scenarios";
import { simRoutes } from "./modules/sim/routes";
import { auth } from "./services";

/*
  Route map (contracts: packages/contracts/src, spec: docs/specs/01-contracts.md)
    /api/auth/*          Better Auth
    /api/me              signed-in agent
    /api/scenarios       Ashwath
    /api/personas        Ashwath (POST used by Tushar's persona extraction)
    /api/merchants       Ashwath (Tomato merchant profiles for the picker)
    /api/sim/*, /ws/sim  Ashwath
    /api/calls/*         Ashwath (list, transcript, scorecard, replay)
    /api/live/*, /ws/live, /internal/live/ingest   Tushar
    /api/knowledge/*     RAG: org docs + search (Ashwath)
    /files/*             local storage (recordings, audio)

  NEVER add a catch-all `GET /*` route: it swallows /api/auth/* (elysia#1515).
*/
// Bun closes a socket after 120s without traffic by default; a call easily idles that long.
// 960s is Bun's maximum. Clients also send a {type:"ping"} every 30s.
const app = new Elysia({ websocket: { idleTimeout: 960 } })
  .use(errorPlugin)
  .use(
    cors({
      origin: ENV.CORS_ORIGIN,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
      credentials: true,
    }),
  )
  .all("/api/auth/*", async ({ request, status }) => {
    if (["POST", "GET"].includes(request.method)) return auth.handler(request);
    return status(405);
  })
  .get("/", () => "OK")
  .get("/health", () => ({
    ok: true,
    stubEngines: ENV.STUB_ENGINES,
    llmProvider: ENV.LLM_PROVIDER,
    llmKeys: Object.fromEntries(
      Object.entries(llmKeyStatus()).map(([p, s]) => [p, { total: s.total, healthy: s.healthy }]),
    ),
    integrations: {
      merge: Boolean(ENV.MERGE_API_KEY),
      gemini: Boolean(ENV.GEMINI_API_KEY),
      elevenlabs: Boolean(ENV.ELEVENLABS_API_KEY),
      sarvam: Boolean(ENV.SARVAM_API_KEY),
      bridge: Boolean(ENV.BRIDGE_SECRET),
      rag: services.knowledge.enabled,
    },
  }))
  .use(authGuard)
  .get("/api/me", ({ agent }) => agent, { authed: true })
  .get(
    "/files/*",
    ({ params, status }) => {
      const path = services.storage.pathFor(params["*"]);
      return path ? Bun.file(path) : status(404);
    },
    { params: z.object({ "*": z.string() }) },
  )
  .use(scenarioRoutes)
  .use(personaRoutes)
  .use(merchantRoutes)
  .use(simRoutes)
  .use(callRoutes)
  .use(liveRoutes)
  .use(knowledgeRoutes)
  .listen(ENV.PORT, () => {
    console.log(`OnFloor API on http://localhost:${ENV.PORT}  (stub engines: ${ENV.STUB_ENGINES})`);
    void services.knowledge.warmup().catch((err) => console.error("[knowledge] warm-up failed:", (err as Error).message));
  });

export type App = typeof app;
