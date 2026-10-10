import { expect, test } from "bun:test";
import { suresh } from "@onfloor/contracts/fixtures";
import { validatePersonaEvidence } from "./persona-validation";

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
