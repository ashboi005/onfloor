# OnFloor demo foundation: context, proposal, and questions to answer

**For:** Mansukh (answers) · **Then:** Ashwath (contracts, RAG, engine, scoring), Harnoor (CRM UI +
live dashboard UI), Tushar (live event stream, Telegram)
**Status:** awaiting answers · 2026-10-10

## How to use this doc

1. Read §1–§3 (what exists, what's wrong, the two-company model).
2. §4 is a **complete recommended premise**. Every number and name in it is a proposal, not a fact.
3. §5 has the **questions**. Each one has options and my **recommended answer (★)**. Write your answer
   on the `Answer:` line: "★" to accept, or your change. Questions marked 🔴 block implementation;
   the rest can default to ★.
4. §6 shows what changes in the code once it's answered, and who does it.

Ground rule (yours): **nothing is scripted.** The AI customer, the copilot and the scoring react to what
the agent actually says and clicks. What we fix in advance is the *world*: the company, its catalog, its
policies, the CRM, the accounts and the personas. Everything inside the call is dynamic.

---

## 1. What exists today (as built)

The engine is general. The **premise** is a placeholder I wrote early on, and it's spread across
these files:

| Piece | Where | What it currently says |
|---|---|---|
| Demo company | `apps/server/knowledge/onfloor-ads-playbook.md` (RAG) | "OnFloor Ads", a local-ads platform selling Basic / Premium / Premium Plus to restaurants |
| Scenario | `packages/contracts/fixtures/scenarios.ts` | "Pitching Premium Ads to a Skeptical Restaurant Owner": upgrade Rakesh to Premium, ≤10% discount, action his account changes |
| Policies | same file + `apps/server/src/modules/live/policies.ts` | discount ≤10%, no next-day activation, only reach is guaranteed, recording disclosure, no refund promises |
| Personas | `packages/contracts/fixtures/personas.ts` | Rakesh (restaurant, price-squeezer), Arjun (cloud kitchen, impatient), Vikram (café, skeptic), Suresh (extracted from a live call) |
| CRM fields | `packages/contracts/src/crm.ts` → Harnoor's `components/sim/crm/mock-crm.tsx` | monthly budget, campaign status, plan, discount %, **weekend notifications, target radius, ad categories**, notes, plus fake Leads/Invoices tabs |
| Persona "asks" | `crmRequests` per persona | e.g. "make the budget 50,000", "turn off weekend notifications" |

What's dynamic today: the persona's replies, patience, when it asks for each CRM change, hints,
guardrails, sentiment, scoring, golden lines, persona extraction from live calls, customer memory,
each agent's weak spots, subtitles.

## 2. What's wrong with the current premise (my diagnosis)

1. **Name collision.** "OnFloor" is *our* product, and "OnFloor Ads" is also the company in the call. On
   stage it isn't clear who is selling what to whom.
2. **It's B2B on paper but reads like B2C.** The customer *is* a business (a restaurant), but the
   vocabulary is consumer-ish: diners, weekend notifications, "ad categories: dine-in/delivery". There
   is no account, no deal, no pricing math, nothing a B2B sales rep actually works with.
3. **The CRM has no workflow.** It's a list of unrelated toggles. A real B2B CRM is organised around
   **account → opportunity (deal) → activity**. Our fields don't add up to "a deal": there's no price
   shown, no term, no start date, no approval flow, no call outcome or next step.
4. **The catalog isn't defined.** Prices don't agree across files (the playbook says Premium needs a
   ₹40k budget; personas say "Basic ₹30,000/mo" and "Premium ₹80,000/mo"). The AI then improvises
   numbers, the judge grounds itself in the playbook, and they disagree.
5. **Policy only exists in speech.** "Above 10% needs manager approval" has no CRM equivalent, so the
   right behaviour (escalate) isn't something the agent can *do* on screen.
6. **Personas aren't tied to CRM records.** Rakesh's business facts live in his persona text, and the CRM
   shows generic defaults. Nothing guarantees the call and the screen tell the same story.
7. **"Dashboard" means three different screens** (trainee workspace, live HUD, manager views), and their
   relationship to the CRM was never defined.

## 3. The two-company model (the key decision)

```
┌──────────────────────────── LAYER 1: our startup ────────────────────────────┐
│ OnFloor: AI training + live copilot + QA for B2B sales/support floors         │
│ We sell to: heads of sales/ops at companies running inside-sales/BPO floors   │
│ They buy: faster ramp, fewer policy breaches, 100% QA coverage                │
└───────────────────────────────────┬──────────────────────────────────────────┘
                                    │ deployed at (the demo tenant)
┌──────────────────────────── LAYER 2: the demo tenant ────────────────────────┐
│ A fictional B2B company whose sales floor uses OnFloor                         │
│ Its agents sell <PRODUCT> to <BUSINESS CUSTOMERS> over the phone               │
│ Its CRM, catalog, policies and accounts = what the AI customer, CRM and RAG    │
│ must agree on                                                                  │
└───────────────────────────────────────────────────────────────────────────────┘
```

Judges must understand **both layers in one sentence each**. Layer 1 is the pitch; Layer 2 is the
stage set for the demo. The tenant needs its **own name**, never "OnFloor".

## 4. Recommended premise (★, for you to accept or change)

### 4.1 Candidate tenants

| | A. Restaurant-partner growth ★ | B. Merchant payments | C. B2B SaaS inside sales |
|---|---|---|---|
| Tenant | Food-ordering & dining marketplace (Swiggy/Zomato-like) | POS/QR + payment gateway (Paytm/Pine Labs-like) | SME payroll/HR software |
| Rep sells | Paid **Growth plans** (guaranteed visibility) to restaurant partners | POS devices + MDR pricing plans to retailers | Seats + annual plans to SMEs |
| Buyer | Restaurant owner / cloud-kitchen founder | Shop owner / retail chain | HR/finance head |
| Fits PRD | **exactly** (the PRD's "merchant ad portal, budget, campaign switches, discount slider") | partly | weakly |
| Rework | **least**: same engine, scoring, policies, RAG shape, personas | medium: new catalog, CRM, policies | high |
| Hinglish realism | high | high | low (mostly English) |

**Recommendation: A, rebuilt properly.** The PRD describes it, every subsystem already maps onto it, and
the problems in §2 are about definition and the CRM, not the industry. B is the strong runner-up if you
want an unmistakably "fintech B2B" feel.

### 4.2 Company (tenant) ★

- **Name:** **Zaika**, a food-ordering & dining-discovery marketplace in Indian metros. (The competitor
  stays **Zestify**.)
- **Team on the floor:** *Zaika Partner Growth*, an inside-sales/account-management team (in-house or
  BPO) that calls **existing restaurant partners** to grow their revenue on Zaika.
- **How Zaika makes money:** (1) **commission on every order**, a flat **18%** (industry-realistic; it's
  never negotiable on calls); (2) **paid Growth plans**, a monthly subscription for visibility. The
  Partner Growth team's target is **plan revenue (MRR) and partner retention**.

### 4.3 What's sold and what the customer buys ★

| Plan | Price / month | What the restaurant gets | Min. ad budget |
|---|---|---|---|
| **Listing** (current default) | ₹0 | Listed in search, commission only | – |
| **Growth** | ₹12,000 | Featured placement, **guaranteed 15,000 impressions/month within 5 km**, Weekend Boost (Fri–Sun priority), weekly performance report | ₹10,000 |
| **Growth Plus** | ₹25,000 | Growth + 40,000 impressions within 8 km, banner slot, dedicated account manager | ₹25,000 |

- **Ad budget** = a separate monthly sponsored-listing wallet (CPC), min/max per plan, which the merchant
  can change.
- **Billing term:** monthly, or quarterly at 5% off.
- **Customer outcome they're buying:** more orders in slow periods (weekends/afternoons) and visibility
  against Zestify. **Guaranteed: impressions only. Never orders or revenue.**

### 4.4 Policies the agent must follow ★ (these drive guardrails, scoring and RAG)

| Policy | Severity | What the agent may do |
|---|---|---|
| Plan discount up to **10% for the first 3 months** | critical above it | Above 10%: **"Request approval" in the CRM**, never promise it verbally |
| Commission (18%) is **never** discounted | critical | Explain value instead |
| **Activation: 3 working days**; priority 2 days on request; next-day only with approval | critical | Set the date in the CRM; request priority |
| Only **impressions** are guaranteed | warn | Never guarantee orders/revenue |
| **Recording disclosure** at the start | warn | Say it in the first 15s |
| No refund promises (billing handles refunds) | critical | Raise a ticket / note |

### 4.5 The sales motion and CRM structure ★

A clean B2B CRM in three parts: **Account → Deal → Activity**. The agent reads the Account, works the
Deal, and logs the Activity. Every edit is a tracked `crm_action` that scoring audits.

```
┌ Header: Mehta's Kitchen · Partner since 2023 · Pune · 3 outlets · Health: ● At risk ─────────────┐
│ [Account]  [Deal]  [Activity]                                                                       │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ACCOUNT (read-only facts, from the account record, the same data the AI customer "knows")          │
│  Current plan: Listing · Commission 18% · Orders last 30d: 1,240 (weekend share 21% ↓)             │
│  Rating 4.2 · Competitor: also on Zestify · Last call: 3 Oct, "asked for pricing, no follow-up"    │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ DEAL (the work)                                                     Monthly total  ₹22,800       │
│  Plan  ( Listing | ●Growth | Growth Plus )           ₹12,000                                       │
│  Billing  ( ●Monthly | Quarterly −5% )                                                            │
│  Ad budget  [ ₹10,000 ▬▬▬▬●──── ]  (min ₹10,000 on Growth)                                         │
│  Discount  [ 10% ▬▬▬▬▬● ] max 10%            [ Request manager approval… ]  ← escalation path      │
│  Activation date  [ 16 Oct ▾ ]  earliest 15 Oct (3 working days)   ☐ Request priority (2 days)    │
│  Add-ons  ☑ Weekend Boost (incl.)  ☐ Banner slot (Plus only)                                        │
├───────────────────────────────────────────────────────────────────────────────────────────────────┤
│ ACTIVITY (log the call)                                                                            │
│  Outcome  ( Committed | Interested–follow up | Callback | Not interested )                         │
│  Next step  [ Send proposal on WhatsApp ]   Follow-up  [ Mon 13 Oct 11:00 ▾ ]                        │
│  Notes  [ …                                                                    ]   [ Save & log ]   │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```

**Actions the CRM supports** (each is tracked and auditable): set plan · set billing term · set ad
budget · set discount (≤10%) · **request manager approval** (with reason) · set activation date ·
request priority activation · toggle add-on · set outcome · set next step + follow-up · add note.

**Removed as clutter:** weekend notifications, ad categories, target radius (it becomes a *plan
attribute*, shown read-only), and the fake Leads/Invoices tabs.

**What the AI customer can ask for** (`crmRequests`, all legitimate): change the ad budget, start on a
specific date, quarterly billing, add the banner, "call me back Monday 11", "send the proposal on
WhatsApp". **Policy-breaching demands** (20% off, live tomorrow, a commission cut) are *objections*
the agent must handle, never CRM requests (decision 2026-10-10).

### 4.6 Demo scenario ★

**"Grow Mehta's Kitchen: upgrade a Listing partner to Growth."** It's an outbound call to an at-risk
partner (weekend orders down, also active on Zestify).

- **Objective (for the agent):** close a Growth (or Growth Plus) upgrade **inside policy**, with the deal
  entered correctly in the CRM (plan, term, budget, discount ≤10% or approval requested, a valid
  activation date) and the call logged with a next step.
- **What makes it hard (persona-driven, not scripted):** the commission objection, a false claim that
  "Zestify is cheaper", a push for 20% off and "live by Saturday", and account changes requested
  mid-call.
- **Success isn't scripted.** The customer can say yes, no or "call me back" depending on the agent. The
  scorecard measures how it was handled.

### 4.7 Personas (all Zaika partners, each with a CRM account record) ★

Every persona gets a **deal zone**, so the outcome is dynamic but believable: what they'd pay at most,
what convinces them, and what makes them hang up.

| Persona | Account | Archetype · default tone | Wants | Deal zone (hidden from the agent) |
|---|---|---|---|---|
| **Rakesh Mehta** | Mehta's Kitchen, 3 outlets, Pune, Listing | price-squeezer · *firm but civil* (aggression 5) | weekend orders, beat Zestify, "a good deal" | Says yes to Growth at ≤₹12k with ≤10% off **if** the agent shows the impressions math and handles commission; walks if pushed to Plus |
| **Arjun Malhotra** | BowlBox cloud kitchen, 6 locations, Bengaluru, already Growth | impatient · *blunt* (aggression 7) | more reach without wasting time | Upgrades to Plus if the agent leads with one number and stays under 30s per answer |
| **Vikram Sethi** | Brew & Bake café, Delhi, Listing | skeptic · *polite* (aggression 3) | proof of ROI | Agrees to a **monthly** Growth trial only if the agent explains how impressions are counted and offers the weekly report |
| **Live-call personas** | extracted after a real call, linked to that customer | as observed | as observed | inferred from the real call |

Trainers can tune any persona before a call (traits, archetype, pace, voice) or save a custom one
(already built).

### 4.8 Knowledge base (RAG) ★

What the AI may "know", written as Zaika's internal documents (markdown, one topic per section):

| Doc | Contents | Used by |
|---|---|---|
| **Partner Growth Playbook** | catalog + prices + what each plan includes, billing terms, activation SLAs | judge, copilot |
| **Policy & compliance** | discount/approval rules, commission rule, guarantee wording, disclosure script, refunds | guardrails, judge |
| **Competitor battlecard** | Zestify (headline vs all-in cost), others | copilot, judge |
| **Objection handbook** | top 10 objections → approved counters, with example lines | copilot, golden lines |
| **Product FAQ** | how impressions are counted, Weekend Boost, reports, how to change a plan | copilot |
| **(automatic)** customer memory, agent weak spots, golden lines | written after every scored call | HUD, simulator, judge |

Rule: **every number the AI customer, the CRM or the copilot can mention must exist in these docs**, and
the account facts in the CRM must match each persona's backstory.

### 4.9 Screens and how they relate to the CRM ★

| Screen | Who | Shows | CRM relation |
|---|---|---|---|
| **Simulator workspace** | trainee | CRM (Account/Deal/Activity) + call panel (voice, transcript, subtitles, patience) | full CRM, every action audited |
| **Live call dashboard (HUD)** | agent on a real Telegram call | hints, guardrails, sentiment, talk metrics, customer memory, subtitles | **none**: no CRM on live calls (Q12 answered) |
| **Calls / Scorecard / Personas** | manager, QA | scores, moments, golden lines, CRM audit, replayable personas | reads the CRM audit |

### 4.10 How it all fits ★

```
SIMULATOR                                         LIVE (Telegram)
trainee picks account+persona(+tuning)            customer calls the Zaika line
  → AI customer (persona + account facts            → bridge → per-channel STT
     + agent's weak spots)                          → copilot (playbook + account + customer memory)
  ↔ trainee talks + works the CRM                     → HUD: hints · guardrails · sentiment · subtitles
  → crm_actions tracked                             → agent talks (no CRM on live calls)
  → hang-up                                         → hang-up
        └──────────────► scoring (transcript + CRM audit + policies + playbook facts) ◄──────────┘
                         → scorecard → memory/weak spots/golden lines into RAG
                         → live call → persona extracted → linked to account → replay in simulator
```

### 4.11 Dynamic vs fixed ★

| Fixed (the world, configured once) | Dynamic (decided in the call) |
|---|---|
| Company, catalog, prices, policies | What the customer says, when, and how patient they are |
| CRM schema and allowed actions | Which account changes they ask for, and when |
| Account records (facts per merchant) | Whether they say yes / no / callback (deal zone + agent behaviour) |
| Persona base traits + deal zone | Hints, guardrails, sentiment, dead-air alerts |
| Scenario objective + success criteria | Scores, moments, golden lines, the CRM audit |
| RAG documents | Customer memory, agent weak spots, extracted personas |

### 4.12 Demo run-of-show (stage directions, not lines) ★

1. **Problem (45s):** ramp time, live-floor freeze, QA covering only ~2% of calls. Introduce OnFloor (Layer 1),
   then "here's Zaika's Partner Growth floor" (Layer 2).
2. **Simulator (2 min):** a trainee calls Rakesh. He pushes on commission and price and asks for account
   changes; the trainee works the Deal tab, hits "Request approval" instead of promising 15%, and logs
   the call. Toggle English subtitles once.
3. **Scorecard (45s):** the score, the moment it went right or wrong, the golden line, the CRM audit.
4. **Live (2 min):** a teammate calls the Zaika line on Telegram. The HUD shows the Account card and
   "Last time…" memory, live hints with playbook citations, and a guardrail firing mid-sentence.
5. **Replay (45s):** the live call becomes a persona → replay it in the simulator.
6. **Close (30s):** what's real vs what's next (more industries, telephony integrations).

---

## 5. Questions to answer

🔴 = blocks implementation. ★ = recommended.

### Business & premise
**Q1 🔴 Which tenant business?** A restaurant-partner growth ★ / B merchant payments / C B2B SaaS / other.
Answer:

**Q2 🔴 Tenant name and competitor names?** ★ "Zaika", competitor "Zestify" (both fictional, no
resemblance claims). (Never "OnFloor" for the tenant.)
Answer:

**Q3 Who is the Layer-1 buyer we pitch OnFloor to?** ★ Heads of sales/ops at B2B inside-sales floors and
BPOs (e.g. a marketplace's partner team, fintech merchant acquisition).
Answer:

**Q4 🔴 Inbound or outbound, new or existing customer?** ★ Outbound call to an **existing** partner
(upsell/retention). Alternatives: inbound complaint-to-upsell, cold acquisition of a new partner.
Answer:

### Catalog & policy
**Q5 🔴 Plans, prices and inclusions:** accept §4.3 ★, or edit the table. (Exact numbers matter: they go
into the RAG, the CRM and the personas.)
Answer:

**Q6 🔴 Commission:** ★ flat 18%, non-negotiable, the same on every plan? Or plan-dependent?
Answer:

**Q7 🔴 Policy list:** accept §4.4 ★ (discount ≤10%/3 months, approval above; commission never;
3-day activation; impressions-only guarantee; disclosure; no refund promises), or edit.
Answer:

**Q8 What happens after "Request manager approval"?** ★ The CRM shows "Pending approval" and the agent must
not promise the discount. (Optional: a simulated manager approves/denies after N seconds, scored either
way.)
Answer:

### Scenario & personas
**Q9 🔴 The headline scenario:** accept §4.6 ★ "Grow Mehta's Kitchen: Listing → Growth", or describe yours.
Do we also want a second scenario (e.g. Arjun's Growth → Plus) or just one, polished?
Answer:

**Q10 🔴 Personas:** accept §4.7 ★ (Rakesh price-squeezer, Arjun impatient, Vikram skeptic, each tied to an
account, with deal zones and the default tones shown), or edit names/businesses/tones/deal zones.
Answer:

**Q11 Default rudeness:** ★ Rakesh 5 (firm but civil), Arjun 7 (blunt), Vikram 3 (polite)? (Trainers can
change it per call anyway.)
Answer:

### CRM & screens
**Q12 🔴 On a live Telegram call, does the agent also use the CRM?** ★ **Yes, read + Deal form**, so the
copilot can notice "customer asked to change the budget, not done in the CRM" and the live scorecard gets
a CRM audit. Alternative: the HUD shows a read-only Account card only (simpler; live calls have no CRM audit).
Answer: ✅ **No (Ashwath, 2026-10-10).** The CRM exists only in the simulator. On a live call there's no CRM,
no Account card and no CRM audit. The customer may still ask for account changes; the agent just
acknowledges them ("sure sir, will do"), nothing is highlighted, and nothing is scored for it.

**Q13 🔴 CRM structure:** accept §4.5 ★ (Account / Deal / Activity, the action list, the removed fields),
or edit. Anything a real partner-growth rep would expect that's missing?
Answer:

**Q14 Live price summary in the Deal tab** (plan − discount + ad budget = monthly total)? ★ yes: it makes
the agent's quoted numbers checkable and gives the judge something to compare.
Answer:

**Q15 Account data:** ★ fictional but consistent (orders, weekend share, rating, last-call note) per persona,
shown in the Account tab and given to the AI customer. Any metrics you want shown?
Answer:

**Q16 Manager views:** ★ calls list + scorecard + personas are enough for the demo (no team leaderboard).
Want a small "floor overview" (today's calls, average score, top breached policy)?
Answer:

### RAG & content
**Q17 🔴 Who writes the knowledge docs?** ★ Mansukh drafts §4.8's five docs (or one long doc with those
sections) from your answers to Q5–Q7; Ashwath ingests them and replaces the current playbook. Format:
markdown, one topic per heading, every number explicit.
Answer:

**Q18 Language of the docs and the demo:** ★ docs in English; the calls in Hinglish (the AI customer
code-switches); subtitles on for the judges.
Answer:

### Live / Telegram
**Q19 How does a Telegram caller map to a CRM account?** ★ A small lookup table (Telegram user id →
account id) for the demo phones; an unknown caller shows "Unknown caller: create account?" Alternatively,
everyone on the demo is "Suresh @ Patil Misal".
Answer: ✅ **No mapping (Ashwath, 2026-10-10).** Telegram callers aren't linked to CRM accounts. (Customer
*memory* still works: it's keyed on the Telegram user id, which has nothing to do with the CRM.)

**Q20 Who plays the live customer on stage, and in which language?** ★ A teammate on a second phone, in
Hinglish, with the WAV replay as the fallback.
Answer:

### Demo
**Q21 Run-of-show:** accept §4.12 ★ (≈7 min), or set the time limit and order.
Answer:

**Q22 What's the one sentence judges should remember?** ★ "OnFloor turns every real call into tomorrow's
practice session, and coaches the agent live while it happens."
Answer:

**Q23 Anything that must NOT appear** (real brand names, real people, prices close to a real company's)?
Answer:

---

## 6. What changes once this is answered

| Change | Owner | Depends on |
|---|---|---|
| Tenant catalog, policies, scenario(s), account records, personas + deal zones (`packages/contracts/fixtures`, `crm.ts` schema) | Ashwath | Q1, Q2, Q5–Q11, Q13, Q15 |
| Persona prompt: account facts + deal zone + yes/no/callback logic (dynamic outcome) | Ashwath | Q9–Q11 |
| CRM actions incl. approval request, activation-date rules, outcome/follow-up; CRM audit + scoring for them | Ashwath | Q8, Q13 |
| Knowledge docs content | Mansukh | Q5–Q7, Q17 |
| Ingest the new docs; wipe old knowledge/memories | Ashwath | Q17 |
| CRM UI rebuild (Account / Deal / Activity, price summary, approval flow) | Harnoor | Q13, Q14 |
| ~~HUD Account card / caller → account mapping~~ | (dropped: Q12, Q19 = no) | |
| Landing page + article reflect Layer 1 / Layer 2 | Mansukh | Q1–Q3, Q22 |
| Demo rehearsal script (stage directions) | Mansukh + all | Q21 |

The checklist for keeping all of this consistent is in `docs/specs/07-rag.md` §7. Everything listed there
changes together.
