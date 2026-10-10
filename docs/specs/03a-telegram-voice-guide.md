# Guide: Telegram Voice Calls → Live Transcript (Tushar)

A practical companion to `03-tushar-live.md`. This is how to get a real Telegram call's
audio into OnFloor, split into clean **agent** and **customer** channels, and turned into a
live transcript.

Verified against **py-tgcalls 3.0.0** (github.com/pytgcalls/pytgcalls). Its `example/`
folder has working versions of everything below. The ones to read first are
`p2p_example/`, `frame_sending/`, `whisper_transcription/` and `bridged_calls/`.

---

## 1. Mental model

```
 Customer's phone                  Agent's laptop
 (Telegram app)                    ┌──────────────────────────────────────────────┐
      │  private voice call        │ telegram-bridge (Python, py-tgcalls)         │
      └───────────────────────────▶│  • logged in as the "OnFloor Line" account   │
                                   │  • auto-answers INCOMING_CALL                │
                                   │  • customer audio  ◀── stream_frame(INCOMING)│──▶ speakers/headset
                                   │  • agent mic (sounddevice) ──▶ send_frame()  │
                                   │  • both channels ──▶ WS to API (tagged 0/1)  │
                                   └──────────────────────┬───────────────────────┘
                                                          │ ws /internal/live/ingest
                                   ┌──────────────────────▼───────────────────────┐
                                   │ apps/api modules/live (TS)                    │
                                   │  2× ElevenLabs realtime STT (one per channel) │
                                   │  → transcript → copilot → /ws/live → HUD      │
                                   └───────────────────────────────────────────────┘
```

Key points:
- **A Bot API bot can't take voice calls.** You need a real **user account**. Get a
  spare SIM / number for the "OnFloor Line" account. Don't use your personal account.
- The bridge **is** the agent's phone. The agent talks into the laptop mic and hears the
  customer through the laptop headset. The Telegram app on the laptop isn't used.
- Because we own both directions, the split is free: what we send = `agent`, what we
  receive = `customer`. **No diarization.** Talk-ratio, interruptions and dead air all rely
  on this, so don't mix the channels.

## 2. One-time setup (≈30 min)

1. Create the app credentials at **my.telegram.org → API development tools** → `api_id`,
   `api_hash` (logged in as the OnFloor Line account).
2. `apps/telegram-bridge/`:
   ```bash
   uv init && uv add py-tgcalls pyrogram tgcrypto sounddevice numpy websockets python-dotenv
   # ffmpeg must be on PATH (brew install ffmpeg); py-tgcalls uses it for file sources
   ```
   (Use `kurigram`/`pyrofork` if vanilla Pyrogram fails to install on your Python. py-tgcalls
   supports Pyrogram, Telethon and Hydrogram.)
3. Log in once interactively and export a **session string**, so the bridge never prompts
   again (and nobody needs the OTP during the demo):
   ```python
   # login.py
   from pyrogram import Client
   with Client("onfloor", api_id=API_ID, api_hash=API_HASH, in_memory=True) as app:
       print(app.export_session_string())
   ```
   Put it in `TELEGRAM_SESSION_STRING`. **Treat it like a password** (it's full account
   access). Never commit it.
4. macOS will ask for **microphone permission** for your terminal the first time. Allow it.

## 3. The bridge, skeleton (≈150 lines when done)

```python
# apps/telegram-bridge/bridge.py — skeleton, fill in the TODOs
import asyncio, json, os, numpy as np, sounddevice as sd, websockets
from pyrogram import Client
from pytgcalls import PyTgCalls, filters as fl, idle
from pytgcalls.types import (ChatUpdate, Device, Direction, ExternalMedia,
                             MediaStream, RecordStream, StreamFrames)
from pytgcalls.types.raw import AudioParameters

RATE, CH = 48000, 1                       # Telegram side: 48 kHz mono PCM16LE
PARAMS = AudioParameters(bitrate=RATE, channels=CH)
FRAME_MS = 10                             # py-tgcalls frame cadence (see frame_sending example)
FRAME_BYTES = RATE * 2 * CH * FRAME_MS // 1000

app = Client("onfloor", session_string=os.environ["TELEGRAM_SESSION_STRING"],
             api_id=int(os.environ["TELEGRAM_API_ID"]), api_hash=os.environ["TELEGRAM_API_HASH"])
calls = PyTgCalls(app)
active_chat: int | None = None
api_ws = None                             # websocket to apps/api

@calls.on_update(fl.chat_update(ChatUpdate.Status.INCOMING_CALL))
async def on_incoming(_, update: ChatUpdate):
    global active_chat
    active_chat = update.chat_id
    # Answer by starting an outgoing stream we feed ourselves (agent mic)…
    await calls.play(update.chat_id, MediaStream(ExternalMedia.AUDIO, PARAMS))
    # …and ask for the customer's audio as raw frames
    await calls.record(update.chat_id, RecordStream(True, PARAMS))
    user = await app.get_users(update.chat_id)
    await send_json({"type": "call_started", "telegramCallId": str(update.chat_id),
                     "customer": {"id": str(user.id), "displayName": user.full_name,
                                  "username": user.username}})

@calls.on_update(fl.chat_update(ChatUpdate.Status.LEFT_CALL))   # includes DISCARDED_CALL / BUSY
async def on_ended(_, update: ChatUpdate):
    global active_chat
    active_chat = None
    await send_json({"type": "call_ended", "reason": str(update.status)})

@calls.on_update(fl.stream_frame(Direction.INCOMING, Device.MICROPHONE))
async def on_customer_audio(_, update: StreamFrames):
    pcm = update.frames[0].frame           # 1:1 call → one remote source
    speaker_out.write(np.frombuffer(pcm, dtype=np.int16))   # agent hears the customer
    await send_audio(channel=1, pcm48k=pcm)

def on_mic(indata, frames, time, status):  # sounddevice callback thread
    if active_chat is None: return
    pcm = indata.tobytes()
    asyncio.run_coroutine_threadsafe(push_agent(pcm), loop)

async def push_agent(pcm: bytes):
    await calls.send_frame(active_chat, Device.MICROPHONE, pcm)   # agent → customer
    await send_audio(channel=0, pcm48k=pcm)

async def send_audio(channel: int, pcm48k: bytes):
    # TODO: downsample 48k → 16k (take every 3rd sample after a simple low-pass, or use
    # numpy/scipy resample_poly(…, 1, 3)), buffer to ~100 ms, then:
    # await api_ws.send(bytes([channel]) + pcm16k)
    ...

async def send_json(msg): ...              # TODO: api_ws.send(json.dumps(msg)), reconnect on drop

async def main():
    global loop, speaker_out, api_ws
    loop = asyncio.get_running_loop()
    api_ws = await websockets.connect(os.environ["API_INGEST_URL"],
                                      additional_headers={"x-bridge-secret": os.environ["BRIDGE_SECRET"]})
    speaker_out = sd.OutputStream(samplerate=RATE, channels=CH, dtype="int16"); speaker_out.start()
    mic = sd.InputStream(samplerate=RATE, channels=CH, dtype="int16",
                         blocksize=RATE * FRAME_MS // 1000, callback=on_mic); mic.start()
    await calls.start()
    await idle()

asyncio.run(main())
```

