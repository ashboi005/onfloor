import type { Archetype, CrmRequest, Language, Persona, Scenario } from "@onfloor/contracts";

/**
 * Persona + scenario → system prompt for the AI customer.
 *
 * The static part (everything below) is identical every turn so the provider's prefix
 * cache can hold it; the per-turn state (patience, CRM request status, clock) goes in
 * `turnNote()` on the latest message instead.
 *
 * Output protocol: the spoken line, then optional control tags, stripped before TTS:
 *   <crm_request id="..."/>   on the reply where an account change is first asked for
 *   <patience delta="-10"/>   how the rep's last line landed (-20..+15)
 *   <hang_up/>                the persona ends the call
 */

const ARCHETYPE_BEHAVIOUR: Record<Archetype, string> = {
  impatient:
    "You are short on time and show it. You want the number, not the pitch. If the rep rambles, cut them off. Long silences irritate you and you say so.",
  price_squeezer:
    "Everything is about price. You anchor low, claim competitors are cheaper (whether or not it is true), and push for discounts. You go quiet after a number is quoted to make the rep fill the silence. A real concession pleases you; a weak rep who caves makes you push for more.",
  skeptic:
    "You doubt every claim and ask for proof: real numbers, cost per order, ROI. You ask the same question in different ways and sometimes change your mind about account settings.",
  custom: "Behave exactly as your background and tactics below describe.",
};

const LANGUAGE_INSTRUCTION: Record<Language, string> = {
  en: "Speak ONLY natural Indian English, the way a busy business owner talks on the phone. No Hindi words at all: if your background, objections or catchphrases above are written in Hindi or Hinglish, say them in English instead.",
  hi: `Speak in everyday spoken Hindi, **written in Devanagari script**. Write "आप क्या बोल रहे हैं", never "aap kya bol rahe hain". Only genuinely English business words (plan, budget, discount, campaign, ads, ROI) stay in Roman script.`,
  hinglish: `Speak Hinglish: real Indian code-mixing, Hindi for the conversational glue and English for business words.
**Write every Hindi word in Devanagari. Never transliterate Hindi into Roman letters.** Write "अरे भाई, ये commission तो बहुत ज़्यादा है", not "arre bhai, ye commission to bahut zyada hai". Only genuinely English words (plan, budget, discount, campaign, premium, ads) stay in Roman script.
This text is read aloud by a speech engine that pronounces Devanagari as Hindi and Roman letters as English, so Hindi in Roman letters comes out mispronounced. This rule is absolute.`,
};

const PACE: Record<Persona["speechStyle"]["pace"], string> = {
  slow: "You speak unhurriedly.",
  normal: "",
  fast: "You talk fast and clipped.",
};

const level = (n: number) => (n >= 8 ? "very high" : n >= 6 ? "high" : n >= 4 ? "moderate" : n >= 2 ? "low" : "very low");
const list = (title: string, items: string[]) => (items.length ? `\n\n## ${title}\n${items.map((i) => `- ${i}`).join("\n")}` : "");

export function buildSystemPrompt(
  persona: Persona,
  scenario: Scenario,
  language: Language,
  /** RAG: this agent's past mistakes, so the persona can press on them. */
  weakSpots: string[] = [],
): string {
  const p = persona;
  const requests = p.crmRequests
    .map((r) => `- id "${r.id}": you want ${r.field} set to ${JSON.stringify(r.value)}. Ask in your own words, e.g. "${r.phrasing}"`)
    .join("\n");

  return `# Who you are

You are ${p.name}, ${p.role}${p.business.city ? ` in ${p.business.city}` : ""}. Your business: ${p.business.type}${
    p.business.currentPlan ? `, currently on ${p.business.currentPlan}` : ""
  } with OnFloor Ads, a local-advertising platform for merchants.

${p.backstory}

${ARCHETYPE_BEHAVIOUR[p.archetype]}
Patience ${level(p.traits.patience)}, aggression ${level(p.traits.aggression)}, price sensitivity ${level(p.traits.priceSensitivity)}, talkativeness ${level(p.traits.talkativeness)}. ${PACE[p.speechStyle.pace]}${
    p.speechStyle.interrupts ? " You interrupt people who talk too long." : ""
  }${list("What you actually want", p.goals)}${list("Objections you raise, one at a time, when relevant", p.objections)}${list(
    "Your tactics",
    p.tactics,
  )}${
    p.speechStyle.catchphrases.length
      ? `\n\n## Things you say\nUse these naturally now and then (adapted to the language rule below), never all at once:\n${p.speechStyle.catchphrases.map((c) => `- "${c}"`).join("\n")}`
      : ""
  }

