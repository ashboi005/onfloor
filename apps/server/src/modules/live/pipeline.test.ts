import { afterAll, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { liveEventSchema, type Agent, type Call, type CreatePersona, type LiveEvent, type Persona, type TranscriptTurn } from "@onfloor/contracts";
import { liveScorecard, VOICES } from "@onfloor/contracts/fixtures";

const owner: Agent = { id: "agent_tushar", name: "Tushar", email: "tushar@onfloor.demo", role: "agent" };
const other: Agent = { ...owner, id: "agent_other" };
const rows = new Map<string, Call>();
const transcripts = new Map<string, TranscriptTurn[]>();
const events = new Map<string, LiveEvent[]>();
const personas = new Map<string, Persona>();
const archived = new Map<string, Uint8Array>();
let token = 0, failScore = false, failStorage = false, failEnd = false;
let customerDelay = 0, customerFailure = false, suggestedHint = false;
let knowledgeEnabled = false;
const knowledgeRequests: Array<{ kind: string; customerKey?: string }> = [];
const sockets: Array<{ close(): void }> = [];

const speech = Bun.serve<{ index: number; spoken: boolean; committed: boolean }>({
  port: 0,
  fetch(request, server) {
    const index = Number(new URL(request.url).searchParams.get("token"));
    if (server.upgrade(request, { data: { index, spoken: false, committed: false } })) return;
    return new Response("upgrade", { status: 400 });
  },
  websocket: {
    open(ws) { sockets.push(ws); ws.send(JSON.stringify({ message_type: "session_started" })); },
    message(ws, raw) {
      const input = JSON.parse(String(raw));
      const pcm = Buffer.from(input.audio_base_64, "base64");
      const text = ws.data.index % 2 ? "I can offer 15% discount" : "Please pause my campaign";
      if (pcm.some((value) => value !== 0) && !ws.data.spoken) {
        ws.data.spoken = true;
        ws.send(JSON.stringify({ message_type: "partial_transcript", text }));
      } else if (ws.data.spoken && !ws.data.committed && pcm.every((value) => value === 0)) {
        ws.data.committed = true;
        ws.send(JSON.stringify({ message_type: "committed_transcript", text }));
      }
    },
  },
});

mock.module("../../env.server", () => ({ ENV: { LIVE_DEFAULT_LANGUAGE: "hinglish", LIVE_AGENT_EMAIL: owner.email,
  STUB_ENGINES: true, STUB_SPEED: 1000, NODE_ENV: "test", BRIDGE_SECRET: "test-secret" } }));
mock.module("../../core/calls", () => ({ calls: {
  async create(input: Partial<Call>) {
    const call: Call = { id: `call_${crypto.randomUUID()}`, kind: "live", agentId: owner.id, language: "hinglish", status: "active",
      customerLabel: "Test customer", scenarioId: null, personaId: null, merchantId: null, guidance: false, replayOfCallId: null, startedAt: new Date().toISOString(),
      endedAt: null, durationMs: null, recordingUrl: null, overallScore: null, ...input };
    rows.set(call.id, call); transcripts.set(call.id, []); return { ...call };
  },
  async get(id: string) { if (!rows.has(id)) throw new Error("not found"); return { ...rows.get(id)! }; },
  async getOwned(id: string, agent: Agent) { const call = rows.get(id)!; if (!call || agent.role !== "manager" && call.agentId !== agent.id) throw new Error("forbidden"); return call; },
  async getWithTranscript(id: string) { return { ...rows.get(id)!, transcript: transcripts.get(id)! }; },
  async appendTurn(callId: string, input: Omit<TranscriptTurn, "id" | "callId" | "seq">) {
    const seq = transcripts.get(callId)!.length + 1;
    // This reproduces the core repo race if the session stops serializing writes.
    await Bun.sleep(10);
    const turn = { ...input, id: `turn_${crypto.randomUUID()}`, callId, seq };
    transcripts.get(callId)!.push(turn); return turn;
  },
  async end(id: string, status: Call["status"]) { if (failEnd) throw new Error("end write unavailable"); const call = rows.get(id)!; call.status = status; call.endedAt = new Date().toISOString(); call.durationMs = Date.now() - Date.parse(call.startedAt); return { ...call }; },
  async setPersona(id: string, personaId: string) { rows.get(id)!.personaId = personaId; },
  async setRecording(id: string, url: string) { rows.get(id)!.recordingUrl = url; },
  async setTurnTranslation() {}, // [added by Ashwath] subtitles write-back (silences test noise)
} }));
mock.module("./index", () => ({
  async agentIdByEmail() { return owner.id; },
  async appendEvent(id: string, _at: number, event: LiveEvent) { events.set(id, [...(events.get(id) ?? []), structuredClone(event)]); },
  async readEvents(id: string) { return events.get(id) ?? []; },
}));
mock.module("../scoring", () => ({ async scoreCall(id: string) {
  if (failScore) throw new Error("judge unavailable");
  rows.get(id)!.status = "scored"; return { ...liveScorecard, callId: id };
} }));
mock.module("../personas", () => ({
  async getPersona(id: string) { return personas.get(id); },
  async createPersona(input: CreatePersona, id = `persona_${crypto.randomUUID()}`) {
    const persona = { ...input, id, createdAt: new Date().toISOString() }; personas.set(id, persona); return persona;
  },
}));
mock.module("../../core/services", () => ({ services: {
  knowledge: {
    get enabled() { return knowledgeEnabled; },
    async retrieve(_query: string, scope: { kind: string; customerKey?: string }) {
      knowledgeRequests.push(scope);
      if (!knowledgeEnabled) return [];
      if (scope.kind === "org_docs") return [{ id: "fact_1", text: "The approved plan costs 499 rupees.", source: "playbook", title: "Approved pricing", score: 0.9, meta: {} }];
      if (scope.kind === "customer" && scope.customerKey === "telegram-customer-17") return [{ id: "memory_1", text: "Asked to pause the campaign.", source: "call:previous", title: "Previous call", score: 0.8, meta: {} }];
      return [];
    },
  },
  stt: { async mintRealtimeToken() { return String(++token); }, realtimeUrl(_input: unknown, value: string) { return `ws://127.0.0.1:${speech.port}/?token=${value}`; } },
  storage: { async put(key: string, bytes: Uint8Array) {
    if (failStorage) throw new Error("storage unavailable");
    archived.set(key, bytes); return { key, url: `https://example.invalid/files/${key}` };
  } },
  llm: { async json(input: { schemaName: string; schema: { parse(value: unknown): unknown } }) {
    if (input.schemaName === "live_customer_analysis") {
      if (customerFailure) throw new Error("customer model unavailable");
      await Bun.sleep(customerDelay);
      return input.schema.parse({ hint: suggestedHint ? { kind: "pitch", title: "Use the approved offer", body: "Explain the approved plan clearly." } : null,
        patience: 70, frustration: 20, engagement: 80 });
    }
    if (input.schemaName === "live_agent_guardrails") return input.schema.parse({ alerts: [] });
    const { suresh } = await import("@onfloor/contracts/fixtures");
    return input.schema.parse({ ...suresh, openingLine: "Please pause my campaign",
      speechStyle: { ...suresh.speechStyle, catchphrases: ["Please pause my campaign"] },
      crmRequests: [] }); // [added by Ashwath] "pause my campaign" is no longer a simulator request kind

  } },
} }));
mock.module("../../core/auth-guard", () => ({
  authGuard: new Elysia({ name: "test-auth" }).macro({ authed: { resolve: ({ request }) => ({ agent: request.headers.get("cookie") === "other" ? other : owner }) } }),
  async requireAgentWs(headers: Record<string, string>) { return headers.cookie === "owner" ? owner : headers.cookie === "other" ? other : null; },
}));

const session = await import("./session");
const { hub } = await import("./hub");
const { decodeWav, encodeWav } = await import("./audio");
const { parseReplayFiles, startReplay } = await import("./replay");
const { openChannelStream } = await import("./transcribe");
const { liveRoutes } = await import("./routes");
const api = new Elysia().use(liveRoutes).listen(0);
const audio = new Uint8Array(3200).fill(1);

afterAll(() => { speech.stop(true); api.stop(); });

async function waitUntil(check: () => boolean, ms = 6000) {
  const end = Date.now() + ms;
  while (!check() && Date.now() < end) await Bun.sleep(10);
  expect(check()).toBe(true);
}

test("two-channel shutdown saves ordered finals, recordings and an evidenced persona once", async () => {
  const call = await session.startLiveCall({ agentId: owner.id, customerLabel: "Customer" });
  await expect(session.startLiveCall({ agentId: owner.id, customerLabel: "Second" })).rejects.toThrow();
  session.pushLiveAudio(call.id, "agent", 0, audio); session.pushLiveAudio(call.id, "customer", 0, audio);
  await waitUntil(() => (events.get(call.id) ?? []).some((e) => e.type === "transcript_partial"));
  const done = session.finishLiveCall(call.id);
  expect(session.finishLiveCall(call.id)).toBe(done);
  await done;
  expect(transcripts.get(call.id)!.map((t) => t.seq)).toEqual([1, 2]);
  const log = events.get(call.id)!;
  for (const event of log) expect(liveEventSchema.safeParse(event).success).toBe(true);
  expect(log.filter((e) => e.type === "call_ended")).toHaveLength(1);
  expect(log.some((e) => e.type === "scorecard_ready")).toBe(true);
  expect(log.some((e) => e.type === "persona_ready")).toBe(true);
  expect(rows.get(call.id)!.recordingUrl).toContain("/mixed.wav");
  expect(decodeWav(archived.get(`live/${call.id}/stereo.wav`)!).channels).toHaveLength(2);
  expect(personas.get(rows.get(call.id)!.personaId!)!.openingLine).toBe("Please pause my campaign");
  expect(personas.get(rows.get(call.id)!.personaId!)!.voiceId).toBe(VOICES.srikant);
  expect(session.getActiveLiveCall()).toBeNull();
  const history: LiveEvent[] = [];
  const off = await hub.subscribe(call.id, owner, (e) => history.push(e)); off();
  expect(history.map((e) => e.type)).toEqual(log.map((e) => e.type));
});

test("recording/scoring failure still permits persona extraction and releases the session", async () => {
  failScore = failStorage = true;
  const call = await session.startLiveCall({ agentId: owner.id, customerLabel: "Customer" });
  session.pushLiveAudio(call.id, "agent", 0, audio); session.pushLiveAudio(call.id, "customer", 0, audio);
  await Bun.sleep(50); await session.finishLiveCall(call.id);
  const log = events.get(call.id)!;
  expect(log.some((e) => e.type === "error" && e.code === "RECORDING_FAILED")).toBe(true);
  expect(log.some((e) => e.type === "error" && e.code === "SCORING_FAILED")).toBe(true);
  expect(log.some((e) => e.type === "persona_ready")).toBe(true);
  expect(session.getActiveLiveCall()).toBeNull();
  failScore = failStorage = false;
});

test("multipart stereo replay runs real audio path even when fixture mode is enabled", async () => {
  const form = new FormData();
  form.set("audio", new File([encodeWav([audio, audio]).buffer as ArrayBuffer], "call.wav"));
  const replay = await parseReplayFiles(form);
  const { callId } = await startReplay(owner.id, replay);
  await waitUntil(() => (events.get(callId) ?? []).some((e) => e.type === "persona_ready"));
  expect(transcripts.get(callId)).toHaveLength(2);
  expect(archived.has(`live/${callId}/agent.wav`)).toBe(true);
  const invalid = new FormData(); invalid.set("agentAudio", new File([encodeWav([audio]).buffer as ArrayBuffer], "agent.wav"));
  await expect(parseReplayFiles(invalid)).rejects.toThrow();
});

test("failed call-end write does not skip independent wrap-up stages", async () => {
  const call = await session.startLiveCall({ agentId: owner.id, customerLabel: "Customer" });
  session.pushLiveAudio(call.id, "agent", 0, audio); session.pushLiveAudio(call.id, "customer", 0, audio);
  await Bun.sleep(50);
  failEnd = true;
  try { await session.finishLiveCall(call.id); } finally { failEnd = false; }
  const log = events.get(call.id)!;
  expect(log.some((e) => e.type === "error" && e.code === "CALL_END_FAILED")).toBe(true);
  expect(log.some((e) => e.type === "scorecard_ready")).toBe(true);
  expect(log.some((e) => e.type === "persona_ready")).toBe(true);
  expect(archived.has(`live/${call.id}/stereo.wav`)).toBe(true);
  expect(session.getActiveLiveCall()).toBeNull();
});

test("STT reconnect mints a fresh token and keeps the stream usable", async () => {
  const before = token;
  let clock = 5000, partials = 0;
  const timing: number[][] = [];
  const stream = await openChannelStream({ callId: "reconnect", speaker: "agent", language: "en", elapsed: () => clock,
    onPartial() { partials++; }, onCommitted(_text, start, end) { timing.push([start, end]); }, onError() {} });
  stream.push(audio); await waitUntil(() => partials === 1);
  sockets.at(-1)!.close();
  clock = 20_000;
  await waitUntil(() => token >= before + 2);
  stream.push(audio); await waitUntil(() => partials === 2);
  clock = 21_000; stream.push(new Uint8Array(3200));
  await waitUntil(() => timing.length === 1);
  expect(timing).toEqual([[20_000, 21_000]]);
  await stream.close();
  expect(token).toBeGreaterThanOrEqual(before + 2);
});

test("shutdown waits for delayed first partial and final", async () => {
  const commits: string[] = [];
  const protocolErrors: string[] = [];
  const provider = Bun.serve({ port: 0, fetch(request, server) {
    if (server.upgrade(request)) return; return new Response("upgrade", { status: 400 });
  }, websocket: {
    open(ws) { ws.send(JSON.stringify({ message_type: 123 })); ws.send(JSON.stringify({ message_type: "session_started" })); },
    message(ws, raw) {
      const pcm = Buffer.from(JSON.parse(String(raw)).audio_base_64, "base64");
      if (pcm.some((byte) => byte !== 0)) setTimeout(() => {
        ws.send(JSON.stringify({ message_type: "partial_transcript", text: "Delayed speech" }));
        ws.send(JSON.stringify({ message_type: "committed_transcript", text: "Delayed speech" }));
      }, 1300);
    },
  } });
  const { services } = await import("../../core/services");
  const original = services.stt.realtimeUrl;
  services.stt.realtimeUrl = () => `ws://127.0.0.1:${provider.port}`;
  try {
    const stream = await openChannelStream({ callId: "late-final", speaker: "agent", language: "en", elapsed: () => 0,
      onPartial() {}, onCommitted(text) { commits.push(text); }, onError(error) { protocolErrors.push(error.message); } });
    stream.push(audio); await stream.close();
    expect(commits).toEqual(["Delayed speech"]);
    expect(protocolErrors).toEqual(["Invalid transcription response."]);
  } finally { services.stt.realtimeUrl = original; provider.stop(true); }
});

test("copilot discards late analysis, deduplicates hints and preserves fast paths on failure", async () => {
  const call = await session.startLiveCall({ agentId: owner.id, customerLabel: "Customer" });
  const customer = (text: string) => session.appendLiveTurn(call.id, { speaker: "customer", text, language: "hinglish", startMs: 0, endMs: 1 });
  suggestedHint = true; customerDelay = 2300;
  try {
    await customer("Please pause my campaign"); await Bun.sleep(2400);
    expect(events.get(call.id)!.filter((e) => e.type === "hint")).toHaveLength(0);
    expect(events.get(call.id)!.filter((e) => e.type === "sentiment")).toHaveLength(1);
    customerDelay = 0;
    await customer("Explain the plan"); await waitUntil(() => events.get(call.id)!.some((e) => e.type === "hint"));
    await customer("Explain the plan again"); await Bun.sleep(30);
    expect(events.get(call.id)!.filter((e) => e.type === "hint")).toHaveLength(1);
    customerFailure = true;
    await customer("Commission is too high"); await customer("Commission is too high"); await Bun.sleep(30);
    expect(events.get(call.id)!.filter((e) => e.type === "hint")).toHaveLength(2);
    const copilot = await import("./copilot");
    copilot.onPartial(call.id, "agent", "I can offer 15% discount");
    copilot.onPartial(call.id, "agent", "I can offer 15% discount");
    await session.appendLiveTurn(call.id, { speaker: "agent", text: "I can offer 15% discount", language: "hinglish", startMs: 0, endMs: 1 });
    await hub.drain(call.id);
    expect(events.get(call.id)!.filter((e) => e.type === "guardrail")).toHaveLength(1);
    await session.appendLiveTurn(call.id, { speaker: "agent", text: "I can offer 15% discount", language: "hinglish", startMs: 2, endMs: 3 });
    await hub.drain(call.id);
    expect(events.get(call.id)!.filter((e) => e.type === "guardrail")).toHaveLength(2);
  } finally {
    customerDelay = 0; customerFailure = suggestedHint = false;
    await session.finishLiveCall(call.id);
  }
}, 10_000);

test("grounded hint retrieves this caller's memory and cites approved playbook facts", async () => {
  knowledgeEnabled = true; suggestedHint = true; knowledgeRequests.length = 0;
  const call = await session.startLiveCall({ agentId: owner.id, customerLabel: "Repeat customer", externalCustomerId: "telegram-customer-17" });
  try {
    await session.appendLiveTurn(call.id, { speaker: "customer", text: "What was the approved plan price?", language: "en", startMs: 0, endMs: 1 });
    await waitUntil(() => events.get(call.id)!.some((e) => e.type === "hint"));
    const hint = events.get(call.id)!.find((e) => e.type === "hint");
    expect(hint?.type === "hint" ? hint.hint.sources : []).toEqual(["Approved pricing"]);
    expect(knowledgeRequests).toContainEqual({ kind: "customer", customerKey: "telegram-customer-17" });
    expect(knowledgeRequests.some((request) => request.kind === "org_docs")).toBe(true);
    await waitUntil(() => events.get(call.id)!.some((e) => e.type === "customer_memory"));
  } finally {
    knowledgeEnabled = false; suggestedHint = false;
    await session.finishLiveCall(call.id);
  }
});

test("bridge start/resume uses one call, rejects audio before ack and validates auth", async () => {
  const base = `ws://127.0.0.1:${api.server!.port}`;
  const messages: Array<{ type: string; callId?: string }> = [];
  const ws = new WebSocket(`${base}/internal/live/ingest`, { headers: { "x-bridge-secret": "test-secret" } });
  ws.onmessage = (m) => messages.push(JSON.parse(String(m.data)));
  await new Promise<void>((resolve, reject) => { ws.onopen = () => resolve(); ws.onerror = () => reject(new Error("bridge open failed")); });
  ws.send(new Uint8Array([0, 0, 0, 0, 0, 1, 0]));
  await waitUntil(() => messages.some((m) => m.type === "error"));
  const start = { type: "call_started", protocolVersion: 1, telegramCallId: "peer:unique-call", customer: { id: "peer", displayName: "Customer" } };
  ws.send(JSON.stringify(start));
  await waitUntil(() => messages.some((m) => m.type === "ack"));
  const callId = messages.find((m) => m.type === "ack")!.callId!;
  ws.send(JSON.stringify({ ...start, callId }));
  await waitUntil(() => messages.filter((m) => m.type === "ack").length === 2);
  expect(messages.filter((m) => m.type === "ack").map((m) => m.callId)).toEqual([callId, callId]);
  const response = await api.handle(new Request(`http://127.0.0.1:${api.server!.port}/api/live/active`, { headers: { cookie: "other" } }));
  expect(await response.json()).toBeNull();
  ws.send(JSON.stringify({ type: "call_ended", reason: "test" }));
  await waitUntil(() => messages.some((m) => m.type === "ended")); ws.close();
  await session.finishLiveCall(callId);
  const unauthorized = await fetch(`http://127.0.0.1:${api.server!.port}/internal/live/ingest`, { headers: { upgrade: "websocket", connection: "Upgrade", "sec-websocket-version": "13", "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==" } });
  expect(unauthorized.status).toBe(401);
}, 15000);
