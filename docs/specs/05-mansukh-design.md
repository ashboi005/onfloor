# Spec: Brand, Design System, Landing, Reports & Article (Mansukh)

> **Update 2026-10-10:** you now also own the look of the simulator screens (picker, workspace, scorecard additions): see [08-tomato-sim-flow.md](08-tomato-sim-flow.md). The scorecard gained `deductions` and `wrapUp`.


You set how OnFloor looks and reads. That covers the visual system everyone else builds
with, the landing page judges see first, the scorecard screens that close the demo, and the
written story (the article).

Your folders: `apps/web/src/app/(marketing)/`, `apps/web/src/components/shell/` (the shell used by
`(app)/layout.tsx`), `apps/web/src/app/(app)/calls/`, `apps/web/src/app/(app)/personas/`,
`apps/web/src/app/design/`, `packages/ui/` (design system: tokens in `src/styles/globals.css`),
`apps/web/src/components/report/`, `docs/article/`, `apps/web/public/brand/`.

Data comes from `lib/api` hooks (`useCalls`, `useCall`, `useScorecard`, `usePersonas`).
They return fixtures in mock mode from H+2. **No direct `fetch`.**

## 1. Brand + design system (by H+3, since Harnoor builds on it)
- Name, wordmark, favicon, a one-line tagline (draft: *"The flight simulator for the call
  floor."*).
- Tokens in Tailwind v4 `@theme`: colour (incl. **semantic** good / warn / critical /
  info, because HUD and scorecard meaning rides on these), type scale, radius, shadow,
  spacing. Dark mode for the app (call centres are dim. The HUD is dark-first) and light
  for marketing if you prefer.
- shadcn/ui themed to the tokens. Primitives in `packages/ui/src/components/`: Button, Card, Badge,
  Tabs, Dialog, Toast, Tooltip, Slider, Switch, Input, Select, **Gauge** (radial 0–100),
  **Meter** (linear with thresholds), **ScoreRing**, **Sparkline**, **Avatar/initials**.
- Motion guidelines: a few durations/easings as tokens. Restrained in the app, expressive
  on the landing page.
- `/design` page that renders every primitive (doubles as your QA sheet).

## 2. App shell (by H+4)
`(app)/layout.tsx`: left nav (Simulator, Live, Calls, Personas), signed-in agent menu
(`useMe()`, sign out), and a slim top bar. Also the **`/login` page** (Ashwath wires the
Better Auth client; you style it). Full-bleed mode for
`/simulator/[id]` and `/live`, so Harnoor's screens get the whole viewport.

## 3. Landing page `/` (by H+10, polish until H+20)
Sections, roughly:
1. Hero: tagline, a one-sentence problem, CTA "Try the simulator" → `/simulator`, and a
   secondary "Watch the demo". Use a looping product visual (screen recording or animated
   HUD mock).
2. The problem: the multitasking dilemma, the live-floor freeze, QA latency (from the PRD §1),
   with one stat each if we can source them.
3. Three pillars: Simulator / Shadow AI Copilot / Instant QA. Each with a visual.
4. "From a real call to a practice rep": the replay loop (live call → persona →
   simulator). This is our differentiator. Give it a diagram/animation.
5. Multilingual: English, Hindi and Hinglish (code-switched), voiced natively.
6. Built with: Gemini / ElevenLabs / Sarvam / Telegram (needed for the sponsor tracks).
7. Team + footer.

It has to look like a funded startup, not a hackathon. It must be responsive and load fast. No
heavy 3D unless it stays smooth on a judge's laptop.

## 4. Calls list `/calls` (by H+8)
Table/cards from `useCalls()`: kind (Sim/Live badge), customer, persona archetype,
duration, score (ScoreRing), status (scoring spinner, failed), date. Filter by kind.

## 5. Scorecard `/calls/[callId]` (by H+12): demo beats 3 & 4
Driven by `useScorecard(callId)` + `useCall(callId)`. While it 404s → "Scoring your call…"
state (polling, nice skeleton). Then:
- **Header:** overall ScoreRing + grade, summary, kind badge, duration, customer.
- **4 dimension cards:** objection handling, tool & CRM accuracy, compliance, soft skills.
  Score, verdict, "see evidence" (scrolls the transcript to those turns). `score: null` →
  "N/A for live calls".
- **Timeline bar:** call duration with coloured markers for `moments` (mistake = red,
  warning = amber, good = green). Clicking one jumps to that turn.
- **Interactive transcript:** add the **Original | English** subtitle toggle (`useSubtitleMode` +
  `subtitleText` from `@/lib/subtitles`; `GET /api/calls/:id` turns include `translation`, see
  `04-harnoor-frontend.md` "Subtitles"). Turns with timestamps `mm:ss`. Turns that have a moment get
  highlighted with the moment's title inline. Expand to see **"Golden Standard"**:
  *You said* ➜ *A top rep would say* (`goldenLine`).
- **CRM audit table** (sim only): field, expected, actual, ✓/✗, latency.
- **Stats strip:** talk % (bar), interruptions, dead air count, longest monologue, wpm.
- **CTAs:** "Retry this scenario" (sim) / "Replay this customer in the simulator" (live,
  only when `call.personaId` is set) → `/simulator/new?replay=<callId>`.

## 6. Persona library `/personas` (by H+14)
Grid from `usePersonas()`: seed vs "From live call" (with a link back to the source call),
archetype, traits, catchphrases as quote chips, language/voice. Each has a "Practice with
<name>" button.

## 7. The article (`docs/article/`)
Audience: hackathon judges + a dev/product blog (Medium/Dev.to/Hashnode). It's also the
Gemini-track write-up, so it has to explain *how* we used Gemini.
- **H+6:** outline + angle (suggestion: *"We built a flight simulator for call-centre
  agents in 24 hours"*. Problem → three pillars → the replay loop → how it works → what
  we learned).
- **H+14:** Ashwath gives you an architecture diagram + bullets. Tushar gives you 3 bullets on
  the Telegram/copilot pipeline (ask him).
- **H+18:** full draft with screenshots/GIFs from the integrated app.
- **H+22:** final, plus a 60–90s demo video cut (backup in case the live demo fails).
- Also: a 5–7 slide pitch deck if the event needs one (confirm with the team).

## Timeline summary
| By | What |
|---|---|
| H+3 | Tokens, shadcn theme, core primitives, `/design` |
| H+4 | App shell |
| H+8 | Calls list |
| H+10 | Landing v1 |
| H+12 | Scorecard page on fixtures |
| H+14 | Persona library, integration checkpoint |
| H+18 | Article draft |
| H+22 | Article final, demo video, (deck) |

## Not yours
Simulator workspace + HUD screens (Harnoor), hooks/data layer (Ashwath), backend.
