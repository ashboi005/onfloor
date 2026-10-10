/**
 * Seeds the Tomato demo: accounts, merchants, behaviour presets, the Max Grow scenario, the
 * company docs + top-rep lines (RAG), and two past practice calls per agent (one strong, one
 * weak, so the calls list, report cards and each agent's RAG weak spots have real content).
 * Idempotent: re-running replaces what it seeded and nothing else.
 *   bun run db:seed
 *
 * Changing the demo company / merchants / scenario? Change the fixtures and
 * apps/server/knowledge/*.md together, then re-run this (docs/specs/07-rag.md §7).
 */
import { addMonths, type Scorecard, type TranscriptTurn, todayIst, type WorkspaceLogEntry } from "@onfloor/contracts";
import {
  merchants,
  personas,
  scenarios,
  sharmaJi,
  simCallTranscript,
  simCallTranslations,
  simScorecard,
  thaliCallTranscript,
  thaliCallTranslations,
  thaliScorecard,
  thaliVoiced,
  thaliWorkspaceLog,
} from "@onfloor/contracts/fixtures";
import { calls as callsTable, crmRequestsVoiced, scorecards, transcriptTurns, user, workspaceActions } from "@onfloor/db/schema";
import { eq, like } from "drizzle-orm";
import { ingestGoldenSeed, ingestOrgDocs, rememberCall } from "../modules/knowledge";
import { upsertMerchant } from "../modules/merchants";
import { createPersona } from "../modules/personas";
import { upsertScenario } from "../modules/scenarios";
import { services } from "../core/services";
import { auth, db } from "../services";

const PASSWORD = process.env.SEED_PASSWORD ?? "OnFloorDemo!2026";

const ACCOUNTS = [
  { key: "ashwath", name: "Ashwath", email: "ashwath@onfloor.demo", role: "agent" },
  { key: "tushar", name: "Tushar", email: "tushar@onfloor.demo", role: "agent" },
  { key: "harnoor", name: "Harnoor", email: "harnoor@onfloor.demo", role: "agent" },
  { key: "mansukh", name: "Mansukh", email: "mansukh@onfloor.demo", role: "agent" },
  { key: "manager", name: "Floor Manager", email: "manager@onfloor.demo", role: "manager" },
] as const;

const agentIds: Record<string, { id: string; name: string }> = {};
for (const a of ACCOUNTS) {
  const [existing] = await db.select().from(user).where(eq(user.email, a.email));
  if (!existing) await auth.api.signUpEmail({ body: { name: a.name, email: a.email, password: PASSWORD } });
  await db.update(user).set({ role: a.role }).where(eq(user.email, a.email));
  const [row] = await db.select().from(user).where(eq(user.email, a.email));
  agentIds[a.key] = { id: row!.id, name: a.name };
  console.log(`  account   ${a.email} (${a.role})`);
}

for (const s of scenarios) {
  await upsertScenario(s);
  console.log(`  scenario  ${s.id}`);
}

for (const { id, createdAt: _, ...p } of personas) {
  await createPersona(p, id);
  console.log(`  persona   ${id} (${p.source})`);
}

for (const { createdAt: _, ...m } of merchants) {
  await upsertMerchant(m);
  console.log(`  merchant  ${m.id} UID ${m.uid}  DRR ₹${m.drr.toLocaleString("en-IN")}  ${m.answerer.relation}${m.demo ? "  ← demo" : ""}`);
}

// --- Past practice calls (history) ---------------------------------------------------------

interface HistoryCall {
  slug: string;
  merchantId: string;
  personaId: string;
  label: string;
  guidance: boolean;
  daysAgo: number;
  hour: number;
  transcript: TranscriptTurn[];
  translations: Record<string, string>;
  card: Scorecard;
  log: (callDate: string) => WorkspaceLogEntry[];
  voiced: { requestId: string; atMs: number }[];
}

const HISTORY: HistoryCall[] = [
  {
    slug: "rajesh",
    merchantId: sharmaJi.id,
    personaId: "persona_curious",
    label: `${sharmaJi.answerer.name} · ${sharmaJi.restaurantName}`,
    guidance: true,
    daysAgo: 1,
    hour: 11,
    transcript: simCallTranscript,
    translations: simCallTranslations,
    card: simScorecard,
    log: (d) => [
      { actor: "agent", kind: "tab_opened", body: { tab: "merchant_dashboard" }, atMs: 23500 },
      { actor: "agent", kind: "dashboard_lookup", body: { uid: sharmaJi.uid, found: true, matchesTicket: true }, atMs: 24500 },
      { actor: "persona", kind: "decision", body: { value: "accepted" }, atMs: 96000 },
      { actor: "agent", kind: "tab_opened", body: { tab: "ad_studio" }, atMs: 99000 },
      {
        actor: "agent",
        kind: "campaign_launch",
        body: { ok: true, error: null, campaign: { uid: sharmaJi.uid, email: "orders@sharmajichholebhature.in", campaignType: "max_grow", startDate: d, endDate: addMonths(d, 1) } },
        atMs: 107000,
      },
      { actor: "agent", kind: "email_sent", body: { template: "campaign_accepted", callback: null, to: "orders@sharmajichholebhature.in" }, atMs: 160000 },
      { actor: "agent", kind: "dispose", body: { outcome: "accepted", callback: null, secondsTaken: 41 }, atMs: 172500 },
    ],
    voiced: [{ requestId: "req_email", atMs: 39000 }],
  },
  {
    slug: "thali",
    merchantId: "mer_royal_thali",
    personaId: "persona_bargainer",
    label: "Hitesh Patel · Royal Thali House",
    guidance: false,
    daysAgo: 2,
    hour: 15,
    transcript: thaliCallTranscript,
    translations: thaliCallTranslations,
    card: thaliScorecard,
    log: (d) => thaliWorkspaceLog(d, addMonths(d, 1)),
    voiced: thaliVoiced,
  },
];

