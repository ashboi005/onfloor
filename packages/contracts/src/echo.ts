/**
 * Telling the agent's voice apart from the AI customer's own, coming back through the speakers.
 * Shared by the browser (before sending STT commits) and the server (before answering them).
 *
 * The microphone stays open while the persona talks (that is what makes barge-in possible), so
 * echo cancellation is the only thing between the AI's voice and the transcriber, and it is
 * imperfect at speaker volume. Rejecting by content keeps barge-in working: the agent
 * interrupting says something *different*; an echo repeats what was just said.
 *
 * Comparison is script-insensitive: the persona's Hinglish is written in Devanagari, while the
 * transcriber may spell the same leaked audio in Latin letters or with other matras. Words are
 * compared both as written and as a consonant skeleton ("कमीशन" ≈ "commission" ≈ "kamishan").
 */

const DEVANAGARI: Record<string, string> = {
  क: "k", ख: "kh", ग: "g", घ: "gh", ङ: "n", च: "ch", छ: "chh", ज: "j", झ: "jh", ञ: "n",
  ट: "t", ठ: "th", ड: "d", ढ: "dh", ण: "n", त: "t", थ: "th", द: "d", ध: "dh", न: "n",
  प: "p", फ: "f", ब: "b", भ: "bh", म: "m", य: "y", र: "r", ल: "l", व: "v", श: "sh",
  ष: "sh", स: "s", ह: "h", ळ: "l", क़: "k", ख़: "kh", ग़: "g", ज़: "z", ड़: "r", ढ़: "rh", फ़: "f",
  अ: "a", आ: "a", इ: "i", ई: "i", उ: "u", ऊ: "u", ए: "e", ऐ: "ai", ओ: "o", औ: "au", ऑ: "o", ऋ: "ri",
  "ं": "n", "ँ": "n", "ः": "h",
};

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Rough Latin consonant skeleton of a word, in either script. */
function skeleton(word: string): string {
  const latin = /[ऀ-ॿ]/.test(word)
    ? [...word.normalize("NFC")].map((c) => DEVANAGARI[c] ?? (/[ऀ-ॿ]/.test(c) ? "" : c)).join("")
    : word;
  return latin
    .replace(/ph/g, "f")
    .replace(/w/g, "v")
    .replace(/[cq]/g, "k")
    .replace(/z/g, "j")
    .replace(/[aeiouyh]/g, "")
    .replace(/(.)\1+/g, "$1");
}

/**
 * The share of what was heard that also appears in what the persona just said. Directional on
 * purpose: the microphone usually catches only part of a line.
 */
export function echoOverlap(heard: string, spoken: string): number {
  const heardWords = words(heard);
  const spokenWords = words(spoken);
  if (!heardWords.length || !spokenWords.length) return 0;
  const exact = new Set(spokenWords);
  const skel = new Set(spokenWords.map(skeleton).filter((s) => s.length >= 2));
  // Tiny words ("ye", "hai", "to") carry no signal once vowels are gone: they only count when spelled identically.
  let counted = 0;
  let matched = 0;
  for (const w of heardWords) {
    if (exact.has(w)) {
      counted++;
      matched++;
    } else if (skeleton(w).length >= 2) {
      counted++;
      if (skel.has(skeleton(w))) matched++;
    }
  }
  return counted ? matched / counted : 0;
}

/**
 * Above this share of repeated words, treat it as the AI hearing itself. Below 1 because the
 * transcriber mishears some of a leaked line; well above a half so an agent who repeats the
 * customer's words back (a sales technique, ~0.6-0.7) is not silenced. Callers also require the
 * speech to overlap the persona's playback (or start within ~1.5s of it ending).
 */
export const ECHO_THRESHOLD = 0.75;

export function isEcho(heard: string, spoken: string | string[]): boolean {
  return (Array.isArray(spoken) ? spoken : [spoken]).some((s) => echoOverlap(heard, s) >= ECHO_THRESHOLD);
}

/** How long after the persona's audio stops a leaked tail can still arrive as a transcript. */
export const ECHO_TAIL_MS = 1500;
