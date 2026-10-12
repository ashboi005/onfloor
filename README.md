# OnFloor

Practice on AI customers before the real call, get help during it, and a scorecard the moment it ends.

OnFloor is a training and live-assist tool for call-centre sales agents. Agents rehearse on voice calls with AI customers who speak English, Hindi or Hinglish, using the same tools they use on the floor. On real calls, a copilot listens to both sides and warns them before a mistake costs the sale. Every call is scored within seconds, and a difficult real customer can be turned into a persona the whole team can practise against.

## 🏆 Innohacks 4.0 winner

Built in 24 hours by team **Cracked Nerds** at [Innohacks 4.0](https://innohacks-4.devfolio.co/). OnFloor won:

- **Overall 1st prize**
- **Best Use of ElevenLabs**
- **Best Use of DigitalOcean**

Project page: [devfolio.co/projects/onfloor-e320](https://devfolio.co/projects/onfloor-e320)

## Live demo

There is no live link right now. We ran OnFloor on a DigitalOcean Droplet for the hackathon and have since taken that instance down. If we deploy it somewhere else, we'll put the link here. Until then, [run it locally](#running-it-locally).

## What it does

The demo company is **Tomato**, a food-delivery marketplace. Its agents call restaurant owners to sell **Max Grow**, an ad plan that charges 20% only on sales above the restaurant's usual daily sales (its DRR). If a restaurant with a DRR of ₹100 sells ₹200 in a day, Tomato takes ₹20. If sales stay at or below ₹100, nothing is deducted. Everything below is company specific only through its data and documents, so another company's plan, scripts and policies can replace Tomato's.

### 1. Flight Simulator

1. Pick who to call (a seeded merchant, or a customer extracted from a real call), how they behave (curious, sceptical, hard bargainer, busy, frustrated, undecided, with sliders for patience, aggression, price sensitivity and talkativeness), and whether guidance is on.
2. The call auto-dials. Nugget, the ticketing tool, pops the merchant's UID, top items and DRR. After a 2 to 5 second ring the merchant picks up and talks first.
3. The agent works the call in the same tools they would use on the floor:
   - **Merchant Dashboard** to look up the UID and confirm who they're talking to
   - **Ad Studio** to set the campaign up; it rejects a wrong UID, a bad email or a campaign shorter than a month
   - the **Max Grow calculator** to show the merchant the maths
4. Customers make requests along the way (a new email, a later start date, two months instead of one, call back tomorrow at 4) and expect them to be done.
5. When the call ends, the agent has 90 seconds to send the right email and dispose the call in Nugget.

With guidance on, the screen highlights the next step and the field to use, suggests answers to the customer's questions, and recommends the disposition after the call.

### 2. Live copilot

A real phone call comes in over Telegram. A Python bridge streams the agent and the customer to the server on separate channels, and the HUD shows:

- both sides transcribed as they speak, with English subtitles for Hindi and Hinglish
- hints pulled from the company's own documents (RAG) when the customer asks something
- guardrails: a red alert when the agent offers a discount or quotes a commission other than 20%, and amber warnings for softer slips
- a support prompt when the customer is getting frustrated, plus sentiment and talk-ratio gauges

### 3. Scorecard

Every call, simulated or live, gets a scorecard within seconds:

- objection handling, compliance, soft skills and tool accuracy, each with evidence linked to the transcript
- the moments that decided the call, with the line a top agent would have used
- QA deductions from the company's rules: plan misrepresented, opening or closing skipped, no empathy, disposed late
- a check of every tool action against what the customer actually asked for

### 4. Replay the customer you just lost

After a live call, OnFloor extracts the customer's persona (traits, objections and their actual phrases) so the agent can call the same customer in the simulator again until they handle them well.

## How it works

```
 Browser (Next.js)                      Server (Elysia on Bun)                    Telegram bridge (Python)
 ─────────────────                      ──────────────────────                    ────────────────────────
 mic ──► ElevenLabs Scribe realtime     /ws/sim  sim engine ──► Gemini persona     py-tgcalls answers the call
          (single-use token)   ───────►          coach, guidance, scoring          agent + customer audio, 16 kHz PCM
 speaker ◄── persona voice     ◄───────          TTS: ElevenLabs / Sarvam                     │
 tools: Nugget, Dashboard, Ad Studio             Postgres (Drizzle), Qdrant (RAG)             │
 live HUD                      ◄─────── /ws/live copilot ◄── /internal/live/ingest ◄──────────┘
```

- The AI customer is an LLM playing a merchant profile combined with a behaviour preset. Alongside each line it emits small control tags (`<crm_request id/>`, `<patience delta/>`, `<decision value/>`, `<hang_up/>`), which drive its requests, patience meter, decision and hang-up.
- The microphone stays open while the customer speaks, so the agent can interrupt. Speech that is really the customer's own voice coming back through the speakers is filtered by comparing words as consonant skeletons, so a Devanagari line and its Latin-letter transcript still match (`packages/contracts/src/echo.ts`).
- Each LLM job runs on the model size it needs. Gemini keys are rotated in a pool with per-model cooldowns, and if every key is rate-limited the job falls back to a second provider.
- RAG uses Mastra and Qdrant with Gemini embeddings. It indexes the company documents (`apps/server/knowledge/*.md`), top-agent lines and each agent's past mistakes, and every scored call is written back.

### Models

| Job | Model | Typical latency |
|---|---|---|
| AI customer | `gemini-3.5-flash-lite` | ~1.8 s per reply |
| Coaching, live copilot, disposition suggestion | `gemini-3.1-flash-lite` | ~1.5 to 2 s |
| QA judge, persona extraction | `gemini-3.5-flash-lite` (low reasoning) | ~4 s per scorecard |
| Embeddings | `gemini-embedding-001` (768 dims) | |
| English subtitles | `gpt-5.4-mini` via Merge | ~1.1 s |
| Fallback for every job | Merge gateway (`zai/glm-5.3-flash`) | |
| Speech to text | ElevenLabs Scribe v2 Realtime | |
| Text to speech | ElevenLabs Flash v2.5, Sarvam `bulbul:v3` for some Indian voices | |

### Stack

| Layer | Choice |
|---|---|
| Monorepo | Bun workspaces, TypeScript |
| Web | Next.js 16, React 19, Tailwind v4, shadcn/ui, TanStack Query |
| API | Elysia on Bun (REST + WebSockets) |
| Data | PostgreSQL + Drizzle ORM, Qdrant for vectors |
| Shared types | Zod v4 schemas in `packages/contracts`, used for API validation and client types |
| Auth | Better Auth (email and password) |
| Env | varlock (`.env.schema` → typed, validated env) |
| Live calls | Python, py-tgcalls + Pyrogram (`apps/telegram-bridge`) |
| Hosting (hackathon) | One DigitalOcean Droplet running web, API, Postgres and Qdrant as containers under Coolify, behind Cloudflare |

## Running it locally

You need Bun, Docker, and API keys for Gemini and ElevenLabs. Sarvam and Merge are optional. The simulator runs on the real engines; the old fixture-only mock mode is no longer maintained.

```bash
bun install
cp apps/server/.env.example apps/server/.env    # keys, BETTER_AUTH_SECRET (openssl rand -base64 32)
cp apps/web/.env.example apps/web/.env

bun run db:start                                # Postgres in Docker
docker run -d --name onfloor-qdrant -p 6333:6333 -v onfloor_qdrant:/qdrant/storage qdrant/qdrant
#   then set VECTOR_DATABASE_URL=http://localhost:6333 in apps/server/.env (leave it empty to run without RAG)

bun run db:migrate && bun run db:seed           # tables, demo accounts, merchants, personas, docs into Qdrant
bun run dev                                     # API on :3000, web on :3001
```

Open http://localhost:3001 and sign in with a seeded account. The password for all of them is `OnFloorDemo!2026`:

- agents: `ashwath@onfloor.demo`, `tushar@onfloor.demo`, `harnoor@onfloor.demo`, `mansukh@onfloor.demo`
- manager: `manager@onfloor.demo`

Go to **Simulator** and pick Sharma Ji Ke Chhole Bhature (DRR ₹100) for the easiest first call. Use headphones so the AI customer doesn't hear itself.

`GET /health` on the API shows which integrations have keys, and `bun run llm:check` tests every configured model.

### Live calls

The Telegram bridge runs on the agent's laptop (it needs the headset) and connects to the API over a WebSocket. Setup, login and the audio protocol are in [`apps/telegram-bridge/README.md`](apps/telegram-bridge/README.md). Set the same `BRIDGE_SECRET` on both sides, and set `LIVE_AGENT_EMAIL` to the OnFloor account that answers the line. Without the bridge, `POST /api/live/dev/simulate` (or the button on `/live`) plays a recorded call through the real live pipeline.

### Docker

`bun run docker:up` builds and starts Postgres, the API and the web app from `docker-compose.yml`. That is how we deployed on the Droplet with Coolify.

## Repo layout

| Path | What |
|---|---|
| `apps/web` | Next.js app: landing page, simulator picker and workspace, live HUD, calls and scorecards, personas |
| `apps/server` | Elysia API: simulator engine, scoring, personas, merchants, live calls and copilot, knowledge (RAG) |
| `apps/server/knowledge` | Company documents and top-agent lines ingested into RAG |
| `apps/telegram-bridge` | Python bridge between Telegram calls and the API |
| `packages/contracts` | Zod schemas for every shared shape, plus the Tomato demo data (merchants, personas, scenario) |
| `packages/db` | Drizzle schema and migrations |
| `packages/auth` | Better Auth config |
| `packages/ui` | Design system (shadcn primitives, tokens) |
| `docs/specs` | Build specs, including RAG (`07-rag.md`) and future scope (`06-future-scope.md`) |
| `docs/demo` | Demo scripts |

## Commands

| | |
|---|---|
| `bun run dev` / `dev:web` / `dev:server` | run everything, or one app |
| `bun run check-types` | typecheck the whole repo |
| `bun run db:generate` → `db:migrate` | after changing `packages/db/src/schema` |
| `bun run db:seed` | demo data (safe to re-run) |
| `bun run env:generate` | after editing a `.env.schema` |
| `bun run llm:check` | test every configured model and key |

## Team

Team Cracked Nerds:

- **Ashwath Soni** ([@ashboi005](https://github.com/ashboi005)): core backend, contracts and database, simulator engine, scoring, RAG, web data layer
- **Tushar Dhingra** ([@TDHINGRA16](https://github.com/TDHINGRA16)): live calls end to end, Telegram bridge, live copilot, persona extraction
- **Harnoor Singh** ([@HarnoorSingh1234](https://github.com/HarnoorSingh1234)): app frontend, simulator workspace, live HUD
- **Mansukh Singh**: brand and design system, landing page, scorecard and report UI
