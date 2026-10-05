import { SUBSIDIARIES } from './subsidiaries'

const RULES = {
  uae: {
    emailPattern: /^[^\s@]+@([^\s@]+\.)?(eics-uae\.com|eicscomp\.com)$/i,
    emailHint: 'Use @eics-uae.com or corporate @eicscomp.com',
    passportPattern: /^[A-Z0-9]{6,12}$/i,
    passportHint: 'UAE passport / Emirates ID reference (6–12 alphanumeric)',
    leaveTypes: ['Annual', 'Sick', 'Unpaid', 'Maternity'],
    leaveHint: 'MOHRE leave rules apply; WPS payroll cutoff on 28th.',
    idLabel: 'Emirates ID / Labour Card',
  },
  saudi: {
    emailPattern: /^[^\s@]+@([^\s@]+\.)?(eics-sa\.com|eicscomp\.com)$/i,
    emailHint: 'Use @eics-sa.com or corporate @eicscomp.com',
    passportPattern: /^[A-Z0-9]{6,12}$/i,
    passportHint: 'Iqama / passport number (6–12 alphanumeric)',
    leaveTypes: ['Annual', 'Sick', 'Hajj', 'Unpaid'],
    leaveHint: 'Qiwa & GOSI compliance; annual leave per Saudi labour law.',
    idLabel: 'Iqama / National ID',
  },
  india: {
    emailPattern: /^[^\s@]+@([^\s@]+\.)?(eics-india\.com|eicscomp\.com)$/i,
    emailHint: 'Use @eics-india.com or corporate @eicscomp.com',
    passportPattern: /^[A-Z][0-9]{7}$/i,
    passportHint: 'Indian passport format: one letter + seven digits (e.g. A1234567)',
    leaveTypes: ['Earned', 'Casual', 'Sick', 'Maternity', 'Comp-off'],
    leaveHint: 'Shops & Establishments / PF-ESI rules vary by state.',
    idLabel: 'Aadhaar / PAN (reference)',
  },
}

/** Dashboard / operations widgets that adapt to subsidiary labour law. */
const COMPLIANCE_WIDGETS = {
  uae: [
    {
      key: 'visa',
      label: 'Visa Expiries',
      tag: 'MOHRE',
      icon: 'passport',
      to: '/passports',
      metricKey: 'attentionPassports',
      hint: (n) =>
        n
          ? `${n} visa/Emirates ID renewal${n === 1 ? '' : 's'} due`
          : 'No visa renewals in the SLA window',
    },
    {
      key: 'fleet',
      label: 'Fleet Allocation',
      tag: 'Fleet',
      icon: 'vehicle',
      to: '/vehicles',
      metricKey: 'activeVehicles',
      hint: (n) =>
        n
          ? `${n} active vehicle assignment${n === 1 ? '' : 's'}`
          : 'No active vehicle assignments',
    },
  ],
  saudi: [
    {
      key: 'jawaz',
      label: 'Salahiat al-Jawaz',
      tag: 'Jawaz',
      icon: 'passport',
      to: '/passports',
      metricKey: 'attentionPassports',
      hint: (n) =>
        n
          ? `${n} passport renewal${n === 1 ? '' : 's'} need follow-up`
          : 'Passport validity is clear in the SLA window',
    },
    {
      key: 'takhsees',
      label: 'Takhsees Al-Sayarat',
      tag: 'Fleet',
      icon: 'vehicle',
      to: '/vehicles',
      metricKey: 'activeVehicles',
      hint: (n) =>
        n
          ? `${n} active vehicle assignment${n === 1 ? '' : 's'}`
          : 'No active vehicle assignments',
    },
  ],
  india: [
    {
      key: 'pfesi',
      label: 'PF / ESI Status',
      tag: 'EPFO',
      icon: 'contract',
      to: '/compliance',
      metricKey: 'statutoryReady',
      hint: (n, ctx) =>
        `${n}/${ctx.activeEmployees || 0} staff covered for PF-ESI filing`,
    },
    {
      key: 'passport-india',
      label: 'Passport Renewals',
      tag: 'Compliance',
      icon: 'passport',
      to: '/passports',
      metricKey: 'attentionPassports',
      hint: (n) =>
        n
          ? `${n} passport renewal${n === 1 ? '' : 's'} need follow-up`
          : 'No passport renewals pending',
    },
  ],
}

export function getRegionalRules(subsidiaryId) {
  return RULES[subsidiaryId] || RULES.uae
}

/**
 * Returns regional compliance module cards for the dashboard.
 * When subsidiaryId is null/undefined, returns null (use universal modules).
 */
export function getRegionalComplianceWidgets(subsidiaryId, metrics = {}) {
  if (!subsidiaryId || !COMPLIANCE_WIDGETS[subsidiaryId]) return null
  const defs = COMPLIANCE_WIDGETS[subsidiaryId]
  const ctx = {
    activeEmployees: metrics.activeEmployees || 0,
    cutoffDay: subsidiaryId === 'uae' ? 28 : null,
  }
  return defs.map((def) => {
    const value = Number(metrics[def.metricKey] ?? 0)
    return {
      key: def.key,
      label: def.label,
      tag: def.tag,
      icon: def.icon,
      to: def.to,
      value,
      hint: def.hint(value, ctx),
      regional: true,
    }
  })
}

export function validateRegionalEmail(email, subsidiaryId) {
  const trimmed = String(email || '').trim()
  if (!trimmed) return { valid: true, message: '' }
  const rules = getRegionalRules(subsidiaryId)
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { valid: false, message: 'Enter a valid email address' }
  }
  if (!rules.emailPattern.test(trimmed)) {
    return { valid: false, message: rules.emailHint }
  }
  return { valid: true, message: '' }
}

export function regionalEmailPlaceholder(subsidiaryId) {
  const domain =
    subsidiaryId === 'india'
      ? 'eics-india.com'
      : subsidiaryId === 'saudi'
        ? 'eics-sa.com'
        : 'eics-uae.com'
  return `name.surname@${domain}`
}
