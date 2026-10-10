import {
  ARCHETYPES,
  CALL_KINDS,
  CALL_STATUSES,
  type CreatePersona,
  CRM_FIELD_KEYS,
  LANGUAGES,
  type LiveEvent,
  PERSONA_SOURCES,
  type Scenario,
  type Scorecard,
  SPEAKERS,
} from "@onfloor/contracts";
import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * OnFloor's tables. Bodies that are read whole (persona, scenario, scorecard) are JSON
 * columns typed by the contracts; only what we filter or join on is a real column.
 * Enums are `text` with a TS enum, not pg enums, so adding a value needs no migration.
 */

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;

export const personas = pgTable(
  "personas",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("persona")),
    name: text("name").notNull(),
    archetype: text("archetype", { enum: ARCHETYPES }).notNull(),
    language: text("language", { enum: LANGUAGES }).notNull(),
    source: text("source", { enum: PERSONA_SOURCES }).notNull(),
    sourceCallId: text("source_call_id"),
    /** The full CreatePersona body (duplicates the columns above, which exist for filtering). */
    body: jsonb("body").$type<CreatePersona>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("personas_source_idx").on(t.source)],
);

export const scenarios = pgTable("scenarios", {
  id: text("id").primaryKey(),
  body: jsonb("body").$type<Omit<Scenario, "id">>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const calls = pgTable(
  "calls",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("call")),
    kind: text("kind", { enum: CALL_KINDS }).notNull(),
    status: text("status", { enum: CALL_STATUSES }).notNull().default("active"),
    agentId: text("agent_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scenarioId: text("scenario_id").references(() => scenarios.id),
    personaId: text("persona_id").references(() => personas.id),
    replayOfCallId: text("replay_of_call_id"),
    language: text("language", { enum: LANGUAGES }).notNull(),
    customerLabel: text("customer_label").notNull(),
    /** Live only: the Telegram user id, so later calls can be linked to the same customer. */
    externalCustomerId: text("external_customer_id"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    durationMs: integer("duration_ms"),
    recordingUrl: text("recording_url"),
    overallScore: integer("overall_score"),
  },
  (t) => [index("calls_agent_idx").on(t.agentId, t.startedAt), index("calls_status_idx").on(t.status)],
);

export const transcriptTurns = pgTable(
  "transcript_turns",
  {
    id: text("id").primaryKey().$defaultFn(() => newId("turn")),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    speaker: text("speaker", { enum: SPEAKERS }).notNull(),
    text: text("text").notNull(),
    language: text("language", { enum: LANGUAGES }),
    startMs: integer("start_ms").notNull(),
    endMs: integer("end_ms").notNull(),
  },
  (t) => [uniqueIndex("transcript_turns_call_seq_idx").on(t.callId, t.seq)],
);

/** Every committed Mock CRM change during a sim call. */
export const crmActions = pgTable(
  "crm_actions",
  {
    id: serial("id").primaryKey(),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    field: text("field", { enum: CRM_FIELD_KEYS }).notNull(),
    from: jsonb("from"),
    to: jsonb("to"),
    atMs: integer("at_ms").notNull(),
  },
  (t) => [index("crm_actions_call_idx").on(t.callId)],
);

/** When the persona actually voiced each crmRequest, so the audit can measure latency. */
export const crmRequestsVoiced = pgTable(
  "crm_requests_voiced",
  {
    id: serial("id").primaryKey(),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    atMs: integer("at_ms").notNull(),
  },
  (t) => [index("crm_requests_voiced_call_idx").on(t.callId)],
);

export const scorecards = pgTable("scorecards", {
  callId: text("call_id")
    .primaryKey()
    .references(() => calls.id, { onDelete: "cascade" }),
  body: jsonb("body").$type<Scorecard>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Append-only log of every HUD event emitted, so a live call can be re-shown later. */
export const liveEvents = pgTable(
  "live_events",
  {
    id: serial("id").primaryKey(),
    callId: text("call_id")
      .notNull()
      .references(() => calls.id, { onDelete: "cascade" }),
    atMs: integer("at_ms").notNull(),
    type: text("type").notNull(),
    body: jsonb("body").$type<LiveEvent>().notNull(),
  },
  (t) => [index("live_events_call_idx").on(t.callId, t.atMs)],
);

/**
 * Registry of what's in the vector store (Qdrant has no cheap "list sources"). One row per
 * ingested source per scope; re-ingesting a source replaces its chunks.
 */
export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: serial("id").primaryKey(),
    /** org_docs | customer | agent | golden */
    scope: text("scope").notNull(),
    /** customerKey / agentId; "" for org_docs and golden. */
    scopeKey: text("scope_key").notNull().default(""),
    source: text("source").notNull(),
    title: text("title").notNull(),
    chunks: integer("chunks").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("knowledge_sources_scope_source_idx").on(t.scope, t.scopeKey, t.source)],
);
