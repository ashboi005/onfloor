import type { Call, Language, LiveEvent, Speaker, TranscriptTurn } from "@onfloor/contracts";
import { LIVE_CALL_ID, liveCallTimeline, suresh } from "@onfloor/contracts/fixtures";
import { calls } from "../../core/calls";
import { AppError } from "../../core/errors";
import { services } from "../../core/services";
import { swapId } from "../../core/timeline";
import { ENV } from "../../env.server";
import { createPersona } from "../personas";
import { scoreCall } from "../scoring";
import { customerMemoryEvent } from "../knowledge";
import { CHUNK_SAMPLES, MAX_SAMPLES } from "./audio";
import { beginCopilot, endCopilot, onFinal, onPartial, onSpeech } from "./copilot";
import { extractPersona } from "./extract-persona";
import { hub } from "./hub";
import { CallRecording } from "./recording";
import { openChannelStream, SpeechFailure, type ChannelStream } from "./transcribe";

type Source = "audio" | "fixture";
interface Session {
  call: Call; source: Source; accepting: boolean; writes: Promise<void>;
  customerKey?: string | null;
  streams: Partial<Record<Speaker, ChannelStream>>; recording: CallRecording;
  telegramCallId?: string; connection?: object;
  timeout?: ReturnType<typeof setTimeout>; disconnected?: ReturnType<typeof setTimeout>;
  finish?: Promise<void>;
}
let current: Session | null = null;
let starting = false;
const completed = new Map<string, Promise<void>>();
const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function getActiveLiveCall(): Call | null { return current?.accepting ? current.call : null; }
export function sessionForBridge(telegramCallId: string, callId?: string): Call | null {
  if (current?.telegramCallId === telegramCallId && (!callId || callId === current.call.id)) return current.call;
  if (callId) throw new AppError("BAD_REQUEST", { message: "The previous bridge call is no longer resumable." });
  return null;
}
function requireSession(callId: string): Session {
  if (!current || current.call.id !== callId) throw new AppError("NOT_FOUND", { message: "No live session for that call." });
  return current;
}
export function attachBridge(callId: string, connection: object) {
  const session = requireSession(callId);
  if (!session.accepting) throw new AppError("BAD_REQUEST", { message: "This call is already ending." });
  clearTimeout(session.disconnected); session.disconnected = undefined; session.connection = connection;
}
export function isBridgeConnection(callId: string, connection: object) { return current?.call.id === callId && current.connection === connection; }
export function detachBridge(callId: string, connection: object) {
  if (!isBridgeConnection(callId, connection) || !current?.accepting) return;
  hub.emit(callId, { type: "error", code: "BRIDGE_DISCONNECTED", message: "Bridge disconnected; waiting up to ten seconds for reconnection.", retryable: true });
  current.connection = undefined;
  current.disconnected = setTimeout(() => { void finishLiveCall(callId).catch(() => console.error("[live] disconnect finalization failed", callId)); }, 10_000);
}

