import { describe, expect, test } from "bun:test";
import { decodeAudioFrame, decodeWav, encodeWav } from "./audio";
import { CallRecording } from "./recording";

describe("live audio formats", () => {
  test("preserves separate stereo channels and signed PCM samples", () => {
    const left = new Uint8Array([0, 128, 255, 127]);
    const right = new Uint8Array([12, 0, 240, 255]);
    const decoded = decodeWav(encodeWav([left, right]));
    expect(decoded.samples).toBe(2);
    expect(decoded.channels).toEqual([left, right]);
  });
  test("rejects a truncated RIFF body", () => {
    const wav = encodeWav([new Uint8Array(3200)]);
    expect(() => decodeWav(wav.subarray(0, wav.length - 1))).toThrow();
  });
  test("skips metadata chunks rather than assuming a 44-byte header", () => {
    const original = encodeWav([new Uint8Array([1, 0])]);
    const wav = new Uint8Array(original.length + 10);
    wav.set(original.subarray(0, 12));
    wav.set(new TextEncoder().encode("JUNK"), 12);
    new DataView(wav.buffer).setUint32(16, 1, true);
    wav[20] = 7;
    wav.set(original.subarray(12), 22);
    new DataView(wav.buffer).setUint32(4, wav.length - 8, true);
    expect(decodeWav(wav).channels[0]).toEqual(new Uint8Array([1, 0]));
  });
  test("rejects unsupported recording rates", () => {
    const wav = encodeWav([new Uint8Array(3200)]);
    new DataView(wav.buffer).setUint32(24, 48000, true);
    expect(() => decodeWav(wav)).toThrow();
  });
  test("decodes channel and little-endian sample offset", () => {
    const frame = new Uint8Array([1, 64, 6, 0, 0, 12, 0]);
    expect(decodeAudioFrame(frame)).toEqual({ channel: 1, offset: 1600, pcm: new Uint8Array([12, 0]) });
    expect(() => decodeAudioFrame(new Uint8Array([2, 0, 0, 0, 0, 0, 0]))).toThrow();
    expect(() => decodeAudioFrame(new Uint8Array([0, 0, 0, 0, 0, 0]))).toThrow();
  });
});

test("recording aligns channels, fills gaps and trims repeated samples", () => {
  const recording = new CallRecording();
  recording.append("agent", 0, new Uint8Array([10, 0, 20, 0]));
  expect(recording.append("agent", 0, new Uint8Array([10, 0, 20, 0]))).toBeNull();
  recording.append("agent", 1, new Uint8Array([20, 0, 30, 0]));
  recording.append("customer", 2, new Uint8Array([40, 0]));
  const files = recording.files(0);
  expect(decodeWav(files.agent).channels[0]).toEqual(new Uint8Array([10, 0, 20, 0, 30, 0]));
  expect(decodeWav(files.customer).channels[0]).toEqual(new Uint8Array([0, 0, 0, 0, 40, 0]));
  expect(decodeWav(files.mixed).channels[0]).toEqual(new Uint8Array([5, 0, 10, 0, 35, 0]));
});
