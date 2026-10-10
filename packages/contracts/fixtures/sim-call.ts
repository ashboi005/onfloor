import { GUIDANCE_STEPS, type GuidanceState, type GuidanceStepId, type GuidanceTip, type SimServerMessage, type Timed, type TranscriptTurn } from "../src";

/**
 * A scripted ~2 min simulator call: Ashwath pitches Max Grow to Rajesh Sharma (Sharma Ji Ke
 * Chhole Bhature, the demo merchant), with guidance on. Mock `useSimCall` replays this; the
 * server's sim stub does the same over the WS.
 *
 * Three parts, because the agent drives the transitions:
 *   simRingTimeline    from session start: dialing → ringing (the agent then sends `answer`)
 *   simCallTimeline    from `answer`: the conversation (agent lines included, no mic needed)
 *   simWrapUpTimeline  from hang-up: the disposition suggestion
 * Workspace actions (lookup, launch, email, dispose) are the agent's clicks, not in the fixture;
 * the mock answers them with the same pure functions the server uses.
 */
export const SIM_CALL_ID = "call_sim_demo";
export const SIM_CALL_DATE = "2026-10-10";
const HARD_LIMIT_MS = 600_000;

let seq = 0;
function turn(speaker: TranscriptTurn["speaker"], text: string, startMs: number, endMs: number): TranscriptTurn {
  seq += 1;
  return { id: `turn_sim_${seq}`, callId: SIM_CALL_ID, seq, speaker, text, language: "hinglish", startMs, endMs };
}


const t = {
  c0: turn("customer", "Hello? Haan ji, boliye.", 1200, 2600),
  a1: turn("agent", "Good morning, sir. My name is Ashwath. I am calling from the Tomato team. Kya meri baat Rajesh Sharma ji se ho rahi hai, Sharma Ji Ke Chhole Bhature se?", 3000, 9500),
  c1: turn("customer", "Haan ji, main Rajesh hi bol raha hoon. Bataiye, kya baat hai?", 10500, 13500),
  a2: turn("agent", "Thank you sir. Aap hi restaurant ke owner hain na, financial decisions aap hi lete hain?", 14500, 18500),
  c2: turn("customer", "Haan, dukaan meri hai. Sab main hi dekhta hoon.", 19500, 22500),
  a3: turn("agent", "Sir, ek baar details confirm kar leta hoon. Aapka registered email rajesh.sharma@sharmajichholebhature.in hai aur phone 98110 42271, sahi hai?", 26000, 33000),
  c3: turn("customer", "Haan ji, sab sahi hai.", 34000, 36000),
  a4: turn("agent", "Thank you sir. Sir, hum aapke liye Max Grow plan laaye hain. Jab koi Tomato pe chhole bhature search karega, aapka restaurant sabse upar dikhega, top-selling list mein bhi.", 40500, 51000),
  c4: turn("customer", "Achha. Waise mera restaurant search mein neeche kyun aata hai? Naye wale upar dikhte hain.", 52000, 57000),
  a5: turn("agent", "Sir, visibility ke liye teen cheezein help karti hain: menu quality improve kijiye, items ki photos daaliye, abhi 42 mein se sirf 11 items pe photo hai, aur orders kam reject kijiye. Max Grow uske upar aapko top pe le aata hai.", 58000, 70000),
  c5: turn("customer", "Theek hai. Isme kitna katega?", 71000, 73500),
  a6: turn("agent", "Sir, sirf 20% lagta hai, aur woh bhi sirf extra sales pe. Aapka daily average abhi 100 rupaye hai. Agar sales 200 ho gayi, toh extra 100 pe 20%, yaani 20 rupaye. Agar sales 100 ya usse kam rahi, toh zero deduction. Weekly payout se adjust hota hai, aur aap kabhi bhi band kar sakte hain.", 76500, 91000),
  c6: turn("customer", "Achha, badhiya. Theek hai, laga do.", 92000, 95000),
  a7: turn("agent", "Done sir. Aapka Max Grow campaign aaj, October 10th se start ho raha hai aur November 10th tak chalega, ek mahine ke liye.", 112000, 119000),
  c7: turn("customer", "Theek hai, badhiya.", 120000, 121500),
  a8: turn("agent", "Thank you for selecting our plan. Is there anything else I can help you with today?", 122500, 127000),
  c8: turn("customer", "Nahi, bas itna hi. Dhanyavaad.", 128000, 130500),
};

