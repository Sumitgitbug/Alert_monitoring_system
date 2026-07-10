from __future__ import annotations

import platform
import re
import subprocess

from .config import CRITICAL_FAILURES, PING_TIMEOUT_MS, WARNING_RESPONSE_MS
from .models import now_iso


def _ping_command(ip_address: str) -> list[str]:
  # Windows and Linux use different ping flags for count and timeout.
  if platform.system().lower().startswith("win"):
    return ["ping", "-n", "1", "-w", str(PING_TIMEOUT_MS), ip_address]
  return ["ping", "-c", "1", "-W", str(max(1, round(PING_TIMEOUT_MS / 1000))), ip_address]


def _extract_response_ms(output: str) -> int | None:
  # Parse response time from common Windows/Linux ping output formats.
  patterns = [
    r"time[=<]\s*(\d+)\s*ms",
    r"Average\s*=\s*(\d+)\s*ms",
    r"avg[/\w.]*\s*=\s*[\d.]+/([\d.]+)",
  ]
  for pattern in patterns:
    match = re.search(pattern, output, flags=re.IGNORECASE)
    if match:
      return int(float(match.group(1)))
  return None


def check_device(device: dict) -> dict:
  # One failed check becomes warning; repeated failures become critical.
  ip_address = str(device.get("ipAddress", "")).strip()
  timestamp = now_iso()

  if not ip_address:
    return {
      **device,
      "status": "critical",
      "responseMs": None,
      "lastChecked": timestamp,
      "failureCount": int(device.get("failureCount") or 0) + 1,
      "message": "Missing IP address",
      "updatedAt": timestamp,
    }

  try:
    result = subprocess.run(
      _ping_command(ip_address),
      capture_output=True,
      text=True,
      timeout=(PING_TIMEOUT_MS / 1000) + 1,
      check=False,
    )
  except (OSError, subprocess.TimeoutExpired) as exc:
    failure_count = int(device.get("failureCount") or 0) + 1
    status = "critical" if failure_count >= CRITICAL_FAILURES else "warning"
    return {
      **device,
      "status": status,
      "responseMs": None,
      "lastChecked": timestamp,
      "failureCount": failure_count,
      "message": _failure_message(status, failure_count, f"Ping failed: {exc}"),
      "updatedAt": timestamp,
    }

  output = f"{result.stdout}\n{result.stderr}"
  response_ms = _extract_response_ms(output)

  if result.returncode == 0:
    # Reachable devices are online unless latency is above the warning limit.
    status = "warning" if response_ms is not None and response_ms >= WARNING_RESPONSE_MS else "online"
    message = "High latency" if status == "warning" else "Device reachable"
    return {
      **device,
      "status": status,
      "responseMs": response_ms,
      "lastChecked": timestamp,
      "failureCount": 0,
      "message": message,
      "updatedAt": timestamp,
    }

  failure_count = int(device.get("failureCount") or 0) + 1
  status = "critical" if failure_count >= CRITICAL_FAILURES else "warning"
  return {
    **device,
    "status": status,
    "responseMs": None,
    "lastChecked": timestamp,
    "failureCount": failure_count,
    "message": _failure_message(status, failure_count, "Device not reachable"),
    "updatedAt": timestamp,
  }


def _failure_message(status: str, failure_count: int, reason: str) -> str:
  if status == "critical":
    return f"Critical: device unreachable for {failure_count} continuous checks"
  remaining = max(CRITICAL_FAILURES - failure_count, 0)
  return f"Warning: {reason}. Critical after {remaining} more failed check{'s' if remaining != 1 else ''}"
