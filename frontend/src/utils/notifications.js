export function getNotificationLink(n) {
  const entity = String(n?.relatedEntity || n?.typeKey || '').toLowerCase()
  if (entity.includes('leave')) return '/leaves'
  if (entity.includes('passport')) return '/passports'
  if (entity.includes('vehicle')) return '/vehicles'
  if (entity.includes('flight')) return '/flights'
  if (entity.includes('employee')) {
    return n?.relatedId ? `/employees/${n.relatedId}` : '/employees'
  }
  return '/notifications'
}
