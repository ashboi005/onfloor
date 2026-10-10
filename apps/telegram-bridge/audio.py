"""Stateful resampling, timestamped packets and independent local WAV backups."""
import struct
import wave
from collections.abc import Callable
from pathlib import Path

import numpy as np
from scipy.signal import firwin, lfilter

RATE = 48_000
OUTPUT_RATE = 16_000
FRAME_SAMPLES = 480
CHUNK_SAMPLES = 1600
MAX_SAMPLES = OUTPUT_RATE * 600


class Downsampler:
    """Keep FIR and decimation phase across arbitrary Telegram frame boundaries."""

    def __init__(self):
        self.taps = firwin(63, 0.30)
        self.state = np.zeros(len(self.taps) - 1)
        self.input_samples = 0

    def process(self, pcm: bytes) -> bytes:
        if len(pcm) % 2:
            raise ValueError("Incomplete PCM16 sample")
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float64)
        if not samples.size:
            return b""
        filtered, self.state = lfilter(self.taps, [1.0], samples, zi=self.state)
        first = (-self.input_samples) % 3
        self.input_samples += samples.size
        return np.clip(np.rint(filtered[first::3]), -32768, 32767).astype("<i2").tobytes()


class AudioChannel:
    def __init__(self, channel: int, path: Path, send: Callable[[bytes], None]):
        self.channel, self.send = channel, send
        self.resampler = Downsampler()
        self.pending = bytearray()
        self.offset = 0
        self.next_sample = 0
        self.started = False
        self.gap_samples = 0
        self.wav = wave.open(str(path), "wb")
        self.wav.setnchannels(1)
        self.wav.setsampwidth(2)
        self.wav.setframerate(OUTPUT_RATE)

    def feed(self, pcm48: bytes, at_sample: int):
        pcm = self.resampler.process(pcm48)
        # Small callback scheduling jitter must not introduce artificial audio gaps.
        target = max(0, at_sample)
        if not self.started or target > self.next_sample + CHUNK_SAMPLES:
            self.flush()
            target = min(MAX_SAMPLES, max(target, self.next_sample))
            gap = target - self.next_sample
            if gap:
                self.wav.writeframesraw(b"\0\0" * gap)
                self.gap_samples += gap
            self.offset = self.next_sample = target
            self.started = True
        pcm = pcm[:max(0, MAX_SAMPLES - self.next_sample) * 2]
        self.wav.writeframesraw(pcm)
        self.pending.extend(pcm)
        self.next_sample += len(pcm) // 2
        while len(self.pending) >= CHUNK_SAMPLES * 2:
            self._packet(CHUNK_SAMPLES * 2)

    def _packet(self, size: int):
        pcm = bytes(self.pending[:size])
        del self.pending[:size]
        self.send(struct.pack("<BI", self.channel, self.offset) + pcm)
        self.offset += size // 2

    def flush(self):
        if self.pending:
            self._packet(len(self.pending))

    def close(self, samples: int):
        self.flush()
        samples = min(MAX_SAMPLES, max(samples, self.next_sample))
        if samples > self.next_sample:
            self.wav.writeframesraw(b"\0\0" * (samples - self.next_sample))
        self.wav.close()
