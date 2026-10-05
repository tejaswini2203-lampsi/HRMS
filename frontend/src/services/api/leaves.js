import { apiRequest } from './client'
import { mapLeave, toNumberId } from './mappers'

function asArray(payload) {
  if (Array.isArray(payload)) return payload
  if (payload == null) return []
  return [payload]
}

function toApiLeaveDayType(value) {
  const raw = String(value || '').toLowerCase()
  if (raw === 'half' || raw === 'half day') return 'HALF'
  return 'FULL'
}

function applyClientFilters(list, params = {}) {
  let next = [...list]
  if (params.empId)
    next = next.filter((l) => String(l.empId) === String(params.empId))
  if (params.leaveType)
    next = next.filter((l) => l.leaveType === params.leaveType)
  if (params.status) next = next.filter((l) => l.status === params.status)
  if (params.fromDate) next = next.filter((l) => l.fromDate >= params.fromDate)
  if (params.toDate) next = next.filter((l) => l.toDate <= params.toDate)
  return next
}

export async function getLeaves(params = {}) {
  const qs =
    params.empId != null && params.empId !== ''
      ? `?empId=${encodeURIComponent(params.empId)}`
      : ''
  const rows = await apiRequest(`/leaves${qs}`)
  let list = asArray(rows).map(mapLeave)
  list = applyClientFilters(list, {
    leaveType: params.leaveType,
    status: params.status,
    fromDate: params.fromDate,
    toDate: params.toDate,
  })
  return { data: list, meta: { total: list.length } }
}

export async function createLeave(payload) {
  const body = {
    empId: toNumberId(payload.empId),
    leaveType: payload.leaveType,
    fromDate: payload.fromDate,
    toDate: payload.toDate,
    leaveDayType: toApiLeaveDayType(payload.leaveDayType),
    initiatedBy: toNumberId(payload.initiatedBy),
    initiatedRole: payload.initiatedRole || null,
    remarks: payload.reason || payload.remarks || null,
  }

  const row = await apiRequest('/leaves', { method: 'POST', body })
  return { data: mapLeave(row) }
}

export async function updateLeave(id, payload) {
  const body = {}
  if (payload.leaveType !== undefined) body.leaveType = payload.leaveType
  if (payload.fromDate !== undefined) body.fromDate = payload.fromDate
  if (payload.toDate !== undefined) body.toDate = payload.toDate
  if (payload.leaveDayType !== undefined) {
    body.leaveDayType = toApiLeaveDayType(payload.leaveDayType)
  }
  if (payload.reason !== undefined || payload.remarks !== undefined) {
    body.remarks = payload.reason ?? payload.remarks
  }

  const row = await apiRequest(`/leaves/${id}`, { method: 'PATCH', body })
  return { data: mapLeave(row) }
}

/**
 * @param {string|number} id
 * @param {{ role: string, by: string|number }} opts - by = approver EmpID
 */
export async function approveLeave(id, { role, by }) {
  let apiRole = role
  if (role === 'ADMIN') apiRole = 'HR'

  const row = await apiRequest(`/leaves/${id}/approve`, {
    method: 'PATCH',
    body: {
      role: apiRole,
      approvedBy: toNumberId(by),
    },
  })
  return { data: mapLeave(row) }
}

export async function rejectLeave(id, { by, remarks } = {}) {
  const row = await apiRequest(`/leaves/${id}/reject`, {
    method: 'PATCH',
    body: {
      rejectedBy: toNumberId(by),
      remarks: remarks || null,
    },
  })
  return { data: mapLeave(row) }
}

export async function cancelLeave(id) {
  const row = await apiRequest(`/leaves/${id}/cancel`, {
    method: 'PATCH',
  })
  return { data: mapLeave(row) }
}
