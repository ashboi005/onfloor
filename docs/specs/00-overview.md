# OnFloor: Team Overview & Integration Rules

> Read this first. Every person's spec (01–05) assumes you know what's here.
> **Contracts (`01-contracts.md`) are frozen at H+2.** After that, changing a shared
> schema needs a ping in the team chat and a sign-off from Ashwath.

## 1. What we're building (one paragraph)

OnFloor trains call-center agents in three steps. **Pillar 1, Simulator:** the agent
talks by voice to an adversarial AI customer while using a Mock CRM on screen.
**Pillar 2, Live Copilot:** during a real call over Telegram, a web HUD shows hints,
guardrail warnings and sentiment as the call happens. **Pillar 3, QA Scorecard:** every call (sim
or live) gets scored right away, and a live call is turned into a **persona** that can be
**replayed** in the simulator.

## 2. Team & ownership

| Person | Owns | Spec |
|---|---|---|
| **Ashwath** | Repo, contracts, DB, core backend (LLM/voice services, simulator engine, scoring engine, personas), web data layer and hooks | `02-ashwath-core.md` |
| **Tushar** | Live call pillar: Telegram bridge, live transcription, copilot brain (hints/guardrails/sentiment), live call storage, persona extraction | `03-tushar-live.md` + `03a-telegram-voice-guide.md` |
| **Harnoor** | App frontend: Simulator workspace (Mock CRM + Call Terminal), Live HUD, scenario/persona picker | `04-harnoor-frontend.md` |
| **Mansukh** | Brand + design system, landing page, app shell, Scorecard/Reports UI, persona library UI, the OnFloor article, demo assets | `05-mansukh-design.md` |

**Rule of thumb:** you own a folder. You don't edit someone else's folder; you open a PR or
ask in chat. Shared files (`packages/contracts`) are Ashwath's.

## 3. Stack

