export const STATUS_META = {
  online: { label: "Online", color: "#16a34a", background: "#dcfce7" },
  warning: { label: "Warning", color: "#d97706", background: "#fef3c7" },
  offline: { label: "Offline", color: "#64748b", background: "#f1f5f9" },
  critical: { label: "Critical", color: "#dc2626", background: "#fee2e2" },
  unknown: { label: "Unknown", color: "#475569", background: "#e2e8f0" },
}

export function getStatusMeta(status) {
  return STATUS_META[String(status || "unknown").toLowerCase()] ?? STATUS_META.unknown
}

export function formatDateTime(value) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function summarizeDevices(devices) {
  const summary = {
    total: devices.length,
    online: 0,
    warning: 0,
    offline: 0,
    critical: 0,
    unknown: 0,
  }
  devices.forEach((device) => {
    const status = String(device.status || "unknown").toLowerCase()
    summary[status] = (summary[status] ?? 0) + 1
  })
  return summary
}
