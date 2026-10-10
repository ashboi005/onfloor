import { MDocument } from "@mastra/rag";
import { QdrantVector } from "@mastra/qdrant";
import { knowledgeSources } from "@onfloor/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { ENV } from "../../env.server";
import { db } from "../../services";
import { embed } from "./llm";

/**
 * RAG: Mastra (chunking + vector-store client) over Qdrant, Gemini embeddings.
 *
 * One collection, partitioned by payload:
 *   scope     org_docs | customer | agent | golden
 *   scopeKey  customerKey (Telegram user id) / agentId; "" for org_docs and golden
 *   source    the document / call it came from; re-ingesting a source replaces it
 * so every retrieval is filtered to exactly one scope (+ key): no cross-customer or
 * cross-agent leakage.
 *
 * With VECTOR_DATABASE_URL unset the service is a no-op: retrieve() → [], ingest() → 0
 * chunks, so nothing upstream needs to care whether RAG is configured.
 */
export type KnowledgeScope =
  | { kind: "org_docs" }
  | { kind: "customer"; customerKey: string }
  | { kind: "agent"; agentId: string }
  | { kind: "golden" };

export interface Snippet {
  id: string;
  text: string;
  source: string;
  title: string;
  score: number;
  meta: Record<string, unknown>;
}

export interface KnowledgeDoc {
  scope: KnowledgeScope;
  /** Stable id of the document, e.g. "playbook" or "call:<id>". Re-ingesting replaces it. */
  source: string;
  title: string;
  text: string;
  /** markdown → split on headings first; text → recursive; snippet → stored as one chunk. */
  format?: "markdown" | "text" | "snippet";
  meta?: Record<string, unknown>;
}

export interface KnowledgeSource {
  scope: KnowledgeScope["kind"];
  scopeKey: string;
  source: string;
  title: string;
  chunks: number;
  updatedAt: string;
}

export interface KnowledgeService {
  readonly enabled: boolean;
  retrieve(query: string, scope: KnowledgeScope, k?: number, opts?: { minScore?: number }): Promise<Snippet[]>;
  ingest(doc: KnowledgeDoc): Promise<{ chunks: number }>;
  remove(scope: KnowledgeScope, source: string): Promise<void>;
  sources(scope?: KnowledgeScope["kind"]): Promise<KnowledgeSource[]>;
}

/**
 * Query-embedding cache. The live copilot asks two scopes (playbook + customer memory) about
 * the same customer line, and retries ask again: one embedding per distinct query text.
 */
const QUERY_CACHE_MAX = 256;
const queryCache = new Map<string, Promise<number[]>>();
function embedQuery(text: string): Promise<number[]> {
  const key = text.slice(0, 4000);
  const hit = queryCache.get(key);
  if (hit) {
    queryCache.delete(key); // refresh LRU position
    queryCache.set(key, hit);
    return hit;
  }
  const pending = embed([key]).then(([v]) => v!);
  pending.catch(() => queryCache.delete(key)); // never cache a failure
  queryCache.set(key, pending);
  if (queryCache.size > QUERY_CACHE_MAX) queryCache.delete(queryCache.keys().next().value!);
  return pending;
}

const scopeKeyOf = (s: KnowledgeScope) => (s.kind === "customer" ? s.customerKey : s.kind === "agent" ? s.agentId : "");

/** Below this cosine similarity a hit is noise (gemini-embedding-001 @768). */
const DEFAULT_MIN_SCORE = 0.55;

async function chunk(doc: KnowledgeDoc): Promise<string[]> {
  const text = doc.text.trim();
  if (!text) return [];
  if (doc.format === "snippet" || text.length < 600) return [text];
  const mdoc = doc.format === "markdown" ? MDocument.fromMarkdown(text) : MDocument.fromText(text);
  const chunks =
    doc.format === "markdown"
      ? await mdoc.chunk({ strategy: "markdown", maxSize: 900, overlap: 100 })
      : await mdoc.chunk({ strategy: "recursive", maxSize: 900, overlap: 100 });
  return chunks.map((c) => c.text.trim()).filter(Boolean);
}

class QdrantKnowledge implements KnowledgeService {
  readonly enabled = true;
  private readonly store = new QdrantVector({
    id: "onfloor-knowledge",
    url: ENV.VECTOR_DATABASE_URL!,
    ...(ENV.VECTOR_DATABASE_API_KEY && { apiKey: ENV.VECTOR_DATABASE_API_KEY }),
  });
  private readonly index = ENV.KNOWLEDGE_COLLECTION;
  private ready: Promise<void> | null = null;

