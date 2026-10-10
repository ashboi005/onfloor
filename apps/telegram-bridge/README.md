# telegram-bridge (owner: Tushar)

Python sidecar that answers Telegram private calls on the **OnFloor Line** account and streams
agent + customer audio to the API. Not a Bun workspace (no package.json); run it with `uv`.

```bash
cd apps/telegram-bridge
cp .env.example .env          # fill TELEGRAM_API_ID / TELEGRAM_API_HASH
uv sync
uv run login.py               # once, paste the session string into .env
uv run bridge.py              # API must be running (bun run dev:server)
```

Full guide: `docs/specs/03a-telegram-voice-guide.md`. Server side: `apps/server/src/modules/live/`.
Use a **headset** (otherwise customer audio leaks into the agent channel).
