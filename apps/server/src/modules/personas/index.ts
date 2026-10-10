import { type CreatePersona, createPersonaSchema, type Persona, type PersonaSource } from "@onfloor/contracts";
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

export async function createPersona(input: CreatePersona, id?: string): Promise<Persona> {
  const body = createPersonaSchema.parse(input);
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
  return rows.map(toPersona);
}
