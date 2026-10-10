import { CRM_FIELDS, type CreatePersona, type CrmRequest, createPersonaSchema, type Persona, type PersonaSource } from "@onfloor/contracts";
import { personas } from "@onfloor/db/schema";
import { desc, eq } from "drizzle-orm";
import { AppError } from "../../core/errors";
import { db } from "../../services";

/**
 * Persona repository: the Pillar 1 ⇄ Pillar 2 seam.
 * Tushar's persona extraction calls `createPersona` with `source: "live_call"`.
 * The simulator plays whatever `getPersona` returns.
 */

type Row = typeof personas.$inferSelect;
const toPersona = (r: Row): Persona => {
  // Older databases used values such as "fixture" for seeded personas. Keep the
  // API compatible with those rows while the next seed run repairs the columns.
  const source = r.source === "live_call" || r.body.source === "live_call" ? "live_call" : "seed";
  return { ...r.body, id: r.id, source, createdAt: r.createdAt.toISOString() };
};

/**
 * Coerce request values onto the CRM's actual field types (LLM extraction says
 * "Premium" for the `premium` enum, "50,000" for a number…). Unusable requests are dropped,
 * since a request the agent can't possibly satisfy would only corrupt the CRM audit.
 */
export function normalizeCrmRequests(requests: CrmRequest[]): CrmRequest[] {
  const out: CrmRequest[] = [];
  for (const r of requests) {
    const def = CRM_FIELDS[r.field];
    let value: unknown = r.value;
    if (def.type === "number") {
      const n = typeof value === "number" ? value : Number(String(value).replace(/[^\d.-]/g, ""));
      if (!Number.isFinite(n)) continue;
      value = Math.min(def.max, Math.max(def.min, Math.round(n)));
    } else if (def.type === "boolean") {
      if (typeof value !== "boolean") value = /^(true|on|yes|enabled?)$/i.test(String(value).trim());
    } else if (def.type === "enum") {
      const match = def.values.find((v) => v === String(value).trim().toLowerCase().replace(/[\s-]+/g, "_"));
      if (!match) continue;
      value = match;
    } else if (def.type === "multi") {
      const vals = (Array.isArray(value) ? value : [value]).map((v) => String(v).trim().toLowerCase().replace(/[\s-]+/g, "_"));
      value = def.values.filter((v) => vals.includes(v));
      if (!(value as string[]).length) continue;
    } else {
      value = String(value);
    }
    out.push({ ...r, value });
  }
  return out;
}

export async function createPersona(input: CreatePersona, id?: string): Promise<Persona> {
  const parsed = createPersonaSchema.parse(input);
  const body = { ...parsed, crmRequests: normalizeCrmRequests(parsed.crmRequests) };
  const [row] = await db
    .insert(personas)
    .values({
      ...(id && { id }),
      name: body.name,
      archetype: body.archetype,
      language: body.language,
      source: body.source,
      sourceCallId: body.sourceCallId,
      body,
    })
    .onConflictDoUpdate({
      target: personas.id,
      set: {
        name: body.name,
        archetype: body.archetype,
        language: body.language,
        source: body.source,
        sourceCallId: body.sourceCallId,
        body,
      },
    })
    .returning();
  return toPersona(row!);
}

export async function getPersona(id: string): Promise<Persona> {
  const [row] = await db.select().from(personas).where(eq(personas.id, id));
  if (!row) throw new AppError("NOT_FOUND", { message: "No such persona." });
  return toPersona(row);
}

export async function listPersonas(source?: PersonaSource): Promise<Persona[]> {
  const rows = await db
    .select()
    .from(personas)
    .where(source ? eq(personas.source, source) : undefined)
    .orderBy(desc(personas.createdAt));
  return rows.map(toPersona);
}