  /** Creates the collection + payload indexes once (idempotent; also required on Qdrant Cloud). */
  private ensure(): Promise<void> {
    this.ready ??= (async () => {
      const existing = await this.store.listIndexes();
      if (!existing.includes(this.index)) {
        await this.store.createIndex({ indexName: this.index, dimension: ENV.EMBEDDING_DIMENSIONS, metric: "cosine" });
      }
      for (const fieldName of ["scope", "scopeKey", "source"]) {
        await this.store
          .createPayloadIndex({ indexName: this.index, fieldName, fieldSchema: "keyword" })
          .catch(() => {}); // already exists
      }
    })().catch((err) => {
      this.ready = null; // retry next time
      throw err;
    });
    return this.ready;
  }

  private filter(scope: KnowledgeScope, source?: string) {
    return { scope: scope.kind, scopeKey: scopeKeyOf(scope), ...(source && { source }) };
  }

  async retrieve(query: string, scope: KnowledgeScope, k = 4, opts: { minScore?: number } = {}): Promise<Snippet[]> {
    if (!query.trim()) return [];
    await this.ensure();
    const vector = await embedQuery(query);
    const hits = await this.store.query({ indexName: this.index, queryVector: vector, topK: k, filter: this.filter(scope) });
    const min = opts.minScore ?? DEFAULT_MIN_SCORE;
    return hits
      .filter((h) => h.score >= min)
      .map((h) => {
        const { text, source, title, scope: _s, scopeKey: _k, ...meta } = (h.metadata ?? {}) as Record<string, unknown>;
        return { id: String(h.id), text: String(text ?? ""), source: String(source ?? ""), title: String(title ?? ""), score: h.score, meta };
      });
  }

  async ingest(doc: KnowledgeDoc): Promise<{ chunks: number }> {
    await this.ensure();
    const chunks = await chunk(doc);
    await this.remove(doc.scope, doc.source); // replace, never duplicate
    if (!chunks.length) return { chunks: 0 };
    const vectors = await embed(chunks);
    const now = new Date().toISOString();
    await this.store.upsert({
      indexName: this.index,
      vectors,
      ids: chunks.map(() => crypto.randomUUID()),
      metadata: chunks.map((text, i) => ({
        ...doc.meta,
        ...this.filter(doc.scope, doc.source),
        title: doc.title,
        text,
        chunk: i,
        createdAt: now,
      })),
    });
    const scopeKey = scopeKeyOf(doc.scope);
    await db
      .insert(knowledgeSources)
      .values({ scope: doc.scope.kind, scopeKey, source: doc.source, title: doc.title, chunks: chunks.length })
      .onConflictDoUpdate({
        target: [knowledgeSources.scope, knowledgeSources.scopeKey, knowledgeSources.source],
        set: { title: doc.title, chunks: chunks.length, updatedAt: sql`now()` },
      });
    return { chunks: chunks.length };
  }

  async remove(scope: KnowledgeScope, source: string): Promise<void> {
    await this.ensure();
    await this.store.deleteVectors({ indexName: this.index, filter: this.filter(scope, source) });
    await db
      .delete(knowledgeSources)
      .where(
        and(
          eq(knowledgeSources.scope, scope.kind),
          eq(knowledgeSources.scopeKey, scopeKeyOf(scope)),
          eq(knowledgeSources.source, source),
        ),
      );
  }

  async sources(scope?: KnowledgeScope["kind"]): Promise<KnowledgeSource[]> {
    const rows = await db
      .select()
      .from(knowledgeSources)
      .where(scope ? eq(knowledgeSources.scope, scope) : undefined)
      .orderBy(desc(knowledgeSources.updatedAt))
      .limit(200);
    return rows.map((r) => ({
      scope: r.scope as KnowledgeScope["kind"],
      scopeKey: r.scopeKey,
      source: r.source,
      title: r.title,
      chunks: r.chunks,
      updatedAt: r.updatedAt.toISOString(),
    }));
  }
}

class DisabledKnowledge implements KnowledgeService {
  readonly enabled = false;
  retrieve = async () => [];
  ingest = async () => ({ chunks: 0 });
  remove = async () => {};
  sources = async () => [];
}

export function createKnowledgeService(): KnowledgeService {
  return ENV.VECTOR_DATABASE_URL ? new QdrantKnowledge() : new DisabledKnowledge();
}
