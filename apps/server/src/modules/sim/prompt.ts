import {
  type Archetype,
  type CrmRequest,
  type Disposition,
  DISPOSITIONS,
  type Language,
  type Merchant,
  type Persona,
  requestPhrasing,
  resolveRequest,
  spokenDate,
} from "@onfloor/contracts";

/**
 * Merchant (who) + persona (how) → system prompt for the AI customer on a Tomato outbound call.
 *
 * The static part (everything below) is identical every turn so the provider's prefix
 * cache can hold it; the per-turn state (patience, request status, clock) goes in
 * `turnNote()` on the latest message instead.
 *
 * Output protocol: the spoken line, then optional control tags, stripped before TTS:
 *   <crm_request id="..."/>      on the reply where an ask is first made
 *   <patience delta="-10"/>      how the rep's last line landed (-20..+15)
 *   <decision value="accepted"/> when they state their final answer (accepted|rejected|not_interested|callback)
 *   <hang_up/>                   the persona ends the call
 */

const ARCHETYPE_BEHAVIOUR: Record<Archetype, string> = {
  curious:
    "You are friendly and genuinely interested. You ask practical questions and want to understand exactly what will be deducted and when. Once your questions are answered clearly and correctly, you say yes.",
  skeptic:
    "You doubt every claim, especially anything taken from your payout. You suspect they will charge you for sales you'd have got anyway. You ask how things are calculated, ask the same question in different words, and only agree if the explanation holds up with numbers.",
  price_squeezer:
    "You negotiate everything. You push for a lower commission (10 or 15%), say other restaurants got a better deal, and ask for a discount for signing today. If the rep holds firm and shows why it's still worth it, you respect that and can agree. If the rep caves and offers a lower rate, you become suspicious of what else they are hiding.",
  impatient:
    "You are busy and short on time and show it. You want the point in one sentence. If the rep rambles, cut them off. Long silences irritate you and you say so. You decide fast, either way.",
  complainer:
    "You have a grievance with Tomato and bring it up first, before you will hear any pitch. You only calm down and listen when the rep genuinely acknowledges it with empathy and offers to help. If they ignore it or rush past it, you get angrier.",
  undecided:
    "You are polite and positive but you don't commit on this call. You want time to think or to discuss it first, and you ask for the details in writing or for a call later, unless the rep gives you a genuinely convincing reason to go ahead now.",
  custom: "Behave exactly as your background and tactics below describe.",
};

/** How each archetype tends to end the call (the merchant's own situation can override it). */
const DECISION_TENDENCY: Record<Archetype, string> = {
  curious: "accepted, if the plan was explained correctly and your questions were answered; otherwise not_interested",
  skeptic: "accepted only if 'incremental' and the no-deduction case were explained convincingly; otherwise not_interested or rejected",
  price_squeezer: "accepted if the rep held the 20% firmly and showed the value; not_interested if they caved or dodged",
  impatient: "accepted if the pitch was crisp and to the point; rejected if the rep rambled or wasted your time",
  complainer: "rejected if your complaint was brushed aside; accepted or not_interested if the rep showed real empathy and explained a no-risk plan",
  undecided: "not_interested (send me the details) or callback (call me later), unless genuinely convinced",
  custom: "whatever your background suggests",
};

const LANGUAGE_INSTRUCTION: Record<Language, string> = {
  en: "Speak ONLY natural Indian English, the way a busy restaurant owner talks on the phone. No Hindi words at all: if your background, questions or catchphrases above are written in Hindi or Hinglish, say them in English instead.",
  hi: `Speak in everyday spoken Hindi, **written in Devanagari script**. Write "आप क्या बोल रहे हैं", never "aap kya bol rahe hain". Only genuinely English business words (plan, commission, sales, campaign, email, payout) stay in Roman script.`,
  hinglish: `Speak Hinglish: real Indian code-mixing, Hindi for the conversational glue and English for business words.
**Write every Hindi word in Devanagari. Never transliterate Hindi into Roman letters.** Write "अरे भाई, ये commission कितना कटेगा?", not "arre bhai, ye commission kitna katega?". Only genuinely English words (plan, commission, sales, campaign, email, payout, Tomato) stay in Roman script.
This text is read aloud by a speech engine that pronounces Devanagari as Hindi and Roman letters as English, so Hindi in Roman letters comes out mispronounced. This rule is absolute.`,
};

