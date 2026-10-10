/**
 * Writes JSON Schema for the shapes the Python bridge (or anything non-TS) needs.
 * `bun run --filter @onfloor/contracts jsonschema` → packages/contracts/dist/schema/*.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import * as c from "../src";

const out = join(import.meta.dir, "..", "dist", "schema");
mkdirSync(out, { recursive: true });

const schemas: Record<string, z.ZodType> = {
  persona: c.personaSchema,
  "create-persona": c.createPersonaSchema,
  scenario: c.scenarioSchema,
  call: c.callSchema,
  "transcript-turn": c.transcriptTurnSchema,
  scorecard: c.scorecardSchema,
  "live-event": c.liveEventSchema,
  "sim-server-message": c.simServerMessageSchema,
  "sim-client-message": c.simClientMessageSchema,
};

for (const [name, schema] of Object.entries(schemas)) {
  writeFileSync(join(out, `${name}.json`), JSON.stringify(z.toJSONSchema(schema, { unrepresentable: "any" }), null, 2));
}
console.log(`wrote ${Object.keys(schemas).length} schemas to ${out}`);
