import { z } from "zod";
import {
  agentSchema,
  callSchema,
  knowledgeSnippetSchema,
  knowledgeSourceSchema,
  liveEventSchema,
  personaSchema,
  scenarioSchema,
  scorecardSchema,
  simServerMessageSchema,
  transcriptTurnSchema,
} from "../src";
import { agents, calls, currentAgent } from "./calls";
import { knowledgeSnippets, knowledgeSources } from "./knowledge";
import { LIVE_CALL_ID, LIVE_PERSONA_ID, liveCall, liveCallTimeline, liveCallTranscript, liveCallTranslations } from "./live-call";
import { personas, VOICES } from "./personas";
import { DEFAULT_POLICIES, premiumRestaurant, scenarios } from "./scenarios";
import { liveScorecard, scorecards, simScorecard } from "./scorecards";
import { SIM_CALL_ID, simCallTimeline, simCallTranscript, simCallTranslations } from "./sim-call";

/*
  Validated at import, so a fixture that drifts from its schema fails loudly the first
  time anyone runs the app, not silently in a demo.
*/
z.array(agentSchema).parse(agents);
z.array(knowledgeSourceSchema).parse(knowledgeSources);
z.array(knowledgeSnippetSchema).parse(knowledgeSnippets);
z.array(personaSchema).parse(personas);
z.array(scenarioSchema).parse(scenarios);
z.array(callSchema).parse(calls);
z.array(scorecardSchema).parse(scorecards);
z.array(transcriptTurnSchema).parse([...simCallTranscript, ...liveCallTranscript]);
for (const { event } of simCallTimeline) simServerMessageSchema.parse(event);
for (const { event } of liveCallTimeline) liveEventSchema.parse(event);

/** Transcript lookup for mock `GET /calls/:id` (with English subtitles filled in, as after the call). */
const withTranslations = (turns: typeof simCallTranscript, tr: Record<string, string>) =>
  turns.map((turn) => ({ ...turn, translation: tr[turn.id] ?? turn.text }));
export const transcripts: Record<string, typeof simCallTranscript> = {
  [SIM_CALL_ID]: withTranslations(simCallTranscript, simCallTranslations),
  [LIVE_CALL_ID]: withTranslations(liveCallTranscript, liveCallTranslations),
};

export * from "./personas";
export {
  agents,
  calls,
  currentAgent,
  DEFAULT_POLICIES,
  knowledgeSnippets,
  knowledgeSources,
  LIVE_CALL_ID,
  LIVE_PERSONA_ID,
  liveCall,
  liveCallTimeline,
  liveCallTranscript,
  liveCallTranslations,
  liveScorecard,
  personas,
  premiumRestaurant,
  scenarios,
  scorecards,
  SIM_CALL_ID,
  simCallTimeline,
  simCallTranscript,
  simCallTranslations,
  simScorecard,
  VOICES,
};
