import type {
  Agent,
  ApiError,
  CreateKnowledgeDoc,
  CreatePersona,
  KnowledgeScopeKind,
  KnowledgeSnippet,
  KnowledgeSource,
  Call,
  CallKind,
  CallWithTranscript,
  EndSimResponse,
  MerchantSource,
  MerchantSummary,
  Persona,
  PersonaSource,
  Scenario,
  Scorecard,
  SimSessionStart,
  StartSim,
} from "@onfloor/contracts";

/**
 * Everything the UI can ask the API. Two implementations, picked by
 * NEXT_PUBLIC_USE_MOCKS: `mockClient` (fixtures, in-memory) and `httpClient`.
 * UI code uses the TanStack hooks in `./queries`, never this directly, and never `fetch`.
 */
export interface ApiClient {
  me(): Promise<Agent>;
  scenarios(): Promise<Scenario[]>;
  personas(source?: PersonaSource): Promise<Persona[]>;
  persona(id: string): Promise<Persona>;
  /** "Save as custom persona": stored with source "custom" whatever you send. */
  createPersona(persona: CreatePersona): Promise<Persona>;
  /** Tomato merchant profiles for the picker (no dashboard data; that's found in the tools on the call). */
  merchants(source?: MerchantSource): Promise<MerchantSummary[]>;
  calls(kind?: CallKind): Promise<Call[]>;
  call(id: string): Promise<CallWithTranscript>;
  /** null while the call is still being scored. */
  scorecard(callId: string): Promise<Scorecard | null>;
  startSim(input: StartSim): Promise<SimSessionStart>;
  /** Hang up. A connected call goes to wrap-up (status "wrap_up"): dispose in Nugget via useSimCall, then it's scored. */
  endSim(callId: string): Promise<EndSimResponse>;
  /** A fresh single-use ElevenLabs realtime STT URL ("" when voice isn't configured / mock). */
  simSttUrl(callId: string): Promise<{ url: string }>;
  /** Start a sim session that replays a live call's extracted persona. */
  replayCall(callId: string): Promise<SimSessionStart>;
  activeLiveCall(): Promise<Call | null>;
  /** Dev/demo: play the fixture live call through the server's real pipeline. */
  simulateLiveCall(): Promise<{ callId: string }>;
  // --- Knowledge (RAG) ---
  knowledgeStatus(): Promise<{ enabled: boolean; collection: string; sources: number }>;
  knowledgeDocs(): Promise<KnowledgeSource[]>;
  /** Manager only. Re-uploading the same source replaces it. */
  uploadKnowledgeDoc(doc: CreateKnowledgeDoc): Promise<{ source: string; chunks: number }>;
  deleteKnowledgeDoc(source: string): Promise<{ removed: string }>;
  searchKnowledge(q: string, scope?: KnowledgeScopeKind, key?: string): Promise<KnowledgeSnippet[]>;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(error.message);
  }
}