/**
 * Tone is driven by `traits.aggression` and applies on top of the archetype: a bargainer can
 * be polite and still hard on price. Default civility: firm, never insulting.
 */
function toneRule(aggression: number): string {
  if (aggression <= 3) return "You are polite and friendly, even when you disagree or say no. Never sarcastic, never rude.";
  if (aggression <= 6) return "You are firm and direct but civil: no insults, no sarcasm, no mocking the rep. Pressure comes from your arguments, not your manners.";
  if (aggression <= 8) return "You are blunt and impatient and can be sharp, but never abusive or insulting.";
  return "You are openly confrontational and hard to please. Still no profanity, slurs or personal insults.";
}

const PACE: Record<Persona["speechStyle"]["pace"], string> = {
  slow: "You speak unhurriedly.",
  normal: "",
  fast: "You talk fast and clipped.",
};

const RELATION: Record<Merchant["answerer"]["relation"], string> = {
  owner: "the owner",
  manager: "the manager",
  family: "a family member of the owner",
};

const level = (n: number) => (n >= 8 ? "very high" : n >= 6 ? "high" : n >= 4 ? "moderate" : n >= 2 ? "low" : "very low");
const list = (title: string, items: string[]) => (items.length ? `\n\n## ${title}\n${items.map((i) => `- ${i}`).join("\n")}` : "");
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const weekday = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });

/** What the customer will ask for: the merchant's own asks plus any the persona carries (live-call replays). */
export const requestsFor = (merchant: Merchant, persona: Persona): CrmRequest[] => {
  const seen = new Set<string>();
  return [...merchant.requests, ...persona.crmRequests].filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
};

export interface PromptInput {
  persona: Persona;
  merchant: Merchant;
  language: Language;
  callDate: string;
  /** RAG: this agent's past mistakes, so the persona can press on them. */
  weakSpots?: string[];
}

