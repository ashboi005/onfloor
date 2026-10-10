# 08 · Tomato simulator flow: frontend handoff (Mansukh)

The simulator now plays **Tomato** (a food-delivery marketplace) selling the **Max Grow** ad plan to
restaurant partners, B2B. The backend, contracts, seed data and a **barebones frontend wired end to
end** are on `main` and were tested in a real browser on real keys (pick → ring → answer → tools →
hang up → dispose → scorecard). Your job: make it look and feel right. Don't change the data flow;
everything goes through `useSimCall` and the `@/lib/api` hooks. Mock mode is no longer maintained:
run against the real server.

## The flow

1. **Picker** `/simulator` (`app/(app)/simulator/page.tsx`)
   1. **Who are you calling?** Seed merchants (`useMerchants("seed")`, demo merchant first), plus
      **From live calls**: customers extracted from Telegram calls (`usePersonas("live_call")`).
   2. **How do they behave?** Merchants only: a behaviour preset (`usePersonas()`, `source !== "live_call"`;
      the merchant's `defaultPersonaId` is "suggested") and trait sliders (sent as `tuning.traits`). A
      live-call customer keeps the behaviour it had on the real call.
   3. **Guidance on/off** + language → **Start simulation** (`useStartSim`).
2. **Workspace** `/simulator/[callId]`
   - **Dialing:** Nugget pops the ticket (`start.ticket`: UID, merchant name, restaurant, top items + DRR).
   - **Ringing** after a random 2–5s: a big "pick up" button → `call.answer()` (must be the click
     handler: it unlocks audio). Mic/STT open only now.
   - **Connected:** the customer answers first. Browser-style tabs: **Merchant Dashboard** (paste UID
     → full details to confirm) and **Ad Studio** (UID, email, campaign type, start/end date ≥ 1 month,
     launch). Under them the **Max Grow calculator** (drag expected sales → 20% of the extra).
     "Customer asked" in Nugget lists `call.requests` (new email, later start, 2 months, callback).
   - **Hang-up** (agent "End call" or the customer) → **wrap-up**: Nugget's disposition panel with
     a 90s countdown: email template + outcome (+ callback date/time) → Send email → Dispose.
   - **Done** → navigate to `/calls/[callId]`.
3. **Scorecard** `/calls/[callId]` (yours already): now also `deductions` (QA penalties), `wrapUp`
   (outcome, template, seconds taken, what the customer actually decided) and `crmAudit` rows are tool
   checks (`field` is a human label like "Ad Studio · email (updated on the call)").

## Files (reference implementation by Ashwath, restyle freely)

| File | What |
|---|---|
| `app/(app)/simulator/page.tsx` | picker (3 steps) |
| `app/(app)/simulator/[callId]/page.tsx` | workspace page: tools left, `CallTerminal` right, navigates on `phase === "done"` |
| `components/sim/workspace/workspace.tsx` | layout: guidance bar, Nugget column, browser tabs, calculator |
| `components/sim/workspace/nugget.tsx` | ticket, pick-up button, "customer asked", disposition panel + AI suggestion |
| `components/sim/workspace/merchant-dashboard.tsx` | UID search + merchant details |
| `components/sim/workspace/ad-studio.tsx` | campaign form, launch result / Ad Studio's error |
| `components/sim/workspace/calculator.tsx` | Max Grow calculator (`maxGrowBill` from contracts) |
| `components/sim/workspace/guide.tsx` | guidance bar + `useGuideHighlight` |
| `components/sim/terminal/call-terminal.tsx` | Harnoor's terminal (transcript with Original/English toggle) |

## `useSimCall` (what the UI reads and calls)

```ts
const call = useSimCall(start);
call.phase              // "dialing" | "ringing" | "connected" | "wrap_up" | "done"
call.turns, call.partialAgentText, call.personaState, call.patience, call.micLevel, call.personaLevel
call.requests           // what the customer asked for, with atMs
call.dashboard          // last lookup: { uid, merchant | null }
call.campaign           // launched campaign, or null; call.launchError = Ad Studio's refusal
call.email              // sent email preview { to, subject, body } (wrap-up)
call.wrapUpError        // e.g. "Pick the callback date and time first."
call.dispositionRemainingMs
call.guidance           // guidance on: { steps, next: { stepId, text, target }, tips (≤3, newest first) }
call.suggestion         // guidance on: { outcome, template, callback, reason }, ~2–4s into wrap-up

call.answer(); call.openTab(tab); call.lookup(uid); call.launchCampaign(draft);
call.sendEmail(template, callbackSlot?); call.dispose({ outcome, callback }); call.end(); call.setMuted(b);
```

Every action is answered in state (never thrown). Ad Studio really validates (8-digit UID that exists,
valid email, start not in the past, end ≥ start + 1 month), so show its error text.

## Guidance (the toggle)

With guidance on, put `data-guide="<target>"` on the matching element; `useGuideHighlight(call.guidance?.next?.target)`
adds the pulsing `guide-highlight` ring. Targets (`GUIDANCE_TARGETS` in contracts):
`nugget.ticket`, `nugget.uid`, `tab.merchant_dashboard`, `dashboard.search`, `dashboard.contact`,
`calculator`, `tab.ad_studio`, `ad_studio.uid|email|campaign_type|dates|launch`,
`disposition.email|outcome|callback|submit`. Steps (10) are in `GUIDANCE_STEPS`; show progress.
Tips (`answer` / `objection` / `warning` / `info`) can be several at once. Guidance off: none of this
renders and no suggestion arrives.

## Data you'll see (seeded, `bun run db:seed`)

8 merchants (`fixtures/merchants.ts`), demo = **Sharma Ji Ke Chhole Bhature** (owner, curious, asks
how to rank higher, gives a new email). Others cover a manager and a son answering (callback path),
a frustrated owner (empathy), a haggler (non-negotiable 20%), a not-sure owner (follow-up), a busy
owner (likely no). 6 behaviour presets (`fixtures/personas.ts`). Each agent account has two past
calls (88 A, and a 17 F with QA deductions) for the calls list and report card.

## Design notes

- The demo story is the agent's screen: make Nugget → Dashboard → Ad Studio → Nugget obvious, and
  the ringing moment and the 90s countdown feel like a real call centre tool.
- Keep the terminal's subtitle toggle (English default).
- The scorecard should make deductions loud (they are the "penalised report card").
