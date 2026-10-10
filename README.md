# OnFloor

The flight simulator for the call floor: AI customers for training (Pillar 1), a live
in-call copilot HUD over Telegram (Pillar 2), and an instant QA scorecard for every call (Pillar 3).

**Read first:** `docs/specs/00-overview.md`, then your own spec (`02`–`05`).

## Quick start (frontend: no backend needed)

```bash
bun install
cp apps/web/.env.example apps/web/.env          # NEXT_PUBLIC_USE_MOCKS=true
bun run dev:web                                 # http://localhost:3001
```

With mocks on, every page runs on `packages/contracts/fixtures`: the simulator plays a scripted
90s call, `/live` plays a scripted 74s Telegram call, and scorecards appear ~3s after a call ends.

## Full stack

```bash
cp apps/server/.env.example apps/server/.env    # fill BETTER_AUTH_SECRET (openssl rand -base64 32)
bun run db:start                                # local Postgres in Docker (or use the shared DB URL)
bun run db:migrate && bun run db:seed           # tables + demo accounts, scenario, personas
bun run dev                                     # API :3000 + web :3001
```

Set `NEXT_PUBLIC_USE_MOCKS=false` in `apps/web/.env` to use the real API. Seeded logins
(password `OnFloorDemo!2026`): `ashwath@`, `tushar@`, `harnoor@`, `mansukh@`, `manager@onfloor.demo`.

With `STUB_ENGINES=true` (default) the real server streams the same fixture calls over its
WebSockets and runs them through the real DB → scoring → persona path. `POST /api/live/dev/simulate`
(or the button on `/live`) fakes a Telegram call. `GET /health` shows which integrations have keys.

## Layout & owners

| Path | What | Owner |
|---|---|---|
| `packages/contracts` | Zod schemas (every shared shape) + typed fixtures. **Frozen; changes go through Ashwath** | Ashwath |
| `packages/db` | Drizzle schema (`schema/app.ts`, `schema/auth.ts`) + migrations | Ashwath |
| `packages/auth` | Better Auth config | Ashwath |
| `packages/ui` | Design system (shadcn primitives, tokens in `styles/globals.css`) | Mansukh |
| `apps/server/src/core` | env, errors, auth guard, `services` (llm/stt/tts/storage/knowledge), `calls` repo | Ashwath |
| `apps/server/src/modules/{sim,scoring,personas,scenarios,calls}` | Simulator engine, QA scoring, personas | Ashwath |
| `apps/server/src/modules/live` | Live calls, copilot, HUD stream, persona extraction | Tushar |
| `apps/telegram-bridge` | Python py-tgcalls bridge | Tushar |
| `apps/web/src/lib/api`, `apps/web/src/hooks` | Data client (mock + http), `useSimCall`, `useLiveCall` | Ashwath |
| `apps/web/src/app/(app)/simulator`, `/live`, `components/{sim,hud}` | Simulator workspace, Live HUD | Harnoor |
| `apps/web/src/app/(marketing)`, `(app)/{calls,personas}`, `/design`, `components/{shell,report}` | Landing, shell, scorecard, personas | Mansukh |
| `docs/article` | The OnFloor article | Mansukh |

## What's real vs stubbed

| Piece | State |
|---|---|
| Auth, DB (migrated + seeded on the shared DB), all REST routes, both WebSockets, live hub | ✅ real |
| LLM toggle: Gemini now (Merge key pending: `zai/glm-5.3-flash`), per-job, 429/5xx retry | ✅ real. `bun run llm:check` |
| TTS: ElevenLabs + Sarvam by voiceId prefix | ✅ real |
| Simulator engine: persona LLM, CRM requests, patience, dead air, barge-in, limits | ✅ real |
| `useSimCall`: mic → ElevenLabs realtime STT, persona playback, barge-in, echo filter | ✅ real (verify in a browser) |
| QA scoring: LLM judge + computed stats + CRM audit | ✅ real |
| Persona extraction from live calls + replay in simulator | ✅ real (draft prompt in `modules/live`, Tushar's to tune) |
| Live transcription, copilot LLM (hints/guardrails/sentiment/talk metrics), replay-file, bridge audio routing | 🔴/🟡 Tushar, see `apps/server/src/modules/live/README.md`. `/api/live/dev/simulate` plays the fixture through the real pipeline meanwhile |
| All UI | 🟡 plain placeholders wired to the hooks: Harnoor/Mansukh restyle or rebuild |

`STUB_ENGINES=true` swaps the simulator back to the fixture replay (no keys needed).
`NEXT_PUBLIC_USE_MOCKS=true` runs the whole frontend on fixtures with no backend.

Models (measured 2026-10-10): roleplay `gemini-3.5-flash-lite` (~1.8s), copilot `gemini-3.1-flash-lite`
(~1.6s), scoring/persona `gemini-3.5-flash` with reasoning (~10s, post-call). Persona replies land
~1.5-2.2s after the agent stops talking (plus ~0.6s STT VAD).

## Commands

| | |
|---|---|
| `bun run dev` / `dev:web` / `dev:server` | run |
| `bun run check-types` | typecheck everything (run before pushing) |
| `bun run db:generate` → `db:migrate` | after changing `packages/db/src/schema` |
| `bun run db:seed` | demo data (idempotent) |
| `bun run contracts:jsonschema` | JSON Schema for the Python side → `packages/contracts/dist/schema` |
| `bun run env:generate` | after editing a `.env.schema` (varlock regenerates `src/env.ts`) |
