import { Lock, Mail, UserRound } from "lucide-react"
import { useEffect, useState } from "react"

import { getAuthStatus, loadCurrentUser, login, logout, setupAdmin } from "../api/devices.js"

function AuthGate({ children }) {
  const [loading, setLoading] = useState(true)
  const [setupRequired, setSetupRequired] = useState(false)
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({ username: "", password: "", fullName: "" })
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function hydrateAuth() {
      try {
        const [status, currentUser] = await Promise.all([getAuthStatus(), loadCurrentUser()])
        if (cancelled) return
        setSetupRequired(Boolean(status?.setupRequired))
        setUser(currentUser)
      } catch (err) {
        if (!cancelled) setError(err?.payload?.error || "Authentication service is not available.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    hydrateAuth()
    return () => { cancelled = true }
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const nextUser = setupRequired
        ? await setupAdmin(form)
        : await login({ username: form.username, password: form.password })
      setUser(nextUser)
      setSetupRequired(false)
      setForm({ username: "", password: "", fullName: "" })
    } catch (err) {
      setError(err?.payload?.error || err.message || "Authentication failed.")
    } finally {
      setSubmitting(false)
    }
  }

  function handleLogout() {
    logout()
    setUser(null)
  }

  if (loading) {
    return <div className="auth-loading">Loading secure monitoring...</div>
  }

  if (user) {
    return children({ user, onLogout: handleLogout })
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-logo-frame">
          <img src="/rcb_logo.svg" alt="RCB logo" />
        </div>
        <div className="auth-heading">
          <h1>Alert Monitoring System</h1>
          <h2>{setupRequired ? "Create Admin Account" : "Sign in to Dashboard"}</h2>
          <p>
            {setupRequired
              ? "Create the first administrator account for secure access to the RCB monitoring dashboard."
              : "A digital monitoring system for tracking RCB network devices, uptime alerts, and downtime reports."}
          </p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {setupRequired ? (
            <label>
              <span>Full Name</span>
              <div className="auth-input">
                <UserRound size={19} />
                <input
                  value={form.fullName}
                  onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                  placeholder="Your name"
                  autoComplete="name"
                />
              </div>
            </label>
          ) : null}

          <label>
            <span>Email Address</span>
            <div className="auth-input">
              <Mail size={19} />
              <input
                type="email"
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="you@example.com"
                autoComplete="username"
                required
              />
            </div>
          </label>

          <label>
            <span>Password</span>
            <div className="auth-input">
              <Lock size={19} />
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="........"
                autoComplete={setupRequired ? "new-password" : "current-password"}
                minLength={setupRequired ? 8 : undefined}
                required
              />
            </div>
            {setupRequired ? <small>Use at least 8 characters.</small> : null}
          </label>

          {error ? <div className="auth-error">{error}</div> : null}

          <button className="auth-submit" type="submit" disabled={submitting}>
            <span className="auth-submit-logo">
              <img src="/rcb_logo.svg" alt="" />
            </span>
            {submitting ? "Please wait..." : setupRequired ? "Create Admin Account" : "Sign in "}
          </button>
        </form>
      </section>
    </main>
  )
}

export default AuthGate
