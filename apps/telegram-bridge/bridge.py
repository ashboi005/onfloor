"""
OnFloor Telegram bridge. OWNER: Tushar.
Guide: docs/specs/03a-telegram-voice-guide.md. Contract: /internal/live/ingest (apps/server/src/modules/live/routes.ts).

The bridge IS the agent's phone: it auto-answers private calls to the OnFloor Line account,
sends the laptop mic into the call, plays the customer through the headset, and streams both
channels to the API (1-byte channel prefix: 0 = agent, 1 = customer; PCM16LE 16 kHz mono).

Status: skeleton. Control messages (call_started / call_ended) are wired; TODOs below.
"""
import asyncio
import json
import os

import numpy as np
import sounddevice as sd
import websockets
from dotenv import load_dotenv
from pyrogram import Client
from pytgcalls import PyTgCalls, filters as fl, idle
from pytgcalls.types import ChatUpdate, Device, Direction, ExternalMedia, MediaStream, RecordStream, StreamFrames
from pytgcalls.types.raw import AudioParameters
from scipy.signal import resample_poly

load_dotenv()

RATE, CH = 48000, 1  # Telegram side: 48 kHz mono PCM16LE
PARAMS = AudioParameters(bitrate=RATE, channels=CH)
FRAME_MS = 10
AGENT, CUSTOMER = 0, 1
CHUNK_MS = 100  # what we send to the API

app = Client(
    "onfloor",
    session_string=os.environ["TELEGRAM_SESSION_STRING"],
    api_id=int(os.environ["TELEGRAM_API_ID"]),
    api_hash=os.environ["TELEGRAM_API_HASH"],
)
calls = PyTgCalls(app)

active_chat: int | None = None
api_ws = None
loop: asyncio.AbstractEventLoop
speaker_out: sd.OutputStream
buffers: dict[int, bytearray] = {AGENT: bytearray(), CUSTOMER: bytearray()}


async def send_json(msg: dict) -> None:
    if api_ws is not None:
        await api_ws.send(json.dumps(msg))


async def send_audio(channel: int, pcm48k: bytes) -> None:
    """Downsample 48k → 16k, buffer to ~100 ms, send with a channel prefix."""
    samples = np.frombuffer(pcm48k, dtype=np.int16)
    pcm16k = resample_poly(samples, 1, 3).astype(np.int16).tobytes()
    buf = buffers[channel]
    buf.extend(pcm16k)
    chunk = 16000 * 2 * CHUNK_MS // 1000
    while len(buf) >= chunk and api_ws is not None:
        await api_ws.send(bytes([channel]) + bytes(buf[:chunk]))
        del buf[:chunk]


@calls.on_update(fl.chat_update(ChatUpdate.Status.INCOMING_CALL))
async def on_incoming(_, update: ChatUpdate):
    global active_chat
    if active_chat is not None:
        return  # TODO(tushar): reject/busy a second concurrent call
    active_chat = update.chat_id
    await calls.play(update.chat_id, MediaStream(ExternalMedia.AUDIO, PARAMS))  # answers; we feed the agent mic
    await calls.record(update.chat_id, RecordStream(True, PARAMS))  # customer audio as raw frames
    user = await app.get_users(update.chat_id)
    await send_json({
        "type": "call_started",
        "telegramCallId": str(update.chat_id),
        "customer": {"id": str(user.id), "displayName": user.full_name or "Telegram user", "username": user.username},
    })


@calls.on_update(fl.chat_update(ChatUpdate.Status.LEFT_CALL))
async def on_ended(_, update: ChatUpdate):
    global active_chat
    if update.chat_id != active_chat:
        return
    active_chat = None
    for b in buffers.values():
        b.clear()
    await send_json({"type": "call_ended", "reason": str(update.status)})


@calls.on_update(fl.stream_frame(Direction.INCOMING, Device.MICROPHONE))
async def on_customer_audio(_, update: StreamFrames):
    pcm = update.frames[0].frame  # 1:1 call → one remote source. Log len() once; don't assume 10 ms.
    speaker_out.write(np.frombuffer(pcm, dtype=np.int16))  # agent hears the customer (USE A HEADSET)
    await send_audio(CUSTOMER, pcm)


def on_mic(indata, frames, time_info, status):  # sounddevice callback thread
    if active_chat is None:
        return
    asyncio.run_coroutine_threadsafe(push_agent(bytes(indata)), loop)


async def push_agent(pcm: bytes) -> None:
    if active_chat is None:
        return
    await calls.send_frame(active_chat, Device.MICROPHONE, pcm)  # agent → customer
    await send_audio(AGENT, pcm)


async def connect_api():
    global api_ws
    # TODO(tushar): reconnect loop with backoff; re-send call_started if a call is in progress.
    api_ws = await websockets.connect(
        os.environ["API_INGEST_URL"],
        additional_headers={"x-bridge-secret": os.environ["BRIDGE_SECRET"]},
    )
    asyncio.create_task(read_api())


async def read_api():
    async for msg in api_ws:
        print("api →", msg)  # {"type":"ack","callId":...}


async def main():
    global loop, speaker_out
    loop = asyncio.get_running_loop()
    await connect_api()
    speaker_out = sd.OutputStream(samplerate=RATE, channels=CH, dtype="int16")
    speaker_out.start()
    mic = sd.InputStream(samplerate=RATE, channels=CH, dtype="int16", blocksize=RATE * FRAME_MS // 1000, callback=on_mic)
    mic.start()
    await calls.start()
    print("OnFloor bridge ready. Waiting for calls on the OnFloor Line…")
    await idle()


if __name__ == "__main__":
    asyncio.run(main())
