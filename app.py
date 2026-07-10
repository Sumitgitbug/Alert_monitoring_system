from __future__ import annotations

import os
import secrets
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from functools import wraps

from flask import Flask, jsonify, request
from flask_cors import CORS
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pymysql.err import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from backend.config import (
  AUTO_CHECK_SECONDS,
  AUTH_TOKEN_MAX_AGE_SECONDS,
  FLASK_SECRET_KEY,
  MAX_PING_WORKERS,
  PING_HISTORY_RETENTION_DAYS,
  RETENTION_CLEANUP_SECONDS,
  SNAPSHOT_RETENTION_DAYS,
)
from backend.importer import parse_device_file
from backend.models import create_device, now_iso, public_device
from backend.ping import check_device
from backend.storage import (
  cleanup_old_history,
  count_users,
  create_user,
  delete_device as delete_device_record,
  find_device,
  get_categories,
  init_database,
  insert_device,
  ip_exists,
  list_devices,
  list_users,
  load_devices,
  load_downtime_report,
  load_status_history,
  load_user,
  normalize_role,
  public_user as public_auth_user,
  save_checked_device,
  save_checked_devices,
  save_status_snapshot,
  update_device_record,
)


_scheduler_started = False


def create_app() -> Flask:
  # Create required MySQL tables before serving any API request.
  init_database()
  app = Flask(__name__)
  CORS(app)
  app.config["SECRET_KEY"] = FLASK_SECRET_KEY or secrets.token_hex(32)

  @app.get("/api/health")
  def health():
    return jsonify({"status": "ok"})

  @app.get("/api/auth/status")
  def auth_status():
    return jsonify({"setupRequired": count_users() == 0})

  @app.post("/api/auth/setup")
  def auth_setup():
    if count_users() > 0:
      return jsonify({"error": "Setup is already completed."}), 409
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip().lower()
    password = str(payload.get("password", ""))
    full_name = str(payload.get("fullName", "")).strip()
    if not username or len(password) < 8:
      return jsonify({"error": "Username and an 8+ character password are required."}), 400
    try:
      user = create_user(username, generate_password_hash(password), "admin", full_name)
    except IntegrityError:
      return jsonify({"error": "Username already exists."}), 409
    return jsonify({"token": _make_auth_token(user), "user": public_auth_user(user)})

  @app.post("/api/auth/login")
  def auth_login():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip().lower()
    password = str(payload.get("password", ""))
    if not username or not password:
      return jsonify({"error": "Username and password are required."}), 400
    user = load_user(username)
    if not user or not int(user.get("is_active") or 0) or not check_password_hash(user["password_hash"], password):
      return jsonify({"error": "Invalid username or password."}), 401
    return jsonify({"token": _make_auth_token(user), "user": public_auth_user(user)})

  @app.get("/api/auth/me")
  @require_auth
  def auth_me():
    return jsonify({"user": public_auth_user(request.environ.get("alert_user"))})

  @app.get("/api/users")
  @require_role("admin")
  def get_users():
    return jsonify({"users": [public_auth_user(user) for user in list_users()]})

  @app.post("/api/users")
  @require_role("admin")
  def add_user():
    payload = request.get_json(silent=True) or {}
    username = str(payload.get("username", "")).strip().lower()
    password = str(payload.get("password", ""))
    role = normalize_role(payload.get("role", "viewer"))
    full_name = str(payload.get("fullName", "")).strip()
    if not username or len(password) < 8:
      return jsonify({"error": "Username and an 8+ character password are required."}), 400
    try:
      user = create_user(username, generate_password_hash(password), role, full_name)
    except IntegrityError:
      return jsonify({"error": "Username already exists."}), 409
    return jsonify({"user": public_auth_user(user)}), 201

  @app.get("/api/devices")
  @require_auth
  def get_devices():
    # Server-side paging/filtering keeps large device lists fast in the browser.
    page = int(request.args.get("page", 1))
    page_size = int(request.args.get("pageSize", 50))
    search = request.args.get("search", "")
    category = request.args.get("category", "all")
    status = request.args.get("status", "total")
    devices, total = list_devices(page, page_size, search, category, status)
    return jsonify({
      "devices": devices,
      "total": total,
      "page": page,
      "pageSize": page_size,
      "categories": get_categories(),
    })

  @app.get("/api/status-history")
  @require_auth
  def get_status_history():
    minutes = int(request.args.get("minutes", 60 * 24 * 30))
    return jsonify({"history": load_status_history(minutes)})

  @app.get("/api/reports/downtime")
  @require_auth
  def get_downtime_report():
    days = int(request.args.get("days", 7))
    limit = int(request.args.get("limit", 500))
    return jsonify({"events": load_downtime_report(days, limit)})

  @app.post("/api/maintenance/cleanup")
  @require_role("admin")
  def cleanup_history():
    # Manual cleanup endpoint for old ping and graph history rows.
    result = cleanup_old_history(PING_HISTORY_RETENTION_DAYS, SNAPSHOT_RETENTION_DAYS)
    return jsonify(result)

  @app.post("/api/devices")
  @require_role("admin", "operator")
  def add_device():
    payload = request.get_json(silent=True) or {}
    device = create_device(payload)
    error = _validate_device(device)
    if error:
      return jsonify({"error": error}), 400
    if ip_exists(device["ipAddress"]):
      return jsonify({"error": "IP address already exists."}), 409

    insert_device(device)
    return jsonify({"device": public_device(device)}), 201

  @app.patch("/api/devices/<device_id>")
  @require_role("admin", "operator")
  def update_device(device_id: str):
    payload = request.get_json(silent=True) or {}
    current = find_device(device_id)
    if not current:
      return jsonify({"error": "Device not found."}), 404

    updated = {
      **current,
      "name": str(payload.get("name", current.get("name", ""))).strip(),
      "type": str(payload.get("type", current.get("type", ""))).strip(),
      "ipAddress": str(payload.get("ipAddress", current.get("ipAddress", ""))).strip(),
      "location": str(payload.get("location", current.get("location", ""))).strip(),
      "updatedAt": now_iso(),
    }
    error = _validate_device(updated)
    if error:
      return jsonify({"error": error}), 400
    if ip_exists(updated["ipAddress"], ignore_id=device_id):
      return jsonify({"error": "IP address already exists."}), 409

    saved = update_device_record(device_id, updated)
    return jsonify({"device": public_device(saved)})

  @app.delete("/api/devices/<device_id>")
  @require_role("admin")
  def delete_device(device_id: str):
    if not delete_device_record(device_id):
      return jsonify({"error": "Device not found."}), 404
    return "", 204

  @app.post("/api/devices/<device_id>/check")
  @require_role("admin", "operator")
  def check_one(device_id: str):
    current = find_device(device_id)
    if not current:
      return jsonify({"error": "Device not found."}), 404
    checked = check_device(current)
    save_checked_device(checked)
    return jsonify({"device": public_device(checked)})

  @app.post("/api/devices/check-all")
  @require_role("admin", "operator")
  def check_all():
    checked_devices = check_all_devices()
    return jsonify({"devices": [public_device(device) for device in checked_devices]})

  @app.post("/api/devices/bulk-upload")
  @require_role("admin", "operator")
  def bulk_upload():
    upload = request.files.get("file")
    category = str(request.form.get("category", "")).strip()
    if not upload:
      return jsonify({"error": "Upload a file."}), 400
    if not category:
      return jsonify({"error": "Select a category before upload."}), 400

    try:
      rows = parse_device_file(upload.filename or "", upload.read())
    except ValueError as exc:
      return jsonify({"error": str(exc)}), 400

    existing_ips = {str(device.get("ipAddress", "")).strip() for device in load_devices()}
    imported = []
    skipped = []

    for index, row in enumerate(rows, start=2):
      # Bulk upload applies the selected category as the device type.
      device = create_device({**row, "type": category})
      error = _validate_device(device)
      if error:
        skipped.append({"row": index, "reason": error})
        continue
      if device["ipAddress"] in existing_ips:
        skipped.append({"row": index, "reason": "Duplicate IP address"})
        continue
      insert_device(device)
      imported.append(public_device(device))
      existing_ips.add(device["ipAddress"])

    next_devices = load_devices()
    return jsonify({
      "imported": len(imported),
      "skipped": skipped,
      "devices": [public_device(device) for device in next_devices],
    })

  return app


