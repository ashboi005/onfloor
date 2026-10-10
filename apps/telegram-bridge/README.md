# Telegram bridge (owner: Tushar)

Runs on the macOS/Linux demo laptop. Uses the dedicated OnFloor user account to answer private calls, routes 48 kHz mono headset audio through py-tgcalls, resamples each speaker to 16 kHz PCM16LE and retains independent local WAV backups. Use a headset to prevent customer playback leaking into the microphone channel.

## Setup and credentials

Install uv and Python 3.12. On Linux, install PortAudio through the system package manager if sounddevice cannot load it. Grant microphone permission on macOS. From this folder:

```sh
uv sync --frozen --python 3.12
cp .env.example .env
uv run --frozen python login.py
uv run --frozen python bridge.py --list-devices
uv run --frozen python bridge.py --check
uv run --frozen python verify_audio.py
```

Fill `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` from the dedicated account's my.telegram.org application before login. Login asks for the phone number, Telegram verification code and 2FA password interactively, then writes `TELEGRAM_SESSION_STRING` directly to ignored `.env` without printing it. The session grants account access; never commit or paste it into chat/logs. A BotFather token cannot authenticate this private user-call bridge.

| Variable | Where and why |
| --- | --- |
| `TELEGRAM_API_ID`, `TELEGRAM_API_HASH` | Laptop only: identify the Telegram client application for account login. |
| `TELEGRAM_SESSION_STRING` | Laptop only: reuse the authenticated dedicated user account. |
| `BRIDGE_SECRET` | Laptop and API: authenticate the internal audio ingest socket. |
| `API_INGEST_URL` | Laptop: `wss://<host>/internal/live/ingest`; local development can use `ws://localhost:3000/internal/live/ingest`. |
| `MIC_DEVICE`, `SPEAKER_DEVICE` | Laptop: sounddevice id or name from `--list-devices`; empty selects defaults. |
| `BACKUP_DIR` | Laptop: local recordings; defaults to `.data/recordings` in this folder. |

These variables are declared in `.env.schema`; Python validates required configuration at startup. Telegram credentials are unnecessary for server-side WAV replay. Server provider/database credentials belong to `apps/server/.env`, not the bridge.

`uv.lock` pins the dependency set. py-tgcalls 3.0.0 APIs were checked against the installed implementation (`play`, `record`, `send_frame`, incoming/end/frame filters). Native ntgcalls 3.0.2 is locked. The current Windows environment imports successfully with Python 3.12.4 but cannot certify the demo laptop's native/audio behaviour. TgCrypto is an optional accelerator; `uv sync --frozen --extra acceleration` may require a C compiler on platforms without wheels. The pure-Python Pyrogram fallback is supported by the base install.

## Three-hour feasibility gate

Start a stopwatch on the actual demo laptop, then run:

```sh
uv run --frozen python bridge.py --spike-only
```

Spike mode answers Telegram calls and writes local backups without requiring a hosted API or bridge secret. Have a teammate call the dedicated account privately and hold a two-minute conversation. Alternate speakers, overlap briefly, pause, then hang up from the caller. Repeat and hang up from the bridge with Ctrl+C. Confirm a second private call is declined while the first is active. Listen to both local WAVs: agent contains headset mic only, customer contains remote voice only, both are 16 kHz PCM16 mono with equal duration. Verify headset playback and that another call starts cleanly without previous-call audio.

Record: OS/version, architecture, Python/uv versions, `uv tree`, device ids/names and 48 kHz support, private-call account/privacy setup, measured duration, channel separation and both hang-up outcomes. Do not include session strings, keys, phone numbers or personal account data.

**Gate status here: not run.** This workspace is Windows and has no bridge `.env` or accessible macOS/Linux headset/account. It is not evidence that Telegram calling fails. If the actual laptop cannot pass within three hours, stop the Telegram spike and switch to WAV replay. Add a blocker note with safe exception type, failing step, platform/dependency versions, attempted fixes and fallback readiness. Prepare it for Ashwath; send it only when Tushar authorizes sending.

## Run with the API

```sh
uv run --frozen python bridge.py
```

The hosted API must be running with matching `BRIDGE_SECRET`, a seeded `LIVE_AGENT_EMAIL` and working STT/LLM/storage. Wait for the safe `API acknowledged call ...` log before starting the demo conversation. That call id is useful for inspecting server rows and the HUD.

Each call owns fresh resamplers, WAV handles, queues and a unique `<peer>:<uuid>` identity. Mic/headset callbacks use bounded local queues. API sends use a separate two-second queue; dropping oldest packets is logged, while local backups continue. Resampling keeps FIR/decimation state across frames. Remaining partial packets are flushed at hang-up, and local WAVs are padded to the same call duration.

When the API disconnects the local call continues. Reconnect backs off, resumes the acknowledged call with its original identity and preserves absolute sample offsets. The API allows ten seconds before finalizing. If recovery fails, keep local WAVs and replay them; the server archive has silence where packets were missing and must not be described as gap-free. Local capture overflow is also logged and can affect backups. Ctrl+C leaves the call, finalizes backups, closes device streams and stops the owned Pyrogram client.

## Internal protocol v1

Connect to `WS /internal/live/ingest` with `x-bridge-secret`. Send JSON:

```json
{"type":"call_started","protocolVersion":1,"telegramCallId":"peer:unique-uuid","customer":{"id":"peer","displayName":"Demo customer","username":null}}
```

The server replies `{"type":"ack","protocolVersion":1,"callId":"..."}` after both STT sessions are ready. For reconnect, include that `callId` in the original start control; never generate another identity for the same ongoing call. Each new Telegram call must generate a fresh UUID, even for the same peer.

After acknowledgement send binary frames: byte 0 is channel (0 agent, 1 customer), bytes 1-4 unsigned little-endian absolute sample offset at 16 kHz, remaining bytes PCM16LE. Normal payload=1600 samples/3200 bytes (100 ms); the final packet can be shorter. Protocol version is negotiated by the start control. Offsets retain channel alignment and allow duplicate trimming/gap reporting.

End with `{"type":"call_ended","reason":"telegram_hangup"}`. The server replies `{"type":"ended","callId":"..."}` promptly; scoring/persona continue independently and arrive over the authorized HUD stream. API error messages have `type`, `code`, `message`, `retryable`. Controls and audio are handled in arrival order; malformed, oversized and pre-ack frames are rejected, and queues are bounded. The bridge's end acknowledgement is not proof that scorecard/persona succeeded.

## Fallback and rehearsal

Upload each backup pair as `agentAudio`/`customerAudio` to authenticated `POST /api/live/calls/replay-file`, or combine them into stereo left=agent/right=customer using an audio editor preserving 16 kHz PCM16. Include optional multipart `customerId` (the same stable test identity for repeat replays) and `customerName` to exercise customer memory and label the persona. The same real server pipeline generates STT, copilot, recordings and wrap-up events. See the live module README and `apps/server/demo-audio/README.md`.

Rehearse three complete runs including the fallback before freeze. Verify both speakers, interruption and reconnect, local backup playback, server gap logs, hint latency, persisted finals/events, recording URLs, scorecard and persona quotations/linkage. Real scoring and simulator/TTS must also be ready in Ashwath's modules.

Protocol reference: [ElevenLabs realtime STT](https://elevenlabs.io/docs/api-reference/speech-to-text/v-1-speech-to-text-realtime). Bridge API reference: the pinned py-tgcalls installation and [upstream repository](https://github.com/pytgcalls/pytgcalls).
