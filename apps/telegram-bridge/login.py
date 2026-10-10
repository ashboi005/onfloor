"""One-time interactive login; save the session locally without printing its secret."""
import asyncio
import os

from dotenv import load_dotenv
from pyrogram import Client

from config import ROOT


async def main():
    load_dotenv(ROOT / ".env")
    for key in ["TELEGRAM_API_ID", "TELEGRAM_API_HASH"]:
        if not os.environ.get(key):
            raise ValueError(f"Set {key} in apps/telegram-bridge/.env first")
    async with Client("onfloor", api_id=int(os.environ["TELEGRAM_API_ID"]),
                      api_hash=os.environ["TELEGRAM_API_HASH"], in_memory=True) as app:
        session = await app.export_session_string()
    path = ROOT / ".env"
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    lines = [line for line in lines if not line.startswith("TELEGRAM_SESSION_STRING=")]
    lines.append("TELEGRAM_SESSION_STRING=" + session)
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    if os.name != "nt":
        path.chmod(0o600)
    print("Session saved to the local ignored .env. It grants full account access; never share or commit it.")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
    except Exception as error:
        print(f"Login failed ({type(error).__name__}). Check app credentials and the interactive Telegram login.")
        raise SystemExit(1)
