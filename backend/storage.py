from __future__ import annotations

import json
from datetime import datetime

import pymysql
from pymysql.cursors import DictCursor

from .config import DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_TIME_ZONE, DB_USER, DEVICES_FILE
from .models import local_now, public_device


def get_connection():
  # Open one MySQL connection for a short database operation.
  connection = pymysql.connect(
    host=DB_HOST,
    port=DB_PORT,
    user=DB_USER,
    password=DB_PASSWORD,
    database=DB_NAME,
    charset="utf8mb4",
    cursorclass=DictCursor,
    autocommit=False,
  )
  with connection.cursor() as cursor:
    cursor.execute("SET time_zone = %s", [DB_TIME_ZONE])
  return connection


def init_database() -> None:
  # Create tables automatically so a fresh schema can start without manual SQL.
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute("""
        CREATE TABLE IF NOT EXISTS devices (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          device_type VARCHAR(120) NOT NULL,
          ip_address VARCHAR(64) NOT NULL UNIQUE,
          location VARCHAR(255) NOT NULL,
          status VARCHAR(32) NOT NULL DEFAULT 'unknown',
          response_ms INT NULL,
          last_checked DATETIME NULL,
          failure_count INT NOT NULL DEFAULT 0,
          message TEXT NULL,
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL,
          INDEX idx_status (status),
          INDEX idx_device_type (device_type),
          INDEX idx_last_checked (last_checked)
        )
      """)
      cursor.execute("""
        CREATE TABLE IF NOT EXISTS ping_history (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          device_id VARCHAR(36) NOT NULL,
          checked_at DATETIME NOT NULL,
          status VARCHAR(32) NOT NULL,
          response_ms INT NULL,
          message TEXT NULL,
          INDEX idx_checked_at (checked_at),
          INDEX idx_device_checked (device_id, checked_at),
          CONSTRAINT fk_ping_history_device
            FOREIGN KEY (device_id) REFERENCES devices(id)
            ON DELETE CASCADE
        )
      """)
      cursor.execute("""
        CREATE TABLE IF NOT EXISTS status_snapshots (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          checked_at DATETIME NOT NULL,
          total INT NOT NULL,
          online INT NOT NULL,
          warning INT NOT NULL,
          offline INT NOT NULL,
          critical INT NOT NULL,
          INDEX idx_snapshot_checked_at (checked_at)
        )
      """)
      cursor.execute("""
        CREATE TABLE IF NOT EXISTS downtime_events (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          device_id VARCHAR(36) NOT NULL,
          started_at DATETIME NOT NULL,
          ended_at DATETIME NULL,
          last_status VARCHAR(32) NOT NULL,
          last_message TEXT NULL,
          duration_seconds INT NULL,
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL,
          INDEX idx_downtime_started (started_at),
          INDEX idx_downtime_open (device_id, ended_at),
          CONSTRAINT fk_downtime_events_device
            FOREIGN KEY (device_id) REFERENCES devices(id)
            ON DELETE CASCADE
        )
      """)
      cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(120) NOT NULL UNIQUE,
          password_hash VARCHAR(255) NOT NULL,
          role_name VARCHAR(30) NOT NULL DEFAULT 'viewer',
          full_name VARCHAR(150) DEFAULT '',
          is_active TINYINT(1) NOT NULL DEFAULT 1,
          created_at DATETIME NOT NULL,
          updated_at DATETIME NOT NULL,
          INDEX idx_users_role (role_name),
          INDEX idx_users_active (is_active)
        )
      """)
    connection.commit()
  migrate_json_devices()


def migrate_json_devices() -> None:
  # Move old JSON demo data into MySQL once, then keep MySQL as the source.
  if not DEVICES_FILE.exists():
    return
  if count_all_devices() > 0:
    return
  try:
    devices = json.loads(DEVICES_FILE.read_text(encoding="utf-8"))
  except (OSError, json.JSONDecodeError):
    return
  if not isinstance(devices, list) or not devices:
    return
  for device in devices:
    insert_device(device)


def load_devices() -> list[dict]:
  devices, _total = list_devices(page=1, page_size=100000)
  return devices


def count_all_devices() -> int:
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute("SELECT COUNT(*) AS total FROM devices")
      row = cursor.fetchone() or {"total": 0}
  return int(row["total"] or 0)


def list_devices(
  page: int = 1,
  page_size: int = 50,
  search: str = "",
  category: str = "all",
  status: str = "total",
) -> tuple[list[dict], int]:
  # Filters are pushed to MySQL for fast category/status/search pagination.
  page = max(int(page or 1), 1)
  page_size = min(max(int(page_size or 50), 1), 500)
  where, values = _build_filters(search, category, status)
  offset = (page - 1) * page_size

  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(f"SELECT COUNT(*) AS total FROM devices {where}", values)
      total = int((cursor.fetchone() or {"total": 0})["total"] or 0)
      cursor.execute(
        f"""
        SELECT * FROM devices
        {where}
        ORDER BY name ASC
        LIMIT %s OFFSET %s
        """,
        [*values, page_size, offset],
      )
      rows = cursor.fetchall()
  return [_row_to_device(row) for row in rows], total


def get_categories() -> list[str]:
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute("SELECT DISTINCT device_type FROM devices ORDER BY device_type ASC")
      rows = cursor.fetchall()
  return [row["device_type"] for row in rows if row.get("device_type")]


def count_users() -> int:
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute("SELECT COUNT(*) AS total FROM users")
      row = cursor.fetchone() or {"total": 0}
  return int(row["total"] or 0)


def load_user(username: str) -> dict | None:
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        SELECT username, password_hash, role_name, full_name, is_active
        FROM users
        WHERE username = %s
        LIMIT 1
        """,
        [username],
      )
      row = cursor.fetchone()
  return row


