# Spec: Live "Shadow AI" Copilot Backend (Tushar)

You own Pillar 2 end to end on the backend: getting call audio out of Telegram, turning it
into a speaker-labelled transcript, running the copilot brain that drives the HUD, storing
the call, and **extracting a persona** that Pillar 1 can replay.

Your folders: `apps/telegram-bridge/` (Python) and `apps/server/src/modules/live/` (TS).
Your output contract: the `/ws/live` events in `01-contracts.md §10`. Harnoor's HUD is
built against `fixtures/live-call.ts`, so **make your real stream look like that
fixture.** Use it as your acceptance test.

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
cheap**: the HUD is only useful if a hint lands within ~2s of the customer finishing.

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
     (empty is fine).
   - `voiceId`: pick from a small cast table by language + inferred gender/age (no voice
     cloning for the MVP. Cloning from the recording is a stretch goal).
   - `source: "live_call"`, `sourceCallId: callId`.
   Then `personas.createPersona(...)` → `calls.setPersona(callId, persona.id)` → emit
   `persona_ready`.

**That's the whole Pillar 1 seam.** Once a persona row exists with that shape, the
simulator can replay it. Nothing else is needed from you.

## 5. Demo fallback: `POST /api/live/calls/replay-file` (must have)

Accepts a stereo WAV (L = agent, R = customer) or two mono files. It streams them in real
time (not faster) through the **same** path as the bridge ingest. So we can demo the full
HUD with no Telegram and no network luck. Record 2 good demo calls by H+16 and keep them in
`apps/server/demo-audio/`.

## 6. Routes you own

`GET /api/live/active`, `WS /ws/live/:callId` (also accept `active` to attach to whichever
call is live), `POST /api/live/calls/replay-file`, `WS /internal/live/ingest`.

## What you get from Ashwath (and when)

| Thing | Signature | Real by |
|---|---|---|
| `services.llm.json<T>({ job, messages, schema })` / `.chat()` | see `02` §D4 | H+3 |
| `services.stt.mintRealtimeToken()` + `realtimeUrl(input, token)` | you own the socket wrapper in `modules/live/transcribe.ts` | H+3 |
| `services.storage.put(key, bytes, type) → url` | | H+3 |
| `calls` repo | `create, appendTurn, end, setPersona, setRecording, get` | H+3 |
| `scoring.scoreCall(callId)` | stub returns fixture → real by H+12 | |
| `personas.createPersona(input)` | real by H+3 (it's an insert) | |

## What you hand back

| To | What | By |
|---|---|---|
| Everyone | Spike result (go / plan B / plan C) | H+3 |
| Harnoor | `/ws/live` emitting real events for at least transcript + sentiment | H+12 |
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
