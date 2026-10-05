import { apiRequest } from './client'
import {
  formatEmpCode,
  mapDepartment,
  mapEmployee,
  toNumberId,
} from './mappers'
import { findDepartmentHodEmpId } from '../../utils/scope'
import { tagEmployees, tagEmployeeSubsidiary } from '../../config/subsidiaries'

/** In-memory cache so sync getEmployeeById / getDepartmentName keep working. */
let employeeCache = []
let departmentCache = []

function asArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload == null) return []
  return [payload]
}

export function getEmployeeById(empId) {
  if (empId === null || empId === undefined || empId === '') return undefined
  const key = String(empId)
  return employeeCache.find((e) => String(e.id) === key)
}

export function setEmployeeCache(list) {
  employeeCache = Array.isArray(list) ? [...list] : []
}

export function upsertEmployeeCache(emp) {
  if (!emp) return
  const idx = employeeCache.findIndex((e) => String(e.id) === String(emp.id))
  if (idx >= 0) employeeCache[idx] = emp
  else employeeCache = [emp, ...employeeCache]
}

export function setDepartmentCache(list) {
  departmentCache = Array.isArray(list) ? [...list] : []
}

export function fullName(emp) {
  if (!emp) return ''
  return [emp.firstName, emp.middleName, emp.lastName].filter(Boolean).join(' ')
}

export function getDepartmentName(departmentId) {
  if (departmentId === null || departmentId === undefined) return ''
  const dept = departmentCache.find((d) => String(d.id) === String(departmentId))
  return dept?.name || ''
}

export function getDepartment(departmentId) {
  return departmentCache.find((d) => String(d.id) === String(departmentId))
}

export { formatEmpCode }

export async function getDepartments() {
  const rows = await apiRequest('/departments')
  const list = asArray(rows).map((row, i) => mapDepartment(row, i))
  setDepartmentCache(list)
  return { data: list }
}

export async function createDepartment(payload) {
  const row = await apiRequest('/departments', {
    method: 'POST',
    body: { departmentName: payload.departmentName || payload.name },
  })
  const mapped = mapDepartment(row, departmentCache.length)
  setDepartmentCache([...departmentCache, mapped])
  return { data: mapped }
}

export async function getEmployees(params = {}) {
  if (!departmentCache.length) {
    try {
      await getDepartments()
    } catch {
      /* tagging still works via departmentId fallback */
    }
  }
  const rows = await apiRequest('/employees')
  let list = tagEmployees(asArray(rows).map(mapEmployee), departmentCache)
  setEmployeeCache(list)

  if (params.search) {
    const q = String(params.search).toLowerCase()
    list = list.filter((e) => {
      const name = fullName(e).toLowerCase()
      return (
        String(e.id).toLowerCase().includes(q) ||
        formatEmpCode(e.id).toLowerCase().includes(q) ||
        name.includes(q) ||
        getDepartmentName(e.departmentId).toLowerCase().includes(q)
      )
    })
  }
  if (params.departmentId) {
    list = list.filter((e) => String(e.departmentId) === String(params.departmentId))
  }
  if (params.status) {
    list = list.filter((e) => e.status === params.status)
  }

  return { data: list, meta: { total: list.length } }
}

export async function getEmployeeByIdApi(id) {
  const row = await apiRequest(`/employees/${id}`)
  const emp = tagEmployeeSubsidiary(mapEmployee(row), departmentCache)
  upsertEmployeeCache(emp)
  return { data: emp }
}

export async function createEmployee(payload) {
  // Ensure department cache is warm for HOD linking
  if (!departmentCache.length) await getDepartments()
  if (!employeeCache.length) await getEmployees()

  let reportsToEmpId = toNumberId(payload.reportsToId)
  if (!reportsToEmpId && payload.departmentId) {
    const hodId = findDepartmentHodEmpId(payload.departmentId, employeeCache)
    reportsToEmpId = toNumberId(hodId)
  }

  const body = {
    firstName: payload.firstName,
    middleName: payload.middleName || null,
    lastName: payload.lastName,
    departmentId: toNumberId(payload.departmentId),
    reportsToEmpId,
    status: payload.status || 'Active',
    email: payload.email || null,
    subsidiaryId: payload.subsidiaryId || null,
  }

  const row = await apiRequest('/employees', { method: 'POST', body })
  const emp = tagEmployeeSubsidiary(mapEmployee(row), departmentCache)
  upsertEmployeeCache(emp)
  return { data: emp }
}

export async function updateEmployee(id, payload) {
  const body = {}
  if (payload.firstName !== undefined) body.firstName = payload.firstName
  if (payload.middleName !== undefined) body.middleName = payload.middleName
  if (payload.lastName !== undefined) body.lastName = payload.lastName
  if (payload.departmentId !== undefined)
    body.departmentId = toNumberId(payload.departmentId)
  if (payload.reportsToId !== undefined)
    body.reportsToEmpId = toNumberId(payload.reportsToId)
  if (payload.status !== undefined) body.status = payload.status
  if (payload.email !== undefined) body.email = payload.email || null
  if (payload.subsidiaryId !== undefined) body.subsidiaryId = payload.subsidiaryId

  const row = await apiRequest(`/employees/${id}`, { method: 'PATCH', body })
  const emp = tagEmployeeSubsidiary(mapEmployee(row), departmentCache)
  upsertEmployeeCache(emp)
  return { data: emp }
}

export async function deactivateEmployee(id) {
  const row = await apiRequest(`/employees/${id}/deactivate`, {
    method: 'PATCH',
  })
  const emp = tagEmployeeSubsidiary(mapEmployee(row), departmentCache)
  upsertEmployeeCache(emp)
  return { data: emp }
}
