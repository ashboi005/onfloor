# OnFloor demo foundation: what the system is, and the questions we need answered

**For:** Mansukh to answer · **Then:** Ashwath, Harnoor and Tushar build from the answers
**Status:** awaiting answers · 2026-10-10

This doc has no recommendations. §1–§3 describe what OnFloor is, how the system works today, and what
it can be configured with. §4 lists what's already decided. §5 is the questions. The demo company,
its product, its customers, the personas, the CRM and the knowledge base are all defined from your
answers.

---

## 1. What we are: OnFloor

OnFloor is a platform for **phone-based sales and support teams** (inside sales, call centres, BPOs). It
covers an agent's whole lifecycle in three pillars:

1. **Simulator (training).** A trainee talks by voice to an AI customer while working a mock CRM on
   screen. The AI customer behaves like a real, difficult customer of the company the trainee works for.
2. **Live copilot (on real calls).** During a real customer call (the demo uses Telegram), a dashboard
   shows the agent live hints, policy warnings, customer sentiment, talk-time and silence alerts,
   what's known about the customer from earlier calls, and an English transcript.
3. **QA scorecard (after every call).** Every call, simulated or real, is scored automatically:
   objection handling, policy compliance, soft skills, and (in the simulator) whether the CRM was used
   correctly. It shows the moments that decided the call and what a strong agent would have said.

The link between the pillars: **a real call becomes a training persona.** After a live call, the system
builds an AI customer that behaves like that real customer, and trainees can replay the call in the
simulator.

For the demo, OnFloor is shown **deployed at a company**: a fictional business whose agents sell to
or serve their customers by phone. That company, what it sells and who it sells to don't exist yet.
Defining them is what this doc is for.

## 2. How the system works today (all of this runs end to end)

| Part | What it does | What it's driven by |
|---|---|---|
| **AI customer (simulator)** | Talks by voice in English, Hindi or Hinglish; reacts to what the agent actually says; has patience that rises and falls; nudges or hangs up on long silences; can interrupt; asks for account changes during the call; can agree, refuse, or end the call | the **persona** + the **scenario** + the **company knowledge** |
| **Mock CRM (simulator)** | A screen the trainee works during the call. Every change is recorded with a timestamp and checked against what the customer asked for | the **CRM field list** |
| **Live copilot** | Transcribes both sides of a real call separately, then shows hints (instant keyword ones and AI ones), policy warnings mid-sentence, sentiment, talk-ratio and dead-air alerts, customer memory, and English subtitles | the **policies** + the **company knowledge** |
| **Scorecard** | Judges the call against the **policies** and the **company knowledge**, and computes the talk statistics and the CRM audit | policies + knowledge + CRM |
| **Knowledge base (RAG)** | Searchable company documents. The AI customer, the copilot and the judge all ground themselves in them. Also stores memory per customer, each agent's past mistakes, and strong lines from good calls, automatically after every call | the **company documents** |
| **Persona extraction** | After a live call, builds a replayable AI customer from what the real customer said and did | the real call |
| **Persona tuning** | Before a simulated call, a trainer can adjust a persona's archetype, patience, aggression, price sensitivity, talkativeness, pace, interrupting and voice, or save the result as a new persona | the UI |
| **Subtitles** | Hindi/Hinglish transcript lines get an English translation 1–2.5s later; screens can switch between original and English | automatic |

What's **dynamic** (decided during the call): everything the AI customer says and when, its patience,
when it asks for account changes, whether it says yes, no or "call me back", the hints, the warnings,
the sentiment, the scores, and what gets remembered.

What has to be **defined once** (the "world"): everything §5 asks about.

### 2.1 What the system needs from each answer (the shapes it can hold)

So the answers fit what's built:

| Thing | What the system can hold |
|---|---|
| **Company knowledge** | Markdown documents of any length, organised by headings. Every fact the AI may quote (prices, rules, timelines) has to be written in them |
| **Policies** | A list of rules, each marked *warn* or *critical*, optionally with the approved phrasing to use instead |
| **Scenario** | A title, a brief (what the agent is told), an objective, the starting CRM values, the policies that apply, and a soft and hard time limit |
| **Persona** | Name, role, business details, archetype, language (English/Hindi/Hinglish), voice, four traits on 0–10 (patience, aggression, price sensitivity, talkativeness), backstory, goals, objections, tactics, pace, whether they interrupt, catchphrases, an opening line, and the account changes they'll ask for during the call |
| **CRM** | A set of fields, each one of: number (with min/max/step), choice from a list, multiple choices, yes/no, free text, or date. Plus the actions a trainee can take. Every change is tracked and auditable |
| **Voices** | 3 ElevenLabs and 2 Sarvam voices are currently audited for Hindi/Hinglish (all male); more can be added |
| **Languages** | English, Hindi, Hinglish |

