import { createPersonaSchema, type CreatePersona, type CrmRequest } from "@onfloor/contracts";
import { detectViolations } from "./policies";

/*
 * [added by Ashwath] The simulator's requests are now Tomato asks (new email, start date, duration,
 * callback slot) instead of the old CRM fields. Same rules as before: valid value format, unique
 * id, verbatim customer phrasing, and the phrasing must actually say what the value claims.
 */
const VALUE_FORMAT: Record<CrmRequest["kind"], RegExp> = {
  email_update: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  start_date: /^\+\d{1,2}$|^\d{4}-\d{2}-\d{2}$/,
  duration: /^(?:[1-9]|1[0-2])$/,
  callback: /^(?:\+\d{1,2}|\d{4}-\d{2}-\d{2}) (?:[01]\d|2[0-3]):[0-5]\d$/,
};
const NUMBER_WORDS: Record<string, number> = { one: 1, ek: 1, two: 2, do: 2, three: 3, teen: 3, four: 4, char: 4, six: 6, che: 6, twelve: 12 };

/** Conservative extraction: ambiguous asks are omitted, never guessed. */
function supportsValue(request: CrmRequest): boolean {
  // The simulator must never reward an agent for granting an unlawful demand.
  if (detectViolations(request.phrasing).length) return false;
  const text = request.phrasing.toLowerCase();
  switch (request.kind) {
    case "email_update":
      return text.includes(request.value.toLowerCase()) || text.includes(request.value.toLowerCase().split("@")[0]!);
    case "start_date":
      return /\b(?:start|shuru|from|begin|monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|kal|parso|next week)\b|शुरू|कल|परसों/.test(text);
    case "duration": {
      if (!/\b(?:months?|mahine|mahina)\b|महीने|महीना/.test(text)) return false;
      const n = Number(request.value);
      const said = [...text.matchAll(/\b(\d{1,2}|[a-z]+)\s*(?:months?|mahine|mahina)\b/g)].map((m) => Number(m[1]) || NUMBER_WORDS[m[1]!]);
      return said.includes(n);
    }
    case "callback":
      if (/\b(?:don't|do not|never)\b.{0,20}\bcall\b/.test(text)) return false;
      return /\b(?:call|phone|ring|baad mein|later|tomorrow|kal)\b|फ़ोन|फोन|कॉल|बाद में|कल/.test(text);
  }
}

/** Structural validation alone cannot prove that a generated quotation is real. */
export function validatePersonaEvidence(draft: CreatePersona, customerLines: string[]): CreatePersona {
  const persona = createPersonaSchema.parse(draft);
  if (!customerLines.includes(persona.openingLine) || persona.speechStyle.catchphrases.some((phrase) =>
    !phrase.trim() || !customerLines.some((line) => line.includes(phrase)))) {
    throw new Error("Opening line/catchphrases must be verbatim customer speech.");
  }
  const ids = new Set<string>();
  for (const request of persona.crmRequests) {
    if (!VALUE_FORMAT[request.kind].test(request.value) || ids.has(request.id) || !request.phrasing.trim() ||
      !customerLines.some((line) => line.includes(request.phrasing))) throw new Error("CRM requests need valid values, unique ids and verbatim customer evidence.");
    ids.add(request.id);
  }
  return { ...persona, crmRequests: persona.crmRequests.filter(supportsValue) };
}

/** Keep sound evidence when the model fails to repair only some quotations. */
export function salvagePersonaEvidence(draft: CreatePersona, customerLines: string[]): CreatePersona {
  const openingLine = customerLines.includes(draft.openingLine) ? draft.openingLine : customerLines[0];
  if (!openingLine) throw new Error("No customer speech is available.");
  const catchphrases = draft.speechStyle.catchphrases.filter((phrase) =>
    phrase.trim() && customerLines.some((line) => line.includes(phrase)));
  const seen = new Set<string>();
  const crmRequests = draft.crmRequests.filter((request) => {
    // [added by Ashwath] VALUE_FORMAT replaces the old crmStateSchema field check.
    if (seen.has(request.id) || !VALUE_FORMAT[request.kind]?.test(request.value) ||
      !customerLines.some((line) => line.includes(request.phrasing)) || !supportsValue(request)) return false;
    seen.add(request.id);
    return true;
  });
  return createPersonaSchema.parse({ ...draft, openingLine, speechStyle: { ...draft.speechStyle, catchphrases }, crmRequests });
}
