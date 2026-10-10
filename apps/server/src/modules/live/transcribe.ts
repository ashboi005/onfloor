import type { Language, Speaker } from "@onfloor/contracts";

/**
 * Live transcription: one ElevenLabs realtime socket PER CHANNEL (agent, customer).
 * Protocol + gotchas: docs/specs/03a-telegram-voice-guide.md §4.
 *
 * TODO(tushar): implement with
 *   const token = await services.stt.mintRealtimeToken();
 *   const ws = new WebSocket(services.stt.realtimeUrl({ language }, token));
 * then push base64 PCM16 16 kHz chunks as `input_audio_chunk`, map
 * partial_transcript → onPartial, committed_transcript → onCommitted, and reconnect
 * with a FRESH token on close/error.
 */
export interface ChannelStream {
  push(pcm16k: Uint8Array): void;
  close(): void;
}

export interface ChannelStreamOptions {
  callId: string;
  speaker: Speaker;
  language: Language;
  onPartial(text: string): void;
  /** startMs/endMs relative to call start. */
  onCommitted(text: string, startMs: number, endMs: number): void;
  onError(err: Error): void;
}

export async function openChannelStream(_opts: ChannelStreamOptions): Promise<ChannelStream> {
  throw new Error("TODO(tushar): openChannelStream");
}