## 3. What's in the system right now (placeholders, to be replaced)

This is test content written during development so the pipeline could be exercised. Nothing here is a
decision.

| Piece | Where it lives | Current placeholder |
|---|---|---|
| Company | `apps/server/knowledge/onfloor-ads-playbook.md` | "OnFloor Ads", a local-advertising platform selling Basic/Premium/Premium Plus plans to restaurants |
| Scenario | `packages/contracts/fixtures/scenarios.ts` | Upgrade a restaurant owner from Basic to Premium within a 10% discount |
| Policies | same file + `apps/server/src/modules/live/policies.ts` | discount ≤10%, no next-day activation, only reach guaranteed, recording disclosure, no refund promises |
| Personas | `packages/contracts/fixtures/personas.ts` | Rakesh (restaurant), Arjun (cloud kitchen), Vikram (café), Suresh (from a live call) |
| CRM | `packages/contracts/src/crm.ts`, `apps/web/src/components/sim/crm/mock-crm.tsx` | budget, campaign status, plan, discount, weekend notifications, target radius, ad categories, notes, plus placeholder Leads/Invoices tabs |

Problems found while testing, which these answers need to resolve:
- The placeholder company is called "OnFloor Ads", which collides with our own name, OnFloor.
- The CRM fields are a loose collection rather than a defined workflow.
- Prices and plan details aren't consistent between the knowledge base and the personas.
- The context reads closer to B2C than the intended B2B.

## 4. Already decided

1. **The CRM exists only in the simulator.** Live (Telegram) calls have no CRM and no customer →
   account mapping. A live customer may ask for account changes; the agent just acknowledges them,
   nothing is highlighted, and nothing is scored for it.
2. **A persona must never make the agent break policy.** Customer demands that breach policy are
   objections the agent should handle, never account changes the agent gets credit for making.
3. **Copilot hints appear as fast as possible**, and several can be on screen at once.
4. **Subtitles** are translated by Merge only (never Gemini), may arrive a little late, and every
   screen can switch between the original and English.
5. **Nothing in a call is scripted.** The world is fixed; the conversation and the outcome are not.
6. **Whenever the company, scenario, personas, CRM or policies change, the knowledge base is
   reseeded to match** (`docs/specs/07-rag.md` §7).

## 5. Questions for Mansukh

Answer in place (write under each question). Where something has several parts, answer each part.

### A. The company the demo is set at

**A1.** What is the company called, and what does it do (in one or two sentences a judge would
understand)?
Answer:

**A2.** What industry is it in, and where does it operate (country, cities, languages its customers
speak)?
Answer:

**A3.** How does the company make money? (Its business model: what it charges for, and how.)
Answer:

**A4.** Who are its customers? Describe the businesses it sells to: their type, size, who the person
on the phone is (owner? manager? role?), and what they care about.
Answer:

**A5.** Who are its competitors, and what does the company say about them (true facts the agent may
use)? Are the competitor names fictional or real?
Answer:

