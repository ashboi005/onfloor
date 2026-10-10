import type { Language, Speaker } from "@onfloor/contracts";
import { services } from "../../core/services";
import { AppError } from "../../core/errors";
export interface ChannelStream {
  push(pcm16k: Uint8Array): void;
  close(): Promise<void>;
}

export interface ChannelStreamOptions {
  callId: string;
  speaker: Speaker;
  language: Language;
  elapsed(): number;
  onPartial(text: string): void;
  /** startMs/endMs relative to call start. */
  onCommitted(text: string, startMs: number, endMs: number): void;
  onError(err: Error): void;
}

export class SpeechFailure extends Error {
  constructor(message: string, readonly category: "auth" | "quota" | "rate_limit" | "protocol" | "transport" | "queue", readonly retryable: boolean) { super(message); }
  get code() { return `STT_${this.category.toUpperCase()}`; }
}

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const TERMINAL_ERRORS = new Set(["auth_error", "quota_exceeded", "quota_exceeded_error", "unaccepted_terms", "input_error", "invalid_request", "invalid_request_error", "chunk_size_exceeded", "session_time_limit_exceeded"]);

/** Each speaker owns an independent socket; recovery always mints a fresh token. */
export async function openChannelStream(opts: ChannelStreamOptions): Promise<ChannelStream> {
  let socket: WebSocket | null = null;
  let ready = false, stopped = false, closing = false;
  let pending: Uint8Array[] = [], bytes = 0, retries = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let segmentStart: number | null = null;
  let generation = 0;
  const report = (message: string, category: SpeechFailure["category"] = "transport", retryable = true) => opts.onError(new SpeechFailure(message, category, retryable));
  const send = (pcm: Uint8Array) => {
    if (!ready || socket?.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify({ message_type: "input_audio_chunk", audio_base_64: Buffer.from(pcm).toString("base64"), commit: false, sample_rate: 16000 }));
      return true;
    } catch { return false; }
  };
  const drain = () => {
    while (pending.length && socket && socket.bufferedAmount < 64_000) {
      const next = pending[0]!;
      if (!send(next)) break;
      pending.shift(); bytes -= next.length;
    }
  };
  const drainTimer = setInterval(drain, 25);
  const schedule = () => {
    if (stopped || reconnectTimer) return;
    if (retries >= 5) { stopped = true; clearInterval(drainTimer); report("Transcription reconnection attempts exhausted; recording continues."); return; }
    const delay = Math.min(4000, 250 * 2 ** retries++);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = undefined;
      void connect().catch(() => { report("Could not reconnect transcription."); schedule(); });
    }, delay);
  };

  async function connect(): Promise<void> {
    const current = ++generation;
    ready = false;
    const token = await services.stt.mintRealtimeToken();
    if (stopped || current !== generation) return;
    const ws = new WebSocket(services.stt.realtimeUrl({ language: opts.language }, token));
    socket = ws;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const rejectStart = () => {
        if (settled) return;
        settled = true; clearTimeout(timeout);
        reject(new AppError("TRANSCRIPTION_FAILED", { message: "Speech session did not start." }));
      };
      const timeout = setTimeout(() => { rejectStart(); ws.close(); }, 10_000);
      ws.onmessage = (event) => {
        if (stopped || current !== generation) return;
        let msg: { message_type?: string; text?: unknown };
        try {
          const value: unknown = JSON.parse(String(event.data));
          if (!value || typeof value !== "object" || !("message_type" in value) || typeof value.message_type !== "string") throw new Error("Invalid speech message.");
          msg = { message_type: value.message_type, text: "text" in value ? value.text : undefined };
        } catch { report("Invalid transcription response.", "protocol", false); return; }
        if (msg.message_type === "session_started") {
          if (settled) return;
          settled = true; clearTimeout(timeout); ready = true; retries = 0; drain(); resolve();
        } else if (msg.message_type === "partial_transcript" && typeof msg.text === "string" && msg.text.trim()) {
          segmentStart ??= opts.elapsed(); opts.onPartial(msg.text);
        } else if (msg.message_type === "committed_transcript" && typeof msg.text === "string") {
          if (msg.text.trim()) {
            const end = opts.elapsed();
            opts.onCommitted(msg.text, Math.min(segmentStart ?? end, end), end);
          }
          segmentStart = null;
        } else if (msg.message_type && (msg.message_type.includes("error") || TERMINAL_ERRORS.has(msg.message_type) || ["rate_limited", "throttled", "queue_overflow", "resource_exhausted", "transcriber_error"].includes(msg.message_type))) {
          const terminal = TERMINAL_ERRORS.has(msg.message_type);
          const category = msg.message_type.includes("auth") || msg.message_type === "unaccepted_terms" ? "auth"
            : msg.message_type.includes("quota") || msg.message_type === "resource_exhausted" ? "quota"
            : /rate|throttl/.test(msg.message_type) ? "rate_limit"
            : msg.message_type.includes("queue") ? "queue" : terminal ? "protocol" : "transport";
          report(`Speech provider reported ${msg.message_type}.`, category, !terminal);
          if (TERMINAL_ERRORS.has(msg.message_type)) { stopped = true; clearInterval(drainTimer); }
          rejectStart(); ws.close();
        }
      };
      ws.onerror = () => { report("Speech transport failed."); rejectStart(); ws.close(); };
      ws.onclose = () => {
        clearTimeout(timeout); rejectStart();
        if (current !== generation) return;
        ready = false;
        if (segmentStart !== null) report("An interrupted speech segment could not be committed; recording retains its audio.");
        segmentStart = null;
        if (!stopped) { report("Speech connection interrupted; reconnecting."); schedule(); }
      };
    });
  }

  try { await connect(); } catch (err) {
    stopped = true; generation++; clearTimeout(reconnectTimer); clearInterval(drainTimer); (socket as WebSocket | null)?.close(); throw err;
  }
  let shutdown: Promise<void> | undefined;
  return {
    push(pcm) {
      if (closing || stopped || !pcm.length) return;
      if (pcm.length % 2) throw new AppError("BAD_REQUEST", { message: "Incomplete PCM sample." });
      pending.push(pcm.slice()); bytes += pcm.length;
      let dropped = false;
      while (bytes > 64_000 && pending.length) { bytes -= pending.shift()!.length; dropped = true; }
      if (dropped) report("Speech queue exceeded two seconds; older audio was dropped.", "queue");
      drain();
    },
    close() {
      shutdown ??= (async () => {
        closing = true;
        const deadline = performance.now() + 3000;
        while (bytes && !stopped && performance.now() < deadline) { drain(); await pause(25); }
        if (bytes) report("Some queued speech could not be flushed.");
        if (ready && !stopped) {
          for (let i = 0; i < 10; i++) { send(new Uint8Array(3200)); await pause(100); }
          const commitDeadline = performance.now() + 1500;
          // A delayed provider may not have sent its first partial yet. Always
          // leave the socket open for this bounded grace period after trailing VAD.
          while (performance.now() < commitDeadline) await pause(25);
          if (segmentStart !== null) report("The final speech segment was not committed before shutdown.");
        }
        stopped = true; generation++; clearTimeout(reconnectTimer); clearInterval(drainTimer);
        socket?.close(); pending = []; bytes = 0;
      })();
      return shutdown;
    },
  };
}
