export const SAMPLE_RATE = 16_000;
export const CHUNK_SAMPLES = 1_600;
export const MAX_SAMPLES = SAMPLE_RATE * 600;
export const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;

export interface WavAudio { channels: Uint8Array[]; samples: number }

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.subarray(offset, offset + length));

/** RIFF chunks may include metadata, odd-size padding, and a nonstandard header length. */
export function decodeWav(bytes: Uint8Array): WavAudio {
  const invalid = () => { throw new Error("Expected a complete 16 kHz PCM16 WAV (mono or stereo), at most ten minutes."); };
  if (bytes.length < 44 || bytes.length > MAX_UPLOAD_BYTES || ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WAVE") invalid();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const limit = view.getUint32(4, true) + 8;
  if (limit !== bytes.length) invalid();
  let channels = 0;
  let data: Uint8Array | undefined;
  for (let offset = 12; offset < limit;) {
    if (offset + 8 > limit) invalid();
    const kind = ascii(bytes, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const start = offset + 8;
    if (start + size + (size % 2) > limit) invalid();
    if (kind === "fmt ") {
      if (channels || size < 16) invalid();
      channels = view.getUint16(start + 2, true);
      if (view.getUint16(start, true) !== 1 || ![1, 2].includes(channels) ||
          view.getUint32(start + 4, true) !== SAMPLE_RATE || view.getUint16(start + 14, true) !== 16 ||
          view.getUint16(start + 12, true) !== channels * 2 || view.getUint32(start + 8, true) !== SAMPLE_RATE * channels * 2) invalid();
    } else if (kind === "data") {
      if (data) invalid();
      data = bytes.subarray(start, start + size);
    }
    offset = start + size + (size % 2);
  }
  if (!channels || !data?.length || data.length % (channels * 2)) invalid();
  const payload = data!;
  const samples = payload.length / (channels * 2);
  if (samples > MAX_SAMPLES) invalid();
  const separated = Array.from({ length: channels }, () => new Uint8Array(samples * 2));
  for (let sample = 0; sample < samples; sample++) {
    for (let channel = 0; channel < channels; channel++) {
      const index = (sample * channels + channel) * 2;
      separated[channel]![sample * 2] = payload[index]!;
      separated[channel]![sample * 2 + 1] = payload[index + 1]!;
    }
  }
  return { channels: separated, samples };
}

export function encodeWav(channels: Uint8Array[]): Uint8Array {
  const length = channels[0]?.length ?? 0;
  if (![1, 2].includes(channels.length) || length % 2 || channels.some((c) => c.length !== length) || length / 2 > MAX_SAMPLES) {
    throw new Error("WAV channels must contain equal-length PCM16 samples.");
  }
  const bytes = new Uint8Array(44 + length * channels.length);
  const view = new DataView(bytes.buffer);
  const text = (at: number, value: string) => bytes.set(new TextEncoder().encode(value), at);
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels.length, true);
  view.setUint32(24, SAMPLE_RATE, true); view.setUint32(28, SAMPLE_RATE * 2 * channels.length, true);
  view.setUint16(32, channels.length * 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, bytes.length - 44, true);
  for (let sample = 0; sample < length / 2; sample++) {
    for (let channel = 0; channel < channels.length; channel++) {
      bytes.set(channels[channel]!.subarray(sample * 2, sample * 2 + 2), 44 + (sample * channels.length + channel) * 2);
    }
  }
  return bytes;
}

/** Protocol v1: channel:u8, absolute sample offset:u32le, up to 100 ms PCM16LE. */
export function decodeAudioFrame(bytes: Uint8Array): { channel: 0 | 1; offset: number; pcm: Uint8Array } {
  if (bytes.length < 7 || bytes.length > 5 + CHUNK_SAMPLES * 2 || (bytes.length - 5) % 2 || bytes[0]! > 1) {
    throw new Error("Invalid channel-tagged audio frame.");
  }
  const offset = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(1, true);
  if (offset + (bytes.length - 5) / 2 > MAX_SAMPLES) throw new Error("Audio exceeds the ten-minute limit.");
  return { channel: bytes[0] as 0 | 1, offset, pcm: bytes.subarray(5) };
}
