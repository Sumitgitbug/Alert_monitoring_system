import { UserPlus, X } from "lucide-react"
import { useEffect, useState } from "react"

import { createUser, loadUsers } from "../api/devices.js"

const EMPTY_USER = { fullName: "", username: "", password: "", role: "viewer" }

const ROLE_LABELS = {
  admin: "Admin",
  operator: "User",
  viewer: "Viewer",
}

function UserManagement() {
  const [users, setUsers] = useState([])
  const [form, setForm] = useState(EMPTY_USER)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [pageError, setPageError] = useState("")
  const [modalError, setModalError] = useState("")

  useEffect(() => {
    refreshUsers()
  }, [])

  async function refreshUsers() {
    try {
      setLoading(true)
      setUsers(await loadUsers())
    } catch (err) {
      setPageError(err?.payload?.error || err.message || "Failed to load users.")
    } finally {
      setLoading(false)
    }
  }

  function openCreateUser() {
    setForm(EMPTY_USER)
    setMessage("")
    setModalError("")
    setModalOpen(true)
  }

  function closeCreateUser() {
    if (saving) return
    setModalOpen(false)
    setForm(EMPTY_USER)
    setModalError("")
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setModalError("")
    setMessage("")
    try {
      setSaving(true)
      const user = await createUser(form)
      setUsers((current) => [user, ...current])
      setForm(EMPTY_USER)
      setMessage("User created successfully.")
      setModalOpen(false)
    } catch (err) {
      setModalError(err?.payload?.error || err.message || "Failed to create user.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="users-layout">
      <div className="panel table-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Access Control</p>
            <h2>Users</h2>
          </div>
          <div className="users-header-actions">
            <span className="record-count">{loading ? "Loading..." : `${users.length} Users`}</span>
            <button className="btn primary" type="button" onClick={openCreateUser}>
              <UserPlus size={18} />
              Add Users
            </button>
          </div>
        </div>
        {message ? <div className="form-message success inline-message">{message}</div> : null}
        {pageError ? <div className="form-message error inline-message">{pageError}</div> : null}
        <div className="table-wrap">
          <table className="device-table users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.username}>
                  <td><strong>{user.fullName || "-"}</strong></td>
                  <td className="mono">{user.username}</td>
                  <td><span className="role-pill">{ROLE_LABELS[user.role] || user.role}</span></td>
                  <td>{user.isActive ? "Active" : "Disabled"}</td>
                </tr>
              ))}
              {!users.length ? (
                <tr>
                  <td colSpan="4" className="empty-row">No users found.</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={closeCreateUser}>
          <div className="modal-card user-modal" role="dialog" aria-modal="true" aria-labelledby="create-user-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">New Login</p>
                <h2 id="create-user-title">Add Users</h2>
              </div>
              <button className="modal-close" type="button" onClick={closeCreateUser} aria-label="Close add user popup">
                <X size={20} />
              </button>
            </div>

            <form className="device-form" onSubmit={handleSubmit}>
              <div className="form-grid one-col">
                <label>
                  <span>Full Name</span>
                  <input value={form.fullName} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} placeholder="Enter full name" />
                </label>
                <label>
                  <span>Email Address</span>
                  <input type="email" value={form.username} onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))} placeholder="user@rcb.res.in" required />
                </label>
                <label>
                  <span>Password</span>
                  <input type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Minimum 8 characters" minLength={8} required />
                </label>
                <label>
                  <span>Role</span>
                  <select value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}>
                    <option value="viewer">Viewer</option>
                    <option value="operator">User</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
              </div>
              {modalError ? <div className="form-message error">{modalError}</div> : null}
              <div className="form-actions">
                <button className="btn ghost" type="button" onClick={closeCreateUser} disabled={saving}>
                  Cancel
                </button>
                <button className="btn primary" type="submit" disabled={saving}>
                  {saving ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

export default UserManagement
