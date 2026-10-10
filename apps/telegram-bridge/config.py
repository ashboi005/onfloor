"""Configuration is loaded only at startup, never during module import."""
import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent


def device(value: str | None) -> int | str | None:
    if not value:
        return None
    return int(value) if value.isdigit() else value


@dataclass(frozen=True)
class Settings:
    api_id: int
    api_hash: str
    session: str
    ingest_url: str
    bridge_secret: str
    backup_dir: Path
    mic_device: int | str | None
    speaker_device: int | str | None

    @classmethod
    def load(cls, *, spike_only: bool = False) -> "Settings":
        load_dotenv(ROOT / ".env")
        required = ["TELEGRAM_API_ID", "TELEGRAM_API_HASH", "TELEGRAM_SESSION_STRING"]
        if not spike_only:
            required += ["API_INGEST_URL", "BRIDGE_SECRET"]
        missing = [name for name in required if not os.environ.get(name, "").strip()]
        if missing:
            raise ValueError("Missing environment variables: " + ", ".join(missing))
        api_id = int(os.environ["TELEGRAM_API_ID"])
        if api_id <= 0:
            raise ValueError("TELEGRAM_API_ID must be a positive integer")
        url = os.environ.get("API_INGEST_URL", "ws://localhost:3000/internal/live/ingest")
        parsed = urlparse(url)
        if parsed.scheme not in {"ws", "wss"} or not parsed.hostname or parsed.path != "/internal/live/ingest":
            raise ValueError("API_INGEST_URL must be a ws(s) URL ending in /internal/live/ingest")
        if parsed.scheme == "ws" and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError("Use wss:// for a remote API to protect the bridge secret")
        backup = Path(os.environ.get("BACKUP_DIR", ".data/recordings"))
        return cls(api_id, os.environ["TELEGRAM_API_HASH"], os.environ["TELEGRAM_SESSION_STRING"],
                   url, os.environ.get("BRIDGE_SECRET", ""), backup if backup.is_absolute() else ROOT / backup,
                   device(os.environ.get("MIC_DEVICE")), device(os.environ.get("SPEAKER_DEVICE")))
