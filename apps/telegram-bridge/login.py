"""One-time interactive login. Prints a session string for TELEGRAM_SESSION_STRING."""
import os

from dotenv import load_dotenv
from pyrogram import Client

load_dotenv()

with Client(
    "onfloor",
    api_id=int(os.environ["TELEGRAM_API_ID"]),
    api_hash=os.environ["TELEGRAM_API_HASH"],
    in_memory=True,
) as app:
    print("\nTELEGRAM_SESSION_STRING=" + app.export_session_string())
