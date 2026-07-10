import { AlertTriangle, CheckCircle2, MonitorDot, WifiOff } from "lucide-react"
import { useState } from "react"
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { summarizeDevices } from "../utils/status.js"

const CHART_RANGES = [
  { id: "minutes", label: "Minutes" },
  { id: "7d", label: "Last 7 days" },
  { id: "30d", label: "Last 30 days" },
]

function Dashboard({ devices, history = [] }) {
  const [chartRange, setChartRange] = useState("minutes")
  const chartData = buildChartData(devices, history, chartRange)
  const summary = summarizeDevices(devices)
  const offlineTotal = (summary.offline ?? 0) + (summary.critical ?? 0)
  const lastChecked = getLastChecked(devices)

  return (
    <section className="dashboard-grid">
      <div className="panel hero-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">RCB Network Monitoring</p>
            <h2>Ping Alert Dashboard</h2>
          </div>
          <div className="dashboard-records">
            <RecordCard icon={MonitorDot} label="Total" value={summary.total} />
            <RecordCard icon={CheckCircle2} label="Online" value={summary.online} tone="online" />
            <RecordCard icon={AlertTriangle} label="Warning" value={summary.warning} tone="warning" alerting={summary.warning > 0} />
            <RecordCard icon={WifiOff} label="Offline" value={offlineTotal} tone="offline" />
            <RecordCard label="Last Check" value={lastChecked} />
          </div>
        </div>

        <div className="hero-chart">
          <div className="chart-toolbar">
            <select value={chartRange} onChange={(event) => setChartRange(event.target.value)}>
              {CHART_RANGES.map((range) => (
                <option key={range.id} value={range.id}>{range.label}</option>
              ))}
            </select>
          </div>
          <div className="chart-plot">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 18, right: 0, left: 0, bottom: 8 }}>
              <defs>
                <linearGradient id="onlineAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.34} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0.08} />
                </linearGradient>
                <linearGradient id="offlineAreaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.30} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0.08} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="#edf2f7" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tickMargin={16}
                minTickGap={26}
                stroke="#525252"
                fontSize={13}
              />
              <YAxis
                allowDecimals={false}
                domain={[0, "dataMax + 1"]}
                hide
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                verticalAlign="bottom"
                iconType="square"
                wrapperStyle={{ paddingTop: 18, color: "#111827" }}
              />
              <Area
                type="natural"
                dataKey="online"
                name="Total Online"
                stroke="#16a34a"
                strokeWidth={1.7}
                fill="url(#onlineAreaFill)"
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 5 }}
              />
              <Area
                type="natural"
                dataKey="offline"
                name="Total Offline"
                stroke="#dc2626"
                strokeWidth={1.8}
                fill="url(#offlineAreaFill)"
                fillOpacity={1}
                dot={false}
                activeDot={{ r: 5 }}
              />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  )
}

function RecordCard({ icon: Icon, label, value, tone = "", alerting = false }) {
  return (
    <div className={["dashboard-record", tone, alerting ? "alerting" : ""].filter(Boolean).join(" ")}>
      {Icon ? <Icon className="dashboard-record-icon" /> : null}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function getLastChecked(devices) {
  const timestamps = devices
    .map((device) => new Date(device.lastChecked).getTime())
    .filter((time) => !Number.isNaN(time))
  if (!timestamps.length) return "Waiting"
  return new Date(Math.max(...timestamps)).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function buildChartData(devices, history, range) {
  // Minutes uses raw snapshots; day ranges group points by date.
  const source = history.length ? normalizeHistory(history) : buildCurrentData(devices)
  const now = Date.now()

  if (range === "minutes") {
    const cutoff = now - 60 * 60 * 1000
    const recent = source.filter((point) => point.time >= cutoff)
    return ensureChartShape(recent.length ? recent : source.slice(-60))
  }

  const days = range === "30d" ? 30 : 7
  const cutoff = now - days * 24 * 60 * 60 * 1000
  const recent = source.filter((point) => point.time >= cutoff)
  return ensureChartShape(groupByDay(recent.length ? recent : source))
}

function normalizeHistory(history) {
  return history
    .map((point) => {
      const time = new Date(point.checkedAt || point.id).getTime()
      return {
        ...point,
        time: Number.isNaN(time) ? Date.now() : time,
        label: point.label || formatMinuteLabel(time),
        online: Number(point.online ?? 0),
        offline: Number(point.offline ?? 0),
      }
    })
    .sort((a, b) => a.time - b.time)
}

function buildCurrentData(devices) {
  const summary = summarizeDevices(devices)
  const offlineTotal = (summary.offline ?? 0) + (summary.critical ?? 0)
  const time = Date.now()
  const current = {
    time,
    checkedAt: new Date(time).toISOString(),
    label: formatMinuteLabel(time),
    online: summary.online,
    offline: offlineTotal,
  }
  return [current]
}

function groupByDay(points) {
  // Keep the latest snapshot for each day to show a clean daily trend.
  const grouped = new Map()
  points.forEach((point) => {
    const date = new Date(point.time)
    const key = date.toISOString().slice(0, 10)
    grouped.set(key, {
      ...point,
      id: key,
      label: date.toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
    })
  })
  return [...grouped.values()]
}

function ensureChartShape(points) {
  if (points.length === 1) {
    return [{ ...points[0], id: "start", label: "Start" }, points[0]]
  }
  return points
}

function formatMinuteLabel(time) {
  return new Date(time).toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  })
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null

  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.dataKey}>
          <i style={{ backgroundColor: item.color }} />
          {item.name}: {item.value}
        </span>
      ))}
    </div>
  )
}

export default Dashboard
