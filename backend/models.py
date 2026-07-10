from __future__ import annotations

from datetime import datetime
from uuid import uuid4
from zoneinfo import ZoneInfo

from .config import APP_TIMEZONE


APP_ZONE = ZoneInfo(APP_TIMEZONE)


def local_now() -> datetime:
  # Store local wall-clock time so Docker and Windows show the same India time.
  return datetime.now(APP_ZONE).replace(tzinfo=None)


def now_iso() -> str:
  return local_now().isoformat(timespec="seconds")


def create_device(payload: dict) -> dict:
  timestamp = now_iso()
  return {
    "id": str(uuid4()),
    "name": str(payload.get("name", "")).strip(),
    "type": str(payload.get("type", "")).strip(),
    "ipAddress": str(payload.get("ipAddress", "")).strip(),
    "location": str(payload.get("location", "")).strip(),
    "status": "unknown",
    "responseMs": None,
    "lastChecked": "",
    "failureCount": 0,
    "message": "Not checked yet",
    "createdAt": timestamp,
    "updatedAt": timestamp,
  }


def public_device(device: dict) -> dict:
  return {
    "id": device.get("id", ""),
    "name": device.get("name", ""),
    "type": device.get("type", ""),
    "ipAddress": device.get("ipAddress", ""),
    "location": device.get("location", ""),
    "status": device.get("status", "unknown"),
    "responseMs": device.get("responseMs"),
    "lastChecked": device.get("lastChecked", ""),
    "failureCount": int(device.get("failureCount") or 0),
    "message": device.get("message", ""),
    "createdAt": device.get("createdAt", ""),
    "updatedAt": device.get("updatedAt", ""),
  }
