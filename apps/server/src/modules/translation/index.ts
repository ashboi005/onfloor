import type { TranscriptTurn } from "@onfloor/contracts";
import { calls } from "../../core/calls";
import { services } from "../../core/services";

/**
 * English subtitles for Hindi/Hinglish transcripts.
 *
 * Product decision (2026-10-10): translated by Merge only (job "translate", never Gemini), and
 * allowed to arrive late. English turns already carry their text as the translation (calls repo).
 * Callers fire-and-forget `translateTurn` and push the result to their socket when it resolves.
 */

const SYSTEM = [
  "You translate single lines from Indian phone sales calls (Hindi or Hinglish, Devanagari or Roman script) into natural, plain English.",
  "Keep names, brand names, plan names, numbers, percentages and ₹ amounts exactly as they are.",
  "Keep the speaker's tone (blunt stays blunt, polite stays polite). Do not explain, add quotes or notes.",
  "Hinglish sales idioms: about an offer, \"kam hai\" = not enough/too little and \"zyada hai\" = too much; \"theek hai\" = okay/fine; \"chalu karo\" = activate/switch on; \"kitna final karoge\" = what's your final price.",
  "The output must be entirely in English (Latin script): never leave a Devanagari word in it (भाई → brother).",
  "If the line is already English, return it unchanged. Output ONLY the translation.",
].join(" ");

/** Serialise per call so subtitles arrive in turn order even when Merge answers out of order. */
const queues = new Map<string, Promise<unknown>>();
/** The last few lines of each call, given as read-only context (one-line MT loses meaning). */
const recent = new Map<string, string[]>();
const CONTEXT_LINES = 3;

/** Text that needs no model call: empty, or no Devanagari and mostly ASCII words. */
function alreadyEnglish(text: string) {
  return !/[ऀ-ॿ]/.test(text) && !/\b(hai|nahi|kya|bhai|karo|theek|kitna|mujhe|aap|hum|tum|kar|ho|yeh|woh|toh)\b/i.test(text);
}

export function translateTurn(turn: TranscriptTurn): Promise<string | null> {
  if (turn.translation) return Promise.resolve(turn.translation);
  const run = async (): Promise<string | null> => {
    const text = turn.text.trim();
    if (!text) return null;
    const context = recent.get(turn.callId) ?? [];
    recent.set(turn.callId, [...context, `${turn.speaker.toUpperCase()}: ${text}`].slice(-CONTEXT_LINES));
    let translation = text;
    if (!alreadyEnglish(text)) {
      const out = await services.llm.chat({
        job: "translate",
        temperature: 0,
        maxTokens: 300,
        timeoutMs: 20_000,
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: context.length
              ? `Earlier in the call (context only, do NOT translate):\n${context.join("\n")}\n\nTranslate this ${turn.speaker} line:\n${text}`
              : text,
          },
        ],
      });
      translation = out.trim().replace(/^["“]|["”]$/g, "");
    }
    await calls.setTurnTranslation(turn.id, translation);
    return translation;
  };
  const prev = queues.get(turn.callId) ?? Promise.resolve();
  const next = prev.then(run, run).catch((err) => {
    console.error(`[translate] ${turn.id} failed:`, (err as Error).message);
    return null;
  });
  queues.set(turn.callId, next);
  void next.finally(() => {
    if (queues.get(turn.callId) === next) queues.delete(turn.callId);
  });
  // Forget a call's context once it has been quiet for 30 minutes.
  setTimeout(() => {
    if (!queues.has(turn.callId)) recent.delete(turn.callId);
  }, 30 * 60_000).unref();
  return next;
}
