import { AuthUser } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api'
const TOKEN_KEY = 'studyflow_auth_token'
const USER_KEY = 'studyflow_auth_user'

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
  // Purge any legacy or stale IDs before setting new session
  localStorage.removeItem('studyflow_user_id')
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  window.dispatchEvent(new Event('studyflow:auth-changed'))
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
  localStorage.removeItem('studyflow_user_id')
  localStorage.removeItem('studyflow_guest_mode')
  localStorage.removeItem('studyflow_plan_settings')
  window.dispatchEvent(new Event('studyflow:auth-changed'))
}

export function getUserId(): string | null {
  const user = getStoredUser()
  return user?.userId || null
}

async function request(path: string, options: RequestInit = {}) {
  const token = getAuthToken()
  const userId = getUserId()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  if (userId) {
    headers['x-user-id'] = userId
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

  if (res.status === 401 && !path.includes('/auth/login') && !path.includes('/auth/register') && !path.includes('/auth/guest')) {
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

