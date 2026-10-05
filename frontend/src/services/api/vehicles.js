import { apiRequest } from './client'
import { mapVehicle, toNumberId } from './mappers'
import { getEmployees } from './employees'

async function fetchVehiclesForEmp(empId) {
  const rows = await apiRequest(`/vehicle-allocations/${empId}`)
  return (Array.isArray(rows) ? rows : rows ? [rows] : []).map(mapVehicle)
}

export async function getVehicleAllocations(params = {}) {
  let list = []

  if (params.empId) {
    list = await fetchVehiclesForEmp(params.empId)
  } else {
    const { data: employees } = await getEmployees()
    const batches = await Promise.all(
      employees.map((e) => fetchVehiclesForEmp(e.id).catch(() => [])),
    )
    list = batches.flat()
  }

  if (params.vehicleType)
    list = list.filter((v) => v.vehicleType === params.vehicleType)
  if (params.status) list = list.filter((v) => v.status === params.status)
  if (params.search) {
    const q = String(params.search).toLowerCase()
    list = list.filter((v) => v.vehicleNumber.toLowerCase().includes(q))
  }

  return { data: list, meta: { total: list.length } }
}

export async function createVehicleAllocation(payload) {
  const body = {
    empId: toNumberId(payload.empId),
    vehicleNumber: payload.vehicleNumber,
    vehicleType: payload.vehicleType,
    allocatedFrom: payload.allocatedFrom,
    allocatedTo: payload.allocatedTo || null,
    isActive: true,
  }
  const row = await apiRequest('/vehicle-allocations', {
    method: 'POST',
    body,
  })
  return { data: mapVehicle(row) }
}

export async function closeVehicleAllocation(id) {
  const row = await apiRequest(`/vehicle-allocations/${id}/close`, {
    method: 'PATCH',
  })
  return { data: mapVehicle(row) }
}

export async function updateVehicleAllocation(id, payload) {
  const body = {}
  if (payload.empId !== undefined) body.empId = toNumberId(payload.empId)
  if (payload.vehicleNumber !== undefined)
    body.vehicleNumber = payload.vehicleNumber
  if (payload.vehicleType !== undefined) body.vehicleType = payload.vehicleType
  if (payload.allocatedFrom !== undefined)
    body.allocatedFrom = payload.allocatedFrom
  if (payload.allocatedTo !== undefined)
    body.allocatedTo = payload.allocatedTo || null

  const row = await apiRequest(`/vehicle-allocations/${id}`, {
    method: 'PATCH',
    body,
  })
  return { data: mapVehicle(row) }
}
