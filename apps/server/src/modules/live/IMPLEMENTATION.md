# Live implementation ledger

Approved plan: Tushar's Live Copilot Implementation Plan (chat, 2026-10-10).
Authority: docs/specs/00-overview.md, 03-tushar-live.md, 03a-telegram-voice-guide.md.

## Decisions

- This review update was verified in an isolated worktree based on main at `7de09ab`, then applied to the original OnFloor checkout for handoff.
- Implementation stays in Tushar's live/bridge folders, plus the spec's server demo-audio directory. Shared contracts, core provider adapters, database schema and frontend remain owner-managed.
- One server-owned session supports both Telegram and real WAV replay. Fixture simulation is a separate source, isolated from STT/copilot providers.
- One slot remains reserved through finalization; repeated finish calls share a promise. Serial transcript writes prevent duplicate sequence numbers and precede final events/copilot.
- Protocol v1 is negotiated in control messages. Binary channel/sample-offset frames align recordings, trim retransmissions and expose gaps. Ten-second bridge grace; bounded queues on bridge, STT and ingest.
- Server archives all four WAV variants with predictable keys and the storage service's actual `{key,url}` return. Local bridge backups are independent. Missing streamed audio becomes silence with operational errors; archives cannot be called gap-free after an outage.
- Copilot uses synchronous keyword/partial checks plus structured requests with a bounded provider timeout and no fixed two-second HUD deadline. Late responses remain eligible even after a newer turn. Policy severity comes from the canonical live policy list. Speech-energy frames alone set the silence clock; the talk-share monologue rule requires 30 seconds of total talk.
- Persona quotes are validated against persisted customer speech; invalid quotes receive one repair, then unverifiable quotes/CRM requests are dropped with a genuine opening-line fallback. Policy-breaking demands stay in objections and cannot become simulator CRM requests. Audited voice selection uses a model-extracted, verbatim customer self-description or a language default; no cloning or customer-persona merging.
- After incorporating Ashwath's updated base (`15f0940`, RAG spec and services), live calls emit the existing `customer_memory` event from the stable Telegram customer key or optional replay `customerId`. The copilot's LLM path retrieves up to three approved playbook facts and two customer-memory snippets; hints cite source titles. Keyword hints remain immediate and cite the OnFloor playbook. No shared contracts or provider services were changed by Tushar.
- Focused behavior checks replace a broad permanent test suite, per the approved plan. Fresh read-only code review was completed; its delayed STT response, reconnect timing, decimal-discount and CRM evidence findings are fixed with regression checks.
- Windows development cannot certify the separate macOS/Linux headset/Telegram spike. No actual private call, teardown directions or teammate demo assets are claimed here.
- Bridge health belongs to the server-owned live event stream: `connecting` at session start, `connected` after bridge acknowledgement, `reconnecting` when the ingest socket drops inside the grace period, and `disconnected` when the ten-second grace period expires. This is control-plane health; the existing audio protocol remains unchanged. The event is not implemented yet because `packages/contracts` is frozen pending Ashwath's approval.
- The HUD shows every unexpired or pinned hint at once, with the newest hint prominent. Each hint retains its own expiry countdown, pin/dismiss actions, and grounded source labels.

## Implementation map

| Area | Files |
| --- | --- |
| Session/ordered writes/finalization | session.ts |
| Authorized routes/bounded ingest | routes.ts |
| Event history/persistence | hub.ts, index.ts |
| Real per-speaker STT | transcribe.ts |
| RIFF parsing/replay/archive | audio.ts, replay.ts, recording.ts |
| Hints/guardrails/sentiment/metrics | copilot/index.ts, copilot/metrics.ts, policies.ts |
| Persona schema/evidence/cast/link | extract-persona.ts, persona-validation.ts |
| Python call/headset/network flow | apps/telegram-bridge/bridge.py |
| Stateful resampling/local WAVs | apps/telegram-bridge/audio.py |
| Private configuration/login | apps/telegram-bridge/config.py, login.py, .env.schema |

