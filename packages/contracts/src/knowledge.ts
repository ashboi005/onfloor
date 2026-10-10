import { z } from "zod";

/**
 * RAG (knowledge) shapes. The vector store is partitioned by scope:
 *   org_docs  playbook, price sheets, policies (managers upload)
 *   golden    real lines from strong calls (written automatically after scoring)
 *   agent     each agent's past mistakes (written automatically after scoring), keyed by agentId
 *   customer  memory of past live calls with a customer, keyed by customerKey (Telegram user id)
 */
export const KNOWLEDGE_SCOPES = ["org_docs", "golden", "agent", "customer"] as const;
export type KnowledgeScopeKind = (typeof KNOWLEDGE_SCOPES)[number];

export const knowledgeSnippetSchema = z.object({
  id: z.string(),
  text: z.string(),
  /** e.g. "playbook" or "call:<id>" */
  source: z.string(),
  title: z.string(),
  /** Cosine similarity, 0–1. */
  score: z.number(),
  meta: z.record(z.string(), z.unknown()),
});
export type KnowledgeSnippet = z.infer<typeof knowledgeSnippetSchema>;

export const knowledgeSourceSchema = z.object({
  scope: z.enum(KNOWLEDGE_SCOPES),
  scopeKey: z.string(),
  source: z.string(),
  title: z.string(),
  chunks: z.number().int(),
  updatedAt: z.string(),
});
export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

export const createKnowledgeDocSchema = z.object({
  /** Stable id; re-uploading the same source replaces it. Defaults to a slug of the title. */
  source: z.string().regex(/^[\w:.-]+$/).optional(),
  title: z.string().min(1).max(200),
  text: z.string().min(1).max(200_000),
  format: z.enum(["markdown", "text"]).default("markdown"),
});
export type CreateKnowledgeDoc = z.infer<typeof createKnowledgeDocSchema>;

export const knowledgeStatusSchema = z.object({
  enabled: z.boolean(),
  collection: z.string(),
  sources: z.number().int(),
});
