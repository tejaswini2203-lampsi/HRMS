import { ROLES } from '../config/featureFlags'

/**
 * Role-aware permission helpers — HRMS Phase 1.
 */
export function canAccessMenu(role, menuKey) {
  const map = {
    dashboard: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    workQueue: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    compliance: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    employees: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    requests: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    documents: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    performance: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    leaves: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    passports: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    vehicles: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    flights: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    notifications: [ROLES.EMPLOYEE, ROLES.HOD, ROLES.HR, ROLES.ADMIN],
    reports: [ROLES.HR, ROLES.ADMIN],
    audit: [ROLES.HR, ROLES.ADMIN],
    administration: [ROLES.HR, ROLES.ADMIN],
    settings: [ROLES.HR, ROLES.ADMIN],
    users: [ROLES.ADMIN],
    roles: [ROLES.ADMIN],
  }
  return (map[menuKey] || []).includes(role)
}

export function canManageEmployees(role) {
  return role === ROLES.HR || role === ROLES.ADMIN
}

export function canViewAllEmployees(role) {
  return role === ROLES.HR || role === ROLES.ADMIN
}

export function canViewTeam(role) {
  return role === ROLES.HOD
}

export function canApproveLeaveAsHod(role) {
  return role === ROLES.HOD || role === ROLES.ADMIN
}

export function canApproveLeaveAsHr(role) {
  return role === ROLES.HR || role === ROLES.ADMIN
}

export function canOverrideLeave(role) {
  return role === ROLES.HR || role === ROLES.ADMIN
}

export function canManagePassports(role) {
  return role === ROLES.HR || role === ROLES.ADMIN
}

export function canManageVehicles(role) {
  return role === ROLES.HR || role === ROLES.ADMIN
}

export function canManageFlights(role) {
  return role === ROLES.HR || role === ROLES.ADMIN
}

export function canManageRoles(role) {
  return role === ROLES.ADMIN
}

export function canApplyLeaveOnBehalf(role) {
  return role === ROLES.HOD || role === ROLES.HR || role === ROLES.ADMIN
}

/** Human-readable capability summary for login / settings */
export const ROLE_CAPABILITIES = {
  [ROLES.EMPLOYEE]: [
    'View own employee record & profile',
    'Execute assigned Work Queue tasks',
    'Apply for Salary / Gratuity advances',
    'Request 11 types of official letters',
    'View own documents and leave records',
  ],
  [ROLES.HOD]: [
    'View and manage team employees',
    'Execute HOD duration & contract confirmations in Work Queue',
    'Approve / reject team advance & leave requests',
    'Add continuous performance observations for team',
    'Access team compliance cases and alerts',
  ],
  [ROLES.HR]: [
    'Full Work Queue operational command',
    'Full cross-region compliance (UAE 13-stage & KSA workflows)',
    'Employee Master CRUD with sensitive salary visibility',
    'Issue & e-sign corporate letters',
    'Document Center, Reports, and Audit Trail access',
  ],
  [ROLES.ADMIN]: [
    'Full access across all modules and regions',
    'Master configuration (Regions, Entities, SLA Rules, Pipelines)',
    'Feature flags & system parameters management',
    'Complete platform audit trail visibility',
  ],
}
