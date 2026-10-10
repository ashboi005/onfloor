# OnFloor: Shared Contracts (frozen at H+2)

These live in `packages/contracts/src/*.ts` as **Zod schemas**. TypeScript types come from
`z.infer`. The Python bridge gets the JSON Schema export (`bun run contracts:jsonschema`
writes `packages/contracts/dist/schema/*.json`).

Conventions: ids are strings (`cuid2`). Times are ISO strings in the API and `ms` offsets
from call start inside a call. Scores are integers 0–100.

---

## 1. Domain enums (`domain.ts`)

```ts
LANGUAGES        = ["en", "hi", "hinglish"]
SPEAKERS         = ["agent", "customer"]
CALL_KINDS       = ["sim", "live"]
CALL_STATUSES    = ["active", "scoring", "scored", "failed", "abandoned"]
ARCHETYPES       = ["impatient", "price_squeezer", "skeptic", "custom"]
PERSONA_SOURCES  = ["seed", "live_call"]
SCORE_DIMENSIONS = ["objectionHandling", "toolAccuracy", "compliance", "softSkills"]
```

## 2. Persona (`persona.ts`): the Pillar 1 ⇄ Pillar 2 seam

This is the most important shared shape. Seed personas are written by Ashwath. Live-call
personas are written by Tushar's extraction step. The simulator plays any persona.

```ts
personaSchema = z.object({
  id: z.string(),
  name: z.string(),                       // "Rakesh Mehta"
  role: z.string(),                       // "Owner, Mehta's Kitchen (3 outlets)"
  business: z.object({
    type: z.string(),                     // "restaurant"
    city: z.string().optional(),
    currentPlan: z.string().optional(),   // "Basic Ads, ₹30,000/mo"
  }),
  archetype: z.enum(ARCHETYPES),
  language: z.enum(LANGUAGES),
  voiceId: z.string(),                    // "elevenlabs:<id>" | "sarvam:<speaker>"
  traits: z.object({                      // 0–10 each; drives prompt + HUD baselines
    patience: z.number().min(0).max(10),
    aggression: z.number().min(0).max(10),
    priceSensitivity: z.number().min(0).max(10),
    talkativeness: z.number().min(0).max(10),
  }),
  backstory: z.string(),                  // 2–4 sentences
  goals: z.array(z.string()),             // what they actually want from the call
  objections: z.array(z.string()),        // the pushbacks they will raise, in their words
  tactics: z.array(z.string()),           // "claims competitor charges 8%", "threatens to hang up"
  speechStyle: z.object({
    pace: z.enum(["slow", "normal", "fast"]),
    interrupts: z.boolean(),
    catchphrases: z.array(z.string()),    // verbatim lines lifted from a live call
  }),
  crmRequests: z.array(crmRequestSchema), // account changes they'll ask for mid-call
  openingLine: z.string(),
  source: z.enum(PERSONA_SOURCES),
  sourceCallId: z.string().nullable(),    // set when source = "live_call"
  createdAt: z.string(),
})

createPersonaSchema = personaSchema.omit({ id: true, createdAt: true })
```

## 3. Mock CRM (`crm.ts`)

The CRM is a *merchant ad portal*. Its fields are fixed for the MVP.

```ts
CRM_FIELDS = {
  monthlyBudget:        { type: "number", min: 5000, max: 500000, step: 1000 },  // ₹
  campaignStatus:       { type: "enum", values: ["active", "paused"] },
  plan:                 { type: "enum", values: ["basic", "premium", "premium_plus"] },
  discountPct:          { type: "number", min: 0, max: 30, step: 1 },          // policy max: 10 without approval
  weekendNotifications: { type: "boolean" },
  targetRadiusKm:       { type: "number", min: 1, max: 25, step: 1 },
  adCategories:         { type: "multi", values: ["dine_in", "delivery", "catering", "offers"] },
  notes:                { type: "text" },
}

crmStateSchema   = z.object({ monthlyBudget, campaignStatus, plan, discountPct,
                              weekendNotifications, targetRadiusKm, adCategories, notes })
crmRequestSchema = z.object({ id: z.string(), field: z.enum(CRM_FIELD_KEYS),
                              value: z.unknown(), phrasing: z.string() })   // what the customer says
crmActionSchema  = z.object({ field: z.enum(CRM_FIELD_KEYS), from: z.unknown(),
                              to: z.unknown(), atMs: z.number().int() })
```

The browser sends a `crmAction` on every **committed** change: slider release, toggle,
blur. Not on every keystroke.

## 4. Scenario (`scenario.ts`)

