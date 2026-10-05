import { ROLES } from '../config/featureFlags'

/**
 * Resolve the department of the signed-in HOD from their Employee record.
 * Ready to map to Employee.DepartmentID during backend integration.
 */
export function getHodDepartmentId(user, employees = []) {
  if (!user?.empId) return null
  const self = employees.find((e) => e.id === user.empId)
  return self?.departmentId || null
}

/**
 * Find the department HOD employee (senior in-department manager).
 * Prefer an employee with no manager who is reported to by others in the same department.
 */
export function findDepartmentHodEmpId(departmentId, employees = []) {
  if (!departmentId) return null
  const deptEmployees = employees.filter(
    (e) => e.departmentId === departmentId && e.status !== 'Inactive',
  )
  if (!deptEmployees.length) return null

  const referenced = deptEmployees.find(
    (e) =>
      !e.reportsToId &&
      deptEmployees.some((other) => other.reportsToId === e.id),
  )
  if (referenced) return referenced.id

  const root = deptEmployees.find((e) => !e.reportsToId)
  return root?.id || null
}

/**
 * Visibility:
 * - Employee → own record only
 * - HOD → all employees in the HOD's department
 * - HR / Admin → all
 *
 * Structured around departmentId so backend Employee.DepartmentID can replace mock later.
 */
export function getVisibleEmployeeIds(user, employees = []) {
  if (!user) return []
  if (user.role === ROLES.HR || user.role === ROLES.ADMIN) {
    return employees.map((e) => e.id)
  }
  if (user.role === ROLES.HOD) {
    const departmentId = getHodDepartmentId(user, employees)
    if (!departmentId) {
      return employees
        .filter((e) => e.id === user.empId || e.reportsToId === user.empId)
        .map((e) => e.id)
    }
    return employees
      .filter((e) => e.departmentId === departmentId)
      .map((e) => e.id)
  }
  return [user.empId].filter(Boolean)
}

export function scopeEmployees(user, employees = [], subsidiaryId) {
  const ids = new Set(getVisibleEmployeeIds(user, employees))
  return employees.filter((e) => {
    if (!ids.has(e.id)) return false
    if (!subsidiaryId) return true
    return e.subsidiaryId === subsidiaryId
  })
}

export function scopeByEmpId(user, records = [], employees = [], subsidiaryId) {
  const visible = new Set(
    scopeEmployees(user, employees, subsidiaryId).map((e) => e.id),
  )
  return records.filter((r) => visible.has(r.empId))
}

export function canAccessEmployee(user, empId, employees = []) {
  return getVisibleEmployeeIds(user, employees).includes(empId)
}
