import { createPersonaSchema, PERSONA_SOURCES } from "@onfloor/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { authGuard } from "../../core/auth-guard";
import { createPersona, getPersona, listPersonas } from ".";

export const personaRoutes = new Elysia({ prefix: "/api/personas" })
  .use(authGuard)
  .get("/", ({ query }) => listPersonas(query.source), {
    authed: true,
    query: z.object({ source: z.enum(PERSONA_SOURCES).optional() }),
  })
  .get("/:id", ({ params }) => getPersona(params.id), { authed: true, params: z.object({ id: z.string() }) })
  /** "Save as custom persona" from the picker. Always stored as source "custom", never seed/live_call. */
  .post("/", ({ body }) => createPersona({ ...body, source: "custom", sourceCallId: null }), {
    authed: true,
    body: createPersonaSchema,
  });
