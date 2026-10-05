import { apiRequest, clearAccessToken, setAccessToken } from './client'

export async function loginApi(username, password) {
  const data = await apiRequest('/auth/login', {
    method: 'POST',
    body: { username, password },
    auth: false,
  })
  if (data?.accessToken) {
    setAccessToken(data.accessToken)
  }
  return data
}

export async function logoutApi() {
  try {
    await apiRequest('/auth/logout', { method: 'POST' })
  } catch {
    // Still clear local session even if network fails
  } finally {
    clearAccessToken()
  }
  return { ok: true }
}

export async function getAuthUsers() {
  const rows = await apiRequest('/auth/users')
  return { data: Array.isArray(rows) ? rows : [] }
}

export async function updateAuthUserRole(userId, role) {
  const row = await apiRequest(`/auth/users/${userId}/role`, {
    method: 'PATCH',
    body: { role },
  })
  return { data: row }
}

export async function updateAuthUserStatus(userId, isActive) {
  const row = await apiRequest(`/auth/users/${userId}/status`, {
    method: 'PATCH',
    body: { isActive: Boolean(isActive) },
  })
  return { data: row }
}
