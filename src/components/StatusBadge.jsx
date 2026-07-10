import { getStatusMeta } from "../utils/status.js"

function StatusBadge({ status }) {
  const meta = getStatusMeta(status)

  return (
    <span className="status-badge" style={{ backgroundColor: meta.background, color: meta.color }}>
      <span className="status-dot" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  )
}

export default StatusBadge
