import { type CreatePersona, type CrmRequest, createPersonaSchema, type Persona, personaSchema, type PersonaSource } from "@onfloor/contracts";
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
const toPersona = (r: Row): Persona => ({ ...r.body, id: r.id, createdAt: r.createdAt.toISOString() });

/**
 * Coerce request values onto the formats the tools audit expects (LLM extraction says
 * "two months" for duration "2", "tomorrow 4pm" for a callback…). Unusable requests are dropped,
 * since a request the agent can't possibly satisfy would only corrupt the audit.
 */
export function normalizeCrmRequests(requests: CrmRequest[]): CrmRequest[] {
  const out: CrmRequest[] = [];
  for (const r of requests) {
    const v = String(r.value ?? "").trim();
    let value: string | null = null;
    if (r.kind === "email_update") {
      value = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v.toLowerCase() : null;
    } else if (r.kind === "start_date") {
      value = /^\+\d{1,2}$|^\d{4}-\d{2}-\d{2}$/.test(v) ? v : /^\d{1,2}$/.test(v) ? `+${v}` : null;
    } else if (r.kind === "duration") {
      const n = Number.parseInt(v, 10);
      value = Number.isFinite(n) && n >= 1 && n <= 12 ? String(n) : null;
    } else if (r.kind === "callback") {
      const m = v.match(/^(\+\d{1,2}|\d{4}-\d{2}-\d{2})\s+([01]?\d|2[0-3]):([0-5]\d)$/);
      value = m ? `${m[1]} ${m[2]!.padStart(2, "0")}:${m[3]}` : null;
    }
    if (value !== null) out.push({ ...r, value });
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
      set: { name: body.name, archetype: body.archetype, language: body.language, body },
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
  // Rows written under an older persona shape (e.g. the pre-Tomato CRM requests) are skipped.
  return rows.map(toPersona).filter((p) => personaSchema.safeParse(p).success);
}
