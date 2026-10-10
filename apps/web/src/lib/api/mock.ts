import type { Call, MerchantSummary, Scorecard, SimSessionStart, StartSim } from "@onfloor/contracts";
import { todayIst, toMerchantSummary, toNuggetTicket } from "@onfloor/contracts";
import {
  calls as fixtureCalls,
  currentAgent,
  knowledgeSnippets,
  knowledgeSources,
  LIVE_CALL_ID,
  liveCall,
  liveScorecard,
  merchants,
  personas,
  scenarios,
  scorecards,
  simCallTranscript,
  simScorecard,
  transcripts,
} from "@onfloor/contracts/fixtures";
import { type ApiClient, ApiClientError } from "./client";

/**
 * In-memory API over the fixtures. Behaves like the server where it matters for UI:
 * latency, 404 for unknown ids, a ~3s "scoring" window after a sim call is disposed, and
 * new calls showing up in the list. Workspace actions are answered by `useSimCall` (mock mode).
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

/** Same cast rules as the server: a live-call persona brings its own identity. */
function startSession(input: StartSim): SimSessionStart {
  const scenario = input.scenarioId ? scenarios.find((s) => s.id === input.scenarioId) : scenarios[0];
  if (!scenario) throw notFound("scenario");
  const picked = input.personaId ? personas.find((p) => p.id === input.personaId) : undefined;
  if (input.personaId && !picked) throw notFound("persona");
  const merchant =
    merchants.find((m) => m.id === input.merchantId) ??
    (picked?.source === "live_call" ? undefined : merchants.find((m) => m.id === scenario.defaultMerchantId));
  // Mock: a live-call persona replays against the demo merchant's tools, under the persona's own name.
  const base = merchant ?? merchants[0]!;
  const persona = picked ?? personas.find((p) => p.id === base.defaultPersonaId)!;
  const summary: MerchantSummary = merchant
    ? toMerchantSummary(merchant)
    : { ...toMerchantSummary(base), id: `mer_live_${persona.id}`, ownerName: persona.name, source: "live_call", sourcePersonaId: persona.id, answeredBy: "owner" };
  const callId = `call_mock_${Math.random().toString(36).slice(2, 10)}`;
  store.calls.unshift({
    id: callId,
    kind: "sim",
    status: "active",
    agentId: currentAgent.id,
    scenarioId: scenario.id,
    personaId: persona.id,
    merchantId: summary.id,
    guidance: input.guidance ?? true,
    replayOfCallId: input.replayOfCallId ?? null,
    language: input.language,
    customerLabel: `${merchant ? merchant.answerer.name : persona.name} · ${summary.restaurantName}`,
    startedAt: new Date().toISOString(),
    endedAt: null,
    durationMs: null,
    recordingUrl: null,
    overallScore: null,
  });
  return {
    callId,
    scenario,
    persona,
    merchant: summary,
    ticket: { ...toNuggetTicket(base), merchantName: summary.ownerName },
    agentName: currentAgent.name,
    guidance: input.guidance ?? true,
    callDate: todayIst(),
    sttUrl: "",
  };
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
  async createPersona(p) {
    const persona = { ...p, source: "custom" as const, sourceCallId: null, id: `persona_custom_${Math.random().toString(36).slice(2, 8)}`, createdAt: new Date().toISOString() };
    personas.unshift(persona);
    return delay(persona);
  },
  merchants: (source) => delay(merchants.filter((m) => !source || m.source === source).map(toMerchantSummary)),
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
    if (call.status === "active" || call.status === "wrap_up" || (until && Date.now() < until) || call.status === "abandoned" || call.status === "failed") {
      return delay(null);
    }
    if (until) {
      call.status = "scored";
      call.overallScore = call.kind === "sim" ? simScorecard.overall : liveScorecard.overall;
    }
    const base: Scorecard = scorecards.find((s) => s.callId === callId) ?? (call.kind === "sim" ? simScorecard : liveScorecard);
    return delay({ ...base, callId });
  },
  async startSim(input) {
    return delay(startSession(input));
  },
  async endSim(callId) {
    const call = findCall(callId);
    if (call.status === "active") {
      call.status = "wrap_up";
      call.endedAt = new Date().toISOString();
      call.durationMs = Date.now() - new Date(call.startedAt).getTime();
    } else if (call.status === "wrap_up") {
      // Disposed (useSimCall calls this again in mock mode): score it.
      call.status = "scoring";
      store.scoringUntil.set(callId, Date.now() + SCORING_MS);
    }
    return delay({ callId, status: call.status });
  },
  simSttUrl: () => delay({ url: "" }),
  async replayCall(callId) {
    const source = findCall(callId);
    if (!source.personaId) {
      throw new ApiClientError(400, { code: "BAD_REQUEST", message: "No persona extracted yet.", retryable: false });
    }
    const persona = personas.find((p) => p.id === source.personaId)!;
    return delay(startSession({ personaId: persona.id, language: persona.language, guidance: true, replayOfCallId: callId }));
  },
  activeLiveCall: () => delay(liveCall),
  simulateLiveCall: () => delay({ callId: LIVE_CALL_ID }),
  knowledgeStatus: () => delay({ enabled: true, collection: "onfloor_knowledge", sources: knowledgeSources.length }),
  knowledgeDocs: () => delay(knowledgeSources),
  uploadKnowledgeDoc: (doc) => delay({ source: doc.source ?? doc.title.toLowerCase().replace(/\W+/g, "-"), chunks: 3 }),
  deleteKnowledgeDoc: (source) => delay({ removed: source }),
  searchKnowledge: () => delay(knowledgeSnippets),
};
