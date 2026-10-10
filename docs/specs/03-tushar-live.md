# Spec: Live "Shadow AI" Copilot: backend + dashboard (Tushar)

You own Pillar 2 **end to end**: getting call audio out of Telegram, turning it into a
speaker-labelled transcript, running the copilot brain, storing the call, **extracting a
persona** that Pillar 1 can replay, and (since 2026-10-10) **the live call dashboard UI** itself (§7).

Your folders: `apps/telegram-bridge/` (Python), `apps/server/src/modules/live/` (TS),
`apps/web/src/app/(app)/live/` and `apps/web/src/components/hud/` (Next.js).
Your output contract: the `/ws/live` events in `01-contracts.md §10`, consumed in the browser only
through `useLiveCall()` (Ashwath's hook). `fixtures/live-call.ts` is the reference stream: the mock
HUD runs on it, and your real stream should look like it.

Review of your first branch, with measurements: `docs/reviews/2026-10-10-live-copilot.md`.

## Decisions (2026-10-10, Ashwath)

These answer the review's open questions and override anything older in this spec:

1. **Hints: as fast as possible, and several can be on screen at once.** Drop the fixed 2s
   budget. Show an AI hint or sentiment update whenever it arrives, even 3–5s late. Don't discard a
   result because a newer customer turn came in; just keep stale hints from repeating
   (near-duplicate suppression stays). The HUD stacks multiple live hints (§7). The keyword fast path
   stays the instant layer.
2. **A persona must never make the agent break policy.** `crmRequests` may only contain changes an
   agent is *allowed* to make. A customer demand that breaches policy (a discount above 10%,
   next-day activation, a refund promise, guaranteed orders) is **not** a CRM request. Put it in
   `objections`/`tactics` instead, so the replayed persona still *pushes* for it and the agent is
   scored on refusing it.
3. **One agent per bridge (`LIVE_AGENT_EMAIL`) is fine** for the demo. No multi-agent work.
4. **You own the live dashboard frontend** (§7, moved from Harnoor's spec).

## 0. Spike first (H0–3, go/no-go)

> **Step-by-step setup, bridge skeleton and the STT protocol are in `03a-telegram-voice-guide.md`.**
> The summary below is the short version.

Telegram's **Bot API cannot do voice calls.** Calls need an MTProto **user account**
(a "userbot"). The likely tool is **py-tgcalls** (Pyrogram/Telethon + ntgcalls). It
supports private 1:1 calls and group voice chats, playing a mic/file into a call, and
receiving raw incoming frames.

Setup to prove:
- A dedicated Telegram account = the **"OnFloor agent line"**, logged in by the bridge on
  the agent's laptop (`api_id`/`api_hash` from my.telegram.org).
- The client (a teammate's phone during the demo) calls that account. The bridge
  **auto-answers**, plays the **agent's laptop mic** into the call, and receives the
  **client's audio** as frames.
- That gives two clean channels with no diarization needed:
  outgoing = `agent`, incoming = `customer`. Keep that split. Talk-ratio and
  interruptions depend on it.
- The agent hears the customer through laptop speakers/headset from the bridge's playback.

**Go criteria by H+3:** a 2-minute call where you can (a) hear each other, and (b) dump
both channels to separate 16 kHz mono PCM/WAV files. If it fails, tell Ashwath right
away. Plan B is a **group voice chat** (all three join, the bridge records per-participant
or mixed audio and we do diarization). Plan C is the file-replay fallback (§5) only.

## 1. Bridge → API ingest (internal contract, you design it, suggested shape)

The bridge stays thin. It moves audio and does no AI.

```
WS  /internal/live/ingest            (header: x-bridge-secret: $BRIDGE_SECRET)
bridge → api:
  { type: "call_started", telegramCallId, customer: { id, displayName, username? } }
  binary frames: 1-byte channel (0 = agent, 1 = customer) + PCM16LE 16 kHz mono, ~100ms chunks
  { type: "call_ended", reason }
api → bridge:
  { type: "ack", callId }
```
Also upload the full mixed + per-channel recordings to storage at the end
(`services.storage`) → `calls.setRecording(callId, url)`.

## 2. Live transcription (`modules/live/transcribe.ts`)

- One ElevenLabs Scribe realtime socket **per channel**, opened server-side with
  `services.stt.mintRealtimeToken()` + `realtimeUrl()` (the same code the simulator uses, so
  Hinglish behaves the same). Language from `LIVE_DEFAULT_LANGUAGE` (en/hi/hinglish). Protocol in `03a` §4.
- Partial → emit `transcript_partial`. Committed → `calls.appendTurn()` then emit
  `transcript_final` with `startMs`/`endMs` relative to call start.

## 3. Copilot brain (`modules/live/copilot/`)

Runs on every `transcript_final` (and on a 1s tick for silence). Keep it **fast and
cheap**: keyword hints land instantly, and AI hints land as soon as the model answers
(Decision 1: no fixed deadline; measured 2.4–5.5s today).

| Signal | How | Event |
|---|---|---|
| **Pitch / objection hints** | On each *customer* final: LLM (`job: "copilot"`, fast model) with the last ~8 turns + playbook → JSON `{ hint: null \| { kind, title, body } }`. Debounce: at most 1 hint per customer turn, and drop a hint that's a near-duplicate of the last 3 | `hint` |
| **Playbook** | `modules/live/playbook.ts`: objection → counter pairs (commission too high → guaranteed reach, "competitor is cheaper" → value comparison, …) + upsell triggers. Inject into the prompt **and** use keyword fast-paths so common objections hint instantly with no LLM wait | `hint` |
| **"Do Not Say" guardrails** | On each *agent* partial + final: (1) regex/keyword fast-path for the policy list (discount >10%, "next-day activation", "guarantee", refund promises) on **partials**, so the warning can land *before* they finish the sentence; (2) LLM check on finals for subtler violations | `guardrail` |
| **Sentiment radar** | On each customer final: fast LLM JSON `{ patience, frustration, engagement }` 0–100, smoothed (EMA α≈0.5) | `sentiment` |
| **Talk ratio / dead air** | Pure arithmetic over turn windows on a 1s tick. `dead_air` when both silent >6s, `monologue` when the agent talks >30s straight or agentTalkPct >70% over the last 2 min | `talk_metrics` |

Persist every emitted event to `live_events` so the call can be re-shown after the fact.

Policies: use the scenario `policies` shape from contracts. Keep a default live policy
list in `modules/live/policies.ts` and share it with Ashwath, because scoring uses the same list.

### 3a. RAG: what's already wired, and what's yours

Full design: `07-rag.md`. Short version for the live pillar:

| | Status | What to do |
|---|---|---|
| **Customer memory at call start** | ✅ wired in `session.ts` `startLiveCall()`: emits `customer_memory` right after `call_started` | Make sure the bridge's `call_started` carries `customer.id` (it does, it becomes `externalCustomerId`). That id is the memory key, so keep it stable per Telegram user |
| **Writing memory after the call** | ✅ automatic: `scoreCall()` → `rememberCall()` writes customer memory, agent mistakes and golden lines | Nothing. Just keep calling `scoreCall` in `finishLiveCall` |
| **Grounded copilot hints** | 🔴 yours, in the LLM hint path (`copilot/index.ts`) | See below |
| **Repeat-caller context in hints** | 🟡 optional | Pass `customerMemory(customerKey)` into the hint prompt too |

Grounding the LLM hint (keep the keyword fast path as it is: it's instant and needs no RAG):

```ts
import { customerMemory, formatSnippets, groundingFacts, sourceTitles } from "../../knowledge";

// on each customer final, in the LLM hint path:
const [facts, memory] = await Promise.all([
  groundingFacts(turn.text, 3),                         // playbook: prices, policies, counters
  customerKey ? customerMemory(customerKey, turn.text, 2) : Promise.resolve([]),
]);
const prompt = `...existing prompt...
APPROVED FACTS (quote numbers only from here):
${formatSnippets(facts, 1200)}
${memory.length ? `THIS CUSTOMER BEFORE:\n${formatSnippets(memory, 600)}` : ""}`;
// …LLM call…
hub.emit(callId, { type: "hint", hint: { ...hint, sources: sourceTitles(facts) } });
```

- The cost is one embedding call (~0.3–1s, cached per line). Fire it as soon as the customer's
  **partial** stabilises, not on the final, if you want the time back.
- Every helper returns `[]` when RAG is off, so this code is safe with or without Qdrant.
- `customerKey` = the call's `externalCustomerId` (keep it on your per-call state from `call_started`).

## 4. End of call → scorecard → persona

On `call_ended`:
1. `calls.end(callId)` → emit `call_ended`.
2. `await scoring.scoreCall(callId)` (Ashwath's) → emit `scorecard_ready`.
3. **Persona extraction** (`modules/live/extract-persona.ts`): LLM (`job: "persona"`) over
   the full transcript → JSON validated by `createPersonaSchema`:
   - Infer `archetype`, `traits`, `goals`, `objections` and `tactics` *from what the
     customer actually did*.
   - `catchphrases` and `openingLine` are **verbatim** customer lines (the replay
     sounds like them because of these).
   - `crmRequests`: the account changes the customer asked for, mapped onto `CRM_FIELDS`
     (empty is fine). **Only changes an agent may legitimately make** (Decision 2): a demand that
     breaches policy goes into `objections`/`tactics`, never into `crmRequests`.
   - `voiceId`: pick from a small cast table by language + inferred gender/age (no voice
     cloning for the MVP. Cloning from the recording is a stretch goal).
   - `source: "live_call"`, `sourceCallId: callId`.
   Then `personas.createPersona(...)` → `calls.setPersona(callId, persona.id)` → emit
   `persona_ready`.

**That's the whole Pillar 1 seam.** Once a persona row exists with that shape, the
simulator can replay it. Nothing else is needed from you.

After `scoreCall`, the call is also written into the knowledge base automatically (customer memory
for the next time this person calls, plus the agent's weak spots for the simulator). See §3a.

## 5. Demo fallback: `POST /api/live/calls/replay-file` (must have)

Accepts a stereo WAV (L = agent, R = customer) or two mono files. It streams them in real
time (not faster) through the **same** path as the bridge ingest. So we can demo the full
HUD with no Telegram and no network luck. Record 2 good demo calls by H+16 and keep them in
`apps/server/demo-audio/`.

## 6. Routes you own

`GET /api/live/active`, `WS /ws/live/:callId` (also accept `active` to attach to whichever
call is live), `POST /api/live/calls/replay-file`, `WS /internal/live/ingest`.

## 7. Live dashboard frontend `/live` (moved from Harnoor, 2026-10-10)

Rules (same as every frontend owner): **no `fetch`/`WebSocket` in UI code.** The page talks only to
`useLiveCall("active" | callId)` from `@/hooks/use-live-call` (owner: Ashwath; ask for anything it
doesn't expose). Types come from `@onfloor/contracts`; UI primitives come from `packages/ui` (Mansukh).
**You're not starting from scratch.** Harnoor already built the dashboard before the hand-over (merged on
`main`). Take it over and finish it:

| File | Component | State |
|---|---|---|
| `app/(app)/live/page.tsx` | the dashboard page, `useLiveCall("active")`, dev "Simulate a call" | ✅ built |
| `components/hud/customer-memory.tsx` | `CustomerMemory`: "Last time…" card | ✅ built |
| `components/hud/hint-stack.tsx` | `HintStack`: primary hint + source chips (📘) | 🟡 older hints are **collapsed** behind a toggle. Decision 1 wants several hints **visible** at once, each with its own countdown |
| `components/hud/guardrail-banner.tsx` | `GuardrailBanner` | ✅ built |
| `components/hud/sentiment-radar.tsx` | `SentimentRadar` + `recommendation()` | ✅ built (it will only move once the copilot LLM path works: review C1) |
| `components/hud/talk-metrics.tsx` | `TalkMetrics` | ✅ built (alerts depend on review C3/C4) |
| `components/hud/mini-transcript.tsx` | `MiniTranscript` | 🟡 add the **Original \| English** subtitle toggle (below) | `NEXT_PUBLIC_USE_MOCKS=true` replays `fixtures/live-call.ts`,
so you can build it without a running call.

The agent keeps this open on a second monitor (or half the screen) while on the Telegram
call. It auto-attaches with `useLiveCall("active")`.

- **Waiting state:** "Waiting for a call on the OnFloor line…", with a pulsing indicator.
- **Top strip:** customer name, call timer, language, connection dot.
- **Customer memory card ("Last time…")** (new, RAG): `live.customerMemory` is a list of
  `{ text, source, at }` from earlier calls with this customer. It arrives ~1s after the call
  starts. Show it as a compact card near the customer name: date (`at`) + text, max 3 items,
  collapsible. With `[]` show "First call with this customer" (or nothing). It's in the mock
  timeline already (2 items for Suresh), so you can build it now.
- **Sentiment radar:** three gauges (patience, frustration, engagement) + a small sparkline
  from `sentiment.history`. One recommendation word derived on the client:
  `frustration > 65` → "DE-ESCALATE", `engagement > 70 && patience > 50` → "CLOSE",
  else "DISCOVER".
- **Hint stack (centre, biggest):** **several hints can be live at once** (Decision 1). Newest
  on top as the large card (kind icon, title, body), the others stacked below it, each with its own
  `ttlMs` countdown bar and pin/dismiss buttons. AI hints may arrive a few seconds after the keyword
  hint for the same turn, so both can show. If `hint.sources` is set (RAG: the hint was grounded in
  the playbook), show it as a small chip under the body, e.g. "📘 OnFloor Ads playbook ›
  Competitor facts". It tells the agent the number is safe to quote.
- **Guardrail banner:** `critical` = full-width red banner + a short audio blip, sticky
  until dismissed. `warn` = amber toast. These must be impossible to miss.
- **Talk metrics:** talk-ratio bar (agent vs customer), silence counter that turns
  amber at 4s and fires a "Say something — dead air" nudge on `alert: "dead_air"`.
  `monologue` → "Pause and ask a question".
- **Mini transcript** (right rail): last ~6 turns + partials, speaker colours, with the
  **Original | English** subtitle toggle:

  **Subtitles (raw ↔ English).** Every transcript turn has an optional `turn.translation`: the
  English version. It's the same as the text for English calls; for Hindi/Hinglish it arrives **1–2.5s
  after the turn** (Merge, never Gemini) and the hook merges it in automatically. Use the shared helper so
  every screen behaves the same and the choice is remembered:
  
  ```ts
  import { subtitleText, useSubtitleMode } from "@/lib/subtitles";
  const [mode, setMode] = useSubtitleMode();            // "raw" | "english" (saved per browser)
  const { text, pending } = subtitleText(turn, mode);   // pending = English not here yet
  ```
  
  Put a small toggle (`Original | English`) above the transcript. In English mode show `pending` lines in
  their raw text, dimmed, with a "translating…" hint, then swap in place when the subtitle lands (no layout
  jump). Live partials are always raw (they're never translated). Mock mode has delayed subtitles in the
  timeline, so you can build this now.

  Server side this already works for live calls: `appendLiveTurn()` fires `translateTurn()` and emits
  `transcript_translation` (3 lines added by Ashwath in your `session.ts`, marked `[added by Ashwath]`;
  keep them if you refactor). Translations are also saved, so `GET /api/calls/:id` returns them.
- **After the call:** "Scoring…" → when `scorecardReady`, a "View scorecard" button
  (`/calls/[id]`). When `personaId` arrives, a celebratory card: "Persona created from
  this call → Replay in simulator" (`/simulator/new?replay=<callId>`). This is demo
  beat 4, so make it look good.

Make the HUD legible at a glance. Big type, few words, colour carries meaning. Nobody
reads paragraphs while they're on a call.

## What you get from Ashwath (and when)

| Thing | Signature | Real by |
|---|---|---|
| `services.llm.json<T>({ job, messages, schema })` / `.chat()` | see `02` §D4 | H+3 |
| `services.stt.mintRealtimeToken()` + `realtimeUrl(input, token)` | you own the socket wrapper in `modules/live/transcribe.ts` | H+3 |
| `services.storage.put(key, bytes, type) → url` | | H+3 |
| `calls` repo | `create, appendTurn, end, setPersona, setRecording, get` | H+3 |
| `scoring.scoreCall(callId)` | stub returns fixture → real by H+12 | |
| `personas.createPersona(input)` | real by H+3 (it's an insert) | |
| Knowledge helpers (`modules/knowledge`) | `groundingFacts`, `customerMemory`, `customerMemoryEvent`, `formatSnippets`, `sourceTitles` (`07-rag.md` §5) | ✅ real |

## What you hand back

| To | What | By |
|---|---|---|
| Everyone | Spike result (go / plan B / plan C) | H+3 |
| Your HUD (§7) | `/ws/live` emitting real events for at least transcript + sentiment | H+12 |
| Ashwath | Default live policy list | H+8 |
| All | 2 recorded demo calls + working replay-file path | H+16 |

## Env (yours)
```env
TELEGRAM_API_ID=
TELEGRAM_API_HASH=
TELEGRAM_SESSION_STRING=      # exported once after the first interactive login
BRIDGE_SECRET=
API_INGEST_URL=ws://localhost:3000/internal/live/ingest
LIVE_DEFAULT_LANGUAGE=hinglish
```