def _auth_serializer() -> URLSafeTimedSerializer:
  return URLSafeTimedSerializer(FLASK_SECRET_KEY, salt="alert-monitoring-auth")


def _make_auth_token(user: dict) -> str:
  return _auth_serializer().dumps({
    "username": user.get("username", ""),
    "role": normalize_role(user.get("role_name")),
  })


def _token_user() -> dict | None:
  auth_header = request.headers.get("Authorization", "")
  scheme, _, token = auth_header.partition(" ")
  if scheme.lower() != "bearer" or not token.strip():
    return None
  try:
    payload = _auth_serializer().loads(token.strip(), max_age=AUTH_TOKEN_MAX_AGE_SECONDS)
  except (BadSignature, SignatureExpired):
    return None
  user = load_user(str(payload.get("username", "")))
  if not user or not int(user.get("is_active") or 0):
    return None
  return user


def require_auth(view):
  @wraps(view)
  def wrapped(*args, **kwargs):
    user = _token_user()
    if not user:
      return jsonify({"error": "Authentication required."}), 401
    request.environ["alert_user"] = user
    return view(*args, **kwargs)
  return wrapped


def require_role(*roles):
  allowed = set(roles)

  def decorator(view):
    @require_auth
    @wraps(view)
    def wrapped(*args, **kwargs):
      user = request.environ.get("alert_user")
      if normalize_role(user.get("role_name")) not in allowed:
        return jsonify({"error": "Permission denied."}), 403
      return view(*args, **kwargs)
    return wrapped
  return decorator


