import { createPersonaSchema, crmStateSchema, type CreatePersona, type CrmRequest } from "@onfloor/contracts";
import { detectViolations } from "./policies";

/** Conservative extraction: ambiguous changes are omitted, never guessed. */
function supportsValue(request: CrmRequest): boolean {
  // The simulator must never reward an agent for granting an unlawful demand.
  if (request.field === "discountPct" && Number(request.value) > 10) return false;
  if (detectViolations(request.phrasing).length) return false;
  const text = request.phrasing.toLowerCase().replace(/_/g, " ");
  if (request.field === "weekendNotifications") {
    if (!/weekend|notification|alert|सप्ताहांत|नोटिफिकेशन/.test(text)) return false;
    const off = /\b(?:off|disable|stop|no|don't|do not|nahi|nahin|band)\b|बंद|नहीं/.test(text);
    const on = /\b(?:on|enable|yes|send|chalu)\b|चालू/.test(text);
    return request.value === false ? off : on && !off;
  }
  if (/\b(?:not|don't|do not|nahi|nahin|never)\b|नहीं/.test(text)) return false;
  switch (request.field) {
    case "campaignStatus": {
      const paused = /\b(?:paus\w*|stop|band)\b|बंद|रोक/.test(text);
      const active = /\b(?:active|activat\w*|resume|restart|chalu)\b|चालू/.test(text);
      return request.value === "paused" ? paused && !active : active && !paused;
    }
    case "plan": {
      const plus = /premium\s*(?:plus|\+)/.test(text);
      return request.value === "premium_plus" ? plus : request.value === "premium" ? /\bpremium\b/.test(text) && !plus : /\bbasic\b/.test(text);
    }
    case "monthlyBudget": case "discountPct": case "targetRadiusKm": {
      const context = request.field === "monthlyBudget" ? /budget|monthly|rupees|₹|बजट/ : request.field === "discountPct" ? /discount|percent|%|डिस्काउंट|प्रतिशत/ : /radius|\bkm\b|kilomet|दायरा|किलोमीटर/;
      if (!context.test(text)) return false;
      const values = [...text.replace(/,/g, "").matchAll(/\b(\d+(?:\.\d+)?)\s*(k\b|thousand|hazar|lakh|lac\b)?/g)].map((match) =>
        Number(match[1]) * (match[2] ? /lakh|lac/.test(match[2]) ? 100_000 : 1000 : 1));
      return values.includes(Number(request.value));
    }
    case "adCategories": {
      const terms: Record<string, RegExp> = { dine_in: /dine[ -]?in/, delivery: /delivery/, catering: /catering/, offers: /offers/ };
      return Array.isArray(request.value) && request.value.length > 0 && request.value.every((value) => terms[String(value)]?.test(text));
    }
    case "notes": return typeof request.value === "string" && !!request.value.trim() && text.includes(request.value.toLowerCase());
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
    if (!crmStateSchema.shape[request.field].safeParse(request.value).success || ids.has(request.id) || !request.phrasing.trim() ||
      !customerLines.some((line) => line.includes(request.phrasing))) throw new Error("CRM requests need valid field values, unique ids and verbatim customer evidence.");
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
    if (seen.has(request.id) || !crmStateSchema.shape[request.field].safeParse(request.value).success ||
      !customerLines.some((line) => line.includes(request.phrasing)) || !supportsValue(request)) return false;
    seen.add(request.id);
    return true;
  });
  return createPersonaSchema.parse({ ...draft, openingLine, speechStyle: { ...draft.speechStyle, catchphrases }, crmRequests });
}
