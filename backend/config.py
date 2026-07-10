from __future__ import annotations

from pathlib import Path
import os


BASE_DIR = Path(__file__).resolve().parent.parent

try:
  from dotenv import load_dotenv
  load_dotenv(BASE_DIR / ".env")
except ImportError:
  pass

DATA_DIR = BASE_DIR / "data"
DEVICES_FILE = DATA_DIR / "devices.json"
UPLOAD_DIR = BASE_DIR / "uploads"

PING_TIMEOUT_MS = 1200
WARNING_RESPONSE_MS = 250
CRITICAL_FAILURES = 3
MAX_PING_WORKERS = 120
AUTO_CHECK_SECONDS = 60
PING_HISTORY_RETENTION_DAYS = int(os.getenv("PING_HISTORY_RETENTION_DAYS", "7"))
SNAPSHOT_RETENTION_DAYS = int(os.getenv("SNAPSHOT_RETENTION_DAYS", "90"))
RETENTION_CLEANUP_SECONDS = int(os.getenv("RETENTION_CLEANUP_SECONDS", str(6 * 60 * 60)))
APP_TIMEZONE = os.getenv("APP_TIMEZONE", "Asia/Kolkata")
DB_TIME_ZONE = os.getenv("DB_TIME_ZONE", "+05:30")
FLASK_SECRET_KEY = os.getenv("FLASK_SECRET_KEY", "alert-monitoring-change-this-secret")
AUTH_TOKEN_MAX_AGE_SECONDS = int(os.getenv("AUTH_TOKEN_MAX_AGE_SECONDS", str(12 * 60 * 60)))

DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_NAME = os.getenv("DB_NAME", "alert_monitoring")
DB_USER = os.getenv("DB_USER", "alert_user")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