def create_user(username: str, password_hash: str, role: str = "viewer", full_name: str = "") -> dict:
  now = local_now()
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        INSERT INTO users (
          username, password_hash, role_name, full_name, is_active, created_at, updated_at
        ) VALUES (%s, %s, %s, %s, 1, %s, %s)
        """,
        [username, password_hash, role, full_name, now, now],
      )
    connection.commit()
  user = load_user(username)
  if not user:
    raise ValueError("User could not be created.")
  return user


def list_users() -> list[dict]:
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        SELECT username, role_name, full_name, is_active, created_at, updated_at
        FROM users
        ORDER BY created_at DESC
        """
      )
      rows = cursor.fetchall()
  return rows


def public_user(user: dict | None) -> dict | None:
  if not user:
    return None
  return {
    "username": user.get("username", ""),
    "role": normalize_role(user.get("role_name")),
    "fullName": user.get("full_name", "") or "",
    "isActive": bool(int(user.get("is_active", 1) or 0)),
  }


def normalize_role(value) -> str:
  role = str(value or "viewer").strip().lower()
  if role == "user":
    return "operator"
  if role not in {"admin", "operator", "viewer"}:
    return "viewer"
  return role


def find_device(devices_or_id, device_id: str | None = None) -> dict | None:
  if device_id is not None and isinstance(devices_or_id, list):
    return next((device for device in devices_or_id if device.get("id") == device_id), None)

  lookup_id = str(devices_or_id or "")
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute("SELECT * FROM devices WHERE id = %s", [lookup_id])
      row = cursor.fetchone()
  return _row_to_device(row) if row else None


def insert_device(device: dict) -> None:
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        INSERT INTO devices (
          id, name, device_type, ip_address, location, status, response_ms,
          last_checked, failure_count, message, created_at, updated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        _device_values(device),
      )
    connection.commit()