export async function startLiveCall(input: {
  agentId: string; customerLabel: string; externalCustomerId?: string | null;
  language?: Language; source?: Source; telegramCallId?: string;
}): Promise<Call> {
  if (starting || current) throw new AppError("FORBIDDEN", { message: "One live or replay call is already running or finalizing." });
  starting = true;
  let session: Session | undefined;
  try {
    const call = await calls.create({ kind: "live", agentId: input.agentId, language: input.language ?? ENV.LIVE_DEFAULT_LANGUAGE,
      customerLabel: input.customerLabel, externalCustomerId: input.externalCustomerId ?? null });
    session = { call, source: input.source ?? "audio", accepting: false, writes: Promise.resolve(), streams: {}, customerKey: input.externalCustomerId,
      recording: new CallRecording(), telegramCallId: input.telegramCallId };
    current = session;
    hub.begin(call); hub.emit(call.id, { type: "call_started", call });
    // Preserve HUD event order: the repeat-customer card follows call_started
    // before any transcript or copilot events can arrive.
    hub.emit(call.id, await customerMemoryEvent(input.externalCustomerId ?? null, call.customerLabel));
    if (session.source === "audio") {
      beginCopilot(call.id, session.customerKey);
      const opened = await Promise.allSettled((["agent", "customer"] as const).map(async (speaker) => {
        const stream = await openChannelStream({ callId: call.id, speaker, language: call.language,
          elapsed: () => hub.elapsed(call.id),
          onPartial: (text) => { hub.emit(call.id, { type: "transcript_partial", speaker, text }); onPartial(call.id, speaker, text); },
          onCommitted: (text, startMs, endMs) => { appendLiveTurn(call.id, { speaker, text, language: call.language, startMs, endMs }); },
          onError: (error) => hub.emit(call.id, { type: "error", code: error instanceof SpeechFailure ? error.code : "TRANSCRIPTION_FAILED",
            message: `${speaker}: ${error.message}`, retryable: error instanceof SpeechFailure ? error.retryable : true }),
        });
        session!.streams[speaker] = stream;
      }));
      const failure = opened.find((r) => r.status === "rejected");
      if (failure?.status === "rejected") throw failure.reason;
    }
    session.accepting = true;
    session.timeout = setTimeout(() => { void finishLiveCall(call.id).catch(() => console.error("[live] time-limit finalization failed", call.id)); }, MAX_SAMPLES / 16);
    return call;
  } catch (err) {
    if (session) {
      endCopilot(session.call.id);
      await Promise.allSettled(Object.values(session.streams).map((s) => s.close()));
      await session.writes;
      const ended = await calls.end(session.call.id, "failed").catch(() => null);
      hub.emit(session.call.id, { type: "error", code: "TRANSCRIPTION_FAILED", message: "Live transcription could not start. Check the STT configuration.", retryable: true });
      if (ended) hub.emit(session.call.id, { type: "call_ended", callId: ended.id, durationMs: ended.durationMs ?? 0 });
      await hub.drain(session.call.id).catch(() => {}); hub.finish(session.call.id);
    }
    current = null; throw err;
  } finally { starting = false; }
}

/** One write queue across both channels prevents calls.appendTurn's max(seq) race. */
export function appendLiveTurn(callId: string, input: Omit<TranscriptTurn, "id" | "callId" | "seq">): Promise<void> {
  const session = requireSession(callId);
  const operation = session.writes.then(async () => {
    const turn = await calls.appendTurn(callId, input);
    hub.emit(callId, { type: "transcript_final", turn });
    if (session.source === "audio") onFinal(callId, turn);
  });
  session.writes = operation.catch(() => {
    hub.emit(callId, { type: "error", code: "TRANSCRIPT_PERSIST_FAILED", message: "A transcript turn could not be saved.", retryable: true });
  });
  return session.writes;
}

export function pushLiveAudio(callId: string, speaker: Speaker, offset: number, pcm: Uint8Array) {
  const session = requireSession(callId);
  if (!session.accepting) throw new AppError("BAD_REQUEST", { message: "The audio session is not accepting frames." });
  const chunk = session.recording.append(speaker, offset, pcm);
  if (!chunk) return;
  const stream = session.streams[speaker];
  if (chunk.gap) {
    hub.emit(callId, { type: "error", code: "AUDIO_GAP", message: `${speaker} audio has a ${Math.round(chunk.gap / 16)} ms gap; the archive contains silence there.`, retryable: true });
    // Flush VAD across a gap without flooding the provider with an outage backlog.
    for (let remaining = Math.min(chunk.gap, CHUNK_SAMPLES * 10); remaining > 0; remaining -= CHUNK_SAMPLES) stream?.push(new Uint8Array(Math.min(remaining, CHUNK_SAMPLES) * 2));
  }
  stream?.push(chunk.pcm);
  const samples = new DataView(chunk.pcm.buffer, chunk.pcm.byteOffset, chunk.pcm.byteLength);
  let sum = 0;
  for (let i = 0; i < chunk.pcm.length; i += 2) sum += samples.getInt16(i, true) ** 2;
  if (Math.sqrt(sum / (chunk.pcm.length / 2)) >= 250) {
    // Metrics use the same server clock as STT partials/finals. Media offsets keep
    // recordings aligned, but queued/replayed media may use a different origin.
    const end = hub.elapsed(callId);
    onSpeech(callId, speaker, Math.max(0, end - Math.round(chunk.pcm.length / 32)), end);
  }
}

