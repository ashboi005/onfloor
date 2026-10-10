# Spec: Simulator Workspace (Harnoor)

You build the **Flight Simulator**: the scenario/persona picker and the two-pane workspace
(Mock CRM + call terminal). Its data comes from one hook (`useSimCall`, written by Ashwath),
which runs on a **mock timeline**, so you never need the backend running until the integration
checkpoint. (The Live HUD moved to Tushar on 2026-10-10.)

Your folders: `apps/web/src/app/(app)/simulator/`, `apps/web/src/components/sim/`.
Use Mansukh's primitives from `packages/ui` (`@onfloor/ui/components/*`) (Button, Card, Badge, Gauge, Meter, Toast…).
If you need one that doesn't exist yet, build it in your folder and tell Mansukh, who can
promote it to `ui/` later.

## Rules
- **No `fetch`, no `WebSocket`, no `getUserMedia` in your code.** It goes through
  `lib/api` (TanStack hooks) and `useSimCall`. If you need something they don't
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

## ~~Screen 3: Live HUD~~: moved to Tushar

The live call dashboard (`/live`, `components/hud/`) now belongs to **Tushar** (decision
2026-10-10, see `03-tushar-live.md` §7). Shared building blocks (gauges, meters, cards) still come
from `packages/ui`; if you've already built HUD widgets, hand them over to Tushar.

## Timeline
| By | What |
|---|---|
| H+2 | Static layouts for both panes (hard-coded data) |
| H+8 | Simulator fully driven by the `useSimCall` mock, CRM reporting actions |
| H+14 | Integration: flip `NEXT_PUBLIC_USE_MOCKS=false`, fix with Ashwath |
| H+20 | Polish: empty/error/loading states, transitions, 1440px + 1280px laptop widths |

## Not yours
Landing page, app shell/nav, scorecard page, persona library (Mansukh). Hook internals
(Ashwath). The HUD event content itself (Tushar).