/** English subtitles for the Hinglish lines (mock: they arrive ~1.5s after each turn). */
export const simCallTranslations: Record<string, string> = {
  [t.c0.id]: "Hello? Yes, go ahead.",
  [t.a1.id]: "Good morning, sir. My name is Ashwath. I am calling from the Tomato team. Am I speaking with Rajesh Sharma ji, from Sharma Ji Ke Chhole Bhature?",
  [t.c1.id]: "Yes, this is Rajesh. Tell me, what is it about?",
  [t.a2.id]: "Thank you sir. You are the owner of the restaurant, and you take the financial decisions?",
  [t.c2.id]: "Yes, the shop is mine. I handle everything.",
  [t.a3.id]: "Sir, let me confirm your details once. Your registered email is rajesh.sharma@sharmajichholebhature.in and phone 98110 42271, correct?",
  [t.c3.id]: "Yes, it's all correct.",
  [t.a4.id]: "Thank you sir. Sir, we have the Max Grow plan for you. When someone searches for chhole bhature on Tomato, your restaurant will show at the very top, and in the top-selling list too.",
  [t.c4.id]: "Okay. By the way, why does my restaurant come so low in search? The new places show up above me.",
  [t.a5.id]: "Sir, three things help visibility: improve the menu quality, add photos to your items, right now only 11 of 42 items have a photo, and reject fewer orders. Max Grow then takes you to the top on top of that.",
  [t.c5.id]: "Okay. How much will be cut for this?",
  [t.a6.id]: "Sir, it's only 20%, and only on the extra sales. Your daily average right now is 100 rupees. If sales go to 200, it's 20% of the extra 100, so 20 rupees. If sales stay at 100 or below, there's zero deduction. It's adjusted from the weekly payout, and you can stop it whenever you want.",
  [t.c6.id]: "Okay, great. Fine, put it on.",
  [t.a7.id]: "Done sir. Your Max Grow campaign starts today, October 10th, and runs till November 10th, for one month.",
  [t.c7.id]: "Okay, great.",
  [t.a8.id]: "Thank you for selecting our plan. Is there anything else I can help you with today?",
  [t.c8.id]: "No, that's all. Thank you.",
};

const msg = (atMs: number, event: SimServerMessage): Timed<SimServerMessage> => ({ atMs, event });
const timer = (ms: number) => msg(ms, { type: "timer", elapsedMs: ms, remainingMs: HARD_LIMIT_MS - ms });
const say = (tr: TranscriptTurn): Timed<SimServerMessage>[] =>
  tr.speaker === "customer"
    ? [
        msg(tr.startMs - 800, { type: "persona_state", state: "thinking" }),
        msg(tr.startMs, { type: "persona_state", state: "speaking" }),
        msg(tr.startMs, { type: "turn", turn: tr }),
        msg(tr.startMs, { type: "persona_audio", turnId: tr.id, audioUrl: "" }),
        msg(tr.endMs, { type: "persona_state", state: "idle" }),
      ]
    : [msg(tr.endMs, { type: "turn", turn: tr })];
const subtitle = (tr: TranscriptTurn): Timed<SimServerMessage> =>
  msg((tr.speaker === "customer" ? tr.startMs : tr.endMs) + 1500, {
    type: "turn_translation",
    turnId: tr.id,
    translation: simCallTranslations[tr.id] ?? tr.text,
  });

// --- Guidance as the server would stream it (tool steps assume the agent clicked along) -------

const tips: GuidanceTip[] = [];
function guidance(atMs: number, done: GuidanceStepId[], next: GuidanceState["next"], tip?: Omit<GuidanceTip, "id" | "atMs">): Timed<SimServerMessage> {
  if (tip) tips.unshift({ ...tip, id: `tip_${tips.length + 1}`, atMs });
  return msg(atMs, {
    type: "guidance",
    guidance: {
      steps: GUIDANCE_STEPS.map((s) => ({ id: s.id, status: done.includes(s.id) ? "done" : "todo" })),
      next,
      tips: tips.slice(0, 3),
    },
  });
}

export const simRingTimeline: Timed<SimServerMessage>[] = [
  msg(0, { type: "phase", phase: "dialing", remainingMs: null }),
  msg(3200, { type: "phase", phase: "ringing", remainingMs: null }),
];

