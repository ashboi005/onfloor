"""OnFloor's local Telegram phone: headset audio, backups and bounded API streaming."""
import argparse
import asyncio
import contextlib
import json
import logging
import queue
import time
import uuid
from dataclasses import dataclass, field

import sounddevice as sd
import websockets
from pyrogram import Client
from pytgcalls import PyTgCalls, filters as fl, idle
from pytgcalls.types import ChatUpdate, Device, Direction, ExternalMedia, MediaStream, RecordStream, StreamFrames
from pytgcalls.types.raw import AudioParameters

from audio import AudioChannel, FRAME_SAMPLES, MAX_SAMPLES, OUTPUT_RATE, RATE
from config import Settings

LOG = logging.getLogger("onfloor.bridge")
PARAMS = AudioParameters(bitrate=RATE, channels=1)


@dataclass
class CallState:
    chat_id: int
    external_id: str
    customer: dict
    started: float
    audio: asyncio.Queue = field(default_factory=lambda: asyncio.Queue(maxsize=40))
    ended: asyncio.Event = field(default_factory=asyncio.Event)
    call_id: str | None = None
    api_task: asyncio.Task | None = None
    timer: asyncio.Task | None = None
    channels: dict[int, AudioChannel] = field(default_factory=dict)
    closing: bool = False
    telegram_ready: bool = False
    dropped_packets: int = 0
    first_frame_logged: bool = False
    remote_ended: asyncio.Event = field(default_factory=asyncio.Event)
    remote_error: bool = False


