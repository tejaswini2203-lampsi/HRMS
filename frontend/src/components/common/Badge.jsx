import './Badge.css'

const map = {
  success: 'badge--success',
  warning: 'badge--warning',
  danger: 'badge--danger',
  info: 'badge--info',
  neutral: 'badge--neutral',
  primary: 'badge--primary',
}

export default function Badge({ children, variant = 'neutral', className = '' }) {
  return (
    <span className={`badge ${map[variant] || map.neutral} ${className}`.trim()}>
      {children}
    </span>
  )
}

export function statusBadgeVariant(status) {
  const s = String(status || '').toLowerCase()
  if (['active', 'hr approved', 'booked', 'completed', 'sent', 'safe'].includes(s))
    return 'success'
  if (['pending', 'hod approved', 'expiring soon', 'proposed'].includes(s))
    return 'warning'
  if (['inactive', 'rejected', 'cancelled', 'expired', 'critical', 'closed'].includes(s))
    return 'danger'
  return 'neutral'
}
