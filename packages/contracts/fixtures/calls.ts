import type { Agent, Call } from "../src";
import { LIVE_CALL_ID, liveCall } from "./live-call";
import { SIM_CALL_ID } from "./sim-call";

export const agents: Agent[] = [
  { id: "agent_ashwath", name: "Ashwath", email: "ashwath@onfloor.demo", role: "agent" },
  { id: "agent_harnoor", name: "Harnoor", email: "harnoor@onfloor.demo", role: "agent" },
  { id: "agent_manager", name: "Floor Manager", email: "manager@onfloor.demo", role: "manager" },
];
export const currentAgent: Agent = agents[0]!;

const base = {
  agentId: "agent_ashwath",
  replayOfCallId: null,
  recordingUrl: null,
} as const;

export const calls: Call[] = [
  {
    ...base,
    id: SIM_CALL_ID,
    kind: "sim",
    status: "scored",
    scenarioId: "scn_premium_restaurant",
    personaId: "persona_rakesh",
    language: "hinglish",
    customerLabel: "Rakesh Mehta",
    startedAt: "2026-10-10T08:30:00.000Z",
    endedAt: "2026-10-10T08:31:20.000Z",
    durationMs: 80000,
    overallScore: 66,
  },
  {
    ...liveCall,
    id: LIVE_CALL_ID,
    status: "scored",
    personaId: "persona_suresh_live",
    endedAt: "2026-10-10T09:01:14.000Z",
    durationMs: 74000,
    overallScore: 58,
  },
  {
    ...base,
    id: "call_sim_replay",
    kind: "sim",
    status: "scoring",
    scenarioId: "scn_premium_restaurant",
    personaId: "persona_suresh_live",
    replayOfCallId: LIVE_CALL_ID,
    language: "hinglish",
    customerLabel: "Suresh Patil",
    startedAt: "2026-10-10T09:10:00.000Z",
    endedAt: "2026-10-10T09:13:30.000Z",
    durationMs: 210000,
    overallScore: null,
  },
  {
    ...base,
    id: "call_sim_arjun",
    kind: "sim",
    status: "abandoned",
    scenarioId: "scn_premium_restaurant",
    personaId: "persona_arjun",
    language: "en",
    customerLabel: "Arjun Malhotra",
    startedAt: "2026-10-09T17:00:00.000Z",
    endedAt: "2026-10-09T17:00:40.000Z",
    durationMs: 40000,
    overallScore: null,
  },
  {
    ...base,
    id: "call_sim_vikram",
    kind: "sim",
    status: "scored",
    scenarioId: "scn_premium_restaurant",
    personaId: "persona_vikram",
    language: "en",
    customerLabel: "Vikram Sethi",
    startedAt: "2026-10-09T15:00:00.000Z",
    endedAt: "2026-10-09T15:05:10.000Z",
    durationMs: 310000,
    overallScore: 84,
  },
  {
    ...base,
    id: "call_live_failed",
    kind: "live",
    status: "failed",
    scenarioId: null,
    personaId: null,
    language: "hi",
    customerLabel: "Telegram user",
    startedAt: "2026-10-09T12:00:00.000Z",
    endedAt: "2026-10-09T12:02:00.000Z",
    durationMs: 120000,
    overallScore: null,
  },
];