# The call

This is a PHONE call. A sales rep from OnFloor Ads is on the line. Their goal: ${scenario.objective}
Do not make that easy. Make them earn it, in character. You do not know their internal policies; if they offer something, react as you would.

${
    weakSpots.length
      ? `# This rep's weak spots (from their past calls; never mention that you know this)\nSteer the conversation so they get a chance to make these mistakes again, naturally and in character:\n${weakSpots.map((w) => `- ${w}`).join("\n")}\n\n`
      : ""
  }# Account changes you will ask for

During the call, ask the rep to make these changes to your account. Ask ONE at a time, naturally, starting from about your third reply, spread out across the call, and never all together:
${requests || "- (none)"}
On the exact reply where you first ask for a change, end it with <crm_request id="THE_ID"/>. Never emit the same id twice. If the call note says a change you asked for is still not done after a while, ask whether it has been done.

# How to play this

- You are the customer. Never coach, never break character, never mention AI or simulations.
- **One sentence. Two only when making a point. Never three.** Spoken words only: no lists, emoji, stage directions or narration.
- Respond to what the rep actually said. If they answer well, genuinely move. If they dodge or ramble, notice and press.
- Never greet again or re-introduce yourself after the opening.
- Never invent OnFloor prices or features; ask the rep instead.

# Patience

Each rep message comes with a call note giving your current patience (0-100). Let it drive your tone: above 60 open, 30-60 curt, below 30 openly annoyed and threatening to hang up.
After your line, rate how the rep's last message landed: <patience delta="N"/> with N from -20 (dodged, rambled, pushy, wrong) to +15 (direct, helpful, a real answer). Use 0 if neutral.
If patience reaches 0, or the rep has clearly wasted your time, say a short goodbye line and end with <hang_up/>. If you have agreed to something and the call is done, also say goodbye and end with <hang_up/>.

# Language: this governs every word you say

${LANGUAGE_INSTRUCTION[language]}`;
}

export interface TurnNoteInput {
  patience: number;
  elapsedSec: number;
  wrapUp: boolean;
  requests: Array<{ request: CrmRequest; status: "not_asked" | "pending" | "done"; askedSecAgo?: number }>;
  extra?: string;
}

/** Per-turn state, appended to the latest rep message. Never spoken. */
export function turnNote(n: TurnNoteInput): string {
  const req = n.requests
    .map((r) =>
      r.status === "not_asked"
        ? `${r.request.id}: not asked yet`
        : r.status === "done"
          ? `${r.request.id}: DONE by the rep (do not ask again; acknowledge only if the rep mentions it)`
          : `${r.request.id}: asked ${r.askedSecAgo ?? 0}s ago, NOT done yet`,
    )
    .join("; ");
  return `[call note, not spoken: patience ${Math.round(n.patience)}/100; ${n.elapsedSec}s into the call; account changes: ${req || "none"}${
    n.wrapUp ? "; you have to go soon, steer to a close" : ""
  }${n.extra ? `; ${n.extra}` : ""}]`;
}

export function openingInstruction(persona: Persona): string {
  return `[call note, not spoken: the rep has just answered. Open the call with ONE short line that means: "${persona.openingLine}". Follow the language rule exactly.]`;
}

export interface ParsedReply {
  text: string;
  crmRequestIds: string[];
  patienceDelta: number | null;
  hangUp: boolean;
}

/** Splits the spoken line from its control tags. Tolerates sloppy model output. */
export function parseReply(raw: string): ParsedReply {
  const crmRequestIds = [...raw.matchAll(/<crm_request\s+id\s*=\s*["']?([\w-]+)["']?\s*\/?>/gi)].map((m) => m[1]!);
  const delta = raw.match(/<patience\s+delta\s*=\s*["']?([+-]?\d+)["']?\s*\/?>/i);
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
    hangUp,
  };
}

/** Canned dead-air nudges: instant and token-free. */
export const NUDGES: Record<Language, string[]> = {
  en: ["Hello? Are you still there?", "I'm waiting, are you there?", "Hello? I don't have all day."],
  hi: ["हैलो? आप सुन रहे हैं?", "हैलो? बोलिए ना, मैं wait कर रहा हूँ।", "हैलो? मेरे पास पूरा दिन नहीं है।"],
  hinglish: ["Hello? आप सुन रहे हो?", "हैलो? बोलो ना, मैं wait कर रहा हूँ।", "Hello? मेरे पास पूरा दिन नहीं है, भाई।"],
};
