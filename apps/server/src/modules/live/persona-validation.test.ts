import { expect, test } from "bun:test";
import { suresh } from "@onfloor/contracts/fixtures";
import { salvagePersonaEvidence, validatePersonaEvidence } from "./persona-validation";

// [added by Ashwath] Requests are Tomato asks now (email_update | start_date | duration | callback).
test("persona evidence rejects invented customer quotes and invalid request values", () => {
  const phrase = "Call me back tomorrow at 4, I'm busy now";
  const persona = { ...suresh, openingLine: phrase, speechStyle: { ...suresh.speechStyle, catchphrases: [phrase] },
    crmRequests: [{ id: "request_1", kind: "callback" as const, value: "+1 16:00", phrasing: phrase }] };
  expect(validatePersonaEvidence(persona, [phrase]).crmRequests[0]?.value).toBe("+1 16:00");
  expect(() => validatePersonaEvidence({ ...persona, openingLine: "An invented opening" }, [phrase])).toThrow();
  expect(() => validatePersonaEvidence({ ...persona, crmRequests: [{ ...persona.crmRequests[0]!, value: "deleted" }] }, [phrase])).toThrow();
  // A valid value the phrasing doesn't support (no months mentioned) is dropped, not guessed.
  expect(validatePersonaEvidence({ ...persona, crmRequests: [{ ...persona.crmRequests[0]!, kind: "duration" as const, value: "2" }] }, [phrase]).crmRequests).toEqual([]);
});

test("persona recovery keeps valid quotes and requests but drops fabricated evidence and forbidden demands", () => {
  const line = "Run it for 2 months please";
  const discount = "I need a 20% discount for 2 months";
  const draft = { ...suresh, openingLine: "Invented intro", speechStyle: { ...suresh.speechStyle, catchphrases: [line, "Invented catchphrase"] },
    crmRequests: [
      { id: "months", kind: "duration" as const, value: "2", phrasing: line },
      { id: "discount", kind: "duration" as const, value: "2", phrasing: discount },
      { id: "fabricated", kind: "email_update" as const, value: "a@b.in", phrasing: "Use a@b.in" },
    ] };
  expect(salvagePersonaEvidence(draft, [line, discount])).toMatchObject({ openingLine: line,
    speechStyle: { catchphrases: [line] }, crmRequests: [{ id: "months" }] });
  expect(validatePersonaEvidence({ ...draft, openingLine: line, speechStyle: { ...draft.speechStyle, catchphrases: [line] },
    crmRequests: draft.crmRequests.slice(0, 2) }, [line, discount]).crmRequests).toHaveLength(1);
});