def check_all_devices() -> list[dict]:
  devices = load_devices()
  if not devices:
    save_status_snapshot([])
    return []

  # Ping many devices in parallel so large networks do not block one-by-one.
  workers = min(MAX_PING_WORKERS, max(1, len(devices)))
  with ThreadPoolExecutor(max_workers=workers) as executor:
    checked_devices = list(executor.map(check_device, devices))
  save_checked_devices(checked_devices)
  return checked_devices


def start_background_scheduler() -> None:
  global _scheduler_started
  if _scheduler_started:
    return
  _scheduler_started = True

  def run_loop():
    last_cleanup = 0
    while True:
      try:
        # Main monitoring loop: ping every device once per configured interval.
        check_all_devices()
        now = time.time()
        if now - last_cleanup >= RETENTION_CLEANUP_SECONDS:
          # Retention prevents ping_history/status_snapshots from growing forever.
          cleanup_old_history(PING_HISTORY_RETENTION_DAYS, SNAPSHOT_RETENTION_DAYS)
          last_cleanup = now
      except Exception as exc:
        print(f"Background ping check failed: {exc}")
      time.sleep(AUTO_CHECK_SECONDS)

  thread = threading.Thread(target=run_loop, name="ping-monitor", daemon=True)
  thread.start()


def _validate_device(device: dict) -> str:
  if not device.get("name"):
    return "Device name is required."
  if not device.get("type"):
    return "Device type is required."
  if not device.get("ipAddress"):
    return "IP address is required."
  if not device.get("location"):
    return "Location is required."
  return ""


app = create_app()


if __name__ == "__main__":
  start_background_scheduler()
  host = os.getenv("FLASK_HOST", "127.0.0.1")
  port = int(os.getenv("FLASK_PORT", "5050"))
  app.run(host=host, port=port, debug=True, use_reloader=False)
