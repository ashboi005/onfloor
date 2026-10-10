# Spec: Core Architecture & Simulator Backend (Ashwath)

**You are the critical path for H0–2.** Everyone else is building on the mocks you push. Ship
contracts and stubs before you write any real logic.

> **Status:** D1–D9 done and verified headlessly (real Gemini + ElevenLabs/Sarvam). Remaining: browser
> pass on `useSimCall` audio, prompt tuning, Merge key + `llm:check`.

## Deliverables in unblock order

### D1. Scaffold + contracts (by H+1.5): unblocks everyone
- Bun workspaces: `apps/web` (Next 16), `apps/server` (Elysia), `apps/telegram-bridge` (empty
  dir + README for Tushar), `packages/contracts`.
- Root scripts: `dev` (web + server), `check-types`,
  `db:generate`, `db:migrate`, `db:seed`, `contracts:jsonschema`.
- `packages/contracts`: every schema in `01-contracts.md` + every fixture in §11.
  The fixtures must pass `schema.parse()` at import time in dev.
- `.env.example` with every var below. Root `README` with setup steps.

### D2. Web data layer + hook stubs (by H+2): unblocks Harnoor & Mansukh
- `apps/web/src/lib/api/`: an `ApiClient` interface, with `mockClient` (fixtures, 300ms fake
  latency) and `httpClient` (fetch + Zod parse) implementations. `NEXT_PUBLIC_USE_MOCKS`
  picks one. TanStack Query hooks on top of it: `useScenarios`, `usePersonas`, `useCall`,
  `useCalls`, `useScorecard` (polls while 404), `useStartSim`, `useReplayCall`, `useMe`.
  In mock mode, auth is bypassed with a fixture agent.
- `apps/web/src/hooks/use-sim-call.ts` (`useSimCall`): the **only** thing Harnoor's sim UI talks to:
  ```ts
  useSimCall(start: SimSessionStart | null) => {
    status: "connecting" | "live" | "ending" | "ended" | "error",
    turns: TranscriptTurn[], partialAgentText: string,
    personaState: "idle" | "thinking" | "speaking",
    patience: number, elapsedMs: number, remainingMs: number,
    pendingCrmRequests: (CrmRequest & { atMs: number })[],
    micLevel: number, personaLevel: number,      // 0–1, for visualisers
    muted: boolean, setMuted(b): void,
    reportCrmAction(a: Omit<CrmAction, "atMs">): void,
    end(): Promise<{ callId: string }>,
    error: { code: string; message: string; retryable: boolean } | null,
  }
  ```
  Mock mode replays `fixtures/sim-call.ts` and fakes the mic. Real mode does the mic,
  ElevenLabs realtime STT, persona audio playback and barge-in (AudioWorklet mic capture, 16 kHz PCM framing,
  echo rejection).
- `apps/web/src/hooks/use-live-call.ts` (`useLiveCall`):
  ```ts
  useLiveCall(callId: string | "active") => {
    call: Call | null, status: "waiting" | "live" | "ended",
    turns: TranscriptTurn[], partial: Record<Speaker, string>,
    hints: Hint[], guardrails: GuardrailAlert[],      // newest first, expired hints removed
    sentiment: { patience; frustration; engagement; history: {atMs, ...}[] },
    talk: { agentTalkPct; currentSilenceMs; alert },
    scorecardReady: boolean, personaId: string | null,
    dismissHint(id): void, pinHint(id): void,
  }
  ```
  Mock mode replays `fixtures/live-call.ts`. Real mode is a reducer over `/ws/live` events.
  Tushar's events are only ever consumed through this reducer.

### D3. API skeleton + service seam (by H+3): unblocks Tushar
- Env: varlock (`apps/server/.env.schema` → generated `src/env.ts`, imported via `env.server.ts`).
- `core/auth`: Better Auth (instance, route guards, drizzle adapter, the generated
  `auth.ts` schema). Email/password, sign-up off, seeded accounts. Next.js uses
  `better-auth/react` client + a `/login` page. Add the Next origin to `TRUSTED_ORIGINS`.
