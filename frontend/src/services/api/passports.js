import { apiRequest } from './client'
import { mapPassport, mapPassportAlert, toNumberId } from './mappers'
import { getEmployees } from './employees'

async function fetchPassportsForEmp(empId) {
  const rows = await apiRequest(`/passports/${empId}`)
  return (Array.isArray(rows) ? rows : rows ? [rows] : []).map(mapPassport)
}

export async function getPassports(params = {}) {
  let list = []

  if (params.empId) {
    list = await fetchPassportsForEmp(params.empId)
  } else {
    const { data: employees } = await getEmployees()
    const batches = await Promise.all(
      employees.map((e) => fetchPassportsForEmp(e.id).catch(() => [])),
    )
    list = batches.flat()
  }

  if (params.activeOnly) list = list.filter((p) => p.isActive)
  return { data: list, meta: { total: list.length } }
}

export async function createPassport(payload) {
  const body = {
    empId: toNumberId(payload.empId),
    passportNumber: payload.passportNumber,
    nationality: payload.nationality,
    issueDate: payload.issueDate,
    expiryDate: payload.expiryDate,
    isActive: payload.isActive !== undefined ? Boolean(payload.isActive) : true,
  }
  const row = await apiRequest('/passports', { method: 'POST', body })
  return { data: mapPassport(row) }
}

export async function getPassportAlerts() {
  const rows = await apiRequest('/passports/alerts')
  const list = (Array.isArray(rows) ? rows : rows ? [rows] : []).map(
    mapPassportAlert,
  )
  return { data: list }
}

export async function updatePassport(id, payload) {
  const body = {}
  if (payload.passportNumber !== undefined)
    body.passportNumber = payload.passportNumber
  if (payload.nationality !== undefined) body.nationality = payload.nationality
  if (payload.issueDate !== undefined) body.issueDate = payload.issueDate
  if (payload.expiryDate !== undefined) body.expiryDate = payload.expiryDate
  if (payload.isActive !== undefined) body.isActive = Boolean(payload.isActive)

  const row = await apiRequest(`/passports/${id}`, { method: 'PATCH', body })
  return { data: mapPassport(row) }
}
