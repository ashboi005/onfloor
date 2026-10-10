# Live copilot (owner: Tushar)

Telegram and WAV replay share `session.ts`: two speaker STT streams, ordered transcript writes, copilot, event history, four WAV archives, scoring and persona extraction. Public `@onfloor/contracts` shapes and frontend mocks are unchanged.

## Run the API

Use Bun 1.3.10 and the team-managed database/providers. From the repository:

```sh
bun install --frozen-lockfile
bun run env:generate
bun run check-types
bun run dev:server
```

Server configuration belongs in the ignored `apps/server/.env`. For this single-agent MVP, set `LIVE_AGENT_EMAIL` to Tushar's seeded account (`tushar@onfloor.demo`), `LIVE_DEFAULT_LANGUAGE=hinglish`, `BRIDGE_SECRET` to the same private value on both machines, and `STUB_ENGINES=false` for real acceptance. Configure `DATABASE_URL`, ElevenLabs, the LLM provider/model for `copilot` and `persona`, and persistent `STORAGE_DIR` through the existing schema. Telegram account credentials stay on the laptop bridge; the API does not need them. `LIVE_AGENT_EMAIL` is one server-wide identity mapping for the current bridge, not a per-caller setting; see the multi-agent note below before connecting separate agents.

The host must keep one API instance awake, support HTTPS/WSS and >=64 MiB requests, and preserve the storage directory. Ashwath owns auth/CORS, provider adapters, scoring and simulator/TTS. Configure the public frontend API URL and auth trusted origins there. The real HUD uses `NEXT_PUBLIC_USE_MOCKS=false`; existing mock mode remains available.

From `apps/server`, run the read-only connectivity check:

```sh
bun src/modules/live/check-integrations.ts
```

It checks the seeded agent, structured LLM and two STT handshakes, without creating a call or logging secrets. On this Windows environment Varlock's CLI/subprocess asserts during exit. Its official runner reaches the checks:

```sh
node ../../node_modules/varlock/bin/cli.js run -- bun src/modules/live/check-integrations.ts
```

An exit assertion is a tooling failure, not a successful check. See `IMPLEMENTATION.md` for measured results and remaining gates.

## Replay a recording

Sign in as the agent or manager using the existing authentication flow. Use the authenticated client, or a private cookie jar from that session:

```sh
curl --cookie cookies.txt -F 'audio=@/path/call.wav' -F 'customerId=telegram-user-17' -F 'customerName=Demo customer' https://API_HOST/api/live/calls/replay-file
curl --cookie cookies.txt -F 'agentAudio=@/path/agent.wav' -F 'customerAudio=@/path/customer.wav' -F 'customerId=telegram-user-17' -F 'customerName=Demo customer' https://API_HOST/api/live/calls/replay-file
```

Accepts 16 kHz PCM16LE only. Stereo left=agent/right=customer, or two mono files with exactly equal sample counts. Rejects mixed/duplicate/unknown fields, malformed/truncated RIFF, unsupported encoding, >64 MiB request bodies and >10 minutes decoded audio before creating a call. RIFF metadata chunks are supported. Response `{callId}` arrives after session creation; audio plays at original speed in the background and finalizes at EOF. WAV replay always uses real STT, even when fixture mode is enabled.
`customerId` and `customerName` are optional multipart text fields (1–200 characters). Reuse the same `customerId` on later replays to retrieve customer memory; use a test identity only for demo recordings.

Use `POST /api/live/dev/simulate` separately for fixture-driven integration. In production it is disabled unless stub engines are enabled. Fixture scorecards do not establish real scoring quality.

## Lifecycle and storage

The MVP reserves one slot through startup, active audio and all wrap-up stages. Each channel records by absolute sample offset. Duplicate/overlapping samples are trimmed; missing intervals become silence and emit `AUDIO_GAP`. STT audio queues are bounded to two seconds. Transcripts carry server-call-relative timing, from first partial receipt to committed receipt; they are approximate segment timings, not word alignment.

Each final is persisted before `transcript_final` or copilot analysis. Wrap-up stops input, sends trailing VAD silence, waits a bounded response grace period, drains writes, stops copilot, ends the call, archives audio, invokes `scoreCall`, extracts/links the persona, drains events and releases the slot. Concurrent finishes reuse one promise. Database end, recording, scoring and persona errors are reported independently. All four archive files are attempted even if one write fails:

- `live/<callId>/agent.wav`
- `live/<callId>/customer.wav`
- `live/<callId>/stereo.wav`
- `live/<callId>/mixed.wav` — `calls.recordingUrl`

A server gap cannot be recovered from missing network packets; keep the bridge's local WAVs for replay. There is no cross-process session recovery: a host restart requires a new replay. The in-memory history remains for ten minutes after completion; explicit historical subscriptions then read `live_events`.

## HUD and copilot