```ts
scenarioSchema = z.object({
  id: z.string(),
  title: z.string(),                   // "Pitching Premium Ads to a Skeptical Restaurant Owner"
  brief: z.string(),                   // what the agent is told before the call
  objective: z.string(),               // "Upgrade to Premium without exceeding 10% discount"
  defaultPersonaId: z.string(),
  initialCrm: crmStateSchema,
  policies: z.array(policySchema),     // also used by live guardrails
  softLimitSec: z.number().int(),      // 300
  hardLimitSec: z.number().int(),      // 480
})

policySchema = z.object({
  id: z.string(),
  rule: z.string(),                    // "Never offer more than 10% discount without manager approval"
  severity: z.enum(["warn", "critical"]),
  goldenLine: z.string().optional(),   // what to say instead
})
```

## 5. Transcript (`transcript.ts`): one shape for sim and live

```ts
transcriptTurnSchema = z.object({
  id: z.string(),
  callId: z.string(),
  seq: z.number().int(),
  speaker: z.enum(SPEAKERS),
  text: z.string(),
  language: z.enum(LANGUAGES).optional(),
  startMs: z.number().int(),
  endMs: z.number().int(),
})
```

## 6. Call (`call.ts`)

```ts
callSchema = z.object({
  id: z.string(),
  kind: z.enum(CALL_KINDS),
  status: z.enum(CALL_STATUSES),
  agentId: z.string(),
  scenarioId: z.string().nullable(),   // null for live calls
  personaId: z.string().nullable(),    // sim: persona played; live: persona extracted (after)
  replayOfCallId: z.string().nullable(), // sim call that replays a live call
  language: z.enum(LANGUAGES),
  customerLabel: z.string(),           // "Rakesh Mehta" or Telegram display name
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  recordingUrl: z.string().nullable(), // live only
  overallScore: z.number().int().nullable(),
})
```

## 7. Scorecard (`scorecard.ts`): Pillar 3

```ts
scorecardSchema = z.object({
  callId: z.string(),
  kind: z.enum(CALL_KINDS),
  overall: z.number().int(),                    // weighted, computed in code (never by the LLM)
  grade: z.enum(["A", "B", "C", "D", "F"]),
  summary: z.string(),                          // 2 sentences
  dimensions: z.array(z.object({
    key: z.enum(SCORE_DIMENSIONS),
    score: z.number().int().nullable(),         // null = not applicable (toolAccuracy on live)
    weight: z.number(),
    verdict: z.string(),                        // one line
    evidence: z.array(z.string()),              // turn ids
  })),
  moments: z.array(z.object({                   // clickable timeline markers
    id: z.string(),
    atMs: z.number().int(),
    turnId: z.string(),
    severity: z.enum(["mistake", "warning", "good"]),
    title: z.string(),                          // "Offered unapproved 15% discount"
    detail: z.string(),
    goldenLine: z.string().nullable(),          // "Golden Standard" phrasing
  })),
  crmAudit: z.array(z.object({                  // sim only, [] for live
    requestId: z.string(),
    field: z.enum(CRM_FIELD_KEYS),
    expected: z.unknown(),
    actual: z.unknown(),
    correct: z.boolean(),
    latencyMs: z.number().int().nullable(),     // request spoken → CRM updated
  })),
  stats: z.object({
    durationMs: z.number().int(),
    agentTalkPct: z.number(),                   // 0–100
    interruptions: z.number().int(),
    deadAirCount: z.number().int(),             // gaps > 5s
    longestMonologueMs: z.number().int(),
    wpm: z.number(),
  }),
  createdAt: z.string(),
})
```

Weights: objectionHandling 0.35, toolAccuracy 0.25, compliance 0.25, softSkills 0.15.
When a dimension is `null`, the remaining weights are renormalised.

## 8. REST API

