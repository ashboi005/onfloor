/**
 * RAG seam. Empty on purpose: see docs/specs/06-future-scope.md (Mastra + pgvector).
 * Call sites may call `retrieve` today; it returns [] until the knowledge module lands.
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
  score: number;
  meta: Record<string, unknown>;
}

export interface KnowledgeDoc {
  scope: KnowledgeScope;
  source: string;
  text: string;
  meta?: Record<string, unknown>;
}

export interface KnowledgeService {
  retrieve(query: string, scope: KnowledgeScope, k?: number): Promise<Snippet[]>;
  ingest(doc: KnowledgeDoc): Promise<void>;
}

export function createKnowledgeService(): KnowledgeService {
  return {
    retrieve: async () => [],
    ingest: async () => {},
  };
}
