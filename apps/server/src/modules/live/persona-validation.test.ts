import { expect, test } from "bun:test";
import { suresh } from "@onfloor/contracts/fixtures";
import { validatePersonaEvidence } from "./persona-validation";

test("persona evidence rejects invented customer quotes and invalid CRM values", () => {
  const phrase = "Please pause my campaign";
  const persona = { ...suresh, openingLine: phrase, speechStyle: { ...suresh.speechStyle, catchphrases: [phrase] },
    crmRequests: [{ id: "request_1", field: "campaignStatus" as const, value: "paused", phrasing: phrase }] };
  expect(validatePersonaEvidence(persona, [phrase]).crmRequests[0]?.value).toBe("paused");
  expect(() => validatePersonaEvidence({ ...persona, openingLine: "An invented opening" }, [phrase])).toThrow();
  expect(() => validatePersonaEvidence({ ...persona, crmRequests: [{ ...persona.crmRequests[0]!, value: "deleted" }] }, [phrase])).toThrow();
  expect(validatePersonaEvidence({ ...persona, crmRequests: [{ ...persona.crmRequests[0]!, value: "active" }] }, [phrase]).crmRequests).toEqual([]);
});
