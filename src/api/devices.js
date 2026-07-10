const API_BASE_URL = "http://127.0.0.1:5050"
const AUTH_TOKEN_KEY = "alert-monitoring.authToken.v1"

export function getAuthToken() {
  if (typeof window === "undefined") return ""
  return window.localStorage.getItem(AUTH_TOKEN_KEY) || ""
}

export function setAuthToken(token) {
  if (typeof window === "undefined") return
  if (token) window.localStorage.setItem(AUTH_TOKEN_KEY, token)
  else window.localStorage.removeItem(AUTH_TOKEN_KEY)
}

async function requestJson(path, options = {}) {
  const token = getAuthToken()
  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers ?? {}),
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers })
  if (!response.ok) {
    let payload = null
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
    if (response.status === 401) setAuthToken("")
    const error = new Error(payload?.error || `Request failed: ${response.status}`)
    error.status = response.status
    error.payload = payload
    throw error
  }
  if (response.status === 204) return null
  return response.json()
}

export async function getAuthStatus() {
  return requestJson("/api/auth/status")
}

export async function setupAdmin(payload) {
  const result = await requestJson("/api/auth/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  setAuthToken(result.token)
  return result.user
}

export async function login(payload) {
  const result = await requestJson("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  setAuthToken(result.token)
  return result.user
}

export async function loadCurrentUser() {
  if (!getAuthToken()) return null
  try {
    const result = await requestJson("/api/auth/me")
    return result.user
  } catch {
    setAuthToken("")
    return null
  }
}

export function logout() {
  setAuthToken("")
}

export async function loadUsers() {
  const result = await requestJson("/api/users")
  return result.users ?? []
}

export async function createUser(payload) {
  const result = await requestJson("/api/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  return result.user
}

export async function loadDevices(options = {}) {
  const params = new URLSearchParams()
  params.set("page", String(options.page ?? 1))
  params.set("pageSize", String(options.pageSize ?? 5000))
  if (options.search) params.set("search", options.search)
  if (options.category) params.set("category", options.category)
  if (options.status) params.set("status", options.status)
  const payload = await requestJson(`/api/devices?${params.toString()}`)
  return {
    devices: payload.devices ?? [],
    total: payload.total ?? payload.devices?.length ?? 0,
    categories: payload.categories ?? [],
  }
}

export async function loadStatusHistory(minutes = 60 * 24 * 30) {
  const payload = await requestJson(`/api/status-history?minutes=${encodeURIComponent(minutes)}`)
  return payload.history ?? []
}

export async function loadDowntimeReport(days = 7) {
  const payload = await requestJson(`/api/reports/downtime?days=${encodeURIComponent(days)}&limit=500`)
  return payload.events ?? []
}

export async function createDevice(payload) {
  const result = await requestJson("/api/devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  return result.device
}

export async function updateDevice(id, payload) {
  const result = await requestJson(`/api/devices/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  })
  return result.device
}

export async function deleteDevice(id) {
  await requestJson(`/api/devices/${encodeURIComponent(id)}`, { method: "DELETE" })
}

export async function checkDevice(id) {
  const result = await requestJson(`/api/devices/${encodeURIComponent(id)}/check`, { method: "POST" })
  return result.device
}

export async function checkAllDevices() {
  const result = await requestJson("/api/devices/check-all", { method: "POST" })
  return result.devices ?? []
}

export async function uploadDevices(file, category = "") {
  const formData = new FormData()
  formData.append("file", file)
  if (category) formData.append("category", category)
  return requestJson("/api/devices/bulk-upload", {
    method: "POST",
    body: formData,
  })
}
