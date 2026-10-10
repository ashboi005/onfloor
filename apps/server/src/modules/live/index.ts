import type { LiveEvent } from "@onfloor/contracts";
import { liveEvents, user } from "@onfloor/db/schema";
import { asc, eq } from "drizzle-orm";
import { db } from "../../services";

/** SQL for the live module stays at its repository boundary. */
export async function agentIdByEmail(email: string): Promise<string | null> {
  const [row] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  return row?.id ?? null;
}

export async function appendEvent(callId: string, atMs: number, event: LiveEvent): Promise<void> {
  await db.insert(liveEvents).values({ callId, atMs, type: event.type, body: event });
}

export async function readEvents(callId: string): Promise<LiveEvent[]> {
  const rows = await db.select({ body: liveEvents.body }).from(liveEvents)
    .where(eq(liveEvents.callId, callId)).orderBy(asc(liveEvents.id));
  return rows.map((row) => row.body);
}