**A6.** Is there anything that must never appear (real brand names, real people, prices close to a real
company's, sensitive topics)?
Answer:

### B. What's being sold

**B1.** What exactly does the agent sell on these calls? List every product/plan/service with its
name, price, billing period and what's included.
Answer:

**B2.** What does the customer get out of it (the outcome they're paying for)? What can and can't be
promised or guaranteed?
Answer:

**B3.** What are the commercial terms an agent negotiates (discounts, billing terms, start dates,
contract length, add-ons, anything else)? What are the limits on each?
Answer:

**B4.** What happens after the customer says yes (activation, onboarding, timelines, who does what)?
Answer:

### C. The sales team and its rules

**C1.** Who are the agents (job title, team name), and what's their target or goal on a call?
Answer:

**C2.** What kind of calls do they make: outbound or inbound, new or existing customers, sales,
renewal, upsell, retention, support? Which one is the demo about?
Answer:

**C3.** List every policy an agent must follow on a call. For each: the rule, whether breaking it is
*critical* or a *warning*, and (if there is one) the exact approved line to say instead.
Answer:

**C4.** What should an agent do when a customer asks for something outside policy (escalate to a
manager, refuse, offer an alternative)? Is there anything the agent can *do* in the CRM for this?
Answer:

**C5.** Are there mandatory things to say on every call (disclosures, greetings, verification steps)?
Answer:

### D. The demo scenario (simulator)

**D1.** What is the scenario's title, and what is the agent told before the call (the brief)?
Answer:

**D2.** What is the agent's objective on the call, and what counts as success?
Answer:

**D3.** What makes the call difficult (the objections, pressure and tricks the customer will use)?
Answer:

**D4.** How long should the call be allowed to run (a soft limit when the customer starts wrapping up,
and a hard limit)?
Answer:

**D5.** One scenario or more? If more, describe each the same way (D1–D4).
Answer:

### E. The personas (AI customers)

For each persona, fill in this template (copy it once per persona):

| Field | Answer |
|---|---|
| Name | |
| Role / title | |
| Business (name, type, size, city) | |
| Their current situation with the company (current product/plan, history, what's going wrong) | |
| Personality in a few words | |
| Archetype (impatient / price-squeezer / skeptic / other: describe) | |
| Language (English / Hindi / Hinglish) | |
| Voice (male/female, age, accent; we'll match it to an available voice) | |
| Patience 0–10 | |
| Aggression / politeness 0–10 (0 = very polite, 10 = confrontational) | |
| Price sensitivity 0–10 | |
| Talkativeness 0–10 | |
| Pace (slow / normal / fast) · interrupts? (yes / no) | |
| Backstory (2–4 sentences) | |
| What they actually want from the call | |
| Their objections, in their own words | |
| Their tactics (how they pressure the agent) | |
| Phrases they'd typically say | |
| How they open the call | |
| Account changes they'll ask for during the call (each must be something the agent is allowed to do) | |
| What would make them say yes, what would make them refuse, and what would make them hang up | |

**E1.** How many personas, and which scenario does each belong to?
Answer:

**E2.** Anything the personas must or must not do (tone limits, topics to avoid)?
Answer:

### F. The CRM (simulator only)

**F1.** What is the CRM screen called, and whose account is on screen during a call?
Answer:

**F2.** What information should the agent be able to *see* about the customer (read-only facts)? List
each item and its value for each persona.
Answer:

**F3.** What should the agent be able to *change* during the call? For each field: name, type (number /
choice / multiple choice / yes-no / text / date), allowed values or range, and its starting value per
persona.
Answer:

**F4.** What *actions* should the agent be able to take beyond editing fields? For each: what it does
and when it's the right thing to do.
Answer:

**F5.** How should the CRM be laid out (sections, tabs, order)? Should it show anything calculated
(totals, prices)? If so, how is it calculated?
Answer:

**F6.** Which CRM actions should the scorecard check, and what counts as "done correctly" for each?
Answer:

### G. The knowledge base (what the AI knows)

**G1.** Which documents does the company have that its agents would use? List each one and what's in it.
Answer:

**G2.** Who writes them, and by when? (They're markdown; every number and rule the AI may mention has to
be in them.)
Answer:

**G3.** What should the AI customer know about the company (public information) versus what only the
agent knows (internal policies, approval limits)?
Answer:

### H. The live call (Telegram)

**H1.** Who plays the customer on the live call during the demo, and in which language?
Answer:

**H2.** What is the live call about? Is it the same company and situation as the simulator, or
different?
Answer:

**H3.** What should the agent's dashboard emphasise during the live call (which hints, warnings and
information matter most for this company)?
Answer:

### I. The demo itself

**I1.** How long is the demo, and in what order are things shown?
Answer:

**I2.** Who presents, who drives each screen, and who plays which role?
Answer:

**I3.** What's the one sentence the judges should remember about OnFloor?
Answer:

**I4.** What should the landing page and article say about OnFloor and about the demo company, and how
should the two be told apart?
Answer:

**I5.** Is there anything else a judge might ask that we should have an answer for (pricing of OnFloor
itself, who buys it, data privacy, how it would be rolled out)?
Answer:

---

## 6. What happens with the answers

| Answers | Turned into | By |
|---|---|---|
| A, B, C, G | The knowledge-base documents, reseeded; the policy list used by the guardrails and the scorecard | Mansukh (content), Ashwath (ingest) |
| D, E | The scenario(s) and personas in `packages/contracts/fixtures`; the AI customer's behaviour | Ashwath |
| F | The CRM fields and actions, the CRM audit and its scoring | Ashwath (data + scoring), Harnoor (CRM screen) |
| H | Live copilot hints and policies | Tushar |
| I | Run-of-show, landing page, article | Mansukh |
