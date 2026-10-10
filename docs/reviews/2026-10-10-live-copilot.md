# Review: `tushar/live-copilot` (8bca44b)

Reviewer: Ashwath (with Claude) · 2026-10-10 · Status: **merged into `main`** (fast-forward), plus
integration fixes in `9c3addd`. Owner of every 🔧 item below: **Tushar**, unless marked otherwise.

## Verdict

Solid, careful work, and it integrates cleanly. It stays inside `modules/live`, `telegram-bridge` and
`demo-audio`, uses the shared contracts and services correctly, and already does the RAG grounding from
`07-rag.md`. Nothing architectural needs to change. The open items are **latency budgets, two detector
edge cases, a demo gap in WAV replay, and one product question**, all listed below with the evidence.

## What was verified (on macOS, real services)

| Check | Result |
|---|---|
| `bun run check-types` (6 workspaces) | ✅ pass, before and after integration |
| `bun test src/modules/live` | ✅ 18/18 pass, before and after integration |
| WAV replay through the **real** pipeline (73s stereo Hinglish call: ElevenLabs agent voice left, Sarvam customer voice right) | ✅ end to end: see the table below |
| Browser E2E on the integrated stack: HUD → dev simulate → scorecard → persona → replay in simulator | ✅ all checks pass |
| Real Telegram call | ⏳ not testable here (no bridge `.env` / demo phone), still your gate |

Real replay, event by event:

