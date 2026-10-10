# OnFloor: Future Scope

> **Not part of the 24h build**, unless noted as built. We pick these up once the demo flow in
> `00-overview.md` §7 works end to end.

---

## 1. RAG: ✅ built. See `07-rag.md`

The core shipped: Mastra + **Qdrant** (instead of the pgvector originally planned), Gemini embeddings,
scopes `org_docs` / `golden` / `agent` / `customer`, a grounded QA judge, agent weak spots in the
simulator, customer memory on the live HUD, and automatic write-back after every scored call.

Still future on top of it:

| Item | What | Where it plugs in |
|---|---|---|
| Grounded copilot hints | LLM hint path retrieves playbook facts + customer memory (spec'd, Tushar) | `03-tushar-live.md` §3a |
| Living personas | A repeat caller's new call **merges** into their existing persona instead of creating a new one | persona extraction: look up `customerMemory` + the previous persona by `externalCustomerId` |
| Manager Q&A | "Which agents gave unapproved discounts this week?" over all calls | new `golden`/`agent`/`customer` cross-scope search for managers + an LLM answer step |
| PII scrubbing | Strip phone numbers and payment details from transcripts before embedding | `rememberCall()` |
| Knowledge admin page | Upload/replace/delete org docs in the UI | API + hooks exist (`useKnowledgeDocs`, `useUploadKnowledgeDoc`) |

## 2. Other future items (from the PRD's out-of-scope column + build learnings)

| Area | Item |
|---|---|
| Telephony | Twilio / Exotel / Avaya / Genesys / Cisco integrations beyond Telegram; SIP media streams into the same ingest WS |
| Simulator | Multiple industry presets (insurance, telecom, banking), multi-tab enterprise CRM replicas, scenario authoring UI |
| Voice | Voice cloning of the real customer for replays (with consent), more Indic languages via Sarvam (Tamil, Telugu, Kannada, Bengali) |
| Gemini | Gemini Live API (native audio in/out) for lower-latency copilot and simulator turns |
| Analytics | Long-term agent performance dashboards, cohort comparison, manager alerts |
| Platform | Multi-tenant orgs, SSO, role-based access for QA auditors, call-recording consent flows |

## Custom client (simulator)

Let the agent fill in their own client before starting a simulation (restaurant, owner, DRR, top
items, who answers, their questions), instead of picking a seeded merchant. Built as a merchant with
`source: "custom"` (the enum, the `merchants` table and the cast logic in `modules/sim/engine.ts`
already support it); the picker would POST it and start with its id. No behaviour presets needed:
the agent still picks/tunes the persona in step 2.
