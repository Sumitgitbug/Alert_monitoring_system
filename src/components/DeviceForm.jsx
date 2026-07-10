import { Save, X } from "lucide-react"

const DEVICE_TYPES = ["Router", "Switch", "Server", "Firewall", "Access Point", "CCTV", "Printer", "Other"]

function DeviceForm({ value, onChange, onSubmit, onCancel, editing }) {
  return (
    <form className="device-form" onSubmit={onSubmit}>
      <div className="form-grid">
        <label>
          <span>Device Name</span>
          <input
            value={value.name}
            onChange={(event) => onChange({ ...value, name: event.target.value })}
            placeholder="Core Switch"
            required
          />
        </label>
        <label>
          <span>Type</span>
          <select value={value.type} onChange={(event) => onChange({ ...value, type: event.target.value })} required>
            <option value="">Select type</option>
            {DEVICE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>
        <label>
          <span>IP Address</span>
          <input
            value={value.ipAddress}
            onChange={(event) => onChange({ ...value, ipAddress: event.target.value })}
            placeholder="192.168.1.1"
            required
          />
        </label>
        <label>
          <span>Location</span>
          <input
            value={value.location}
            onChange={(event) => onChange({ ...value, location: event.target.value })}
            placeholder="Server Room"
            required
          />
        </label>
      </div>
      <div className="form-actions">
        {editing ? (
          <button className="btn ghost" type="button" onClick={onCancel}>
            <X size={16} />
            Cancel
          </button>
        ) : null}
        <button className="btn primary" type="submit">
          <Save size={16} />
          {editing ? "Update Device" : "Add Device"}
        </button>
      </div>
    </form>
  )
}

export default DeviceForm