`GET /api/live/active` returns an owned call (or manager-visible call), otherwise JSON `null`. Authenticated `WS /ws/live/<callId>` checks ownership, replays ordered history and follows current events. `WS /ws/live/active` waits for authorized calls and stays connected through scorecard/persona wrap-up. Emissions are schema-validated, persisted serially with one retry, and subscriber failures are isolated.

At call start, `customer_memory` follows `call_started` and uses the stable Telegram user ID (`externalCustomerId`) or replay `customerId` to show repeat-caller history. Scoring writes the new memory after the call through Ashwath's `scoreCall()` integration. Customer finals still receive an instant playbook keyword hint when matched. The structured hint/sentiment path also retrieves up to three approved playbook facts and two snippets for this customer, and cites approved fact titles in `hint.sources`. Keyword hints cite the OnFloor playbook. If retrieval is off or fails, the call continues without RAG. AI results may arrive after a newer turn; a bounded provider timeout prevents hung requests, but there is no fixed HUD arrival deadline. At most one hint per turn; the last three hints suppress repeated/near-duplicate suggestions. The copilot does not suggest CRM actions during live calls. Sentiment uses EMA alpha=0.5 and retains the last success on failure.

Agent partials use policy fast paths; finals use a structured policy check. Warnings deduplicate within an utterance and preserve policy severity. `policies.ts` is the canonical live policy list for Ashwath: discount >10% (critical), premature activation (critical), orders/revenue guarantees (warn), mandatory disclosure (warn), unauthorized refund promises (critical). Confirm exact commercial wording with the scoring owner before the demo.

Talk metrics emit every second over the last 120 seconds: silence >6 seconds, agent monologue >30 seconds or talk share >70% after at least 30 seconds of total speech. Speech-energy frames set the silence clock; delayed STT commits do not extend it. RMS below 250 PCM units does not count as speech. Tune this threshold on the actual headset during rehearsal.

Personas use the full persisted transcript, shared schema/CRM field rules and existing audited voice IDs. Source and language are set in code. The model supplies a customer self-description as verbatim evidence for demographic voice selection; otherwise the language-based default is used. Quotes must match real customer text; invalid evidence receives one repair, then unverifiable quotes and CRM requests are removed while the first genuine customer line becomes the opening. Policy-breaking demands (such as discounts above 10%) remain objections, never CRM requests. Spoken numeric requests without recognized digit notation may be omitted. Empty customer transcripts fail explicitly. Stable per-call persona IDs and existing links prevent duplicate extraction. Voice cloning and customer-persona merging remain outside the MVP.

## Multiple agent identities

This bridge is currently attributed to one seeded agent using server-side `LIVE_AGENT_EMAIL`; that keeps the demo configuration explicit. Do not solve a team rollout by letting a bridge send an arbitrary agent email in `call_started`: the server must establish identity from authenticated bridge credentials. For multiple bridges, Ashwath should own hosted secret storage and credential provisioning, while Tushar can implement a token-to-agent lookup at ingest and pass that trusted `agentId` into the existing call/session code. Give each bridge its own revocable credential and map it to a seeded agent. The single-active-call guard still allows only one of those agents to be on a live/replay call at a time. Supporting simultaneous calls is a separate change: replace the global session slot with per-call session ownership, enforce a concurrency limit, and verify active-call lookup, event subscriptions, persistence, recording keys and cleanup remain call-scoped. The browser simulator already derives the agent from the signed-in account and does not use this bridge mapping.

## Verification and rehearsal

```sh
# From apps/server
bun test src/modules/live
# From repository root
bun run check-types
# From apps/telegram-bridge
uv run --frozen python verify_audio.py
```

Local tests exercise audio formats/gaps, ordered commits, STT reconnect and delayed shutdown responses, authorization/start-resume, independent wrap-up failures, real replay plumbing, guardrails, metrics and persona evidence using controlled provider responses. They do not certify real recognition, hint latency, hosted auth or Telegram duplex audio.

For the demo, follow the bridge README feasibility checklist, prepare the two real teammate recordings described in `apps/server/demo-audio/README.md`, and rehearse three complete runs including WAV fallback. Record callId, transcript sequence order, speaker labels, hint latency from customer final, events, four storage URLs, scorecard and persona linkage. Open a second HUD mid-call, reconnect it, test a different agent's denied subscription, reconnect the bridge inside ten seconds, then test an outage exceeding ten seconds. Check both hang-up directions, second-call rejection, silence/overlap/long speech and malformed uploads. Use policy refusal/quoted objections alongside actual offers; verify repeated utterances warn again. Inspect customer quotations and CRM evidence before simulator reuse.

## Glossary

Bridge: local Telegram/headset process. Bridge status: server-observed ingest connection state, distinct from whether audio contains speech. Session: server-owned lifecycle for one call. Channel: isolated agent/customer PCM. Replay: recorded audio paced through that lifecycle. Persona: validated customer behaviour reusable in the simulator. Hint stack: all active copilot hints shown together, newest first, with independent expiry and controls.
