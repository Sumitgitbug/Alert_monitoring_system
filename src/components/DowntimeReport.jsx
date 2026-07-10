import { FileClock } from "lucide-react"
import { useMemo, useState } from "react"

import { formatDateTime } from "../utils/status.js"

function DowntimeReport({ events, days, onDaysChange, loading }) {
  const [search, setSearch] = useState("")
  const filteredEvents = useMemo(() => filterEvents(events, search), [events, search])

  return (
    <section className="panel table-panel">
      <div className="panel-header device-list-header">
        <div>
          <p className="eyebrow">Device Downtime</p>
          <h2>Report</h2>
        </div>
        <div className="device-list-controls">
          <label className="category-filter report-search">
            <span>Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or IP"
            />
          </label>
          <label className="category-filter report-range">
            <span>Range</span>
            <select value={days} onChange={(event) => onDaysChange(Number(event.target.value))}>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
          </label>
          <div className="table-meta">
            <span>{loading ? "Loading report..." : `${filteredEvents.length} Down Events`}</span>
          </div>
        </div>
      </div>

      <div className="report-summary-strip">
        <FileClock size={20} />
        <span>Shows when a device went down, when it recovered, and total downtime duration.</span>
      </div>

      <div className="table-wrap">
        <table className="device-table downtime-table">
          <thead>
            <tr>
              <th>Device</th>
              <th>IP Address</th>
              <th>Location</th>
              <th>Down From</th>
              <th>Down To</th>
              <th>Duration</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredEvents.map((event) => (
              <tr key={event.id}>
                <td>
                  <strong>{event.deviceName}</strong>
                  <small>{event.type}</small>
                </td>
                <td className="mono">{event.ipAddress}</td>
                <td>{event.location}</td>
                <td>{formatDateTime(event.downFrom)}</td>
                <td>{event.downTo ? formatDateTime(event.downTo) : "Still Down"}</td>
                <td>{formatDuration(event.durationSeconds)}</td>
                <td>
                  <span className={event.status === "running" ? "report-pill running" : "report-pill resolved"}>
                    {event.status === "running" ? "Still Down" : "Recovered"}
                  </span>
                </td>
              </tr>
            ))}
            {!filteredEvents.length ? (
              <tr>
                <td colSpan="7" className="empty-row">No downtime report found for this search.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function filterEvents(events, search) {
  const query = search.trim().toLowerCase()
  if (!query) return events
  return events.filter((event) => {
    const name = String(event.deviceName || "").toLowerCase()
    const ipAddress = String(event.ipAddress || "").toLowerCase()
    return name.includes(query) || ipAddress.includes(query)
  })
}

function formatDuration(seconds) {
  const total = Math.max(Number(seconds || 0), 0)
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days) return `${days}d ${hours}h ${minutes}m`
  if (hours) return `${hours}h ${minutes}m`
  if (minutes) return `${minutes}m`
  return `${total}s`
}

export default DowntimeReport