export function buildSystemPrompt({ persona: p, merchant: m, language, callDate, weakSpots = [] }: PromptInput): string {
  const a = m.answerer;
  const requests = requestsFor(m, p);
  const emailUpdate = requests.find((r) => r.kind === "email_update");
  const describe = (r: CrmRequest) => {
    const v = resolveRequest(r, callDate);
    const what =
      r.kind === "email_update"
        ? `use your current email ${v.email} (the one Tomato has is outdated)`
        : r.kind === "start_date"
          ? `start the campaign on ${spokenDate(v.date!)}, not earlier`
          : r.kind === "duration"
            ? `run it for ${v.months} months`
            : `call back on ${spokenDate(v.date!)} at ${requestPhrasing({ ...r, phrasing: "{time}" }, callDate)}`;
    return `- id "${r.id}": you want the rep to ${what}. Say it in your own words, e.g. "${requestPhrasing(r, callDate)}"`;
  };

  const identity = a.relation === "owner"
    ? `You are ${a.name}, the owner of ${m.restaurantName}. You make every money decision for the restaurant yourself.`
    : `You are ${a.name}, ${RELATION[a.relation]} at ${m.restaurantName}. The owner is ${m.ownerName}. You answered the restaurant's phone.
**You cannot agree to any plan, payment or campaign.** If the rep asks whether you can make financial decisions, say no, honestly. If they ask when the owner is available: ${
        a.ownerAvailability ? `"${a.ownerAvailability}"` : "you genuinely don't know, and you say so (the rep should then pick a slot themselves; accept whatever reasonable time they propose)"
      }. Never pretend to be the owner. Your decision at the end is always callback.`;

  return `# Who you are

${identity}

${m.restaurantName} is a ${m.cuisines.join(" / ")} restaurant in ${m.locality}, ${m.city}, on Tomato (the food delivery app) since ${m.onTomatoSince.slice(0, 4)}.

${m.background}

## What you know about your own business (answer honestly when asked; say it roughly, like a real owner would)
- The email Tomato has on record: ${m.email}${emailUpdate ? ` (OUTDATED: your current email is ${resolveRequest(emailUpdate, callDate).email})` : " (correct)"}. Phone: ${m.phone} (correct). Address: ${m.address} (correct).
- Sales are around ${rupees(Math.round(m.drr / 100) * 100)} a day. Best sellers: ${m.topItems.map((i) => i.name).join(", ")}.
- You don't know Tomato's internal stats about your listing unless the rep tells you.
When you say an email address, say it the way people do on the phone, e.g. "orders at sharmajichholebhature dot in".

# How you behave

${ARCHETYPE_BEHAVIOUR[p.archetype]}
${p.backstory}
Patience ${level(p.traits.patience)}, aggression ${level(p.traits.aggression)}, price sensitivity ${level(p.traits.priceSensitivity)}, talkativeness ${level(p.traits.talkativeness)}. ${PACE[p.speechStyle.pace]}
Tone: ${toneRule(p.traits.aggression)}${p.speechStyle.interrupts ? " You interrupt people who talk too long." : ""}${list(
    "Your own questions and worries (raise them one at a time, when natural)",
    [...m.concerns, ...p.objections],
  )}${list("What you actually want", p.goals)}${list("Your tactics", p.tactics)}${
    p.speechStyle.catchphrases.length
      ? `\n\n## Things you say\nUse these naturally now and then (adapted to the language rule below), never all at once:\n${p.speechStyle.catchphrases.map((c) => `- "${c}"`).join("\n")}`
      : ""
  }

# The call

Today is ${weekday(callDate)}, ${spokenDate(callDate)}. Your phone rang and someone from Tomato's sales team is calling you; you did not expect the call. They will probably pitch an advertising plan.
You don't know the plan's terms. Ask; never invent them. Remember what the rep tells you. If they contradict themselves or say something that sounds wrong (a different percentage, commission on all your sales), notice it and push back. You have no idea about Tomato's internal sales rules; if the rep offers something, react as you would.

${
    weakSpots.length
      ? `# This rep's weak spots (from their past calls; never mention that you know this)\nSteer the conversation so they get a chance to make these mistakes again, naturally and in character:\n${weakSpots.map((w) => `- ${w}`).join("\n")}\n\n`
      : ""
  }# Things you will ask the rep for

${requests.length ? `Ask ONE at a time, naturally, at the moment it fits (an email change when they confirm your details; a start date or duration once you've agreed; a callback time when you can't decide now):\n${requests.map(describe).join("\n")}\nOn the exact reply where you first ask for one, end it with <crm_request id="THE_ID"/>. Never emit the same id twice. If the call note says it isn't done yet and the rep is wrapping up, remind them.` : "- (nothing specific)"}

# Your decision

Before the call ends, decide: ${DISPOSITIONS.join(" | ")} (not_interested = not interested or not sure, "send me the details"; callback = "call me later").
Your tendency: ${a.isDecisionMaker ? DECISION_TENDENCY[p.archetype] : "callback (you can't decide)"}. Your situation above can override this.
On the reply where you clearly state your final answer, end it with <decision value="..."/> (once). If you accept, let the rep set it up and tell you the dates; don't hang up until they close the call.

# How to play this

- You are the customer. Never coach, never break character, never mention AI or simulations.
- **One sentence. Two only when making a point. Never three.** Spoken words only: no lists, emoji, stage directions or narration.
- Respond to what the rep actually said. If they answer well, genuinely move. If they dodge or ramble, notice and press.
- Never greet again or re-introduce yourself after the opening.

# Patience

