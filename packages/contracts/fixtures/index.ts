import { z } from "zod";
import {
  agentSchema,
  callSchema,
  knowledgeSnippetSchema,
  knowledgeSourceSchema,
  liveEventSchema,
  merchantSchema,
  personaSchema,
  scenarioSchema,
  scorecardSchema,
  simServerMessageSchema,
  transcriptTurnSchema,
} from "../src";
import { agents, calls, currentAgent } from "./calls";
import { knowledgeSnippets, knowledgeSources } from "./knowledge";
import { LIVE_CALL_ID, LIVE_PERSONA_ID, liveCall, liveCallTimeline, liveCallTranscript, liveCallTranslations } from "./live-call";
import { THALI_CALL_ID, thaliCallTranscript, thaliCallTranslations, thaliScorecard, thaliVoiced, thaliWorkspaceLog } from "./history";
import { merchants } from "./merchants";
import { PERSONA_PRESETS, personas, VOICES } from "./personas";
import { DEFAULT_POLICIES, MAX_GROW_POLICIES, maxGrowOutbound, scenarios } from "./scenarios";
import { liveScorecard, scorecards, simScorecard } from "./scorecards";
import {
  SIM_CALL_DATE,
  SIM_CALL_ID,
  simCallTimeline,
  simCallTranscript,
  simCallTranslations,
  simRingTimeline,
  simWrapUpTimeline,
} from "./sim-call";

/*
  Validated at import, so a fixture that drifts from its schema fails loudly the first
  time anyone runs the app, not silently in a demo.
*/
z.array(agentSchema).parse(agents);
z.array(knowledgeSourceSchema).parse(knowledgeSources);
z.array(knowledgeSnippetSchema).parse(knowledgeSnippets);
z.array(personaSchema).parse(personas);
z.array(merchantSchema).parse(merchants);
for (const m of merchants) {
  if (!personas.some((p) => p.id === m.defaultPersonaId)) throw new Error(`fixtures: ${m.id} has unknown defaultPersonaId`);
}
if (new Set(merchants.map((m) => m.uid)).size !== merchants.length) throw new Error("fixtures: duplicate merchant UID");
z.array(scenarioSchema).parse(scenarios);
z.array(callSchema).parse(calls);
z.array(scorecardSchema).parse(scorecards);
z.array(transcriptTurnSchema).parse([...simCallTranscript, ...liveCallTranscript, ...thaliCallTranscript]);
for (const { event } of [...simRingTimeline, ...simCallTimeline, ...simWrapUpTimeline]) simServerMessageSchema.parse(event);
for (const { event } of liveCallTimeline) liveEventSchema.parse(event);

/** Transcript lookup for mock `GET /calls/:id` (with English subtitles filled in, as after the call). */
const withTranslations = (turns: typeof simCallTranscript, tr: Record<string, string>) =>
  turns.map((turn) => ({ ...turn, translation: tr[turn.id] ?? turn.text }));
export const transcripts: Record<string, typeof simCallTranscript> = {
  [SIM_CALL_ID]: withTranslations(simCallTranscript, simCallTranslations),
  [LIVE_CALL_ID]: withTranslations(liveCallTranscript, liveCallTranslations),
  [THALI_CALL_ID]: withTranslations(thaliCallTranscript, thaliCallTranslations),
};

export * from "./merchants";
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
  MAX_GROW_POLICIES,
  maxGrowOutbound,
  PERSONA_PRESETS,
  personas,
  scenarios,
  scorecards,
  SIM_CALL_DATE,
  SIM_CALL_ID,
  simCallTimeline,
  simCallTranscript,
  simCallTranslations,
  simRingTimeline,
  simScorecard,
  simWrapUpTimeline,
  THALI_CALL_ID,
  thaliCallTranscript,
  thaliCallTranslations,
  thaliScorecard,
  thaliVoiced,
  thaliWorkspaceLog,
  VOICES,
};