**Things that will bite you:**
- **Echo.** Use a **headset** for the agent. With laptop speakers, the customer's voice
  leaks into the agent mic → customer lines show up on the agent channel → bad talk-ratio and
  ghost "agent" turns. This is a hardware fix, not code.
- **Simpler variant if `send_frame` gives trouble:** `calls.play(chat_id,
  MediaDevices.microphone_devices()[0])` lets py-tgcalls drive the mic itself (see
  `example/capture_mic`). Then open a *separate* `sounddevice.InputStream` on the same mic
  only to feed the API. Two readers of one mic is fine on macOS.
- **Hearing the customer:** `RecordStream` also accepts a `SpeakerDevice`
  (`MediaDevices.speaker_devices()[0]`) to play straight to speakers, but then you don't
  get frames. Stick with `RecordStream(True, …)` + playing frames yourself, as above.
- **Frame sizes:** check `len(update.frames[0].frame)` on the first call and log it.
  Don't assume 10 ms.
- **Outgoing test calls:** to test without a second person, call `calls.play(user_id, …)` to
  *ring* someone (see `p2p_example`). Use this to call your own phone.

## 4. Transcription: the same STT as the simulator

The simulator already uses **ElevenLabs Scribe v2 Realtime** (a server-side token minter in `apps/server/src/core/services/stt.ts`, the browser mic in `apps/web/src/hooks/use-sim-call.ts`). The only difference is **where the socket is
opened**:

| | OnFloor simulator | OnFloor live (you) |
|---|---|---|
| Audio source | browser mic | Telegram bridge |
| Who opens the ElevenLabs socket | the **browser**, with a single-use token | the **API server** (`modules/live/transcribe.ts`) |
| Sockets | 1 | **2 per call** (agent, customer) |

Ashwath ports `realtimeQuery()` (model, `language_code`, `audio_format=pcm_16000`,
`commit_strategy=vad`, `vad_silence_threshold_secs`, Hinglish → `secondary_languages=en`,
`keyterms`) into `services.stt`, so the language handling matches the simulator exactly. You
open one socket per channel and speak this protocol (the same one the simulator's browser hook uses):

```ts
// open: wss://api.elevenlabs.io/v1/speech-to-text/realtime?<realtimeQuery>&token=<mintRealtimeToken()>
// send every ~100 ms:
{ message_type: "input_audio_chunk", audio_base_64: <PCM16LE 16 kHz mono, base64>, commit: false }
// receive:
{ message_type: "session_started" }
{ message_type: "partial_transcript", text }      → emit transcript_partial
{ message_type: "committed_transcript", text }    → appendTurn + transcript_final
{ message_type: "*_error", ... }                  → emit error, reconnect with a fresh token
```

Notes:
- Mint a **fresh token per socket** (they're single-use). Reconnect = new token.
- Stamp `startMs` when the first partial of a segment arrives and `endMs` on commit, both
  relative to `call_started`. That's what scoring and the timeline use.
- For the HUD, partials matter as much as finals. Guardrail fast-path regexes run on the
  **agent partials**, so the warning can appear before the sentence is finished.
- Languages are `en | hi | hinglish` only. Set from `LIVE_DEFAULT_LANGUAGE`. Don't build
  language auto-detect.

## 5. Spike checklist (H0–3), then tick these off in chat

- [ ] OnFloor Line account created, session string exported
- [ ] `p2p_example` adapted: your phone calls the account → bridge auto-answers
- [ ] You hear the phone on the laptop headset, the phone hears the laptop mic
- [ ] Each channel dumped to `agent.wav` / `customer.wav` (16 kHz mono) for 2 minutes. Check they don't bleed into each other
- [ ] Hang-up from either side fires `call_ended`

**If it's stuck at H+3:** switch to plan B (a group voice chat that all three join, and the
bridge records it) or plan C (the replay-file path only). Tell Ashwath either way.
`/api/live/calls/replay-file` is built regardless, because it's our stage insurance.
