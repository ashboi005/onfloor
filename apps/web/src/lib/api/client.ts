import type {
  Agent,
  ApiError,
  Call,
  CallKind,
  CallWithTranscript,
  EndSimResponse,
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
  calls(kind?: CallKind): Promise<Call[]>;
  call(id: string): Promise<CallWithTranscript>;
  /** null while the call is still being scored. */
  scorecard(callId: string): Promise<Scorecard | null>;
  startSim(input: StartSim): Promise<SimSessionStart>;
  endSim(callId: string): Promise<EndSimResponse>;
  /** A fresh single-use ElevenLabs realtime STT URL ("" when voice isn't configured / mock). */
  simSttUrl(callId: string): Promise<{ url: string }>;
  /** Start a sim session that replays a live call's extracted persona. */
  replayCall(callId: string): Promise<SimSessionStart>;
  activeLiveCall(): Promise<Call | null>;
  /** Dev/demo: play the fixture live call through the server's real pipeline. */
  simulateLiveCall(): Promise<{ callId: string }>;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly error: ApiError,
  ) {
    super(error.message);
  }
}
