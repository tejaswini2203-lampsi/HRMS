/**
 * Central HTTP client for NestJS EICS API.
 * Base URL: VITE_API_BASE_URL or http://localhost:3000
 */

const isLocalhost =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1'

// Localhost communicates directly with http://localhost:3000.
// Production/Vercel routes through the Vercel application origin proxy (/api)
// to forward to ngrok server-side, preventing browser CORS preflight blocks.
const resolveBaseUrl = () => {
  if (isLocalhost) return 'http://localhost:3000'
  const envUrl = (import.meta.env.VITE_API_BASE_URL || '').trim()
  if (!envUrl || envUrl.includes('ngrok')) {
    return '/api'
  }
  return envUrl
}

const BASE_URL = resolveBaseUrl().replace(/\/$/, '')

const TOKEN_KEY = 'eics_access_token'

export class ApiError extends Error {
  constructor(
    message,
    { status = 0, path = '', details = null } = {},
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.path = path
    this.details = details
  }
}

export function getAccessToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAccessToken(token) {
  if (!token) {
    sessionStorage.removeItem(TOKEN_KEY)
    return
  }
  sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearAccessToken() {
  sessionStorage.removeItem(TOKEN_KEY)
}

function friendlyMessage(status, body, fallback) {
  if (body && typeof body === 'object') {
    if (typeof body.message === 'string') return body.message
    if (Array.isArray(body.message)) return body.message.join(', ')
  }
  if (status === 401) return 'Session expired. Please sign in again.'
  if (status === 403) return 'You do not have permission for this action.'
  if (status === 404) return 'Record not found.'
  if (status === 400) return 'Invalid request. Please check the form fields.'
  if (status >= 500) return 'Server error. Please try again shortly.'
  return fallback || 'Request failed.'
}

/**
 * @param {string} path - e.g. '/employees'
 * @param {{ method?: string, body?: any, headers?: Record<string,string>, auth?: boolean }} options
 */
export async function apiRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const cleanPath = path.startsWith('/') ? path : `/${path}`
  const url =
    BASE_URL === '/api' && cleanPath.startsWith('/api/')
      ? cleanPath
      : `${BASE_URL}${cleanPath}`
  const useAuth = options.auth !== false

  const shouldSkipNgrokWarning =
    !isLocalhost ||
    (typeof BASE_URL === 'string' && BASE_URL.includes('ngrok'))

  const headers = {
    Accept: 'application/json',
    ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(shouldSkipNgrokWarning ? { 'ngrok-skip-browser-warning': 'true' } : {}),
    ...options.headers,
  }

  if (useAuth) {
    const token = getAccessToken()
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let response
  try {
    response = await fetch(url, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    })
  } catch {
    throw new ApiError(
      'Cannot reach the EICS API. Confirm the backend is running on port 3000.',
      { status: 0, path },
    )
  }

  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }

  if (!response.ok) {
    throw new ApiError(friendlyMessage(response.status, data, text), {
      status: response.status,
      path,
      details: data,
    })
  }

  return data
}

export function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
