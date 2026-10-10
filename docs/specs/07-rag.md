# OnFloor: Knowledge & RAG

Owner: **Ashwath** (store, ingestion, simulator + scoring integration).
Touches: **Tushar** (copilot grounding, already-wired customer memory, and the HUD's "Last time…" card
and hint source chips, since he owns the live dashboard). Mansukh: nothing required (an optional manager "Knowledge" page is possible, the
API and hooks exist).

## 1. What it does

Every AI decision in OnFloor can now be grounded in **our own data** instead of the prompt alone:

| Scope | What's in it | Written by | Read by | Effect |
|---|---|---|---|---|
| `org_docs` | Playbook: plans, prices, reach guarantees, activation SLAs, discount policy, competitor facts, objection counters | `bun run db:seed` (bundled playbook), managers via `POST /api/knowledge/docs` | QA judge, live copilot | The judge flags quoted facts that contradict the playbook; hints quote real numbers |
| `golden` | Real agent lines that worked, from calls scoring ≥ 75 | automatically after scoring | QA judge | "Golden Standard" lines come from what strong reps actually said |
| `agent` (per agentId) | Each agent's past mistakes | automatically after scoring | simulator | The AI customer presses on **that agent's** weak spots |
| `customer` (per Telegram user id) | Summary + key moments + what they said, per live call | automatically after scoring a live call | live HUD, copilot | "Last time…" card when a repeat customer calls |

Retrieval is always filtered to exactly one scope (and key): one customer's memory can never leak into
another's, and agents only see their own weak spots.

## 2. Architecture

```
                  writes                                         reads
 seed / manager ──► org_docs ┐                       ┌──► scoring judge (facts + golden)
 scoreCall() ──► rememberCall()─► agent / golden /   │──► startSim (agent weak spots → persona prompt)
                              customer ──────────────┤──► startLiveCall (customer_memory → HUD)
                                                     └──► copilot hints (facts + memory)  [Tushar]
                       ┌─────────────────────────────┐
  Mastra MDocument ──► │ Qdrant  collection          │ ◄── Mastra QdrantVector
  (markdown/recursive  │ onfloor_knowledge           │     query(filter: scope+scopeKey)
   chunking)           │ payload: scope, scopeKey,   │
  Gemini embeddings ─► │ source, title, text, meta   │
  (key pool, 768-d)    └─────────────────────────────┘
                       Postgres knowledge_sources = registry of what's indexed (for listing)
```

- **Mastra** (`@mastra/rag` for chunking, `@mastra/qdrant` as the vector-store client), in
  `apps/server/src/core/services/knowledge.ts`.
- **Embeddings:** `gemini-embedding-001` at 768 dimensions, through the same 4-key rotation pool as the
  LLM. They never fall back to Merge: vectors from different models can't share a collection.