class Bridge:
    def __init__(self, settings: Settings, spike_only: bool):
        self.settings, self.spike_only = settings, spike_only
        self.loop = asyncio.get_running_loop()
        self.app = Client("onfloor", session_string=settings.session, api_id=settings.api_id, api_hash=settings.api_hash)
        self.calls = PyTgCalls(self.app)
        self.active: CallState | None = None
        self.call_lock = asyncio.Lock()
        self.capture = asyncio.Queue(maxsize=400)
        self.playback = queue.Queue(maxsize=200)
        self.playback_pending = bytearray()
        self.playback_call: CallState | None = None
        self.tasks: list[asyncio.Task] = []
        self.stop_requested = False
        self.calls.on_update(fl.chat_update(ChatUpdate.Status.INCOMING_CALL))(self.incoming)
        self.calls.on_update(fl.chat_update(ChatUpdate.Status.LEFT_CALL))(self.ended)
        self.calls.on_update(fl.stream_frame(Direction.INCOMING, Device.MICROPHONE))(self.customer_audio)

    def enqueue_capture(self, state: CallState, channel: int, pcm: bytes, captured: float):
        if state is not self.active or state.closing:
            return
        try:
            self.capture.put_nowait((state, channel, pcm, captured))
        except asyncio.QueueFull:
            LOG.error("Local capture queue overflow; local backup will contain a gap")

    def mic_callback(self, data, frames, time_info, status):
        state = self.active
        if state is None or state.closing or self.stop_requested:
            return
        if status:
            self.loop.call_soon_threadsafe(LOG.warning, "Microphone reported an audio buffer issue")
        captured = time.monotonic() - frames / RATE
        self.loop.call_soon_threadsafe(self.enqueue_capture, state, 0, bytes(data), captured)

    def speaker_callback(self, output, frames, time_info, status):
        if self.playback_call is not self.active:
            self.playback_pending.clear()
            self.playback_call = self.active
        size = frames * 2
        while len(self.playback_pending) < size:
            try:
                self.playback_pending.extend(self.playback.get_nowait())
            except queue.Empty:
                break
        available = min(size, len(self.playback_pending))
        output[:] = bytes(self.playback_pending[:available]) + b"\0" * (size - available)
        del self.playback_pending[:available]

    async def incoming(self, _, update: ChatUpdate):
        async with self.call_lock:
            if self.active is not None:
                LOG.warning("Second incoming call rejected: the line is busy")
                with contextlib.suppress(Exception):
                    await self.calls.leave_call(update.chat_id)
                return
            user = await self.app.get_users(update.chat_id)
            name = " ".join(part for part in [user.first_name, user.last_name] if part) or "Telegram customer"
            state = CallState(update.chat_id, f"{update.chat_id}:{uuid.uuid4()}",
                              {"id": str(user.id), "displayName": name, "username": user.username}, time.monotonic())
            self.settings.backup_dir.mkdir(parents=True, exist_ok=True)
            directory = self.settings.backup_dir / state.external_id.replace(":", "_")
            directory.mkdir()
            for channel, label in [(0, "agent"), (1, "customer")]:
                state.channels[channel] = AudioChannel(channel, directory / f"{label}.wav", lambda packet: self.send_packet(state, packet))
            self.active = state
            if not self.spike_only:
                state.api_task = asyncio.create_task(self.stream_api(state))
            try:
                await self.calls.play(state.chat_id, MediaStream(ExternalMedia.AUDIO, PARAMS))
                state.telegram_ready = True
                await self.calls.record(state.chat_id, RecordStream(True, PARAMS))
                state.timer = asyncio.create_task(self.time_limit(state))
                LOG.info("Call answered. Local backups: %s", directory)
                if self.spike_only:
                    LOG.info("Spike mode: API disabled; verify headset audio and both WAV channels")
                else:
                    LOG.info("Wait for 'API acknowledged' before beginning the demo conversation")
            except Exception:
                LOG.error("Telegram call setup failed; closing local recordings")
                with contextlib.suppress(Exception):
                    await self.calls.leave_call(state.chat_id)
                await self.finish(state)

    async def customer_audio(self, _, update: StreamFrames):
        state = self.active
        if state is None or state.closing or update.chat_id != state.chat_id:
            return
        for frame in update.frames:
            pcm = bytes(frame.frame)
            if not pcm or len(pcm) % 2:
                continue
            if not state.first_frame_logged:
                LOG.info("First customer PCM frame: %d bytes", len(pcm))
                state.first_frame_logged = True
            try:
                self.playback.put_nowait(pcm)
            except queue.Full:
                with contextlib.suppress(queue.Empty):
                    self.playback.get_nowait()
                with contextlib.suppress(queue.Full):
                    self.playback.put_nowait(pcm)
            self.enqueue_capture(state, 1, pcm, time.monotonic() - len(pcm) / (RATE * 2))

    async def capture_worker(self):
        while True:
            state, channel, pcm, captured = await self.capture.get()
            try:
                if state is not self.active:
                    continue
                at_sample = max(0, round((captured - state.started) * OUTPUT_RATE))
                state.channels[channel].feed(pcm, at_sample)
                if channel == 0 and state.telegram_ready:
                    # Sending the mic never waits for the API or its queues.
                    await self.calls.send_frame(state.chat_id, Device.MICROPHONE, pcm)
            except Exception:
                LOG.error("Audio frame delivery/capture failed; verify audio devices and Telegram call state")
            finally:
                self.capture.task_done()

    def send_packet(self, state: CallState, packet: bytes):
        if self.spike_only:
            return
        if state.audio.full():
            state.audio.get_nowait()
            state.dropped_packets += 1
            if state.dropped_packets == 1 or state.dropped_packets % 20 == 0:
                LOG.warning("API queue overflow; %d packets dropped (local backups retained)", state.dropped_packets)
        state.audio.put_nowait(packet)

    async def api_reader(self, ws, state: CallState):
        async for raw in ws:
            message = json.loads(raw)
            if message.get("type") == "ended":
                state.remote_ended.set()
            elif message.get("type") == "error":
                LOG.warning("API reported an ingest error; inspect the HUD/server configuration")
                if not message.get("retryable", False):
                    state.remote_error = True

    async def stream_api(self, state: CallState):
        delay, disconnected_at = 0.25, None
        while not self.stop_requested:
            try:
                async with websockets.connect(self.settings.ingest_url,
                        additional_headers={"x-bridge-secret": self.settings.bridge_secret},
                        open_timeout=5, ping_interval=20, ping_timeout=10, max_size=65536) as ws:
                    await ws.send(json.dumps({"type": "call_started", "protocolVersion": 1,
                        "telegramCallId": state.external_id, "customer": state.customer,
                        **({"callId": state.call_id} if state.call_id else {})}))
                    raw = await asyncio.wait_for(ws.recv(), timeout=45)
                    ack = json.loads(raw)
                    if ack.get("type") != "ack" or ack.get("protocolVersion") != 1 or not ack.get("callId"):
                        LOG.error("API refused call start/resume; retaining local audio only")
                        return
                    state.call_id = ack["callId"]
                    disconnected_at, delay = None, 0.25
                    LOG.info("API acknowledged call %s", state.call_id)
                    reader = asyncio.create_task(self.api_reader(ws, state))
                    try:
                        while not state.ended.is_set() or not state.audio.empty():
                            if reader.done():
                                await reader
                                raise ConnectionError("API reader ended")
                            if state.remote_error:
                                LOG.error("API cannot accept this session; retaining local recordings")
                                return
                            try:
                                packet = await asyncio.wait_for(state.audio.get(), timeout=0.1)
                            except asyncio.TimeoutError:
                                continue
                            await ws.send(packet)
                        await ws.send(json.dumps({"type": "call_ended", "reason": "telegram_hangup"}))
                        await asyncio.wait_for(state.remote_ended.wait(), timeout=5)
                        return
                    finally:
                        reader.cancel()
                        with contextlib.suppress(asyncio.CancelledError, Exception):
                            await reader
            except asyncio.CancelledError:
                raise
            except Exception:
                disconnected_at = disconnected_at or time.monotonic()
                if state.ended.is_set() or (state.call_id and time.monotonic() - disconnected_at >= 8):
                    LOG.error("API connection could not recover inside the server grace period; use local WAV replay")
                    return
                LOG.warning("API disconnected; retrying (local Telegram audio remains active)")
                await asyncio.sleep(delay)
                delay = min(2.0, delay * 2)

    async def ended(self, _, update: ChatUpdate):
        state = self.active
        if state and state.chat_id == update.chat_id:
            await self.finish(state)

    async def time_limit(self, state: CallState):
        await asyncio.sleep(600)
        if state is self.active:
            with contextlib.suppress(Exception):
                await self.calls.leave_call(state.chat_id)
            await self.finish(state)

    async def finish(self, state: CallState):
        if state.closing:
            return
        state.closing = True
        if state.timer and state.timer is not asyncio.current_task():
            state.timer.cancel()
        try:
            await asyncio.wait_for(self.capture.join(), timeout=2)
        except asyncio.TimeoutError:
            LOG.error("Capture drain timed out; local recordings may be incomplete")
            # Stale queued frames must never write to already-closed WAV handles.
            while not self.capture.empty():
                self.capture.get_nowait()
                self.capture.task_done()
        samples = min(MAX_SAMPLES, round((time.monotonic() - state.started) * OUTPUT_RATE))
        for channel in state.channels.values():
            channel.close(samples)
        state.ended.set()
        if state.api_task:
            try:
                await asyncio.wait_for(asyncio.shield(state.api_task), timeout=12)
            except Exception:
                state.api_task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await state.api_task
        self.active = None
        while not self.playback.empty():
            with contextlib.suppress(queue.Empty):
                self.playback.get_nowait()
        LOG.info("Call ended; local WAVs finalized. API packets dropped: %d", state.dropped_packets)

    async def run(self):
        sd.check_input_settings(device=self.settings.mic_device, channels=1, dtype="int16", samplerate=RATE)
        sd.check_output_settings(device=self.settings.speaker_device, channels=1, dtype="int16", samplerate=RATE)
        self.tasks = [asyncio.create_task(self.capture_worker())]
        try:
            with sd.RawOutputStream(device=self.settings.speaker_device, samplerate=RATE, channels=1, dtype="int16",
                    blocksize=FRAME_SAMPLES, callback=self.speaker_callback), sd.RawInputStream(
                    device=self.settings.mic_device, samplerate=RATE, channels=1, dtype="int16",
                    blocksize=FRAME_SAMPLES, callback=self.mic_callback):
                await self.calls.start()
                LOG.info("Bridge ready: headset required; waiting for incoming calls")
                await idle()
        finally:
            if self.active:
                with contextlib.suppress(Exception):
                    await self.calls.leave_call(self.active.chat_id)
                await self.finish(self.active)
            self.stop_requested = True
            for task in self.tasks:
                task.cancel()
            await asyncio.gather(*self.tasks, return_exceptions=True)
            # py-tgcalls 3.0 has no public stop(); leave the call above, then stop
            # the owned Pyrogram client. Native resources release with the process.
            if self.app.is_connected:
                await self.app.stop()


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spike-only", action="store_true", help="Telegram/headset and local recordings only; no API")
    parser.add_argument("--list-devices", action="store_true", help="Show sounddevice microphone/output device ids")
    parser.add_argument("--check", action="store_true", help="Validate configuration/imports without logging in or placing calls")
    args = parser.parse_args()
    if args.list_devices:
        print(sd.query_devices())
        return
    settings = Settings.load(spike_only=args.spike_only)
    if args.check:
        print("Bridge imports and configuration valid. No Telegram/network connection attempted.")
        return
    await Bridge(settings, args.spike_only).run()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as error:
        # Avoid tracebacks from HTTP/WebSocket exceptions that can include credential URLs.
        LOG.error("Bridge stopped (%s). Check configuration, audio devices and native dependencies.", type(error).__name__)
        raise SystemExit(1)
