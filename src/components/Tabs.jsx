import { Check } from "lucide-react"
import { useRef, useState } from "react"

const DEVICE_LIST_OPTIONS = [
  { id: "total", label: "All Devices" },
  { id: "online", label: "Online" },
  { id: "offline", label: "Offline" },
  { id: "warning", label: "Warning" },
  { id: "report", label: "Report" },
]

const ADD_DEVICE_OPTIONS = [
  { id: "manual", label: "Manual Entry" },
  { id: "bulk", label: "Bulk Upload" },
]

function Tabs({
  activeTab,
  onChange,
  selectedStatus,
  onStatusChange,
  statusCounts = {},
  addMode,
  onAddModeChange,
  canManage = false,
  canAdmin = false,
}) {
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const deviceCloseTimer = useRef(null)
  const addCloseTimer = useRef(null)

  function openMenu(setOpen, timerRef) {
    // Cancel pending close when the pointer comes back to the menu.
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setOpen(true)
  }

  function closeMenuSoon(setOpen, timerRef) {
    // Keep hover menus open briefly so small pointer slips do not close them.
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
    }
    timerRef.current = window.setTimeout(() => {
      setOpen(false)
      timerRef.current = null
    }, 1000)
  }

  function selectDeviceList(optionId) {
    if (optionId === "report") {
      onChange("report")
      if (deviceCloseTimer.current) window.clearTimeout(deviceCloseTimer.current)
      setDeviceMenuOpen(false)
      return
    }
    onStatusChange(optionId)
    onChange("devices")
    if (deviceCloseTimer.current) window.clearTimeout(deviceCloseTimer.current)
    setDeviceMenuOpen(false)
  }

  function selectAddMode(optionId) {
    onAddModeChange(optionId)
    onChange("add")
    if (addCloseTimer.current) window.clearTimeout(addCloseTimer.current)
    setAddMenuOpen(false)
  }

  return (
    <div className="tabs">
      <button
        type="button"
        className={activeTab === "dashboard" ? "active" : ""}
        onClick={() => onChange("dashboard")}
      >
        Dashboard
      </button>

      <div
        className={deviceMenuOpen ? "tab-dropdown open" : "tab-dropdown"}
        onMouseEnter={() => openMenu(setDeviceMenuOpen, deviceCloseTimer)}
        onMouseLeave={() => closeMenuSoon(setDeviceMenuOpen, deviceCloseTimer)}
        onFocus={() => openMenu(setDeviceMenuOpen, deviceCloseTimer)}
      >
        <button
          type="button"
          className={activeTab === "devices" || activeTab === "report" ? "tab-menu-trigger active" : "tab-menu-trigger"}
          onClick={() => {
            onChange("devices")
            setDeviceMenuOpen((open) => !open)
          }}
          aria-expanded={deviceMenuOpen}
          aria-haspopup="menu"
        >
          Device List
        </button>
        {deviceMenuOpen ? (
          <div className="tab-menu" role="menu">
            {DEVICE_LIST_OPTIONS.map((option) => (
              <button
                className="tab-menu-item"
                key={option.id}
                type="button"
                role="menuitem"
                onClick={() => selectDeviceList(option.id)}
              >
                <span>{option.label}</span>
                <strong>{option.id === "report" ? "" : statusCounts[option.id] ?? 0}</strong>
                {(option.id === "report" ? activeTab === "report" : selectedStatus === option.id) ? <Check size={15} /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {canManage ? (
        <div
          className={addMenuOpen ? "tab-dropdown open" : "tab-dropdown"}
          onMouseEnter={() => openMenu(setAddMenuOpen, addCloseTimer)}
          onMouseLeave={() => closeMenuSoon(setAddMenuOpen, addCloseTimer)}
          onFocus={() => openMenu(setAddMenuOpen, addCloseTimer)}
        >
          <button
            type="button"
            className={activeTab === "add" ? "tab-menu-trigger active" : "tab-menu-trigger"}
            onClick={() => {
              onChange("add")
              setAddMenuOpen((open) => !open)
            }}
            aria-expanded={addMenuOpen}
            aria-haspopup="menu"
          >
            Add Device
          </button>
          {addMenuOpen ? (
            <div className="tab-menu" role="menu">
              {ADD_DEVICE_OPTIONS.map((option) => (
                <button
                  className="tab-menu-item"
                  key={option.id}
                  type="button"
                  role="menuitem"
                  onClick={() => selectAddMode(option.id)}
                >
                  <span>{option.label}</span>
                  <strong />
                  {addMode === option.id ? <Check size={15} /> : null}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {canAdmin ? (
        <button
          type="button"
          className={activeTab === "users" ? "active" : ""}
          onClick={() => onChange("users")}
        >
          Users
        </button>
      ) : null}
    </div>
  )
}

export default Tabs