def update_device_record(device_id: str, fields: dict) -> dict | None:
  current = find_device(device_id)
  if not current:
    return None
  updated = {**current, **fields}
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        UPDATE devices
        SET name = %s, device_type = %s, ip_address = %s, location = %s,
            status = %s, response_ms = %s, last_checked = %s,
            failure_count = %s, message = %s, updated_at = %s
        WHERE id = %s
        """,
        [
          updated.get("name", ""),
          updated.get("type", ""),
          updated.get("ipAddress", ""),
          updated.get("location", ""),
          updated.get("status", "unknown"),
          updated.get("responseMs"),
          _to_datetime(updated.get("lastChecked")),
          int(updated.get("failureCount") or 0),
          updated.get("message", ""),
          _to_datetime(updated.get("updatedAt")) or local_now(),
          device_id,
        ],
      )
    connection.commit()
  return find_device(device_id)


def delete_device(device_id: str) -> bool:
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute("DELETE FROM devices WHERE id = %s", [device_id])
      deleted = cursor.rowcount > 0
    connection.commit()
  return deleted


def ip_exists(ip_address: str, ignore_id: str = "") -> bool:
  query = "SELECT id FROM devices WHERE ip_address = %s"
  values = [ip_address]
  if ignore_id:
    query += " AND id <> %s"
    values.append(ignore_id)
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(query, values)
      row = cursor.fetchone()
  return row is not None


def save_devices(devices: list[dict]) -> None:
  for device in devices:
    save_checked_device(device)
  save_status_snapshot(load_devices())


def save_checked_device(device: dict) -> None:
  updated = update_device_record(device.get("id", ""), device)
  if updated:
    insert_ping_history(updated)
    sync_downtime_event(updated)


def save_checked_devices(devices: list[dict]) -> None:
  # Save latest device status and append one ping_history row per checked device.
  with get_connection() as connection:
    with connection.cursor() as cursor:
      for device in devices:
        cursor.execute(
          """
          UPDATE devices
          SET status = %s, response_ms = %s, last_checked = %s,
              failure_count = %s, message = %s, updated_at = %s
          WHERE id = %s
          """,
          [
            device.get("status", "unknown"),
            device.get("responseMs"),
            _to_datetime(device.get("lastChecked")),
            int(device.get("failureCount") or 0),
            device.get("message", ""),
            _to_datetime(device.get("updatedAt")) or local_now(),
            device.get("id", ""),
          ],
        )
        cursor.execute(
          """
          INSERT INTO ping_history (device_id, checked_at, status, response_ms, message)
          VALUES (%s, %s, %s, %s, %s)
          """,
          [
            device.get("id", ""),
            _to_datetime(device.get("lastChecked")) or local_now(),
            device.get("status", "unknown"),
            device.get("responseMs"),
            device.get("message", ""),
          ],
        )
        _sync_downtime_event(cursor, device)
    connection.commit()
  save_status_snapshot(devices)


def insert_ping_history(device: dict) -> None:
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        INSERT INTO ping_history (device_id, checked_at, status, response_ms, message)
        VALUES (%s, %s, %s, %s, %s)
        """,
        [
          device.get("id", ""),
          _to_datetime(device.get("lastChecked")) or local_now(),
          device.get("status", "unknown"),
          device.get("responseMs"),
          device.get("message", ""),
        ],
      )
    connection.commit()


def sync_downtime_event(device: dict) -> None:
  with get_connection() as connection:
    with connection.cursor() as cursor:
      _sync_downtime_event(cursor, device)
    connection.commit()


def load_downtime_report(days: int = 7, limit: int = 500) -> list[dict]:
  days = min(max(int(days or 7), 1), 90)
  limit = min(max(int(limit or 500), 1), 2000)
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        SELECT
          e.id,
          e.started_at,
          e.ended_at,
          e.last_status,
          e.last_message,
          e.duration_seconds,
          d.name,
          d.device_type,
          d.ip_address,
          d.location
        FROM downtime_events e
        JOIN devices d ON d.id = e.device_id
        WHERE e.started_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
           OR e.ended_at IS NULL
        ORDER BY e.started_at DESC
        LIMIT %s
        """,
        [days, limit],
      )
      rows = cursor.fetchall()
  return [_row_to_downtime_event(row) for row in rows]


def save_status_snapshot(devices: list[dict]) -> None:
  # Dashboard graph reads these total online/offline counts over time.
  summary = _summarize(devices)
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        INSERT INTO status_snapshots (checked_at, total, online, warning, offline, critical)
        VALUES (%s, %s, %s, %s, %s, %s)
        """,
        [
          local_now(),
          summary["total"],
          summary["online"],
          summary["warning"],
          summary["offline"],
          summary["critical"],
        ],
      )
    connection.commit()