| Layer | Choice |
|---|---|
| Runtime / package manager | Bun (workspaces monorepo) |
| Web | Next.js 15 (App Router) + React 19 + Tailwind v4 + shadcn/ui + TanStack Query |
| API | Elysia on Bun (REST + WebSocket) |
| DB | Postgres (one shared Neon/Supabase DB for the team) + Drizzle ORM |
| Validation / shared types | Zod v4 in `packages/contracts` (one schema for API validation and client types) |
| LLM | `LLM_PROVIDER=merge\|gemini`: Merge Gateway (OpenAI-compatible) or Google Gemini. Can be overridden per job |
| TTS | ElevenLabs (default) + Sarvam `bulbul:v3` (Indic voices). The persona's `voiceId` prefix picks the provider |
| STT | ElevenLabs Scribe v2 Realtime (browser streams directly, token minted server-side). Sarvam STT for Indic where it's better |
| Live call channel | Telegram (MTProto user-bot via a Python sidecar, see Tushar's spec) |
| Languages | `en`, `hi`, `hinglish` |
| Auth | Better Auth (email/password). Seeded demo accounts |

## 4. Repo layout

```
onfloor/
  apps/
    web/                    Next.js — Harnoor + Mansukh (+ Ashwath's lib/ and hooks/)
      app/
        (marketing)/        landing page                          [Mansukh]
        (app)/layout.tsx    app shell, nav                        [Mansukh]
        (app)/simulator/    scenario picker + workspace           [Harnoor]
        (app)/live/         live HUD                              [Harnoor]
        (app)/calls/        call list + scorecard pages           [Mansukh]
        (app)/personas/     persona library + "replay" button     [Mansukh]
      components/ui/        design system primitives              [Mansukh]
      components/sim/       CRM + call terminal                   [Harnoor]
      components/hud/       HUD widgets                           [Harnoor]
      components/report/    scorecard widgets                     [Mansukh]
      lib/api/              typed client, mock + http impl        [Ashwath]
      hooks/                useSimCall, useLiveCall, ...          [Ashwath]
    api/                    Elysia — Ashwath + Tushar
      src/
        core/               config, db, services (llm, voice, stt)   [Ashwath]
        modules/sim/        simulator engine + routes                [Ashwath]
        modules/scoring/    QA scorecard engine                      [Ashwath]
        modules/personas/   persona repo + routes + prompt compiler  [Ashwath]
        modules/live/       live calls, copilot, persona extraction  [Tushar]
    telegram-bridge/        Python (py-tgcalls) sidecar              [Tushar]
  packages/
    contracts/              Zod schemas + fixtures + WS event types  [Ashwath, frozen H+2]
  docs/
    specs/                  these files
    article/                OnFloor article drafts                   [Mansukh]
```

## 5. How we stay decoupled: mocks first

1. **`packages/contracts`** holds every shared shape plus **typed fixtures** (a sample
   scorecard, a sample persona, a scripted live-call event timeline, a scripted sim call).
   Fixtures are type-checked against the schemas, so they can't drift from them.
2. **Frontend never calls `fetch` directly.** It uses `apps/web/lib/api` and the hooks in
   `apps/web/hooks`. With `NEXT_PUBLIC_USE_MOCKS=true` these return fixtures and replay
   the scripted timelines on a timer. Harnoor and Mansukh can build their whole UI on
   day 0 with no backend running.
3. **Backend modules talk through interfaces, not internals.** Tushar's live module uses
   `services.llm`, `services.stt`, `scoring.scoreCall()` and `personas.create()` from core.
   Until they're real, they return fixtures with the same signatures.
4. **Integration = flip the flag.** At the integration checkpoint we set
   `NEXT_PUBLIC_USE_MOCKS=false` and fix whatever breaks.

## 6. Timeline (24h)

| Window | Ashwath | Tushar | Harnoor | Mansukh |
|---|---|---|---|---|
| **H0–2** | Scaffold monorepo, contracts + fixtures, mock client + hook stubs. **Push by H+2** | Telegram call **spike** (go/no-go by H+3) | Static Mock CRM + call terminal layout (no data) | Brand, tokens, shadcn theme, app shell |
| **H2–8** | Port LLM/voice/STT services, provider toggle, sim engine, persona compiler | Bridge → API audio/transcript ingest, live call storage | Sim workspace on `useSimCall` mock, CRM action wiring | Landing page, scorecard page on fixture |
| **H8–14** | Scoring engine (4 dims + moments + golden lines), CRM audit, replay endpoint | Copilot brain: hints, guardrails, sentiment, talk metrics → HUD events | HUD on `useLiveCall` mock timeline | Calls list, persona library, article outline |
| **H14 ✅ Integration checkpoint** | Mocks OFF. Everyone on the shared DB + API | | | |
| **H14–20** | Fix integration, sim polish, multilingual pass | Persona extraction → `personas.create()`, end-to-end live demo | Polish, edge states (errors, loading, mic denied) | Screenshots, article draft, demo video |
| **H20–24** | Feature freeze H20. Rehearse demo flow (§7) ×3. Record a backup demo video | | | |

## 7. Demo flow (what must work)

1. Landing page → "Try the simulator".
2. Simulator: pick *"Skeptical Restaurant Owner"* (Price-Squeezer). AI customer talks;
   agent answers by voice **and** updates budget/notifications in the Mock CRM.
3. End call → scorecard with a CRM audit and timestamped mistakes.
4. Live: client calls over Telegram → HUD streams hints, guardrail warnings, sentiment.
5. Hang up → live scorecard → "Persona created" → **Replay in simulator** → the same
   customer's behaviour, now voiced by the AI.

**Fallback (mandatory):** if Telegram is flaky on stage, the live pipeline must also
accept a **pre-recorded call file** (`POST /api/live/calls/replay-file`) that streams
through the exact same transcription → copilot → HUD path. Tushar owns this.

## 8. Working agreements

- Branch per person: `ashwath/*`, `tushar/*`, `harnoor/*`, `mansukh/*`. Small PRs into
  `main`, merged by the owner of the target folder.
- Never commit `.env`. Ask Ashwath for keys. Keys are server-only; nothing secret gets a
  `NEXT_PUBLIC_` prefix.
- No tests required. Run `bun run typecheck` before you push.
- If you're blocked for more than 20 minutes, say so in chat. Don't wait it out.
- Ideas that don't fit the 24h (RAG personalisation etc.) go in `06-future-scope.md`, not into the build.
