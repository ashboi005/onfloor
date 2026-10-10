# OnFloor: Future Scope

> **Not part of the 24h build.** We pick this up only once the demo flow in `00-overview.md
> §7` works end to end. The one thing that ships now is the **empty `services.knowledge`
> seam** (Ashwath, D3), so none of this needs call-site changes later.

---

## 1. Dynamic RAG for personalisation (Mastra, TypeScript)

### Why
Right now every hint, persona and golden line is generated from the prompt alone. RAG grounds
them in **our own data**: the company's real price sheets and policies, *this* customer's
history, and *this* agent's past mistakes. That makes OnFloor personalised instead of
generic, and it's the natural next pitch after the hackathon.

### Stack
- **Mastra** (`@mastra/core`, `@mastra/rag`) inside `apps/api`, as a new module
  `modules/knowledge/`. TypeScript end to end, so no new runtime.
- **Vector store:** `pgvector` in the **same Postgres** (`@mastra/pg`). No new infra, and
  rows can join to `calls` / `personas` / agents by id.
- **Embeddings:** Gemini embeddings (`gemini-embedding-001`) or an embedding model through Merge.
  Chosen by `EMBEDDING_PROVIDER`, mirroring `LLM_PROVIDER`.
- **Chunking:** Mastra `MDocument` (recursive/markdown strategies) for documents. For
  transcripts, one chunk per *moment* (a scorecard moment ± 2 turns), not fixed windows.

### The seam (ships now, empty)
```ts
// apps/api/src/core/services/knowledge.ts
interface KnowledgeService {
  retrieve(query: string, scope: KnowledgeScope, k?: number): Promise<Snippet[]>  // [] for now
  ingest(doc: KnowledgeDoc): Promise<void>                                         // no-op for now
}
type KnowledgeScope =
  | { kind: "org_docs" }                       // price sheets, policy manual, product FAQ
  | { kind: "customer"; customerKey: string }  // Telegram user id / merchant id
  | { kind: "agent"; agentId: string }         // that agent's past mistakes
  | { kind: "golden" }                         // top-rep moments
interface Snippet { id: string; text: string; source: string; score: number; meta: Record<string, unknown> }
```

### Where it plugs in

| # | Use | Index (ingest trigger) | Consumer | What changes for the user |
|---|---|---|---|---|
| 1 | **Grounded copilot hints** | `org_docs`: upload price sheets, policy manual, product FAQ (admin upload) | Tushar's copilot prompt, `retrieve(customerTurn, org_docs)` | Hints quote *real* numbers ("Premium includes 12k guaranteed impressions in 5 km") instead of plausible ones. Guardrails cite the actual policy clause |
| 2 | **Customer memory** | `customer`: on `scorecard_ready` for live calls, embed the summary + objections + commitments made | HUD on `call_started` → "Last call (3 Oct): complained about weekend leads, was promised a callback" | The agent walks in knowing the customer's history |
| 3 | **Living personas** | `customer`: each new live call with the same customer | Persona extraction merges into the *existing* persona instead of creating a new one | Replays get more accurate with every real call |
| 4 | **Real golden standards** | `golden`: moments scored `good` from calls with `overall ≥ 85` | Scoring judge `retrieve(mistakeContext, golden)` | "Golden Standard" lines come from what our best reps actually said, not from what the LLM imagines |
| 5 | **Personalised training** | `agent`: every `mistake` moment, tagged by dimension | Simulator prompt compiler: the persona's tactics are biased toward that agent's weak spots. A "recommended next scenario" on the dashboard | Each trainee's simulator gets harder exactly where they're weak |
| 6 | **Manager Q&A** | all of the above | A chat panel: "Which agents gave unapproved discounts this week?" | QA without listening to calls |

### Rollout order
1 (pure win, small) → 4 → 2 → 5 → 3 → 6.

### Guardrails
- Scope every retrieval by org, and by customer/agent where relevant. No cross-customer leakage.
- Strip PII (phone numbers, payment details) from transcripts before embedding.
- Latency budget for the copilot path: retrieval ≤ 150 ms, so keep `k` small and use pgvector HNSW.

---

## 2. Other future items (from the PRD's out-of-scope column + build learnings)

| Area | Item |
|---|---|
| Telephony | Twilio / Exotel / Avaya / Genesys / Cisco integrations beyond Telegram; SIP media streams into the same ingest WS |
| Simulator | Multiple industry presets (insurance, telecom, banking), multi-tab enterprise CRM replicas, scenario authoring UI |
| Voice | Voice cloning of the real customer for replays (with consent), more Indic languages via Sarvam (Tamil, Telugu, Kannada, Bengali) |
| Gemini | Gemini Live API (native audio in/out) for lower-latency copilot and simulator turns |
| Analytics | Long-term agent performance dashboards, cohort comparison, manager alerts |
| Platform | Multi-tenant orgs, SSO, role-based access for QA auditors, call-recording consent flows |
