import { type Scenario, scenarioSchema } from "@onfloor/contracts";
import { scenarios } from "@onfloor/db/schema";
import { asc, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { authGuard } from "../../core/auth-guard";
import { AppError } from "../../core/errors";
import { db } from "../../services";

const toScenario = (r: typeof scenarios.$inferSelect): Scenario => ({ ...r.body, id: r.id });

export async function getScenario(id: string): Promise<Scenario> {
  const [row] = await db.select().from(scenarios).where(eq(scenarios.id, id));
  if (!row) throw new AppError("NOT_FOUND", { message: "No such scenario." });
  return toScenario(row);
}

export async function listScenarios(): Promise<Scenario[]> {
  // Rows written under an older scenario shape are skipped, not served.
  return (await db.select().from(scenarios).orderBy(asc(scenarios.createdAt)))
    .map(toScenario)
    .filter((s) => scenarioSchema.safeParse(s).success);
}

export async function upsertScenario({ id, ...body }: Scenario) {
  await db.insert(scenarios).values({ id, body }).onConflictDoUpdate({ target: scenarios.id, set: { body } });
}

export const scenarioRoutes = new Elysia({ prefix: "/api/scenarios" })
  .use(authGuard)
  .get("/", () => listScenarios(), { authed: true })
  .get("/:id", ({ params }) => getScenario(params.id), { authed: true, params: z.object({ id: z.string() }) });
