import {
  type CreateMerchant,
  createMerchantSchema,
  type Merchant,
  type MerchantSource,
  merchantSchema,
  type Persona,
  toMerchantSummary,
} from "@onfloor/contracts";
import { VOICES } from "@onfloor/contracts/fixtures";
import { merchants } from "@onfloor/db/schema";
import { desc, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { authGuard } from "../../core/auth-guard";
import { AppError } from "../../core/errors";
import { db } from "../../services";

/**
 * Merchant repository: the Tomato restaurant partners the simulator calls. WHO is on the
 * line and their restaurant's data; HOW they behave is the persona (modules/personas).
 */

type Row = typeof merchants.$inferSelect;
const toMerchant = (r: Row): Merchant => ({ ...r.body, id: r.id, createdAt: r.createdAt.toISOString() });

export async function upsertMerchant(input: CreateMerchant): Promise<Merchant> {
  const body = createMerchantSchema.parse(input);
  const [row] = await db
    .insert(merchants)
    .values({ id: body.id, uid: body.uid, restaurantName: body.restaurantName, source: body.source, sourcePersonaId: body.sourcePersonaId, body })
    .onConflictDoUpdate({ target: merchants.id, set: { uid: body.uid, restaurantName: body.restaurantName, body } })
    .returning();
  return toMerchant(row!);
}

export async function getMerchant(id: string): Promise<Merchant> {
  const [row] = await db.select().from(merchants).where(eq(merchants.id, id));
  if (!row) throw new AppError("NOT_FOUND", { message: "No such merchant." });
  return toMerchant(row);
}

/** Merchant Dashboard's lookup. null when no merchant has that UID. */
export async function findMerchantByUid(uid: string): Promise<Merchant | null> {
  const [row] = await db.select().from(merchants).where(eq(merchants.uid, uid.trim()));
  return row ? toMerchant(row) : null;
}

/** Rows written under an older merchant shape are skipped, not served. */
export async function listMerchants(source?: MerchantSource): Promise<Merchant[]> {
  const rows = await db
    .select()
    .from(merchants)
    .where(source ? eq(merchants.source, source) : undefined)
    .orderBy(desc(merchants.createdAt));
  return rows.map(toMerchant).filter((m) => merchantSchema.safeParse(m).success);
}

/** Deterministic pseudo-random ints from a string, so a derived profile is stable across replays. */
function seeded(key: string) {
  let h = 2166136261;
  for (const c of key) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (min: number, max: number) => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    return min + (h % (max - min + 1));
  };
}

/**
 * A live-call persona has an identity but no restaurant data. On replay we derive a stable
 * merchant profile from it (persisted, so its UID resolves in Merchant Dashboard).
 */
/** Round, small DRRs (₹100-500) so the 20%-of-incremental maths is easy to say on the call. */
const REPLAY_DRRS = [100, 150, 200, 250, 300, 400, 500];
const MAX_DRR = 1000;

export async function ensureMerchantForPersona(persona: Persona): Promise<Merchant> {
  const id = `mer_live_${persona.id}`;
  const existing = await db.select().from(merchants).where(eq(merchants.id, id));
  const current = existing[0] ? toMerchant(existing[0]) : null;
  // Profiles derived before DRRs were capped (₹3,000-25,000) are rebuilt with the same UID.
  if (current && current.drr <= MAX_DRR) return current;

  const rand = seeded(persona.id);
  const first = persona.name.split(/\s+/)[0] ?? persona.name;
  const restaurantName = persona.role.split(",").slice(1).join(",").trim() || `${first}'s Kitchen`;
  const slug = restaurantName.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const drr = REPLAY_DRRS[rand(0, REPLAY_DRRS.length - 1)]!;
  const aov = Math.min(drr, rand(10, 30) * 10);
  let uid = current?.uid ?? String(rand(10_000_000, 99_999_999));
  while (!current && (await findMerchantByUid(uid))) uid = String(rand(10_000_000, 99_999_999));
  const items = persona.business.type.includes("cafe") ? ["Cold Coffee", "Club Sandwich", "Brownie"] : ["House Special Thali", "Paneer Butter Masala", "Masala Chai"];

  return upsertMerchant({
    id,
    uid,
    restaurantName,
    ownerName: persona.name,
    email: `${first.toLowerCase()}@${slug || "restaurant"}.in`,
    phone: `+91 9${rand(1000, 9999)} ${rand(10000, 99999)}`,
    city: persona.business.city ?? "Pune",
    locality: "Main Road",
    address: `${rand(1, 99)}, Main Road, ${persona.business.city ?? "Pune"}`,
    cuisines: ["North Indian"],
    outletType: "dine_in_delivery",
    onTomatoSince: `20${rand(18, 23)}-0${rand(1, 9)}-1${rand(0, 9)}`,
    rating: rand(36, 45) / 10,
    ratingCount: rand(300, 4000),
    costForTwo: rand(3, 7) * 100,
    drr,
    avgOrderValue: aov,
    ordersPerDay: Math.max(1, Math.round(drr / aov)),
    topItems: items.map((name, i) => ({ name, price: rand(8, 30) * 10, dailySales: Math.round((drr * [0.5, 0.3, 0.2][i]!) / 10) * 10 })),
    menu: { items: rand(25, 60), itemsWithPhotos: rand(5, 20) },
    orderRejectionPct: rand(15, 90) / 10,
    payoutCycle: "weekly",
    activeCampaigns: [],
    answerer: { name: persona.name, relation: "owner", isDecisionMaker: true, ownerAvailability: null },
    language: persona.language,
    voiceId: persona.voiceId || VOICES.mahesh,
    background: persona.backstory,
    concerns: persona.objections,
    requests: [],
    defaultPersonaId: persona.id,
    tagline: `Replay of a live call with ${persona.name}.`,
    demo: false,
    source: "live_call",
    sourcePersonaId: persona.id,
  });
}

export const merchantRoutes = new Elysia({ prefix: "/api/merchants" })
  .use(authGuard)
  /** Picker cards: no dashboard data (the agent finds that with the tools during the call). */
  .get("/", async ({ query }) => (await listMerchants(query.source)).map(toMerchantSummary), {
    authed: true,
    query: z.object({ source: z.enum(["seed", "live_call", "custom"]).optional() }),
  })
  .get("/:id", async ({ params }) => toMerchantSummary(await getMerchant(params.id)), { authed: true, params: z.object({ id: z.string() }) });
