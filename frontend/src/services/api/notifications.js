import { apiRequest } from './client'
import { mapNotification } from './mappers'

function asArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload == null) return []
  return [payload]
}

export async function getNotifications() {
  const rows = await apiRequest('/notifications')
  const list = asArray(rows).map(mapNotification)
  return { data: list, meta: { total: list.length } }
}

export async function markNotificationRead(id) {
  const row = await apiRequest(`/notifications/${id}/read`, { method: 'PATCH' })
  return { data: mapNotification(row) }
}

export async function markAllNotificationsRead() {
  await apiRequest('/notifications/read-all', { method: 'PATCH' })
}
