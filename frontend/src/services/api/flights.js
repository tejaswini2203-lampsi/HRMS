import { apiRequest } from './client'
import { mapFlight, toNumberId } from './mappers'
import { getEmployees } from './employees'

async function fetchFlightsForEmp(empId) {
  const rows = await apiRequest(`/flight-tickets/${empId}`)
  return (Array.isArray(rows) ? rows : rows ? [rows] : []).map(mapFlight)
}

export async function getFlightTickets(params = {}) {
  let list = []

  if (params.empId) {
    list = await fetchFlightsForEmp(params.empId)
  } else {
    const { data: employees } = await getEmployees()
    const batches = await Promise.all(
      employees.map((e) => fetchFlightsForEmp(e.id).catch(() => [])),
    )
    list = batches.flat()
  }

  if (params.ticketType)
    list = list.filter((f) => f.ticketType === params.ticketType)
  if (params.bookingStatus)
    list = list.filter((f) => f.bookingStatus === params.bookingStatus)
  if (params.travelDate)
    list = list.filter((f) => f.travelDate === params.travelDate)

  return { data: list, meta: { total: list.length } }
}

export async function createFlightTicket(payload) {
  const body = {
    empId: toNumberId(payload.empId),
    ticketType: payload.ticketType,
    travelDate: payload.travelDate,
    returnDate: payload.returnDate || null,
    sector: payload.sector,
    bookingStatus: payload.bookingStatus || 'Pending',
    markedBy: toNumberId(payload.markedBy),
    markedDate: payload.markedDate || undefined,
  }
  const row = await apiRequest('/flight-tickets', { method: 'POST', body })
  return { data: mapFlight(row) }
}

export async function updateFlightTicket(id, payload) {
  const body = {}
  if (payload.ticketType !== undefined) body.ticketType = payload.ticketType
  if (payload.travelDate !== undefined) body.travelDate = payload.travelDate
  if (payload.returnDate !== undefined) body.returnDate = payload.returnDate || null
  if (payload.sector !== undefined) body.sector = payload.sector
  if (payload.bookingStatus !== undefined)
    body.bookingStatus = payload.bookingStatus
  if (payload.markedBy !== undefined) body.markedBy = toNumberId(payload.markedBy)
  if (payload.markedDate !== undefined) body.markedDate = payload.markedDate

  const row = await apiRequest(`/flight-tickets/${id}`, {
    method: 'PATCH',
    body,
  })
  return { data: mapFlight(row) }
}