def load_status_history(minutes: int = 60) -> list[dict]:
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        """
        SELECT * FROM status_snapshots
        WHERE checked_at >= DATE_SUB(NOW(), INTERVAL %s MINUTE)
        ORDER BY checked_at ASC
        """,
        [minutes],
      )
      rows = cursor.fetchall()
  return [
    {
      "id": str(row["id"]),
      "checkedAt": _format_datetime(row["checked_at"]),
      "label": row["checked_at"].strftime("%I:%M %p") if row.get("checked_at") else "",
      "total": int(row["total"] or 0),
      "online": int(row["online"] or 0),
      "offline": int(row["offline"] or 0) + int(row["critical"] or 0),
      "warning": int(row["warning"] or 0),
      "critical": int(row["critical"] or 0),
    }
    for row in rows
  ]


def cleanup_old_history(ping_days: int, snapshot_days: int) -> dict:
  # Delete old monitoring rows according to retention settings.
  ping_days = max(int(ping_days or 1), 1)
  snapshot_days = max(int(snapshot_days or 1), 1)
  with get_connection() as connection:
    with connection.cursor() as cursor:
      cursor.execute(
        "DELETE FROM ping_history WHERE checked_at < DATE_SUB(NOW(), INTERVAL %s DAY)",
        [ping_days],
      )
      ping_deleted = cursor.rowcount
      cursor.execute(
        "DELETE FROM status_snapshots WHERE checked_at < DATE_SUB(NOW(), INTERVAL %s DAY)",
        [snapshot_days],
      )
      snapshot_deleted = cursor.rowcount
      cursor.execute(
        """
        DELETE FROM downtime_events
        WHERE ended_at IS NOT NULL
          AND ended_at < DATE_SUB(NOW(), INTERVAL %s DAY)
        """,
        [snapshot_days],
      )
      downtime_deleted = cursor.rowcount
    connection.commit()
  return {
    "pingHistoryDeleted": ping_deleted,
    "snapshotsDeleted": snapshot_deleted,
    "downtimeEventsDeleted": downtime_deleted,
  }


def _build_filters(search: str, category: str, status: str) -> tuple[str, list]:
  clauses = []
  values = []
  if search:
    clauses.append("(name LIKE %s OR ip_address LIKE %s OR location LIKE %s)")
    like = f"%{search}%"
    values.extend([like, like, like])
  if category and category != "all":
    clauses.append("device_type = %s")
    values.append(category)
  if status and status != "total":
    if status == "offline":
      clauses.append("status IN ('offline', 'critical')")
    else:
      clauses.append("status = %s")
      values.append(status)
  where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
  return where, values


def _device_values(device: dict) -> list:
  timestamp = _to_datetime(device.get("createdAt")) or local_now()
  return [
    device.get("id", ""),
    device.get("name", ""),
    device.get("type", ""),
    device.get("ipAddress", ""),
    device.get("location", ""),
    device.get("status", "unknown"),
    device.get("responseMs"),
    _to_datetime(device.get("lastChecked")),
    int(device.get("failureCount") or 0),
    device.get("message", ""),
    timestamp,
    _to_datetime(device.get("updatedAt")) or timestamp,
  ]


def _row_to_device(row: dict) -> dict:
  return public_device({
    "id": row.get("id", ""),
    "name": row.get("name", ""),
    "type": row.get("device_type", ""),
    "ipAddress": row.get("ip_address", ""),
    "location": row.get("location", ""),
    "status": row.get("status", "unknown"),
    "responseMs": row.get("response_ms"),
    "lastChecked": _format_datetime(row.get("last_checked")),
    "failureCount": row.get("failure_count", 0),
    "message": row.get("message", ""),
    "createdAt": _format_datetime(row.get("created_at")),
    "updatedAt": _format_datetime(row.get("updated_at")),
  })


def _to_datetime(value) -> datetime | None:
  if not value:
    return None
  if isinstance(value, datetime):
    return value
  text = str(value).replace("Z", "").replace("T", " ")
  try:
    return datetime.fromisoformat(text)
  except ValueError:
    return None