export const simCallTimeline: Timed<SimServerMessage>[] = [
  msg(0, { type: "phase", phase: "connected", remainingMs: null }),
  msg(0, { type: "state", status: "active", elapsedMs: 0 }),
  msg(0, { type: "patience", value: 70 }),
  guidance(0, [], { stepId: "greeting", text: "Good morning, sir. My name is Ashwath. I am calling from the Tomato team.", target: "nugget.ticket" }),
  ...say(t.c0),
  ...say(t.a1),
  guidance(10000, ["greeting", "verify_identity"], { stepId: "verify_owner", text: "Are you the right person to make financial decisions for this restaurant?", target: null }),
  ...say(t.c1),
  timer(15000),
  ...say(t.a2),
  ...say(t.c2),
  guidance(23000, ["greeting", "verify_identity", "verify_owner"], { stepId: "lookup", text: "Copy UID 21847390 from Nugget into Merchant Dashboard.", target: "nugget.uid" }),
  timer(30000),
  ...say(t.a3),
  ...say(t.c3),
  guidance(
    40000,
    ["greeting", "verify_identity", "verify_owner", "lookup", "confirm_details"],
    { stepId: "pitch", text: "Pitch Max Grow: top of search for the dishes they sell; 20% only on sales above ₹100/day.", target: "calculator" },
  ),
  ...say(t.a4),
  timer(45000),
  ...say(t.c4),
  guidance(
    57500,
    ["greeting", "verify_identity", "verify_owner", "lookup", "confirm_details", "pitch"],
    { stepId: "campaign", text: "Answer the visibility question, then ask if he'd like to go ahead.", target: null },
    { kind: "answer", text: "Visibility: improve menu quality, add photos (only 11 of 42 items have one), and reject fewer orders (6.8% in the last 30 days)." },
  ),
  timer(60000),
  ...say(t.a5),
  ...say(t.c5),
  guidance(
    76000,
    ["greeting", "verify_identity", "verify_owner", "lookup", "confirm_details", "pitch"],
    { stepId: "campaign", text: "Explain the billing with his numbers.", target: "calculator" },
    { kind: "answer", text: "20% only on sales above ₹100/day: ₹100 → ₹200 is ₹20. At or below ₹100: zero deduction. Weekly from the payout; stop anytime." },
  ),
  timer(75000),
  ...say(t.a6),
  timer(90000),
  ...say(t.c6),
  guidance(
    98500,
    ["greeting", "verify_identity", "verify_owner", "lookup", "confirm_details", "pitch"],
    { stepId: "campaign", text: "He said yes. Ad Studio: UID 21847390, rajesh.sharma@sharmajichholebhature.in, Max Grow, Oct 10 → Nov 10.", target: "tab.ad_studio" },
  ),
  timer(105000),
  guidance(
    110000,
    ["greeting", "verify_identity", "verify_owner", "lookup", "confirm_details", "pitch", "campaign"],
    { stepId: "dictate_timeline", text: "Your campaign starts today, October 10th, and runs through November 10th for one month.", target: null },
  ),
  ...say(t.a7),
  ...say(t.c7),
  guidance(
    121700,
    ["greeting", "verify_identity", "verify_owner", "lookup", "confirm_details", "pitch", "campaign", "dictate_timeline"],
    { stepId: "closing", text: "Thank you for selecting our plan. Is there anything else I can help you with today?", target: null },
  ),
  timer(120000),
  ...say(t.a8),
  guidance(
    127500,
    ["greeting", "verify_identity", "verify_owner", "lookup", "confirm_details", "pitch", "campaign", "dictate_timeline", "closing"],
    { stepId: "disposition", text: "After the call: send the acceptance email and dispose as Accepted within 90s.", target: "disposition.email" },
  ),
  ...say(t.c8),
  msg(131500, { type: "ended", reason: "persona_hung_up", callId: SIM_CALL_ID }),
  msg(131500, { type: "phase", phase: "wrap_up", remainingMs: 90_000 }),
  ...Object.values(t).map(subtitle),
].sort((a, b) => a.atMs - b.atMs);

export const simWrapUpTimeline: Timed<SimServerMessage>[] = [
  msg(2500, {
    type: "disposition_suggestion",
    suggestion: {
      outcome: "accepted",
      template: "campaign_accepted",
      callback: null,
      reason: "Rajesh agreed to Max Grow and the campaign is set up from October 10th to November 10th. Send the acceptance email and dispose as Accepted.",
    },
  }),
];

export const simCallTranscript: TranscriptTurn[] = Object.values(t);
