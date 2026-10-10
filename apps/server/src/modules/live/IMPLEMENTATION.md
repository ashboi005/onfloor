# Live implementation ledger

Approved plan: Tushar's Live Copilot Implementation Plan (chat, 2026-10-10).
Authority: docs/specs/00-overview.md, 03-tushar-live.md, 03a-telegram-voice-guide.md.

## Decisions

- User approved the existing OnFloor checkout; branch `tushar/live-copilot`.
- Implementation stays in Tushar's live/bridge folders, plus the spec's server demo-audio directory. Shared contracts, core provider adapters, database schema and frontend remain owner-managed.
- One server-owned session supports both Telegram and real WAV replay. Fixture simulation is a separate source, isolated from STT/copilot providers.
- One slot remains reserved through finalization; repeated finish calls share a promise. Serial transcript writes prevent duplicate sequence numbers and precede final events/copilot.
- Protocol v1 is negotiated in control messages. Binary channel/sample-offset frames align recordings, trim retransmissions and expose gaps. Ten-second bridge grace; bounded queues on bridge, STT and ingest.
- Server archives all four WAV variants with predictable keys and the storage service's actual `{key,url}` return. Local bridge backups are independent. Missing streamed audio becomes silence with operational errors; archives cannot be called gap-free after an outage.
- Copilot uses synchronous keyword/partial checks plus structured requests with a two-second result deadline. Policy severity comes from the canonical live policy list. Numeric speech metrics use server receipt time and speech-energy frames.
- Persona quotes are validated against persisted customer speech; invalid quotes receive one repair. Shared CRM value rules plus conservative quoted-evidence checks omit ambiguous/contradictory changes. Existing audited voice IDs, language defaults and deterministic per-call IDs; no cloning or customer-persona merging.
- After incorporating Ashwath's updated base (`15f0940`, RAG spec and services), live calls emit the existing `customer_memory` event from the stable Telegram customer key. The copilot's LLM path retrieves up to three approved playbook facts and two customer-memory snippets within the two-second deadline; hints cite the playbook source titles. Keyword hints remain immediate. No shared contracts or provider services were changed by Tushar.
- Focused behavior checks replace a broad permanent test suite, per the approved plan. Fresh read-only code review was completed; its delayed STT response, reconnect timing, decimal-discount and CRM evidence findings are fixed with regression checks.
- Windows development cannot certify the separate macOS/Linux headset/Telegram spike. No actual private call, teardown directions or teammate demo assets are claimed here.

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
- Updated-base `bun test apps/server/src/modules/live`: 18 pass, 0 fail. Controlled STT sockets exercise simultaneous commits, delayed first partial/final, fresh-token reconnect with reset timing, stereo replay, start/resume/auth, idempotency, independent wrap-up failures, malformed STT responses, slow analysis, grounded retrieval/source citations, hint/utterance deduplication and LLM failure fast paths. Other checks cover RIFF metadata/truncation/rates, offset gaps/overlaps, guardrail context/decimals, metrics and persona quotes/CRM contradictions.
- `uv run --frozen python verify_audio.py`: 3 pass (continuous resampling across frames, anti-alias filtering, sample offsets/local WAV gaps).
- `uv lock --check --offline`: resolves 26 packages, exit 0. All Python sources AST-parse; bridge/login imports succeed.
- Bun workspace lockfile unchanged. Bridge dependencies pinned in uv.lock: Python 3.12, py-tgcalls 3.0.0/native ntgcalls 3.0.2. TgCrypto is optional because its Windows Python 3.12 build needs unavailable C++ tooling; the base Pyrogram fallback imports successfully.
- Read-only real database/account check: PASS; configured Tushar agent exists.
- Two independent real ElevenLabs `session_started` handshakes: PASS. This is connectivity evidence, not a real speech/recognition acceptance run.
- Before Ashwath's base update, the structured copilot LLM check returned `LLM_FAILED/HTTP_404`. That result predates the updated LLM service/configuration and must be rerun before claiming real copilot/persona acceptance. Raw provider bodies, keys and URLs were not logged.
- `git diff --check`: clean apart from informational Windows line-ending notices.

## Tooling findings

The system Bun 1.2.19 crashed during dependency installation. An official temporary Bun 1.3.10 download completed frozen installation and verification; no workspace dependency upgrades were made. The Windows sandbox cannot read the linked workspace for native Bun, and uv cannot persist its sandbox interpreter cache; checks pass in the approved unsandboxed environment.

Varlock 1.18.0 generation reports generated code then exits with `UV_HANDLE_CLOSING` assertion on Windows; direct Node invocation has the same exit issue. The official `varlock run` entrypoint reaches the real connectivity checks, then reports the failed LLM check and exit assertion. Generated files remain ignored. No success claim relies on that exit code. No shared `.env.schema` was changed; bridge configuration declarations are local to its folder.

## Open acceptance gates and team handoff

1. **LLM service configuration:** rerun the real structured LLM check against Ashwath's updated base and configured provider/model. The existing keyword hints and partial guardrails survive LLM failure; live LLM hint/persona acceptance remains unverified here.
2. **Telegram feasibility:** bridge `.env` is absent locally, and the actual demo laptop/headset is unavailable. Use the bridge README's three-hour private-call gate. If it fails there, choose WAV replay and write the safe blocker report; no group-call substitution. Sending the report needs Tushar's instruction.
3. **Assets/rehearsal:** record two actual teammate calls in the accepted format under `apps/server/demo-audio/`, document mapping/duration/signals, and perform three full rehearsals. Only preparation notes exist here.
4. **Hosted integration:** team must validate HTTPS/WSS, owner/manager auth cookies, trusted origins/CORS, public frontend API URL, upload limits, one awake API instance and persistent recordings. No hosted deployment was performed.
5. **Scoring/simulator readiness:** Ashwath's updated base now includes real scoring and simulator integrations; those upstream services were not changed as part of this work. `scorecard_ready` plumbing passing is not proof of hosted, real QA/scenario quality. Align the five live policies in `policies.ts` with scoring (discount/activation/refund critical; guarantee/disclosure warn).
6. **Real-service acceptance:** measure hint latency and inspect persisted transcript/event rows, recording URLs, scorecard and persona/source-call linkage, then reuse the persona in the existing simulator. Local mocked-provider checks establish pipeline behavior, not this full-team gate.

Changes remain local and reviewable on the implementation branch; nothing was pushed, merged, sent to teammates or deployed.
