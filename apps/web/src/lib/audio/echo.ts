/**
 * Telling the agent's voice apart from the AI customer's own, coming back through
 * the speakers.
 *
 * The microphone stays open while the persona talks (that is what makes barge-in
 * possible), so the browser's echo cancellation is the only thing between the AI's
 * voice and the transcriber. AEC is imperfect at speaker volume and has not yet
 * converged at the start of a call, which is why the opening line leaks worst: it
 * is the longest stretch of AI speech with nobody talking over it.
 *
 * Rejecting by content rather than by muting the microphone keeps barge-in working.
 * The agent interrupting says something *different*; an echo repeats what was
 * just said.
 */

/** Words, case- and punctuation-insensitive, across Latin and Devanagari alike. */
function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * The share of what was heard that also appears in what the persona just said.
 *
 * Directional on purpose: the microphone usually catches only part of a line, so
 * comparing against the whole of what was spoken would score a genuine echo low.
 */
export function echoOverlap(heard: string, spoken: string): number {
  const heardWords = words(heard);
  const spokenWords = new Set(words(spoken));
  if (heardWords.length === 0 || spokenWords.size === 0) return 0;

  const matched = heardWords.filter((word) => spokenWords.has(word)).length;
  return matched / heardWords.length;
}

/**
 * Above this share of repeated words, treat it as the AI hearing itself.
 *
 * Set below 1 because the transcriber mishears some of a leaked line, and above a
 * half so an agent who picks up the customer's own words (likely in a sales
 * conversation, where echoing the customer's words back is a technique) is not
 * silenced.
 */
const ECHO_THRESHOLD = 0.7;

export function isEcho(heard: string, spoken: string): boolean {
  return echoOverlap(heard, spoken) >= ECHO_THRESHOLD;
}
