import { CRM_FIELD_KEYS, type CreatePersona, createPersonaSchema, type Persona } from "@onfloor/contracts";
import { VOICES } from "@onfloor/contracts/fixtures";
import { calls } from "../../core/calls";
import { services } from "../../core/services";
import { createPersona } from "../personas";

/**
 * Live call → replayable persona (the Pillar 2 → Pillar 1 seam).
 *
 * DRAFT (works, yours to improve, Tushar): one LLM JSON call over the transcript,
 * validated by createPersonaSchema, then `createPersona()`. Things to improve:
 * better voice casting, merging into an existing persona for a repeat customer
 * (see 06-future-scope), and prompt tuning so catchphrases stay VERBATIM.
 */
const VOICE_CAST = `Pick voiceId from: ${Object.entries(VOICES)
  .map(([name, id]) => `${id} (${name})`)
  .join(", ")}. Prefer sarvam:* for Hindi/Hinglish speakers.`;

export async function extractPersona(callId: string): Promise<Persona> {
  const call = await calls.getWithTranscript(callId);
  const transcript = call.transcript.map((t) => `${t.speaker.toUpperCase()}: ${t.text}`).join("\n");

  const draft = await services.llm.json<CreatePersona>({
    job: "persona",
    schemaName: "persona",
    schema: createPersonaSchema,
    temperature: 0.3,
    messages: [
      {
        role: "system",
        content: [
          "You turn a real sales call into a CUSTOMER persona that an AI can role-play in a training simulator.",
          "Infer archetype, traits (0-10), goals, objections and tactics from what the customer actually did.",
          "catchphrases and openingLine MUST be verbatim customer lines from the transcript.",
          `crmRequests: account changes the customer asked for, mapped onto these fields: ${CRM_FIELD_KEYS.join(", ")}. Empty if none.`,
          VOICE_CAST,
          `Set source="live_call", sourceCallId="${callId}", language="${call.language}".`,
        ].join("\n"),
      },
      { role: "user", content: `Customer label: ${call.customerLabel}\n\nTranscript:\n${transcript}` },
    ],
  });

  return createPersona({ ...draft, source: "live_call", sourceCallId: callId, language: call.language });
}
