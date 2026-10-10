# Spec: Simulator Workspace & Live HUD (Harnoor)

You build the two **real-time screens**: the Flight Simulator and the Live HUD. Both get
their data from one hook each (`useSimCall`, `useLiveCall`) written by Ashwath. Those
hooks run on **mock timelines** from H+2, so you never need the backend running until the
H+14 integration checkpoint.

Your folders: `apps/web/src/app/(app)/simulator/`, `apps/web/src/app/(app)/live/`,
`apps/web/src/components/sim/`, `apps/web/src/components/hud/`.
Use Mansukh's primitives from `packages/ui` (`@onfloor/ui/components/*`) (Button, Card, Badge, Gauge, Meter, Toast…).
If you need one that doesn't exist yet, build it in your folder and tell Mansukh, who can
promote it to `ui/` later.

## Rules
- **No `fetch`, no `WebSocket`, no `getUserMedia` in your code.** It goes through
  `lib/api` (TanStack hooks) and the two call hooks. If you need something they don't
  expose, ask Ashwath to add it to the hook. Don't work around it.
- Types come from `@onfloor/contracts`. Don't redeclare shapes.

## Screen 1: Scenario picker `/simulator`
- Cards from `useScenarios()`, persona chooser from `usePersonas()`. Show the
  archetype badge, traits as small bars, the language, and a "From live call" badge when
  `source === "live_call"`.
- Language select (en / hi / Hinglish).
- "Start call" → `useStartSim().mutate({ scenarioId, personaId, language })` →
  navigate to `/simulator/[callId]`.
- Deep link `/simulator/new?replay=<callId>` → `useReplayCall` (Mansukh's persona and
  scorecard pages link here).

## Screen 2: Simulator workspace `/simulator/[callId]` (the demo hero)

Two panes, side by side on a laptop (CRM ≈ 60%, call ≈ 40%):

**Pane A: Mock CRM** (`components/sim/crm/`), styled as a believable *merchant ad portal*:
- Header: merchant name, plan badge, campaign status pill.
- Fields from `CRM_FIELDS` (contracts §3): budget (slider + number input, ₹ formatting),
  campaign status (switch), plan (segmented), discount % (slider; show a subtle "needs
  approval" hint above 10% but **don't block it**, because we want trainees to be able to
  make the mistake), weekend notifications (switch), radius (slider), ad categories (chips),
  notes (textarea).
- Local state starts from `scenario.initialCrm`. On each **committed** change call
  `reportCrmAction({ field, from, to })`.
- **Request toasts:** when `pendingCrmRequests` gets an entry, the field it refers to gets
  a soft pulse. Don't show what the customer asked. They have to listen. The toast
  only says "Customer requested a change". Keep a toggle (`?assist=1`) that shows the exact
  ask, for the demo.
- A couple of fake extra tabs (Leads, Invoices) with static content, so it feels like real
  software. They don't do anything.

**Pane B: Call terminal** (`components/sim/terminal/`):
- Persona card (name, role, business, archetype), timer (elapsed / remaining), status.
- Voice visualiser for the persona (`personaLevel`) and the agent mic (`micLevel`), plus
  `personaState` (thinking dots / speaking wave).
- **Patience meter** (`patience` 0–100, green → amber → red, shakes when it drops).
- Live transcript: committed turns + `partialAgentText` greyed out. Auto-scroll.
- Controls: mute, end call (confirm), push-to-talk not needed (VAD is automatic).
- States: connecting, mic denied, error with retry, persona hung up ("Rakesh hung up 😬"
  → button to scorecard).
- On end → `await end()` → `/calls/[callId]` (Mansukh's scorecard page, which shows a
  "scoring…" state while it polls).

## Screen 3: Live HUD `/live`

The agent keeps this open on a second monitor (or half the screen) while on the Telegram
call. It auto-attaches with `useLiveCall("active")`.

- **Waiting state:** "Waiting for a call on the OnFloor line…", with a pulsing indicator.
- **Top strip:** customer name, call timer, language, connection dot.
- **Sentiment radar:** three gauges (patience, frustration, engagement) + a small sparkline
  from `sentiment.history`. One recommendation word derived on the client:
  `frustration > 65` → "DE-ESCALATE", `engagement > 70 && patience > 50` → "CLOSE",
  else "DISCOVER".
- **Hint stack (centre, biggest):** newest hint on top as a large card (kind icon, title,
  body). It auto-expires by `ttlMs` with a visible countdown bar. Pin/dismiss
  buttons. Older hints collapse below.
- **Guardrail banner:** `critical` = full-width red banner + a short audio blip, sticky
  until dismissed. `warn` = amber toast. These must be impossible to miss.
- **Talk metrics:** talk-ratio bar (agent vs customer), silence counter that turns
  amber at 4s and fires a "Say something — dead air" nudge on `alert: "dead_air"`.
  `monologue` → "Pause and ask a question".
- **Mini transcript** (right rail): last ~6 turns + partials, speaker colours.
- **After the call:** "Scoring…" → when `scorecardReady`, a "View scorecard" button
  (`/calls/[id]`). When `personaId` arrives, a celebratory card: "Persona created from
  this call → Replay in simulator" (`/simulator/new?replay=<callId>`). This is demo
  beat 4, so make it look good.

Make the HUD legible at a glance. Big type, few words, colour carries meaning. Nobody
reads paragraphs while they're on a call.

## Timeline
| By | What |
|---|---|
| H+2 | Static layouts for both panes + HUD (hard-coded data) |
| H+8 | Simulator fully driven by the `useSimCall` mock, CRM reporting actions |
| H+12 | HUD fully driven by the `useLiveCall` mock timeline |
| H+14 | Integration: flip `NEXT_PUBLIC_USE_MOCKS=false`, fix with Ashwath/Tushar |
| H+20 | Polish: empty/error/loading states, transitions, 1440px + 1280px laptop widths |

## Not yours
Landing page, app shell/nav, scorecard page, persona library (Mansukh). Hook internals
(Ashwath). The HUD event content itself (Tushar).