def _format_datetime(value) -> str:
  if not value:
    return ""
  if isinstance(value, datetime):
    return value.isoformat(timespec="seconds")
  return str(value)


def _sync_downtime_event(cursor, device: dict) -> None:
  status = str(device.get("status", "unknown")).lower()
  checked_at = _to_datetime(device.get("lastChecked")) or local_now()
  device_id = device.get("id", "")
  if not device_id:
    return

  cursor.execute(
    """
    SELECT id, started_at FROM downtime_events
    WHERE device_id = %s AND ended_at IS NULL
    ORDER BY started_at DESC
    LIMIT 1
    """,
    [device_id],
  )
  open_event = cursor.fetchone()
  if status in ("offline", "critical"):
    started_at = _find_current_down_start(cursor, device_id, checked_at)
    if open_event:
      event_started_at = open_event["started_at"]
      if started_at and started_at < event_started_at:
        event_started_at = started_at
      cursor.execute(
        """
        UPDATE downtime_events
        SET started_at = %s, last_status = %s, last_message = %s, updated_at = %s
        WHERE id = %s
        """,
        [event_started_at, status, device.get("message", ""), checked_at, open_event["id"]],
      )
      return
    cursor.execute(
      """
      INSERT INTO downtime_events (
        device_id, started_at, last_status, last_message, created_at, updated_at
      ) VALUES (%s, %s, %s, %s, %s, %s)
      """,
      [device_id, started_at, status, device.get("message", ""), checked_at, checked_at],
    )
    return

  if open_event:
    duration_seconds = max(int((checked_at - open_event["started_at"]).total_seconds()), 0)
    cursor.execute(
      """
      UPDATE downtime_events
      SET ended_at = %s, duration_seconds = %s, last_status = %s,
          last_message = %s, updated_at = %s
      WHERE id = %s
      """,
      [checked_at, duration_seconds, status, device.get("message", ""), checked_at, open_event["id"]],
    )


def _row_to_downtime_event(row: dict) -> dict:
  ended_at = row.get("ended_at")
  started_at = row.get("started_at")
  duration_seconds = row.get("duration_seconds")
  if ended_at is None and started_at:
    duration_seconds = max(int((local_now() - started_at).total_seconds()), 0)
  return {
    "id": str(row.get("id", "")),
    "deviceName": row.get("name", ""),
    "type": row.get("device_type", ""),
    "ipAddress": row.get("ip_address", ""),
    "location": row.get("location", ""),
    "downFrom": _format_datetime(started_at),
    "downTo": _format_datetime(ended_at),
    "durationSeconds": int(duration_seconds or 0),
    "status": "running" if ended_at is None else "resolved",
    "lastStatus": row.get("last_status", ""),
    "message": row.get("last_message", ""),
  }


def _find_current_down_start(cursor, device_id: str, checked_at: datetime) -> datetime:
  # Find the first failed ping after the last successful/warning check.
  cursor.execute(
    """
    SELECT MAX(checked_at) AS recovered_at
    FROM ping_history
    WHERE device_id = %s
      AND checked_at < %s
      AND status NOT IN ('offline', 'critical')
    """,
    [device_id, checked_at],
  )
  recovered_at = (cursor.fetchone() or {}).get("recovered_at")
  if recovered_at:
    cursor.execute(
      """
      SELECT MIN(checked_at) AS started_at
      FROM ping_history
      WHERE device_id = %s
        AND checked_at > %s
        AND checked_at <= %s
        AND status IN ('offline', 'critical')
      """,
      [device_id, recovered_at, checked_at],
    )
  else:
    cursor.execute(
      """
      SELECT MIN(checked_at) AS started_at
      FROM ping_history
      WHERE device_id = %s
        AND checked_at <= %s
        AND status IN ('offline', 'critical')
      """,
      [device_id, checked_at],
    )
  started_at = (cursor.fetchone() or {}).get("started_at")
  return started_at or checked_at


def _summarize(devices: list[dict]) -> dict:
  summary = {"total": len(devices), "online": 0, "warning": 0, "offline": 0, "critical": 0}
  for device in devices:
    status = str(device.get("status", "unknown")).lower()
    if status in summary:
      summary[status] += 1
  return summary