const agents = ACCOUNTS.filter((a) => a.role === "agent");
const remember: Promise<void>[] = [];
for (const a of agents) {
  const agent = agentIds[a.key]!;
  for (const h of HISTORY) {
    const id = `call_hist_${a.key}_${h.slug}`;
    await db.delete(callsTable).where(eq(callsTable.id, id)); // cascades turns, actions, scorecard
    const startedAt = new Date(Date.now() - h.daysAgo * 86_400_000);
    startedAt.setHours(h.hour, 0, 0, 0);
    const durationMs = h.card.stats.durationMs;
    await db.insert(callsTable).values({
      id,
      kind: "sim",
      status: "scored",
      agentId: agent.id,
      scenarioId: "scn_max_grow",
      personaId: h.personaId,
      merchantId: h.merchantId,
      guidance: h.guidance,
      language: "hinglish",
      customerLabel: h.label,
      startedAt,
      endedAt: new Date(startedAt.getTime() + durationMs),
      durationMs,
      overallScore: h.card.overall,
    });
    // Agent names in the scripted lines follow the account.
    const ids = new Map<string, string>();
    for (const t of h.transcript) {
      const turnId = `${id}_t${t.seq}`;
      ids.set(t.id, turnId);
      const text = t.text.replaceAll("Ashwath", agent.name);
      await db.insert(transcriptTurns).values({
        id: turnId,
        callId: id,
        seq: t.seq,
        speaker: t.speaker,
        text,
        language: t.language,
        startMs: t.startMs,
        endMs: t.endMs,
        translation: (h.translations[t.id] ?? t.text).replaceAll("Ashwath", agent.name),
      });
    }
    const callDate = todayIst(startedAt);
    for (const entry of h.log(callDate)) await db.insert(workspaceActions).values({ callId: id, ...entry });
    for (const v of h.voiced) await db.insert(crmRequestsVoiced).values({ callId: id, ...v });
    const remap = (turnId: string) => ids.get(turnId) ?? turnId;
    const card: Scorecard = {
      ...h.card,
      callId: id,
      dimensions: h.card.dimensions.map((d) => ({ ...d, evidence: d.evidence.map(remap) })),
      moments: h.card.moments.map((m) => ({ ...m, turnId: remap(m.turnId), goldenLine: m.goldenLine?.replaceAll("Ashwath", agent.name) ?? null })),
      deductions: h.card.deductions.map((d) => ({ ...d, turnId: d.turnId ? remap(d.turnId) : null })),
      createdAt: new Date(startedAt.getTime() + durationMs + 120_000).toISOString(),
    };
    await db.insert(scorecards).values({ callId: id, body: card });
    if (services.knowledge.enabled) remember.push(rememberCall(id, card));
    console.log(`  history   ${id} (${card.overall} ${card.grade})`);
  }
}

// Old-format history from before the Tomato demo is left alone (it's skipped by the API's schema
// checks); `bun run db:seed --prune` removes this seed's history ids that no longer exist.
if (process.argv.includes("--prune")) {
  const keep = new Set(agents.flatMap((a) => HISTORY.map((h) => `call_hist_${a.key}_${h.slug}`)));
  for (const row of await db.select({ id: callsTable.id }).from(callsTable).where(like(callsTable.id, "call_hist_%"))) {
    if (!keep.has(row.id)) await db.delete(callsTable).where(eq(callsTable.id, row.id));
  }
}

// --- Knowledge (RAG) ------------------------------------------------------------------------

if (services.knowledge.enabled) {
  const { docs, removed } = await ingestOrgDocs();
  for (const d of docs) console.log(`  knowledge org_docs ${d.source} (${d.chunks} chunks)`);
  for (const r of removed) console.log(`  knowledge removed retired doc ${r}`);
  console.log(`  knowledge golden   ${await ingestGoldenSeed()} seed lines`);
  await Promise.all(remember);
  console.log(`  knowledge agent    weak spots + golden lines from ${remember.length} past calls`);
} else {
  console.log("  knowledge skipped (VECTOR_DATABASE_URL unset)");
}

console.log(`\nSeeded. Password for every account: ${PASSWORD}`);
process.exit(0);
