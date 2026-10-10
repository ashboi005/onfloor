/**
 * Raw audio for the realtime transcriber.
 *
 * Scribe v2 Realtime takes 16 kHz mono PCM as base64 inside a JSON frame. It
 * silently rejects raw binary WebSocket frames and closes the socket cleanly, so
 * the encoding here is not a detail that can be got approximately right.
 *
 * These are pure functions on purpose: they are the only part of the audio path
 * that can be tested without a microphone.
 */

const TARGET_RATE = 16_000;

/**
 * Resamples to 16 kHz by averaging each source window.
 *
 * Only needed where the browser refuses an `AudioContext` at the target rate.
 * Chrome and Firefox honour `new AudioContext({ sampleRate: 16000 })` and this
 * becomes a no-op. Averaging rather than picking the nearest sample because
 * dropping samples aliases, and speech is exactly where that is audible.
 */
export function downsampleTo16k(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === TARGET_RATE) return input;
  if (inputRate < TARGET_RATE) {
    throw new Error(`Cannot upsample ${inputRate}Hz to ${TARGET_RATE}Hz`);
  }

  const ratio = inputRate / TARGET_RATE;
  const output = new Float32Array(Math.floor(input.length / ratio));

  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(Math.floor((i + 1) * ratio), input.length);
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j] as number;
    output[i] = end > start ? sum / (end - start) : 0;
  }

  return output;
}

/** Float samples in [-1, 1] to base64 little-endian signed 16-bit. */
export function toPcm16Base64(samples: Float32Array): string {
  const bytes = new Uint8Array(samples.length * 2);
  const view = new DataView(bytes.buffer);

  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling: an out-of-range sample would otherwise wrap around
    // and turn a loud moment into a burst of noise.
    const clamped = Math.max(-1, Math.min(1, samples[i] as number));
    view.setInt16(i * 2, Math.round(clamped * 0x7fff), true);
  }

  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export const PCM_TARGET_RATE = TARGET_RATE;