| What | Observed |
|---|---|
| Per-channel STT | ✅ Devanagari Hinglish, speakers never mixed, ~1–3s from speech end to final |
| Keyword hints | ✅ landed **3–5ms** after the customer final ("Commission pushback", "Competitor rate claim") |
| Partial guardrail | ✅ `pol_discount` (critical) fired on the agent's **partial**, 3s before the sentence finished |
| LLM hints / sentiment / final-turn policy check | ❌ **none ever arrived** (see C1) |
| `pol_activation` on "कल तक activate कर देंगे" | ❌ **missed** (see C2) |
| Dead air (real 7.5s gap) | ❌ not raised; the server measured ~5.7s (see C4) |
| `call_ended` → `scorecard_ready` → `persona_ready` | ✅ 16s and 24s after hang-up; scorecard caught both violations |
| 4 WAV archives + `recordingUrl` | ✅ written (`GET /api/calls/:id` initially 500'd: an env bug on my side, fixed) |
| Persona | ✅ verbatim quotes, `price_squeezer`, Sarvam voice, CRM requests premium + ₹50,000 (and see Q1) |

## Findings for you (🔧 Tushar)

### C1 · The copilot's LLM path never completes (high: no AI hints, sentiment or final-turn guardrails)

`copilot/index.ts` gives the LLM call `timeoutMs: 1500` inside a 2s `beforeDeadline`, and the RAG
retrieval also has to fit in those 2s. Measured with your exact call (`job: "copilot"`, `tier: "fast"`,
`live_customer_analysis` schema):

| Provider | Latency, 6 runs (ms) |
|---|---|
| Gemini `gemini-3.1-flash-lite` | 1508✗ 1510✗ 1505✗ at your 1.5s timeout; uncapped: 2561–5543 |
| Merge `zai/glm-5.3-flash` | 2362–4244 |

So every LLM hint, sentiment update and final-turn policy check is aborted, and the HUD's sentiment
gauges never move off the initial 60/30/50. The keyword hints and partial guardrails are unaffected,
which is why the demo *looks* half-right.

Options (your call): raise the budget for this path to ~5s (hints arriving 3–5s after the customer
finishes are still useful while the agent is answering; sentiment can be slower still), split hint
and sentiment into separate budgets, and/or set `LLM_PROVIDER_COPILOT=merge` if it measures faster on
the day. Whatever you choose, keep the keyword fast path as the instant layer.

### C2 · `pol_activation` misses mixed-script speech (high: critical guardrail silent)

ElevenLabs Scribe returned **"कल तक activate कर देंगे"**: Devanagari "कल तक" plus Roman "activate".
`FAST_PATHS.pol_activation` only matches all-Roman (`kal tak … activ`) or all-Devanagari
(`कल … चालू|एक्टिव`). With C1 also failing, nothing caught it. Mixed script is the *normal* STT output
for Hinglish, so every detector should accept either script on each side, e.g.
`(?:kal tak|tomorrow|next[- ]day|कल)\b.*(?:activ\w*|chalu|चालू|एक्टिव|live|start)`. Add the exact STT
strings above as regression cases. The same applies to the discount/guarantee/refund patterns (e.g.
"गारंटी", "रिफंड").

### C3 · "monologue" alert fires seconds into every call (medium: false alarm on the HUD)

`TalkMetrics.read()` raises `monologue` when `agentTalkPct > 70`. At 3.5s into the call only the
agent had spoken (100%), so the HUD showed "monologue" during the greeting. Suggest requiring a
minimum amount of total talk (e.g. ≥ 30s in the window) before the ratio rule applies; the 30s
continuous-speech rule is fine as is.

### C4 · Dead air is undercounted by the STT lag (medium)

`metrics.turn(turn)` extends speech windows to the turn's `endMs`, which is the **commit receipt**
time, 1–3s after the speaker actually stopped. A real 7.5s silence (54.7s → 62.2s in the recording)
peaked at 4.8s in the persisted `talk_metrics`, so `dead_air` never fired. Suggest computing silence
from the speech-energy frames only (`onSpeech`), and using turns just for talk share.

### C5 · WAV replay has no customer identity (medium: demo fallback can't show customer memory)

`startReplay()` calls `startLiveCall({ agentId, customerLabel: "Recorded demo call" })` with no
`externalCustomerId`. On stage, the WAV fallback can therefore never show the "Last time…" card, and a
second replay never recalls the first. The persona is also named generically ("Restaurant Owner").
Suggest optional multipart fields `customerId` and `customerName` (validated, ≤200 chars) passed
through to `startLiveCall`.

### C6 · Persona extraction hard-fails after one repair (low-medium: demo risk)

It worked on the test call. But on code-mixed speech, models often change punctuation or script when
"quoting", and after one failed repair `extractPersona` throws (`PERSONA_FAILED`), which kills the
"Persona created → Replay" beat. Consider dropping only the unverifiable quotes and catchphrases (and
falling back to the first customer line for `openingLine`) instead of failing the whole persona.

### Smaller notes

- `hub.emit()` now `parse()`s every event and **throws** on an invalid one. That's good for catching bugs,
  but a throw inside an STT callback will surface as an unhandled error. Consider logging and dropping instead.
- `talk_metrics` is persisted every second (~600 rows per 10-minute call into `live_events`). That's fine
  for the demo; consider not persisting it, or persisting only alert transitions.
- `openChannelStream` doesn't pass `keyTerms`. The simulator passes "OnFloor", "Premium", "budget",
  "discount", "campaign"; adding "Zestify" and plan names would help recognition (STT wrote "Onfloor").
- Keyword hints carry no `sources`. They come from `playbook.ts`, so they could cite "OnFloor playbook" too.
- Style: many multi-statement one-liners (`a; b; c` on one line) make `session.ts`, `routes.ts` and
  `transcribe.ts` hard to read and diff. Not blocking.
- `startLiveCall` awaits customer memory before opening STT, to keep the event order. It's now capped at
  2.5s by the RAG helper (fix on my side), but a dead Qdrant still adds those 2.5s to every call start.
  Emitting it asynchronously right after `call_started` would avoid that; your call.

## Fixed on my side during integration (`9c3addd`, Ashwath)

1. **varlock leak guard 500'd `GET /api/calls/:id` for live calls.** `recordingUrl` is built from
   `BETTER_AUTH_URL`, which the server schema marked sensitive. Both public URLs are now `@sensitive=false`.
2. **RAG helpers had no timeout.** `customerMemoryEvent()` sits on your call-start path, so an
   unreachable Qdrant would have hung it. Every helper is now capped at 2.5s (verified: dead Qdrant →
   0 items in 2505ms, and the call continues).
3. **Two embeddings per customer turn.** `groundingFacts` + `customerMemory` on the same line now share a
   cached query embedding (615ms → 4ms on repeat).
4. **Scoring ignored `pol_refund`.** Live calls are now scored against your `LIVE_POLICIES`, as your
   IMPLEMENTATION.md asked.

## Questions for the team: ✅ answered 2026-10-10

Recorded as decisions in `03-tushar-live.md`: **Q1** policy-breaching demands are never CRM requests
(they become objections/tactics); **Q2** AI hints as fast as possible, several on screen at once (no
fixed deadline); **Q3** one agent per bridge is fine. The live dashboard UI stays with Harnoor; Tushar owns its event stream.

Original questions:

- **Q1 · Are customer *demands* account changes?** The persona extracted "मुझे 20% discount चाहिए" as a
  CRM request `discountPct = 20`. Replayed in the simulator, the agent would then be scored *up* for
  setting a 20% discount the policy forbids. Options: exclude `discountPct` from extracted CRM
  requests, cap it at the policy limit, or have scoring treat policy-violating requests as "should
  refuse". This needs a product decision.
- **Q2 · Copilot latency budget** (C1): what delay is acceptable for an AI hint on stage?
- **Q3 · One agent per bridge** (`LIVE_AGENT_EMAIL`): fine for the demo, per your own multi-agent note.

## Still open from your own acceptance gates

Real Telegram spike on the demo laptop with a headset; two real teammate recordings in
`apps/server/demo-audio/` (16 kHz PCM16, stereo L=agent R=customer, or two equal mono files); three full
rehearsals including the WAV fallback; hosted HTTPS/WSS deployment checks.

Converting a recording to the accepted format:
`ffmpeg -i call.m4a -ar 16000 -ac 1 -c:a pcm_s16le out.wav` per channel, or with `-ac 2` for a stereo
file whose left channel is the agent and right channel the customer.
