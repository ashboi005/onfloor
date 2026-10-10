import { expect, test } from "bun:test";
import { suresh } from "@onfloor/contracts/fixtures";
import { salvagePersonaEvidence, validatePersonaEvidence } from "./persona-validation";

test("persona evidence rejects invented customer quotes and invalid CRM values", () => {
  const phrase = "Please pause my campaign";
  const persona = { ...suresh, openingLine: phrase, speechStyle: { ...suresh.speechStyle, catchphrases: [phrase] },
    crmRequests: [{ id: "request_1", field: "campaignStatus" as const, value: "paused", phrasing: phrase }] };
  expect(validatePersonaEvidence(persona, [phrase]).crmRequests[0]?.value).toBe("paused");
  expect(() => validatePersonaEvidence({ ...persona, openingLine: "An invented opening" }, [phrase])).toThrow();
  expect(() => validatePersonaEvidence({ ...persona, crmRequests: [{ ...persona.crmRequests[0]!, value: "deleted" }] }, [phrase])).toThrow();
  expect(validatePersonaEvidence({ ...persona, crmRequests: [{ ...persona.crmRequests[0]!, value: "active" }] }, [phrase]).crmRequests).toEqual([]);
});

test("persona recovery keeps valid quotes and CRM changes but drops fabricated evidence and forbidden demands", () => {
  const line = "Please pause my campaign";
  const discount = "I need a 20% discount";
  const draft = { ...suresh, openingLine: "Invented intro", speechStyle: { ...suresh.speechStyle, catchphrases: [line, "Invented catchphrase"] },
    crmRequests: [
      { id: "pause", field: "campaignStatus" as const, value: "paused", phrasing: line },
      { id: "discount", field: "discountPct" as const, value: 20, phrasing: discount },
      { id: "fabricated", field: "plan" as const, value: "premium", phrasing: "Upgrade me to premium" },
    ] };
  expect(salvagePersonaEvidence(draft, [line, discount])).toMatchObject({ openingLine: line,
    speechStyle: { catchphrases: [line] }, crmRequests: [{ id: "pause" }] });
  expect(validatePersonaEvidence({ ...draft, openingLine: line, speechStyle: { ...draft.speechStyle, catchphrases: [line] },
    crmRequests: draft.crmRequests.slice(0, 2) }, [line, discount]).crmRequests).toHaveLength(1);
});
