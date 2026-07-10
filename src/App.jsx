import { LogOut, RefreshCw, ShieldCheck, X } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  checkAllDevices,
  checkDevice,
  createDevice,
  deleteDevice,
  loadDowntimeReport,
  loadDevices,
  loadStatusHistory,
  updateDevice,
  uploadDevices,
} from "./api/devices.js"
import BulkUpload from "./components/BulkUpload.jsx"
import Dashboard from "./components/Dashboard.jsx"
import DeviceForm from "./components/DeviceForm.jsx"
import DeviceTable from "./components/DeviceTable.jsx"
import DowntimeReport from "./components/DowntimeReport.jsx"
import Tabs from "./components/Tabs.jsx"
import UserManagement from "./components/UserManagement.jsx"
import { summarizeDevices } from "./utils/status.js"

const EMPTY_FORM = { name: "", type: "", ipAddress: "", location: "" }
const AUTO_CHECK_MS = 60000
const HISTORY_STORAGE_KEY = "alert-monitoring-history-v2"
const MAX_HISTORY_POINTS = 60 * 24 * 30
const DEVICE_PAGE_SIZE = 50

function App({ currentUser, onLogout }) {
  const [devices, setDevices] = useState([])
  const [tableDevices, setTableDevices] = useState([])
  const [deviceTotal, setDeviceTotal] = useState(0)
  const [devicePage, setDevicePage] = useState(1)
  const [deviceSearch, setDeviceSearch] = useState("")
  const [serverCategories, setServerCategories] = useState([])
  const [activeTab, setActiveTab] = useState("dashboard")
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState("")
  const [loading, setLoading] = useState(true)
  const [checkingId, setCheckingId] = useState("")
  const [checkingAll, setCheckingAll] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [toast, setToast] = useState(null)
  const [lastAutoCheck, setLastAutoCheck] = useState("")
  const [lastReport, setLastReport] = useState(null)
  const [history, setHistory] = useState(loadHistory)
  const [reportEvents, setReportEvents] = useState([])
  const [reportDays, setReportDays] = useState(7)
  const [reportLoading, setReportLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("all")
  const [selectedStatus, setSelectedStatus] = useState("total")
  const [addMode, setAddMode] = useState("manual")
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false)
  const autoCheckingRef = useRef(false)

  const sortedDevices = useMemo(
    () => [...devices].sort((a, b) => String(a.name).localeCompare(String(b.name))),
    [devices],
  )
  const categories = useMemo(
    () => serverCategories.length ? serverCategories : getCategories(devices),
    [devices, serverCategories],
  )
  const filteredDevices = useMemo(() => [...tableDevices].sort((a, b) => String(a.name).localeCompare(String(b.name))), [tableDevices])
  const filterCounts = useMemo(() => getFilterCounts(sortedDevices), [sortedDevices])
  const totalPages = Math.max(1, Math.ceil(deviceTotal / DEVICE_PAGE_SIZE))
  const canManage = currentUser?.role === "admin" || currentUser?.role === "operator"
  const canDelete = currentUser?.role === "admin"
  const canAdmin = currentUser?.role === "admin"

  useEffect(() => {
    refreshDevices()
  }, [])

  useEffect(() => {
    if (activeTab !== "devices") return undefined
    refreshTableDevices()
    return undefined
  }, [activeTab, devicePage, deviceSearch, selectedCategory, selectedStatus])

  useEffect(() => {
    if (activeTab !== "report") return undefined
    refreshReport()
    return undefined
  }, [activeTab, reportDays])

  useEffect(() => {
    setDevicePage(1)
  }, [deviceSearch, selectedCategory, selectedStatus])

  useEffect(() => {
    if (!devices.length) return undefined
    const firstRun = window.setTimeout(() => {
      runAutoCheck()
    }, 500)
    const timer = window.setInterval(() => {
      runAutoCheck()
    }, AUTO_CHECK_MS)
    return () => {
      window.clearTimeout(firstRun)
      window.clearInterval(timer)
    }
  }, [devices.length])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 2600)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function refreshDevices() {
    try {
      setLoading(true)
      const [deviceResult, statusHistory] = await Promise.all([
        loadDevices({ pageSize: 5000 }),
        loadStatusHistory(),
      ])
      const loadedDevices = deviceResult.devices ?? []
      setDevices(loadedDevices)
      setServerCategories(deviceResult.categories ?? [])
      setHistory(statusHistory.length ? statusHistory : seedHistory(loadedDevices))
    } catch (error) {
      showToast(error.message, "error")
    } finally {
      setLoading(false)
    }
  }

  async function refreshTableDevices() {
    try {
      const result = await loadDevices({
        page: devicePage,
        pageSize: DEVICE_PAGE_SIZE,
        search: deviceSearch,
        category: selectedCategory,
        status: selectedStatus,
      })
      setTableDevices(result.devices ?? [])
      setDeviceTotal(result.total ?? 0)
      setServerCategories(result.categories ?? [])
    } catch (error) {
      showToast(error.message, "error")
    }
  }

  async function refreshReport() {
    try {
      setReportLoading(true)
      const events = await loadDowntimeReport(reportDays)
      setReportEvents(events)
    } catch (error) {
      showToast(error.message, "error")
    } finally {
      setReportLoading(false)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()
    try {
      if (editingId) {
        const updated = await updateDevice(editingId, form)
        setDevices((current) => current.map((device) => device.id === editingId ? updated : device))
        setTableDevices((current) => current.map((device) => device.id === editingId ? updated : device))
        showToast("Device updated successfully.")
      } else {
        const created = await createDevice(form)
        setDevices((current) => [created, ...current])
        if (activeTab === "devices") refreshTableDevices()
        showToast("Device added successfully.")
      }
      resetForm()
      setActiveTab("devices")
    } catch (error) {
      showToast(error.message, "error")
    }
  }

  function startEdit(device) {
    setEditingId(device.id)
    setForm({
      name: device.name,
      type: device.type,
      ipAddress: device.ipAddress,
      location: device.location,
    })
    setAddMode("manual")
    setActiveTab("add")
  }

  function resetForm() {
    setEditingId("")
    setForm(EMPTY_FORM)
  }

  async function handleDelete(id) {
    const ok = window.confirm("Delete this device?")
    if (!ok) return
    try {
      await deleteDevice(id)
      setDevices((current) => current.filter((device) => device.id !== id))
      setTableDevices((current) => current.filter((device) => device.id !== id))
      setDeviceTotal((current) => Math.max(current - 1, 0))
      showToast("Device deleted.")
    } catch (error) {
      showToast(error.message, "error")
    }
  }

  async function handleCheck(id) {
    try {
      setCheckingId(id)
      const checked = await checkDevice(id)
      setDevices((current) => current.map((device) => device.id === id ? checked : device))
      setTableDevices((current) => current.map((device) => device.id === id ? checked : device))
      showToast("Ping check completed.")
    } catch (error) {
      showToast(error.message, "error")
    } finally {
      setCheckingId("")
    }
  }

  async function handleCheckAll() {
    try {
      setCheckingAll(true)
      const checkedDevices = await checkAllDevices()
      setDevices(checkedDevices)
      if (activeTab === "devices") refreshTableDevices()
      updatePingReport(checkedDevices, "Manual")
      showToast("All devices checked.")
    } catch (error) {
      showToast(error.message, "error")
    } finally {
      setCheckingAll(false)
    }
  }

  async function runAutoCheck() {
    if (autoCheckingRef.current || checkingAll || !devices.length) return
    try {
      autoCheckingRef.current = true
      const [deviceResult, statusHistory] = await Promise.all([
        loadDevices({ pageSize: 5000 }),
        loadStatusHistory(),
      ])
      const latestDevices = deviceResult.devices ?? []
      setDevices(latestDevices)
      setServerCategories(deviceResult.categories ?? [])
      if (statusHistory.length) {
        setHistory(statusHistory)
      } else {
        updatePingReport(latestDevices, "Auto")
      }
    } catch {
      // Keep the existing dashboard state if a background refresh fails.
    } finally {
      autoCheckingRef.current = false
    }
  }

  async function handleUpload(file, category) {
    try {
      setUploading(true)
      const result = await uploadDevices(file, category)
      setDevices(result.devices ?? [])
      setDevicePage(1)
      setTableDevices((result.devices ?? []).slice(0, DEVICE_PAGE_SIZE))
      setDeviceTotal(result.devices?.length ?? 0)
      const skipped = result.skipped?.length ? ` ${result.skipped.length} skipped.` : ""
      showToast(`${result.imported} devices imported.${skipped}`)
      setActiveTab("devices")
    } catch (error) {
      showToast(error.message, "error")
    } finally {
      setUploading(false)
    }
  }

  function showToast(message, type = "success") {
    setToast({ id: Date.now(), message, type })
  }

  function confirmLogout() {
    setLogoutConfirmOpen(false)
    onLogout()
  }

  function updatePingReport(nextDevices, mode) {
    const checkedAt = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
    const summary = summarizeDevices(nextDevices)
    const offlineTotal = (summary.offline ?? 0) + (summary.critical ?? 0)
    setLastAutoCheck(checkedAt)
    setLastReport({ ...summary, offline: offlineTotal, checkedAt, mode })
    setHistory((current) => appendHistoryPoint(current, nextDevices, mode))
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={24} /></div>
          <div>
            <span>Regional Centre for Biotechnology</span>
            <h1>Alert Monitoring System</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="user-chip">
            <span>{currentUser?.fullName || currentUser?.username}</span>
            <strong>{currentUser?.role || "viewer"}</strong>
          </div>
          <button className="btn primary" type="button" onClick={handleCheckAll} disabled={checkingAll || !devices.length || !canManage}>
            <RefreshCw size={16} className={checkingAll ? "spin" : ""} />
            {checkingAll ? "Checking..." : "Check All"}
          </button>
          <button className="btn ghost" type="button" onClick={() => setLogoutConfirmOpen(true)} title="Logout">
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </header>

      {toast ? <div className={`toast ${toast.type}`}>{toast.message}</div> : null}

      {logoutConfirmOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setLogoutConfirmOpen(false)}>
          <div className="modal-card confirm-modal" role="dialog" aria-modal="true" aria-labelledby="logout-confirm-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Confirm Logout</p>
                <h2 id="logout-confirm-title">Logout from this session?</h2>
              </div>
              <button className="modal-close" type="button" onClick={() => setLogoutConfirmOpen(false)} aria-label="Close logout confirmation">
                <X size={20} />
              </button>
            </div>
            <div className="confirm-body">
              <p>Are you sure you want to logout from Alert Monitoring System?</p>
              <div className="form-actions">
                <button className="btn ghost" type="button" onClick={() => setLogoutConfirmOpen(false)}>
                  Cancel
                </button>
                <button className="btn danger" type="button" onClick={confirmLogout}>
                  Yes, Logout
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <main className="content">
        <Tabs
          activeTab={activeTab}
          onChange={setActiveTab}
          selectedStatus={selectedStatus}
          onStatusChange={setSelectedStatus}
          statusCounts={filterCounts}
          addMode={addMode}
          onAddModeChange={setAddMode}
          canManage={canManage}
          canAdmin={canAdmin}
        />

        {activeTab === "dashboard" ? (
          <Dashboard devices={devices} history={history} />
        ) : null}

        {activeTab === "devices" ? (
          <section className="panel table-panel">
            <div className="panel-header device-list-header">
              <div>
                <p className="eyebrow">Device Inventory</p>
                <h2>Device List</h2>
              </div>
              <div className="device-list-controls">
                <label className="category-filter">
                  <span>Category</span>
                  <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                    <option value="all">All Categories</option>
                    {categories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </label>
                <label className="category-filter device-search">
                  <span>Search</span>
                  <input
                    value={deviceSearch}
                    onChange={(event) => setDeviceSearch(event.target.value)}
                    placeholder="Name, IP, location"
                  />
                </label>
                <div className="table-meta">
                  {lastAutoCheck ? <span>Last checked {lastAutoCheck}</span> : <span>Auto check every 1 min</span>}
                  <span className="record-count">{loading ? "Loading..." : `${deviceTotal} Records`}</span>
                </div>
              </div>
            </div>
            <DeviceTable
              devices={filteredDevices}
              checkingId={checkingId}
              startIndex={(devicePage - 1) * DEVICE_PAGE_SIZE}
              onEdit={startEdit}
              onDelete={handleDelete}
              onCheck={handleCheck}
              canManage={canManage}
              canDelete={canDelete}
            />
            <div className="pagination-bar">
              <span>Page {devicePage} of {totalPages}</span>
              <div>
                <button className="btn ghost" type="button" disabled={devicePage <= 1} onClick={() => setDevicePage((page) => Math.max(page - 1, 1))}>
                  Previous
                </button>
                <button className="btn ghost" type="button" disabled={devicePage >= totalPages} onClick={() => setDevicePage((page) => Math.min(page + 1, totalPages))}>
                  Next
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "report" ? (
          <DowntimeReport
            events={reportEvents}
            days={reportDays}
            onDaysChange={setReportDays}
            loading={reportLoading}
          />
        ) : null}

        {activeTab === "users" && canAdmin ? (
          <UserManagement />
        ) : null}

        {activeTab === "add" && canManage ? (
          <section className={addMode === "manual" ? "add-layout single" : "add-layout upload-only"}>
            {addMode === "manual" ? (
              <div className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">{editingId ? "Update Device" : "Manual Entry"}</p>
                    <h2>{editingId ? "Edit Device" : "Add Device"}</h2>
                  </div>
                </div>
                <DeviceForm
                  value={form}
                  onChange={setForm}
                  onSubmit={handleSubmit}
                  onCancel={resetForm}
                  editing={Boolean(editingId)}
                />
              </div>
            ) : null}

            {addMode === "bulk" ? (
              <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Bulk Upload</p>
                  <h2>Upload Devices</h2>
                </div>
              </div>
              <BulkUpload onUpload={handleUpload} uploading={uploading} categories={categories} />
            </div>
            ) : null}
          </section>
        ) : null}
      </main>
    </div>
  )
}

function getCategories(devices) {
  return [...new Set(
    devices
      .map((device) => String(device.type || "").trim())
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b))
}

function getFilterCounts(devices) {
  const summary = summarizeDevices(devices)
  return {
    total: summary.total,
    online: summary.online,
    warning: summary.warning,
    offline: (summary.offline ?? 0) + (summary.critical ?? 0),
  }
}

function filterDevices(devices, category, status) {
  return devices.filter((device) => {
    const type = String(device.type || "").trim()
    const deviceStatus = String(device.status || "unknown").toLowerCase()
    const categoryMatches = category === "all" || type === category
    const statusMatches =
      status === "total" ||
      deviceStatus === status ||
      (status === "offline" && deviceStatus === "critical")
    return categoryMatches && statusMatches
  })
}

function loadHistory() {
  try {
    const saved = window.localStorage.getItem(HISTORY_STORAGE_KEY)
    const parsed = saved ? JSON.parse(saved) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveHistory(history) {
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history))
  } catch {
    // Chart history is helpful, but the app can run without browser storage.
  }
}

function seedHistory(devices) {
  if (!devices.length) return []
  const seeded = [createHistoryPoint(devices, "Current")]
  saveHistory(seeded)
  return seeded
}

function appendHistoryPoint(current, devices, mode) {
  const next = [...current, createHistoryPoint(devices, mode)].slice(-MAX_HISTORY_POINTS)
  saveHistory(next)
  return next
}

function createHistoryPoint(devices, mode) {
  const now = new Date()
  const summary = summarizeDevices(devices)
  const offlineTotal = (summary.offline ?? 0) + (summary.critical ?? 0)
  return {
    id: now.toISOString(),
    label: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    checkedAt: now.toISOString(),
    mode,
    total: summary.total,
    online: summary.online,
    offline: offlineTotal,
  }
}

export default App
