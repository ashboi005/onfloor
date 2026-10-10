import type { Call, Scorecard, SimSessionStart } from "@onfloor/contracts";
import {
  calls as fixtureCalls,
  currentAgent,
  liveScorecard,
  personas,
  scenarios,
  simScorecard,
  transcripts,
  simCallTranscript,
  LIVE_CALL_ID,
  liveCall,
} from "@onfloor/contracts/fixtures";
import { type ApiClient, ApiClientError } from "./client";

/**
 * In-memory API over the fixtures. Behaves like the server where it matters for UI:
 * latency, 404 for unknown ids, a ~3s "scoring" window after a sim call ends, and
 * new calls showing up in the list.
 */
const LATENCY_MS = 300;
const SCORING_MS = 3000;

const delay = <T>(value: T): Promise<T> =>
  new Promise((r) => setTimeout(() => r(structuredClone(value)), LATENCY_MS));

const notFound = (what: string) =>
  new ApiClientError(404, { code: "NOT_FOUND", message: `No such ${what}.`, retryable: false });

const store = {
  calls: structuredClone(fixtureCalls) as Call[],
  /** callId → when scoring finishes (ms epoch). */
  scoringUntil: new Map<string, number>(),
};

function findCall(id: string): Call {
  const call = store.calls.find((c) => c.id === id);
  if (!call) throw notFound("call");
  return call;
}

function startSession(scenarioId: string, personaId: string | undefined, language: SimSessionStart["persona"]["language"], replayOfCallId?: string): SimSessionStart {
  const scenario = scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw notFound("scenario");
  const persona = personas.find((p) => p.id === (personaId ?? scenario.defaultPersonaId));
  if (!persona) throw notFound("persona");
  const callId = `call_mock_${Math.random().toString(36).slice(2, 10)}`;
  store.calls.unshift({
    id: callId,
    kind: "sim",
    status: "active",
    agentId: currentAgent.id,
    scenarioId,
    personaId: persona.id,
    replayOfCallId: replayOfCallId ?? null,
    language,
    customerLabel: persona.name,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationMs: null,
    recordingUrl: null,
    overallScore: null,
  });
  return { callId, scenario, persona, sttUrl: "" };
}

export const mockClient: ApiClient = {
  me: () => delay(currentAgent),
  scenarios: () => delay(scenarios),
  personas: (source) => delay(source ? personas.filter((p) => p.source === source) : personas),
  async persona(id) {
    const p = personas.find((x) => x.id === id);
    if (!p) throw notFound("persona");
    return delay(p);
  },
  calls: (kind) => delay(kind ? store.calls.filter((c) => c.kind === kind) : store.calls),
  async call(id) {
    const call = findCall(id);
    // New mock sim calls reuse the fixture sim transcript.
    const transcript = transcripts[id] ?? (call.kind === "sim" ? simCallTranscript : transcripts[LIVE_CALL_ID]!);
    return delay({ ...call, transcript: transcript.map((t) => ({ ...t, callId: id })) });
  },
  async scorecard(callId) {
    const call = findCall(callId);
    const until = store.scoringUntil.get(callId);
    if (call.status === "active" || (until && Date.now() < until) || call.status === "abandoned" || call.status === "failed") {
      return delay(null);
    }
    if (until) {
      call.status = "scored";
      call.overallScore = call.kind === "sim" ? simScorecard.overall : liveScorecard.overall;
    }
    const base: Scorecard = call.kind === "sim" ? simScorecard : liveScorecard;
    return delay({ ...base, callId });
  },
  async startSim({ scenarioId, personaId, language, replayOfCallId }) {
    return delay(startSession(scenarioId, personaId, language, replayOfCallId));
  },
  async endSim(callId) {
    const call = findCall(callId);
    call.status = "scoring";
    call.endedAt = new Date().toISOString();
    call.durationMs = Date.now() - new Date(call.startedAt).getTime();
    store.scoringUntil.set(callId, Date.now() + SCORING_MS);
    return delay({ callId, status: "scoring" });
  },
  simSttUrl: () => delay({ url: "" }),
  async replayCall(callId) {
    const source = findCall(callId);
    if (!source.personaId) {
      throw new ApiClientError(400, { code: "BAD_REQUEST", message: "No persona extracted yet.", retryable: false });
    }
    const persona = personas.find((p) => p.id === source.personaId)!;
    return delay(startSession(scenarios[0]!.id, persona.id, persona.language, callId));
  },
  activeLiveCall: () => delay(liveCall),
  simulateLiveCall: () => delay({ callId: LIVE_CALL_ID }),
};
