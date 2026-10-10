# Live call rehearsal script (Telegram, ~1:15)

A short Hinglish call to rehearse the **live pillar**: two real people on a Telegram call, the
OnFloor HUD open on the agent's screen. Each customer line is written so the copilot pulls a
specific section of the Tomato policy document from RAG
(`apps/server/knowledge/tomato-live-call-guide.md`) and shows it as a hint with a 📘 source chip.

- **Agent:** Ashwath, Tomato merchant sales team (wears the headset on the bridge laptop).
- **Customer:** Vikas Gupta, owner of Gupta Sweets & Snacks, Lucknow (calls the bridge account on Telegram).
- Speak naturally and at a normal pace. Leave a beat (~1s) after each customer line so the hint can
  land before the agent answers. Lines don't have to be word-perfect; the keywords in **bold** matter.

| # | Who | Line | What the HUD should show |
|---|---|---|---|
| 1 | Agent | Good morning, sir. My name is Ashwath. I am calling from the Tomato team. Kya meri baat Vikas Gupta ji se ho rahi hai, Gupta Sweets & Snacks se? | Talk metrics start. (Standard opening, which QA checks) |
| 2 | Customer | Haan, main Vikas hi bol raha hoon. Bataiye, **kya offer hai**? | Hint: why you're calling / pitch line ("Opening the call") |
| 3 | Agent | Sir, aap restaurant ke owner hain na, financial decisions aap hi lete hain? | (Decision-maker check) |
| 4 | Customer | Haan, sab main hi dekhta hoon. Par ek baat, **naye restaurants search mein upar dikhte hain, mera kaise upar aayega**? | Keyword hint "How to get more visibility" + grounded hint from the visibility guide 📘 |
| 5 | Agent | Sir, teen cheezein: menu quality improve kijiye, menu mein photos daaliye, aur orders kam reject kijiye. Aur hamara Max Grow plan aapko search aur top-selling list mein sabse upar le aata hai. | |
| 6 | Customer | Achha. **Isme kitna katega**? | Keyword hint "How much is cut" (20% of incremental: DRR ₹100 → sales ₹200 → ₹20/day) 📘 |
| 7 | Agent | Sir, sirf 20%, aur woh bhi sirf extra sales pe. Aapka daily average abhi 200 rupaye hai. Agar sales 300 ho gayi, toh extra 100 pe 20%, yaani 20 rupaye din ka. | |
| 8 | Customer | Aur **agar sales nahi badhi, toh bhi paisa katega kya? Koi risk** toh nahi? | Keyword hint "Worried about paying without growth" + grounded "zero deduction at or below the DRR" 📘 |
| 9 | Agent | Bilkul nahi, sir. Agar sales 200 ya usse kam rahi, toh zero deduction. | Sentiment: patience/engagement up |
| 10 | Customer | Hmm. Par **bees percent bahut zyada hai, das percent kar do**. **Mere dost ko kam mila** tha. | Keyword hint "Asks for a lower rate" (hold the 20%, non-negotiable) 📘 |
| 11 | Agent | Sir, 20% sabke liye same hai, ise kam nahi kar sakte. Lekin yeh sirf extra sales pe hai; jo sales aap abhi karte ho, us pe kuch nahi lagta. | (No guardrail: a refusal is not a violation) |
| 12 | Customer | Theek hai. **Kab katega**, aur **beech mein band karna ho** toh kar sakta hoon? | Keyword hint "When it's deducted" (weekly from payout) + grounded hint "stop anytime" 📘 |
| 13 | Agent | Weekly aapke Tomato payout se adjust hota hai, upfront kuch nahi. Aur aap jab chahein band kar sakte hain. | |
| 14 | Customer | Theek hai, **laga do**. Campaign start karo. | Keyword hint "Buying signal: close now" + grounded "dictate the dates" 📘 |
| 15 | Agent | Done sir. Aapka campaign aaj, October 10th se start ho raha hai aur November 10th tak chalega, ek mahine ke liye. Thank you for selecting our plan. Is there anything else I can help you with today? | |
| 16 | Customer | Nahi, bas itna hi. Thank you. | Call ends → "Scoring…" → scorecard → "Persona created from this call → Replay in simulator" |

## Optional guardrail beat (adds ~10s)

To show a policy warning, replace line 11 with a deliberate slip, then correct it:

> **Agent:** Theek hai sir, aapke liye **commission 15% kar deta hoon**… sorry sir, correction, 20% hi hai, sabke liye same.

Expected: an amber **policy warning** appears on the HUD while the agent is still talking ("Max Grow
is exactly 20%, and only on sales above the DRR"). Live warnings are never shown as a red alarm. The
scorecard notes it too (a slip corrected on the same call costs little).

## Before you rehearse

1. Server deployed (or local) with `VECTOR_DATABASE_URL` set, then `bun run db:seed` once. The seed
   ingests every `apps/server/knowledge/*.md` into RAG, including the live-call guide.
2. The bridge laptop runs `uv run --frozen python bridge.py` with `API_INGEST_URL=wss://<api-host>/internal/live/ingest`
   and the same `BRIDGE_SECRET` as the server. Wait for `API acknowledged call …`.
3. Open `/live` on the agent's screen (signed in as `LIVE_AGENT_EMAIL`), then the customer calls the
   bridge account on Telegram.
4. Hindi/Hinglish lines get English subtitles a second or two later (the transcript toggle defaults to English).

Rehearse it three times; the second and later runs also show the **"Last time…" customer memory**
card at the start (RAG memory of the previous run with the same Telegram caller).
