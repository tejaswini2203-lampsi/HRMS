import { SLA_RULES } from '../config/featureFlags'
import { daysUntil } from './dates'

/**
 * Corporate compliance tone for matrix badges.
 * green = compliant, amber = 16–60 day renewal, red = ≤15 days or expired
 */
export function complianceTone(dateStr) {
  if (!dateStr) return 'empty'
  const days = daysUntil(dateStr)
  if (days <= 15) return 'critical'
  if (days <= 60) return 'renewal'
  return 'ok'
}

/**
 * Countdown badge text, e.g. "14d overdue", "in 45 days", "today"
 */
export function countdownBadge(dateStr) {
  const days = daysUntil(dateStr)
  if (days === 0) return 'today'
  if (days < 0) return `${Math.abs(days)}d overdue`
  return `in ${days} days`
}

/**
 * Evaluate SLA status for a compliance item type.
 * Returns { level: 'ok'|'watch'|'action'|'overdue'|'beyond', label, owner, days }
 */
export function evaluateSla(type, dateStr, flags = {}) {
  if (!dateStr) {
    return { level: 'ok', label: '—', owner: '', days: null, warn: false }
  }

  const days = daysUntil(dateStr)
  const ownerDefault = SLA_RULES[type]?.owner ?? ''

  if (days < 0) {
    return {
      level: 'overdue',
      label: countdownBadge(dateStr),
      owner: ownerDefault,
      days,
      warn: true,
    }
  }

  if (type === 'passport') {
    const esc90 = flags.passportEscalation90Days
    const esc30 = flags.passportEscalation30Days
    if (esc30 && days <= SLA_RULES.passport.escalation30) {
      return {
        level: 'action',
        label: '30d escalation',
        owner: '',
        days,
        warn: true,
      }
    }
    if (esc90 && days <= SLA_RULES.passport.escalation90) {
      return {
        level: 'action',
        label: '90d escalation',
        owner: '',
        days,
        warn: true,
      }
    }
    if (flags.passportWarning40Days !== false && days <= SLA_RULES.passport.warningDays) {
      return {
        level: 'action',
        label: '40d warning',
        owner: '',
        days,
        warn: true,
      }
    }
    if (flags.passportAlert180Days !== false && days <= SLA_RULES.passport.baselineDays) {
      return {
        level: 'watch',
        label: '180d alert',
        owner: '',
        days,
        warn: true,
      }
    }
  }

  if (type === 'flight') {
    if (days <= SLA_RULES.flight.leadDays) {
      return {
        level: 'action',
        label: 'Finance cutoff',
        owner: 'F',
        days,
        warn: true,
      }
    }
  }

  if (type === 'vehicle') {
    if (days <= SLA_RULES.vehicle.leadDays) {
      return {
        level: 'watch',
        label: 'Review',
        owner: '',
        days,
        warn: true,
      }
    }
  }

  if (type === 'leave') {
    if (days <= 7) {
      return {
        level: 'watch',
        label: 'Upcoming leave',
        owner: 'H',
        days,
        warn: false,
      }
    }
  }

  if (days > 30) {
    return {
      level: 'beyond',
      label: countdownBadge(dateStr),
      owner: ownerDefault,
      days,
      warn: false,
    }
  }

  return {
    level: 'ok',
    label: countdownBadge(dateStr),
    owner: ownerDefault,
    days,
    warn: false,
  }
}

/** Action matrix columns — active 4-module scope only */
export const ACTION_COLUMNS = [
  { key: 'LVE', type: 'leave', label: 'Leave', color: '#F97316' },
  { key: 'PPT', type: 'passport', label: 'Passport', color: '#BE185D' },
  { key: 'VEH', type: 'vehicle', label: 'Vehicle', color: '#0F766E' },
  { key: 'FLT', type: 'flight', label: 'Flight', color: '#0E7490' },
]
