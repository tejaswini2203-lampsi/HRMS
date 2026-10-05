export function formatDate(value) {
  if (!value) return '—'
  try {
    const d = value instanceof Date ? value : new Date(value)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
  } catch (e) {
    return '—'
  }
}

/** Compact cell date, e.g. "24 Aug" */
export function formatCompactDate(value) {
  if (!value) return ''
  try {
    const d = value instanceof Date ? value : new Date(value)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    })
  } catch (e) {
    return ''
  }
}

/** Compact range for leave cells, e.g. "18 Jul–01 Sep" */
export function formatCompactDateRange(from, to) {
  const a = formatCompactDate(from)
  const b = formatCompactDate(to)
  if (a && b) return `${a}–${b}`
  return a || b || ''
}

export function formatDateTime(value) {
  if (!value) return '—'
  try {
    const d = value instanceof Date ? value : new Date(value)
    if (isNaN(d.getTime())) return '—'
    return d.toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch (e) {
    return '—'
  }
}

export function daysUntil(dateStr) {
  const target = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24))
}

export function expiryCountdownLabel(expiryDate) {
  const days = daysUntil(expiryDate)
  if (days > 0) return `Expires in ${days} days`
  if (days === 0) return 'Expires today'
  return `Expired ${Math.abs(days)} days ago`
}
