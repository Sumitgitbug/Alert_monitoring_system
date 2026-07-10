import { Edit3, Play, Trash2 } from "lucide-react"

import StatusBadge from "./StatusBadge.jsx"
import { formatDateTime } from "../utils/status.js"

function DeviceTable({ devices, onEdit, onDelete, onCheck, checkingId, startIndex = 0, canManage = false, canDelete = false }) {
  return (
    <div className="table-wrap">
      <table className="device-table">
        <thead>
          <tr>
            <th className="serial-col">S.No.</th>
            <th>Device Name</th>
            <th>Type</th>
            <th>IP Address</th>
            <th>Location</th>
            <th>Last Checked</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((device, index) => (
            <tr key={device.id}>
              <td className="serial-col">{startIndex + index + 1}</td>
              <td>
                <strong>{device.name}</strong>
                <small>{device.message || "No message"}</small>
              </td>
              <td>{device.type}</td>
              <td className="mono">{device.ipAddress}</td>
              <td>{device.location}</td>
              <td>
                <div>{formatDateTime(device.lastChecked)}</div>
                {device.responseMs !== null && device.responseMs !== undefined ? (
                  <small>{device.responseMs} ms</small>
                ) : null}
              </td>
              <td><StatusBadge status={device.status} /></td>
              <td>
                {canManage ? (
                  <div className="row-actions">
                    <button className="icon-btn blue" type="button" onClick={() => onCheck(device.id)} disabled={checkingId === device.id} title="Ping now">
                      <Play size={15} />
                    </button>
                    <button className="icon-btn green" type="button" onClick={() => onEdit(device)} title="Edit device">
                      <Edit3 size={15} />
                    </button>
                    {canDelete ? (
                      <button className="icon-btn red" type="button" onClick={() => onDelete(device.id)} title="Delete device">
                        <Trash2 size={15} />
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <span className="read-only-label">View only</span>
                )}
              </td>
            </tr>
          ))}
          {!devices.length ? (
            <tr>
              <td colSpan="8" className="empty-row">No devices added yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

export default DeviceTable