/** The first caller owns shutdown. All later callers await the same operation. */
export function finishLiveCall(callId: string): Promise<void> {
  const previous = completed.get(callId);
  if (previous) return previous;
  const session = requireSession(callId);
  if (session.finish) return session.finish;
  session.accepting = false;
  clearTimeout(session.timeout); clearTimeout(session.disconnected);
  const audioDurationMs = hub.elapsed(callId);
  session.finish = (async () => {
    try {
      await Promise.allSettled(Object.values(session.streams).map((s) => s.close()));
      await session.writes; endCopilot(callId);
      let ended: Call | undefined;
      try { ended = await calls.end(callId, "scoring"); }
      catch {
        try { ended = await calls.end(callId, "scoring"); }
        catch { hub.emit(callId, { type: "error", code: "CALL_END_FAILED", message: "Audio ended, but the call-end database write failed; inspect the call row.", retryable: true }); }
      }
      hub.emit(callId, { type: "call_ended", callId, durationMs: ended?.durationMs ?? audioDurationMs });
      if (session.source === "audio") {
        try {
          const files = session.recording.files(audioDurationMs);
          let archiveFailed = false;
          for (const name of ["mixed", "agent", "customer", "stereo"] as const) {
            try {
              const stored = await services.storage.put(`live/${callId}/${name}.wav`, files[name], "audio/wav");
              if (name === "mixed") await calls.setRecording(callId, stored.url);
            } catch { archiveFailed = true; }
          }
          if (archiveFailed) throw new Error("Recording archive incomplete.");
        } catch { hub.emit(callId, { type: "error", code: "RECORDING_FAILED", message: "One or more recordings could not be archived; retain the local bridge backup.", retryable: true }); }
      }
      try { await scoreCall(callId); hub.emit(callId, { type: "scorecard_ready", callId }); }
      catch { hub.emit(callId, { type: "error", code: "SCORING_FAILED", message: "Scoring failed.", retryable: true }); }
      try {
        const persona = session.source === "fixture"
          ? await createPersona({ ...swapId(suresh, LIVE_CALL_ID, callId), source: "live_call", sourceCallId: callId }, `persona_live_${callId}`)
          : await extractPersona(callId);
        await calls.setPersona(callId, persona.id);
        hub.emit(callId, { type: "persona_ready", personaId: persona.id, callId });
      } catch { hub.emit(callId, { type: "error", code: "PERSONA_FAILED", message: "Persona extraction failed; check that customer speech was captured.", retryable: true }); }
      try { await hub.drain(callId); }
      catch { hub.emit(callId, { type: "error", code: "EVENT_PERSIST_FAILED", message: "Some HUD events could not be saved.", retryable: true }); await hub.drain(callId).catch(() => {}); }
    } finally {
      endCopilot(callId); hub.finish(callId);
      if (current === session) current = null;
    }
  })();
  completed.set(callId, session.finish);
  setTimeout(() => completed.delete(callId), 10 * 60_000).unref();
  return session.finish;
}

/** Fixtures stay isolated from STT/LLM; they still exercise the real DB/hub lifecycle. */
export async function simulateFixtureCall(agentId: string) {
  const call = await startLiveCall({ agentId, customerLabel: "Suresh Patil", externalCustomerId: "demo-suresh", language: "hinglish", source: "fixture" });
  void (async () => {
    const start = performance.now();
    const speed = Math.max(0.1, ENV.STUB_SPEED);
    for (const { atMs, event: original } of liveCallTimeline) {
      const event = swapId(original, LIVE_CALL_ID, call.id);
      await pause(Math.max(0, atMs / speed - (performance.now() - start)));
      if (!getActiveLiveCall() || current?.call.id !== call.id) break;
      if (event.type === "transcript_final") {
        const { speaker, text, language, startMs, endMs } = event.turn;
        await appendLiveTurn(call.id, { speaker, text, language, startMs, endMs });
      } else if (event.type === "call_ended") { await finishLiveCall(call.id); break; }
      else if (!["call_started", "customer_memory", "scorecard_ready", "persona_ready"].includes(event.type)) hub.emit(call.id, event as LiveEvent);
    }
  })().catch(() => { void finishLiveCall(call.id).catch(() => console.error("[live] fixture finalization failed", call.id)); });
  return { callId: call.id };
}
