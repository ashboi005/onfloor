import { AppError } from "../../core/errors";
import { CHUNK_SAMPLES, decodeWav, MAX_UPLOAD_BYTES } from "./audio";
import { finishLiveCall, getActiveLiveCall, pushLiveAudio, startLiveCall } from "./session";

export interface ReplayAudio { agent: Uint8Array; customer: Uint8Array; samples: number }

/** Read with a hard bound even when Content-Length is missing/chunked. */
export async function readReplayUpload(request: Request): Promise<ReplayAudio> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) throw new AppError("BAD_REQUEST", { message: "Upload multipart WAV files." });
  if (Number(request.headers.get("content-length")) > MAX_UPLOAD_BYTES) throw new AppError("BAD_REQUEST", { message: "Upload exceeds 64 MiB." });
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("BAD_REQUEST", { message: "Missing upload body." });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_UPLOAD_BYTES) { await reader.cancel(); throw new Error("Upload exceeds 64 MiB."); }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), { headers: { "content-type": contentType } }).formData();
    return await parseReplayFiles(form);
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError("BAD_REQUEST", { message: "Invalid WAV upload. Use 16 kHz PCM16 stereo or two matching mono files." });
  } finally { reader.releaseLock(); }
}

export async function parseReplayFiles(form: { keys(): Iterable<string>; get(name: string): unknown; getAll(name: string): unknown[] }): Promise<ReplayAudio> {
  const fields = ["audio", "agentAudio", "customerAudio"];
  if ([...form.keys()].some((key) => !fields.includes(key)) || fields.some((key) => form.getAll(key).length > 1)) throw new AppError("BAD_REQUEST", { message: "Unexpected or duplicate audio fields." });
  const audio = form.get("audio"), agent = form.get("agentAudio"), customer = form.get("customerAudio");
  if (audio instanceof File && !agent && !customer) {
    const decoded = decodeWav(new Uint8Array(await audio.arrayBuffer()));
    if (decoded.channels.length !== 2) throw new AppError("BAD_REQUEST", { message: "audio must be stereo: left agent, right customer." });
    return { agent: decoded.channels[0]!, customer: decoded.channels[1]!, samples: decoded.samples };
  }
  if (!audio && agent instanceof File && customer instanceof File) {
    if (agent.size + customer.size > MAX_UPLOAD_BYTES) throw new AppError("BAD_REQUEST", { message: "Upload exceeds 64 MiB." });
    const a = decodeWav(new Uint8Array(await agent.arrayBuffer())), c = decodeWav(new Uint8Array(await customer.arrayBuffer()));
    if (a.channels.length !== 1 || c.channels.length !== 1 || a.samples !== c.samples) throw new AppError("BAD_REQUEST", { message: "Both files must be mono with equal duration." });
    return { agent: a.channels[0]!, customer: c.channels[0]!, samples: a.samples };
  }
  throw new AppError("BAD_REQUEST", { message: "Use audio, or agentAudio plus customerAudio." });
}

export async function startReplay(agentId: string, audio: ReplayAudio): Promise<{ callId: string }> {
  const call = await startLiveCall({ agentId, customerLabel: "Recorded demo call" });
  void (async () => {
    const start = performance.now();
    for (let offset = 0; offset < audio.samples; offset += CHUNK_SAMPLES) {
      const delay = offset / 16 - (performance.now() - start);
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      if (getActiveLiveCall()?.id !== call.id) break;
      const end = Math.min(audio.samples, offset + CHUNK_SAMPLES) * 2;
      pushLiveAudio(call.id, "agent", offset, audio.agent.subarray(offset * 2, end));
      pushLiveAudio(call.id, "customer", offset, audio.customer.subarray(offset * 2, end));
    }
    // Do not end a partial final chunk early: the media duration is the clock.
    const remaining = audio.samples / 16 - (performance.now() - start);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    await finishLiveCall(call.id);
  })().catch(() => { void finishLiveCall(call.id).catch(() => console.error("[live] replay finalization failed", call.id)); });
  return { callId: call.id };
}
