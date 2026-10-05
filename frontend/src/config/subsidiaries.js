/** Multi-subsidiary workspace catalog for EICS. */

export const SUBSIDIARY_IDS = ['uae', 'saudi', 'india']

export const SUBSIDIARIES = {
  uae: {
    id: 'uae',
    label: 'PS Group UAE',
    shortLabel: 'UAE',
    country: 'United Arab Emirates',
    city: 'Dubai / Abu Dhabi',
    currency: 'AED',
    branding: {
      logo: null,
      logoMark: 'AE',
      productName: 'EICS UAE',
      badge: '#FB923C',
      accent: '#FDBA74',
      accentSoft: 'rgba(251, 146, 60, 0.18)',
      primaryDeep: '#EA580C',
      strip: 'linear-gradient(90deg, #FDBA74, #FB923C)',
    },
    complianceStandards: ['UAE MOHRE', 'WPS', 'Emirates ID'],
  },
  saudi: {
    id: 'saudi',
    label: 'PS Group Saudi Arabia',
    shortLabel: 'Saudi',
    country: 'Kingdom of Saudi Arabia',
    city: 'Riyadh / Jeddah',
    currency: 'SAR',
    branding: {
      logo: null,
      logoMark: 'SA',
      productName: 'EICS Saudi',
      badge: '#4ADE80',
      accent: '#86EFAC',
      accentSoft: 'rgba(134, 239, 172, 0.22)',
      primaryDeep: '#16A34A',
      strip: 'linear-gradient(90deg, #86EFAC, #4ADE80)',
    },
    complianceStandards: ['Qiwa', 'GOSI', 'Iqama'],
  },
  india: {
    id: 'india',
    label: 'PS Group India',
    shortLabel: 'India',
    country: 'India',
    city: 'Hyderabad / Mumbai',
    currency: 'INR',
    branding: {
      logo: null,
      logoMark: 'IN',
      productName: 'EICS India',
      badge: '#60A5FA',
      accent: '#93C5FD',
      accentSoft: 'rgba(96, 165, 250, 0.2)',
      primaryDeep: '#2563EB',
      strip: 'linear-gradient(90deg, #93C5FD, #60A5FA)',
    },
    complianceStandards: ['EPFO / PF', 'ESI', 'Shops & Establishments'],
  },
}

export const SUBSIDIARY_LIST = SUBSIDIARY_IDS.map((id) => SUBSIDIARIES[id])

/** Default enterprise theme — used for admins until a subsidiary is selected. */
export const DEFAULT_THEME = {
  id: null,
  label: 'All Subsidiaries',
  shortLabel: 'Enterprise',
  country: 'Multi-region',
  city: 'Global HQ',
  currency: '—',
  branding: {
    logo: null,
    logoMark: 'EICS',
    productName: 'EICS',
    badge: '#1fb5a0',
    accent: '#1fb5a0',
    accentSoft: 'rgba(31, 181, 160, 0.14)',
    strip: 'linear-gradient(90deg, #1fb5a0, #0f766e)',
    primaryHover: '#179e8b',
    primaryDeep: '#0f766e',
    gradientStart: '#2ad4bb',
    gradientEnd: '#129883',
    ringTrack: '#e7f3f0',
    pillIdle: '#eef4f2',
    promoStart: '#e8faf6',
    promoEnd: '#d4f3ec',
  },
  complianceStandards: ['ISO 27001', 'Multi-regional HR', 'Enterprise governance'],
}

export function getActiveWorkspace(activeId) {
  return activeId && SUBSIDIARIES[activeId] ? SUBSIDIARIES[activeId] : DEFAULT_THEME
}

export function getEffectiveSubsidiaryId(activeId, fallback = 'uae') {
  return activeId && SUBSIDIARIES[activeId] ? activeId : fallback
}

const DEPT_HINTS = [
  { test: /finance|operation|hr|admin/i, id: 'uae' },
  { test: /install|production|plant|field/i, id: 'saudi' },
  { test: /digital|audit|it|tech/i, id: 'india' },
]

export function resolveSubsidiaryId(emp, departments = []) {
  if (emp?.subsidiaryId && SUBSIDIARIES[emp.subsidiaryId]) return emp.subsidiaryId
  const dept = departments.find(
    (d) => String(d.id) === String(emp?.departmentId),
  )
  const name = dept?.name || ''
  const hinted = DEPT_HINTS.find((h) => h.test.test(name))
  if (hinted) return hinted.id
  const n = Number(emp?.departmentId || emp?.id || 0)
  return SUBSIDIARY_IDS[Math.abs(n) % SUBSIDIARY_IDS.length]
}

export function tagEmployeeSubsidiary(emp, departments = []) {
  if (!emp) return emp
  return { ...emp, subsidiaryId: resolveSubsidiaryId(emp, departments) }
}

export function tagEmployees(employees = [], departments = []) {
  return employees.map((emp) => tagEmployeeSubsidiary(emp, departments))
}