- `packages/db`: Drizzle schema for `agents` (= Better Auth `user`, role `agent`|`manager`), `personas`, `scenarios`, `calls`,
  `transcript_turns`, `crm_actions`, `scorecards`, `live_events` (append-only HUD log).
  JSON columns for persona/scorecard bodies; don't normalise.
- `core/services/index.ts`: a lazy service registry (`services.llm`,
  `services.tts`, `services.stt`, `services.storage`). Also add an **empty
  `services.knowledge` interface** (`retrieve(query, scope) → Snippet[]`, returning `[]`) so the
  RAG work in `06-future-scope.md` plugs in without touching call sites.
- Module public APIs that Tushar imports. **Stub these first, then make them real:**
  ```ts
  // modules/personas/index.ts
  export function createPersona(input: CreatePersona): Promise<Persona>
  export function getPersona(id: string): Promise<Persona>
  // modules/scoring/index.ts
  export function scoreCall(callId: string): Promise<Scorecard>   // reads transcript from DB
  // core/calls (shared repo)
  export const calls = { create, appendTurn, end, setPersona, setRecording, get }
  ```

### D4. LLM provider toggle
Both providers expose OpenAI-compatible chat completions, so the LLM layer is
one adapter with a base URL and key chosen per job.

```env
LLM_PROVIDER=merge                 # merge | gemini — the default for every job
LLM_PROVIDER_ROLEPLAY=             # optional per-job override
LLM_PROVIDER_COPILOT=
LLM_PROVIDER_SCORING=
LLM_PROVIDER_PERSONA=

MERGE_API_KEY=
MERGE_BASE_URL=https://api-gateway.merge.dev/v1/openai
MERGE_MODEL_ROLEPLAY=              # fill from the Merge dashboard
MERGE_MODEL_FAST=
MERGE_MODEL_SCORING=

GEMINI_API_KEY=
GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
GEMINI_MODEL_ROLEPLAY=gemini-2.5-flash
GEMINI_MODEL_FAST=gemini-2.5-flash-lite
GEMINI_MODEL_SCORING=gemini-2.5-pro
```
- Interface: `chat()`, `json<T>(schema)`, plus `stream()` for roleplay
  latency. Jobs: `roleplay | copilot | scoring | persona`.
- On a 429 from Gemini, retry once on Merge if `LLM_FALLBACK=true`, and log it. That's
  how we stay in the Gemini track without rate limits killing the demo.
- **Gemini track pitch (suggestion):** route `scoring` and `persona` to Gemini. They're
  few calls each, long context, structured JSON, and they're the "intelligence" judges
  will look at. Keep `roleplay` and `copilot` on Merge (high frequency, latency-bound).
  Stretch goal: Gemini Live API (native audio) for the copilot. Talk to Tushar first.

### D5. Voice (multilingual)
- `services.tts`: ElevenLabs + Sarvam adapters, routed by the voiceId
  `elevenlabs:`/`sarvam:` prefix.
- STT: `services.stt` (single-use ElevenLabs realtime token, `realtimeQuery()` with
  Hinglish `secondary_languages` handling). Two consumers: the browser (sim)
  and **Tushar's server-side sockets** for Telegram audio. Expose `mintRealtimeToken()` +
  `realtimeUrl(input, token)` to him by H+3 (see `03a` §4). Languages: en/hi/Hinglish only.
- `services.tts.synthesize(text, voiceId, language) → { audio: Uint8Array, contentType }`.