All under `/api`. Errors look like `{ error: { code, message, retryable } }`.
Auth: Better Auth session cookie (`/api/auth/*`). Every route except
`/api/auth/*` and `/internal/*` requires a signed-in agent. `/internal/*` (the bridge) uses
the `x-bridge-secret` header instead. In mock mode the web client fakes a signed-in agent.
**Never add a catch-all `GET /*` route to Elysia.** It swallows `/api/auth/*` (elysia#1515).

| Method | Path | Owner | Body → Response |
|---|---|---|---|
| GET | `/me` | Ashwath | → `Agent` (current signed-in agent) |
| GET | `/scenarios` | Ashwath | → `Scenario[]` |
| GET | `/personas` | Ashwath | `?source=` → `Persona[]` |
| GET | `/personas/:id` | Ashwath | → `Persona` |
| POST | `/personas` | Ashwath (called by Tushar) | `CreatePersona` → `Persona` |
| POST | `/sim/sessions` | Ashwath | `{ scenarioId, personaId?, language, replayOfCallId? }` → `SimSessionStart` |
| WS | `/ws/sim/:callId` | Ashwath | see §9 |
| POST | `/sim/sessions/:callId/end` | Ashwath | → `{ callId, status }` |
| GET | `/calls` | Ashwath | `?kind=` → `Call[]` |
| GET | `/calls/:id` | Ashwath | → `Call & { transcript: TranscriptTurn[] }` |
| GET | `/calls/:id/scorecard` | Ashwath | → `Scorecard`, or 202 `{ status }` while scoring (poll) |
| POST | `/calls/:id/replay` | Ashwath | → `SimSessionStart` (replays that call's extracted persona) |
| GET | `/live/active` | Tushar | → `Call \| null` (the HUD auto-attaches to this) |
| WS | `/ws/live/:callId` | Tushar | see §10 |
| POST | `/live/calls/replay-file` | Tushar | multipart audio → `{ callId }` (demo fallback) |

```ts
simSessionStartSchema = z.object({
  callId: z.string(),
  scenario: scenarioSchema,
  persona: personaSchema,
  sttUrl: z.string(),        // ready-to-open ElevenLabs realtime URL (single-use token)
})
```

## 9. Simulator WebSocket `/ws/sim/:callId`

**Harnoor doesn't use this directly. Use the `useSimCall()` hook.** It's listed here so
Ashwath's mock and real implementations match.

Client → server:
```ts
{ type: "agent_turn", text, startMs, endMs }
{ type: "crm_action", action: CrmAction }
{ type: "interrupt" }                          // agent talked over the persona
{ type: "end" }
```
Server → client:
```ts
{ type: "state", status, elapsedMs }
{ type: "turn", turn: TranscriptTurn }         // committed turns, both speakers
{ type: "persona_audio", turnId, audioUrl }
{ type: "persona_state", state: "idle" | "thinking" | "speaking" }
{ type: "crm_request", request: CrmRequest, atMs }  // persona just asked for a change
{ type: "patience", value: 0-100 }             // persona's simulated patience
{ type: "timer", elapsedMs, remainingMs }
{ type: "ended", reason: "agent" | "persona_hung_up" | "time", callId }
{ type: "error", code, message, retryable }
```

## 10. Live HUD WebSocket `/ws/live/:callId` (Tushar → HUD)

**Harnoor uses `useLiveCall(callId)`.** Tushar's server emits exactly these:

```ts
{ type: "call_started", call: Call }
{ type: "transcript_partial", speaker, text }        // in-flight, overwrite per speaker
{ type: "transcript_final", turn: TranscriptTurn }
{ type: "hint", hint: {
    id, kind: "pitch" | "objection" | "upsell" | "close",
    title,                        // "Commission pushback"
    body,                         // "Pivot to guaranteed reach: 12k diners/month in 5km"
    triggerTurnId, ttlMs } }      // HUD hides it after ttlMs unless pinned
{ type: "guardrail", alert: {
    id, severity: "warn" | "critical",
    policyId, message,            // "Don't promise next-day activation without approval"
    triggerTurnId } }
{ type: "sentiment", patience, frustration, engagement, atMs }   // 0–100 each, ~every turn
{ type: "talk_metrics", agentTalkPct, currentSilenceMs, alert: null | "dead_air" | "monologue" }
{ type: "call_ended", callId, durationMs }
{ type: "scorecard_ready", callId }
{ type: "persona_ready", personaId, callId }
{ type: "error", code, message, retryable }
```

## 11. Fixtures (`packages/contracts/fixtures/`)

| File | Contents | Used by |
|---|---|---|
| `personas.ts` | 3 seed personas (impatient, price_squeezer, skeptic) + 1 `live_call` persona | everyone |
| `scenarios.ts` | "Skeptical Restaurant Owner" scenario with policies + initial CRM | Harnoor, Ashwath |
| `sim-call.ts` | Scripted `/ws/sim` server event timeline (~90s) incl. 2 `crm_request`s | Harnoor (mock `useSimCall`) |
| `live-call.ts` | Scripted `/ws/live` event timeline (~2 min) with hints, a critical guardrail, sentiment swings, dead-air alert, ending in `scorecard_ready` + `persona_ready` | Harnoor (mock `useLiveCall`), Tushar (target output) |
| `scorecards.ts` | One sim scorecard (with CRM audit) and one live scorecard | Mansukh |
| `calls.ts` | ~6 calls of mixed kind/status for lists | Mansukh |