- **Multilingual:** Hindi, Hinglish and English queries all hit English docs (measured: "kal tak activate ho
  jayega?" → the activation-policy chunk, score 0.68).
- **Fail-soft:** with `VECTOR_DATABASE_URL` unset, or Qdrant down, every helper returns nothing and the
  call proceeds exactly as before. RAG improves a call; it never breaks one.

## 3. Setup

```env
VECTOR_DATABASE_URL=http://localhost:6333      # or a Qdrant Cloud URL
VECTOR_DATABASE_API_KEY=                       # Qdrant Cloud only
# defaults, change only with a re-index:
KNOWLEDGE_COLLECTION=onfloor_knowledge
EMBEDDING_MODEL=gemini-embedding-001
EMBEDDING_DIMENSIONS=768
```

```bash
docker run -d --name onfloor-qdrant -p 6333:6333 -v onfloor_qdrant:/qdrant/storage qdrant/qdrant   # local
bun run db:migrate      # knowledge_sources table
bun run db:seed         # also ingests the playbook (11 chunks)
```

The collection and its payload indexes are created on first use. Changing the embedding model or the
dimensions means deleting the collection and re-seeding.

## 4. Server API (`/api/knowledge`, signed-in)

| Method | Path | Who | Does |
|---|---|---|---|
| GET | `/status` | any | `{ enabled, collection, sources }` |
| GET | `/docs` | any | org docs (`KnowledgeSource[]`) |
| POST | `/docs` | manager | `{ title, text, format: markdown\|text, source? }`: upload or replace a doc |
| DELETE | `/docs/:source` | manager | remove a doc |
| POST | `/docs/playbook/reindex` | manager | re-ingest the bundled playbook after editing it |
| GET | `/search?q=&scope=&key=&k=` | any | `KnowledgeSnippet[]`; `agent` scope is always your own unless manager; `customer` needs `key` |

Web hooks (`@/lib/api`): `useKnowledgeStatus`, `useKnowledgeDocs`, `useKnowledgeSearch`,
`useUploadKnowledgeDoc` (mock + http).

## 5. Server helpers (`apps/server/src/modules/knowledge`)

```ts
groundingFacts(query, k?)            → Snippet[]   // org_docs
goldenExamples(query, k?)            → Snippet[]   // golden
agentWeakSpots(agentId, query, k?)   → Snippet[]   // agent
customerMemory(customerKey, query?, k?) → Snippet[] // customer
customerMemoryEvent(customerKey, label) → LiveEvent // ready to hub.emit
formatSnippets(snippets, maxChars?)  → string      // "- [title] text" lines for a prompt
sourceTitles(snippets)               → string[]    // for hint.sources
rememberCall(callId, scorecard)      → void        // called by scoring; you never need to call it
```

All of them are safe to call unconditionally: they return empty results when RAG is off or fails.

## 6. Contract additions (`packages/contracts`)

- `knowledge.ts`: `KNOWLEDGE_SCOPES`, `knowledgeSnippetSchema`, `knowledgeSourceSchema`,
  `createKnowledgeDocSchema`, `knowledgeStatusSchema`.
- `ws-live.ts`:
  - **new event** `{ type: "customer_memory", customerLabel, items: { text, source, at }[] }`, sent
    right after `call_started` (`items: []` for a first-time caller);
  - `hint.sources?: string[]`: titles of the knowledge the hint was grounded in.
- Fixtures: `liveCallTimeline` now includes a `customer_memory` event and cited hints;
  `fixtures/knowledge.ts` has sample sources and snippets for the mock API.

## 7. Demo content must change together ⚠️

The scenario, personas, CRM fields and the RAG seed describe **one** fictional business (OnFloor Ads
selling local advertising to restaurants). When the demo scenario or personas change, **reseed the
knowledge base to match**, or the judge and copilot will ground themselves in the wrong prices,
plans and policies:

| Change | Also update |
|---|---|
| Scenario (`packages/contracts/fixtures/scenarios.ts`): product, objective, policies | `apps/server/knowledge/*.md` (prices, plans, policies, competitor facts), then `bun run db:seed` or `POST /api/knowledge/docs/playbook/reindex` |
| Personas (`fixtures/personas.ts`): business type, current plan, objections | Playbook objection counters + competitor facts |
| Mock CRM fields (`packages/contracts/src/crm.ts`) | Playbook "account changes" + `crmRequests` in personas |
| Live policies (`apps/server/src/modules/live/policies.ts`) | Playbook "Discounts and approvals" / "Compliance" sections |

Old org docs aren't removed by a reseed of a *different* source name: delete them with
`DELETE /api/knowledge/docs/:source`. Agent, golden and customer memories from old calls can be wiped by
dropping the Qdrant collection (and clearing `knowledge_sources`) before the final demo.

## 8. Limits & next steps

- Copilot grounding adds one embedding call (~0.3–1s) per customer turn. Keep the keyword fast path for
  instant hints, and use RAG on the LLM hint path (see `03-tushar-live.md` §3a).
- Golden lines need calls scoring ≥ 75 before they exist; until then the judge writes its own.
- Still future (`06-future-scope.md`): living personas (merging repeat-caller personas), manager Q&A over
  calls, PII scrubbing before embedding.