Both module READMEs contain operator runbooks and the bridge README specifies the complete local protocol. `apps/server/demo-audio/README.md` provides recording scripts and the required asset/rehearsal metadata. The live README includes a glossary, multi-agent rollout boundary and canonical policy handoff.

## Observed verification (2026-10-10)

- Updated-base root `bun run check-types`: all six workspace checks exit 0 (contracts, UI, DB, auth, web, server).
- Review update `bun test apps/server/src/modules/live`: 21 pass, 0 fail. Added cases cover late AI results after newer turns, mixed-script policy phrases, early monologue suppression, dead air despite delayed STT commit, replay customer identity/memory, and persona recovery after failed quote repair. Existing controlled STT sockets continue to cover simultaneous commits, fresh-token reconnect, stereo replay, auth, independent wrap-up failures, malformed responses, grounding/source citations and LLM failure fast paths.
- `uv run --frozen python verify_audio.py`: 3 pass (continuous resampling across frames, anti-alias filtering, sample offsets/local WAV gaps).
- `uv lock --check --offline`: resolves 26 packages, exit 0. All Python sources AST-parse; bridge/login imports succeed.
- Bun workspace lockfile unchanged. Bridge dependencies pinned in uv.lock: Python 3.12, py-tgcalls 3.0.0/native ntgcalls 3.0.2. TgCrypto is optional because its Windows Python 3.12 build needs unavailable C++ tooling; the base Pyrogram fallback imports successfully.
- Read-only `check-integrations.ts` with the configured original checkout: PASS for the seeded live agent, structured copilot LLM service and two independent real ElevenLabs `session_started` handshakes. This verifies connectivity, not real speech recognition or a full hosted call. No provider body, key or URL was logged.
- `git diff --check`: clean apart from informational Windows line-ending notices.

## Tooling findings

The system Bun 1.2.19 crashed during dependency installation. An official temporary Bun 1.3.10 download completed frozen installation and verification; no workspace dependency upgrades were made. The Windows sandbox cannot read the linked workspace for native Bun, and uv cannot persist its sandbox interpreter cache; checks pass in the approved unsandboxed environment.

Varlock 1.18.0 generation reports generated code then exits with `UV_HANDLE_CLOSING` assertion on Windows; direct Node invocation has the same exit issue. The official `varlock run` entrypoint reaches the real connectivity checks, then reports the failed LLM check and exit assertion. Generated files remain ignored. No success claim relies on that exit code. No shared `.env.schema` was changed; bridge configuration declarations are local to its folder.

## Open acceptance gates and team handoff

1. **Real copilot/persona acceptance:** provider connectivity now passes, but live hint latency, quote quality and final policy judgments still need a recorded or Telegram call with real speech.
2. **Telegram feasibility:** bridge `.env` is absent locally, and the actual demo laptop/headset is unavailable. Use the bridge README's three-hour private-call gate. If it fails there, choose WAV replay and write the safe blocker report; no group-call substitution. Sending the report needs Tushar's instruction.
3. **Assets/rehearsal:** record two actual teammate calls in the accepted format under `apps/server/demo-audio/`, document mapping/duration/signals, and perform three full rehearsals. Only preparation notes exist here.
4. **Hosted integration:** team must validate HTTPS/WSS, owner/manager auth cookies, trusted origins/CORS, public frontend API URL, upload limits, one awake API instance and persistent recordings. No hosted deployment was performed.
5. **Scoring/simulator readiness:** Ashwath's updated base now includes real scoring and simulator integrations; those upstream services were not changed as part of this work. `scorecard_ready` plumbing passing is not proof of hosted, real QA/scenario quality. Align the five live policies in `policies.ts` with scoring (discount/activation/refund critical; guarantee/disclosure warn).
6. **Real-service acceptance:** measure hint latency and inspect persisted transcript/event rows, recording URLs, scorecard and persona/source-call linkage, then reuse the persona in the existing simulator. Local mocked-provider checks establish pipeline behavior, not this full-team gate.

Changes remain local and reviewable in the original checkout; nothing was pushed, merged, sent to teammates or deployed.