### D6. Simulator engine (`modules/sim`)
- The prompt compiler takes a `Persona` + `Scenario`.
  It injects: traits, tactics, objections, catchphrases, speech style, and the
  **crmRequests script**. The persona has to ask for each request naturally within the
  first ~60% of the call. Output protocol: the LLM returns its line plus
  optional control tags (`<crm_request id="..."/>`, `<hang_up/>`), parsed and stripped
  before TTS. A `crm_request` tag emits the WS event and stamps `atMs`.
- Impatience mechanic: patience starts at `traits.patience*10`. It drops on dead air
  (>6s with no agent turn), monologues (>25s), dodged questions and policy violations.
  It rises on direct answers. At 0 the persona hangs up. Emit `patience` every turn. Dead
  air triggers an unprompted persona nudge ("Hello? Are you still there?").
- Interruptions: the impatient archetype cuts the agent off when an agent turn
  runs past 20s (server sends the persona line early).
- Every `crm_action` is persisted with `atMs`.
- On end: persist, set status `scoring`, run `scoreCall` detached.

### D7. Scoring engine (`modules/scoring`)
Four dimensions:
- **LLM judge** (job `scoring`) returns per-dimension score, verdict, evidence turn ids,
  `moments[]` with `goldenLine`, and `summary`. Policies from the scenario go into the
  prompt. For live calls a default policy set is used.
- **Computed in code:** `overall` (weighted, renormalised), `grade`, all `stats`
  (talk %, interruptions = overlapping turn windows, dead air = gaps >5s, wpm), and
  **`crmAudit`**: for each `crmRequest` the persona actually voiced, compare the final
  CRM value to the expected one, and measure latency to the first matching action.
  `toolAccuracy` = 70% correctness + 30% latency band. It's `null` for live calls.

### D8. Replay
`POST /calls/:id/replay`: look up the live call's `personaId` (set by Tushar), start a sim
session with that persona and the default scenario, and set `replayOfCallId`. The persona's
`catchphrases` and `openingLine` come from the real call, so the replay sounds like that
customer.

### D9. Seed data
3 agent accounts + 1 manager (Better Auth), 1 scenario, 3 seed
personas (Impatient Decision-Maker, Price-Squeezer, High-Maintenance Skeptic) with voices
cast in English/Hinglish (ElevenLabs) and at least one Sarvam Hindi voice.

### D10. RAG (`07-rag.md`)
Mastra + Qdrant (`VECTOR_DATABASE_URL`), Gemini embeddings via the key pool. Scopes: `org_docs`
(playbook), `golden`, `agent`, `customer`. Wired: grounded judge, agent weak spots in the simulator
prompt, customer memory at live-call start, automatic write-back after scoring. ✅ Done.

### D11. Custom personas + English subtitles ✅
- Persona tuning (`startSim({ tuning })`, `POST /api/personas` → `source: "custom"`), tone driven by aggression.
- Subtitles: job `translate` pinned to Merge (`MERGE_MODEL_TRANSLATE=gpt-5.4-mini`, no Gemini fallback),
  `modules/translation` (ordered per call, context lines, idiom hints), `transcript_turns.translation`,
  `turn_translation` / `transcript_translation` events, `lib/subtitles.ts` for the UI toggle.

## What you hand to others, and when

| To | What | By |
|---|---|---|
| All | Repo, contracts, fixtures, `.env.example`, shared DB URL | H+1.5 |
| Harnoor | `useSimCall`, `useLiveCall` mock mode, `lib/api` mock | H+2 |
| Mansukh | `useScorecard`, `useCalls`, `usePersonas` mock | H+2 |
| Tushar | API skeleton, `services.llm`/`stt` real, stubs for `createPersona`/`scoreCall`/`calls` | H+3 |
| Tushar | Real `scoreCall`, `createPersona` | H+12 |
| Mansukh | Architecture diagram + 5 bullet "how it works" for the article | H+14 |

## Out of scope
Admin console, RAG (see `06-future-scope.md`; only the empty `services.knowledge` seam ships), video avatars, multiple
scenarios beyond one polished one (a second one is a stretch goal).
