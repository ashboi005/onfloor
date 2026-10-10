"""Offline checks: uv run --frozen python verify_audio.py (no account or API needed)."""
import tempfile
import unittest
import wave
from pathlib import Path

import numpy as np

from audio import AudioChannel, Downsampler
from config import ROOT


class AudioChecks(unittest.TestCase):
    def test_filter_state_survives_arbitrary_frame_boundaries(self):
        samples = (np.sin(np.arange(48000) * 2 * np.pi * 1000 / 48000) * 12000).astype("<i2")
        whole = Downsampler().process(samples.tobytes())
        stream = Downsampler()
        parts = [stream.process(samples[i:i + 479].tobytes()) for i in range(0, len(samples), 479)]
        self.assertEqual(b"".join(parts), whole)
        self.assertEqual(len(whole), 32000)

    def test_removes_out_of_band_energy_before_decimation(self):
        samples = (np.sin(np.arange(48000) * 2 * np.pi * 12000 / 48000) * 12000).astype("<i2")
        result = np.frombuffer(Downsampler().process(samples.tobytes()), dtype="<i2")[100:]
        self.assertLess(np.sqrt(np.mean(result.astype(float) ** 2)), 500)

    def test_packet_offsets_and_local_wav_survive_a_gap(self):
        root = ROOT / ".data"
        root.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=root) as directory:
            packets = []
            path = Path(directory) / "agent.wav"
            channel = AudioChannel(0, path, packets.append)
            pcm = np.full(4800, 1000, dtype="<i2").tobytes()
            channel.feed(pcm, 0)
            channel.feed(pcm, 4800)
            channel.close(6400)
            self.assertEqual(len(packets), 2)
            self.assertEqual(int.from_bytes(packets[1][1:5], "little"), 4800)
            with wave.open(str(path), "rb") as recording:
                self.assertEqual(recording.getnframes(), 6400)
                self.assertEqual(recording.getframerate(), 16000)
                audio = recording.readframes(6400)
                self.assertEqual(audio[3200:9600], b"\0" * 6400)


if __name__ == "__main__":
    unittest.main()