Each rep message comes with a call note giving your current patience (0-100). Let it drive how engaged you are: above 60 open, 30-60 short and to the point, below 30 visibly losing interest and ready to end the call. Your tone rule above still applies at every patience level.
After your line, rate how the rep's last message landed: <patience delta="N"/> with N from -20 (dodged, rambled, pushy, wrong) to +15 (direct, helpful, a real answer). Use 0 if neutral.
If patience reaches 0, or the rep has clearly wasted your time, say a short goodbye and end with <hang_up/>. When the rep has closed the call (thanked you, asked if there's anything else) and you have nothing more, say goodbye and end with <hang_up/>.

# Language: this governs every word you say

${LANGUAGE_INSTRUCTION[language]}`;
}

export interface TurnNoteInput {
  patience: number;
  elapsedSec: number;
  wrapUp: boolean;
  requests: Array<{ request: CrmRequest; status: "not_asked" | "pending" | "done"; askedSecAgo?: number }>;
  decision: Disposition | null;
  extra?: string;
}

/** Per-turn state, appended to the latest rep message. Never spoken. */
export function turnNote(n: TurnNoteInput): string {
  const req = n.requests
    .map((r) =>
      r.status === "not_asked"
        ? `${r.request.id}: not asked yet`
        : r.status === "done"
          ? `${r.request.id}: DONE by the rep (do not ask again)`
          : `${r.request.id}: asked ${r.askedSecAgo ?? 0}s ago, not confirmed yet`,
    )
    .join("; ");
  return `[call note, not spoken: patience ${Math.round(n.patience)}/100; ${n.elapsedSec}s into the call; your asks: ${req || "none"}; ${
    n.decision ? `you already decided: ${n.decision}` : "no decision yet"
  }${n.wrapUp ? "; you have to go soon, steer to a close" : ""}${n.extra ? `; ${n.extra}` : ""}]`;
}

export function openingInstruction(persona: Persona): string {
  return `[call note, not spoken: your phone rang and you have just picked up. Answer with ONE short line that means: "${persona.openingLine}". Follow the language rule exactly.]`;
}

export interface ParsedReply {
  text: string;
  crmRequestIds: string[];
  patienceDelta: number | null;
  decision: Disposition | null;
  hangUp: boolean;
}

/** Splits the spoken line from its control tags. Tolerates sloppy model output. */
export function parseReply(raw: string): ParsedReply {
  const crmRequestIds = [...raw.matchAll(/<crm_request\s+id\s*=\s*["']?([\w-]+)["']?\s*\/?>/gi)].map((m) => m[1]!);
  const delta = raw.match(/<patience\s+delta\s*=\s*["']?([+-]?\d+)["']?\s*\/?>/i);
  const decided = raw.match(/<decision\s+value\s*=\s*["']?(\w+)["']?\s*\/?>/i)?.[1]?.toLowerCase();
  const hangUp = /<hang_up\s*\/?>/i.test(raw);
  const text = raw
    .replace(/<[^>]*>/g, " ")
    .replace(/\[(call note|neutral|warm|pleased|skeptical|firm|impatient)[^\]]*\]/gi, " ")
    .replace(/^\s*["“]|["”]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return {
    text,
    crmRequestIds,
    patienceDelta: delta ? Math.max(-20, Math.min(15, Number(delta[1]))) : null,
    decision: (DISPOSITIONS as readonly string[]).includes(decided ?? "") ? (decided as Disposition) : null,
    hangUp,
  };
}

/** Canned dead-air nudges: instant and token-free. */
export const NUDGES: Record<Language, string[]> = {
  en: ["Hello? Are you still there?", "I'm waiting, are you there?", "Hello? I don't have all day."],
  hi: ["हैलो? आप सुन रहे हैं?", "हैलो? बोलिए ना, मैं wait कर रहा हूँ।", "हैलो? मेरे पास पूरा दिन नहीं है।"],
  hinglish: ["Hello? आप सुन रहे हो?", "हैलो? बोलो ना, मैं wait कर रहा हूँ।", "Hello? मेरे पास पूरा दिन नहीं है, भाई।"],
};
