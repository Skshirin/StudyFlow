import { AuthUser } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'
const TOKEN_KEY = 'studyflow_auth_token'
const USER_KEY = 'studyflow_auth_user'
const LEGACY_USER_ID_KEY = 'studyflow_user_id'

export function getAuthToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function getStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore parsing failure
  }
  return null
}

export function setAuthSession(token: string, user: AuthUser) {
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  localStorage.setItem(LEGACY_USER_ID_KEY, user.userId)
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  // note: we do not necessarily remove all cached plan settings, but clear auth
  window.dispatchEvent(new Event('studyflow:auth-changed'))
}

export function getUserId(): string {
  const user = getStoredUser()
  if (user?.userId) return user.userId

  let id = localStorage.getItem(LEGACY_USER_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(LEGACY_USER_ID_KEY, id)
  }
  return id
}

async function request(path: string, options: RequestInit = {}) {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-user-id': getUserId(),
    ...(options.headers as Record<string, string> || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  })

  let body: any = null
  try {
    body = await res.json()
  } catch {
    // no JSON body
  }

  if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/register')) {
    clearAuthSession()
  }

  if (!res.ok) {
    const message = body?.error || `Request failed (${res.status})`
    throw new Error(message)
  }

  return body
}

export const api = {
  get: (path: string) => request(path, { method: 'GET' }),
  post: (path: string, data?: unknown) =>
    request(path, { method: 'POST', body: data !== undefined ? JSON.stringify(data) : undefined }),
  put: (path: string, data?: unknown) =>
    request(path, { method: 'PUT', body: data !== undefined ? JSON.stringify(data) : undefined }),
  del: (path: string) => request(path, { method: 'DELETE' }),
}
