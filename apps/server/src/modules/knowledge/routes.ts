import { createKnowledgeDocSchema, KNOWLEDGE_SCOPES } from "@onfloor/contracts";
import { Elysia } from "elysia";
import { z } from "zod";
import { authGuard } from "../../core/auth-guard";
import { AppError } from "../../core/errors";
import { services } from "../../core/services";
import { ENV } from "../../env.server";
import { ingestOrgDocs } from ".";

const managerOnly = (role: string) => {
  if (role !== "manager") throw new AppError("FORBIDDEN", { message: "Managers only." });
};
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "doc";

/**
 * /api/knowledge: manage org docs and search any scope.
 *   GET    /status                     { enabled, collection, sources }
 *   GET    /docs                       org_docs sources
 *   POST   /docs                       (manager) upload/replace a markdown or text doc
 *   DELETE /docs/:source               (manager)
 *   POST   /docs/playbook/reindex      (manager) re-ingest the bundled company docs (apps/server/knowledge/*.md)
 *   GET    /search?q=&scope=&key=      snippets; agent scope is always your own unless manager
 */
export const knowledgeRoutes = new Elysia({ prefix: "/api/knowledge" })
  .use(authGuard)
  .get(
    "/status",
    async () => ({
      enabled: services.knowledge.enabled,
      collection: ENV.KNOWLEDGE_COLLECTION,
      sources: (await services.knowledge.sources()).length,
    }),
    { authed: true },
  )
  .get("/docs", () => services.knowledge.sources("org_docs"), { authed: true })
  .post(
    "/docs",
    async ({ agent, body }) => {
      managerOnly(agent.role);
      if (!services.knowledge.enabled) throw new AppError("NOT_IMPLEMENTED", { message: "RAG is off (VECTOR_DATABASE_URL unset)." });
      const source = body.source ?? slug(body.title);
      const { chunks } = await services.knowledge.ingest({
        scope: { kind: "org_docs" },
        source,
        title: body.title,
        text: body.text,
        format: body.format,
      });
      return { source, chunks };
    },
    { authed: true, body: createKnowledgeDocSchema },
  )
  .delete(
    "/docs/:source",
    async ({ agent, params }) => {
      managerOnly(agent.role);
      await services.knowledge.remove({ kind: "org_docs" }, params.source);
      return { removed: params.source };
    },
    { authed: true, params: z.object({ source: z.string() }) },
  )
  .post(
    "/docs/playbook/reindex",
    async ({ agent }) => {
      managerOnly(agent.role);
      return ingestOrgDocs();
    },
    { authed: true },
  )
  .get(
    "/search",
    ({ agent, query }) => {
      const k = query.k ?? 5;
      switch (query.scope) {
        case "org_docs":
        case "golden":
          return services.knowledge.retrieve(query.q, { kind: query.scope }, k);
        case "agent":
          return services.knowledge.retrieve(
            query.q,
            { kind: "agent", agentId: agent.role === "manager" && query.key ? query.key : agent.id },
            k,
          );
        case "customer":
          if (!query.key) throw new AppError("BAD_REQUEST", { message: "customer scope needs ?key=<customerKey>" });
          return services.knowledge.retrieve(query.q, { kind: "customer", customerKey: query.key }, k);
      }
    },
    {
      authed: true,
      query: z.object({
        q: z.string().min(1),
        scope: z.enum(KNOWLEDGE_SCOPES).default("org_docs"),
        key: z.string().optional(),
        k: z.coerce.number().int().min(1).max(20).optional(),
      }),
    },
  );
