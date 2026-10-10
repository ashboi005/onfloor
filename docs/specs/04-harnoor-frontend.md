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
- **Persona tuning panel ("Customize")** (new): lets the trainer reshape the selected persona
  before the call. Controls map 1:1 to `PersonaTuning` (`@onfloor/contracts`):
  - **Archetype**: impatient / price-squeezer / skeptic (`ARCHETYPE_LABELS`)
  - **Sliders 0–10**: patience, aggression ("politeness ↔ hostility"), price sensitivity,
    talkativeness. Show the tone the aggression value produces next to the slider: 0–3 *polite*,
    4–6 *firm but civil*, 7–8 *blunt*, 9–10 *confrontational*. (The default personas felt too rude;
    this is the knob for that.)
  - **Speech**: pace (slow/normal/fast), interrupts (on/off)
  - **Voice**: optional pick from `VOICES` (fixtures)
  Preview the effective persona with `applyPersonaTuning(persona, tuning)` (pure, runs in the browser).
  Start with `useStartSim().mutate({ scenarioId, personaId, language, tuning })`; the tuning applies to
  that call only. Also offer **"Save as new persona"**:
  `useCreatePersona().mutate({ ...applyPersonaTuning(persona, tuning), name })` (strip `id`/`createdAt`).
  The server stores it as `source: "custom"`; show a "Custom" badge for those in the list.
- "Start call" → `useStartSim().mutate({ scenarioId, personaId, language, tuning })` →
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
  With the **Original | English** subtitle toggle (below).
- Controls: mute, end call (confirm), push-to-talk not needed (VAD is automatic).
- States: connecting, mic denied, error with retry, persona hung up ("Rakesh hung up 😬"
  → button to scorecard).
- On end → `await end()` → `/calls/[callId]` (Mansukh's scorecard page, which shows a
  "scoring…" state while it polls).

### Subtitles in the call terminal

**Subtitles (raw ↔ English).** Every transcript turn has an optional `turn.translation`: the
English version. It's the same as the text for English calls; for Hindi/Hinglish it arrives **1–2.5s
after the turn** (Merge, never Gemini) and the hook merges it in automatically. Use the shared helper so
every screen behaves the same and the choice is remembered:

```ts
import { subtitleText, useSubtitleMode } from "@/lib/subtitles";
const [mode, setMode] = useSubtitleMode();            // "raw" | "english" (saved per browser)
const { text, pending } = subtitleText(turn, mode);   // pending = English not here yet
```

Put a small toggle (`Original | English`) above the transcript. In English mode show `pending` lines in
their raw text, dimmed, with a "translating…" hint, then swap in place when the subtitle lands (no layout
jump). Live partials are always raw (they're never translated). Mock mode has delayed subtitles in the
timeline, so you can build this now.

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
