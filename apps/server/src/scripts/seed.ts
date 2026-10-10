/**
 * Seeds demo accounts, the scenario and the personas. Idempotent.
 *   bun run db:seed
 */
import { personas, scenarios } from "@onfloor/contracts/fixtures";
import { user } from "@onfloor/db/schema";
import { eq } from "drizzle-orm";
import { createPersona } from "../modules/personas";
import { upsertScenario } from "../modules/scenarios";
import { auth, db } from "../services";

const PASSWORD = process.env.SEED_PASSWORD ?? "OnFloorDemo!2026";

const ACCOUNTS = [
  { name: "Ashwath", email: "ashwath@onfloor.demo", role: "agent" },
  { name: "Tushar", email: "tushar@onfloor.demo", role: "agent" },
  { name: "Harnoor", email: "harnoor@onfloor.demo", role: "agent" },
  { name: "Mansukh", email: "mansukh@onfloor.demo", role: "agent" },
  { name: "Floor Manager", email: "manager@onfloor.demo", role: "manager" },
] as const;

for (const a of ACCOUNTS) {
  const [existing] = await db.select().from(user).where(eq(user.email, a.email));
  if (!existing) await auth.api.signUpEmail({ body: { name: a.name, email: a.email, password: PASSWORD } });
  await db.update(user).set({ role: a.role }).where(eq(user.email, a.email));
  console.log(`  account  ${a.email} (${a.role})`);
}

for (const s of scenarios) {
  await upsertScenario(s);
  console.log(`  scenario ${s.id}`);
}

for (const { id, createdAt: _, ...p } of personas) {
  await createPersona(p, id);
  console.log(`  persona  ${id} (${p.source})`);
}

console.log(`\nSeeded. Password for every account: ${PASSWORD}`);
process.exit(0);
