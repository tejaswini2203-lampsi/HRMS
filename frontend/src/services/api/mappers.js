/**
 * Maps NestJS / SQL PascalCase records → frontend camelCase models.
 * Backend remains the source of truth; this is a display/API adapter only.
 */

const DEPT_COLORS = ['#0E7490', '#1D6FA3', '#7C3AED', '#BE185D', '#0F766E', '#C47A3A']

export function toId(value) {
  if (value === null || value === undefined || value === '') return null
  return String(value)
}

export function toNumberId(value) {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function toDateOnly(value) {
  if (!value) return null
  if (typeof value === 'string') return value.slice(0, 10)
  try {
    return new Date(value).toISOString().slice(0, 10)
  } catch {
    return null
  }
}

export function toIso(value) {
  if (!value) return null
  if (typeof value === 'string') return value
  try {
    return new Date(value).toISOString()
  } catch {
    return null
  }
}

/** Display code EMP0001 from numeric EmpID */
export function formatEmpCode(id) {
  const n = Number(id)
  if (!Number.isFinite(n)) return String(id ?? '')
  return `EMP${String(n).padStart(4, '0')}`
}

export function mapDepartment(row, index = 0) {
  if (!row) return null
  const id = toId(row.DepartmentID ?? row.id)
  return {
    id,
    name: row.DepartmentName ?? row.name ?? '',
    color: row.color || DEPT_COLORS[index % DEPT_COLORS.length],
    order: row.order ?? index + 1,
  }
}

export function mapEmployee(row) {
  if (!row) return null
  return {
    id: toId(row.EmpID ?? row.id),
    firstName: row.FirstName ?? row.firstName ?? '',
    middleName: row.MiddleName ?? row.middleName ?? '',
    lastName: row.LastName ?? row.lastName ?? '',
    departmentId: toId(row.DepartmentID ?? row.departmentId),
    reportsToId: toId(row.ReportsToEmpID ?? row.reportsToId),
    status: row.Status ?? row.status ?? 'Active',
    email: row.Email ?? row.email ?? '',
    subsidiaryId: row.SubsidiaryID ?? row.subsidiaryId ?? null,
    createdAt: toIso(row.CreatedAt ?? row.createdAt),
    updatedAt: toIso(row.UpdatedAt ?? row.updatedAt),
    // HRMS Phase 1 Extensions
    designation: row.Designation ?? row.designation ?? '',
    joiningDate: toDateOnly(row.JoiningDate ?? row.joiningDate ?? row.CreatedAt),
    joinDate: toDateOnly(row.JoiningDate ?? row.joinDate ?? row.CreatedAt),
    employmentType: row.EmploymentType ?? row.employmentType ?? 'Fixed Term',
    entityId: row.EntityID ?? row.entityId ?? null,
    countryRegion: row.CountryRegion ?? row.countryRegion ?? row.SubsidiaryID,
    salary: row.Salary !== undefined ? row.Salary : null,
    iqamaNumber: row.IqamaNumber ?? row.iqamaNumber ?? null,
    iqamaExpiry: toDateOnly(row.IqamaExpiry ?? row.iqamaExpiry),
    emiratesId: row.EmiratesID ?? row.emiratesId ?? null,
    emiratesIdExpiry: toDateOnly(row.EmiratesIDExpiry ?? row.emiratesIdExpiry),
    visaNumber: row.VisaNumber ?? row.visaNumber ?? null,
    visaExpiry: toDateOnly(row.VisaExpiry ?? row.visaExpiry),
    sponsor: row.Sponsor ?? row.sponsor ?? null,
    ksaVendorType: row.KSAVendorType ?? row.ksaVendorType ?? null,
    uaeEmployeeCategory: row.UAEEmployeeCategory ?? row.uaeEmployeeCategory ?? null,
    uaeVisaType: row.UAEVisaType ?? row.uaeVisaType ?? null,
    flightEligible: row.flightEligible ?? false,
  }
}

function buildLeaveTimeline(leave) {
  const status = leave.Status || leave.status || 'Pending'
  const initiatedBy = toId(leave.InitiatedBy ?? leave.initiatedBy)
  const hodBy = toId(leave.HODApprovedBy ?? leave.hodApprovedBy)
  const hrBy = toId(leave.HRApprovedBy ?? leave.hrApprovedBy)
  const createdAt = toIso(leave.CreatedAt ?? leave.createdAt)

  const submitted = {
    step: 'Submitted',
    at: createdAt,
    by: initiatedBy,
    status: 'done',
  }

  if (status === 'Pending') {
    return [
      submitted,
      { step: 'HOD Review', at: null, by: null, status: 'current' },
      { step: 'HR Review', at: null, by: null, status: 'pending' },
      { step: 'Final Status', at: null, by: null, status: 'pending' },
    ]
  }

  if (status === 'HOD Approved') {
    return [
      submitted,
      { step: 'HOD Review', at: createdAt, by: hodBy, status: 'done' },
      { step: 'HR Review', at: null, by: null, status: 'current' },
      { step: 'Final Status', at: null, by: null, status: 'pending' },
    ]
  }

  if (status === 'HR Approved') {
    return [
      submitted,
      {
        step: 'HOD Review',
        at: createdAt,
        by: hodBy || 'Skipped / Direct HR',
        status: 'done',
      },
      { step: 'HR Review', at: createdAt, by: hrBy, status: 'done' },
      {
        step: 'Final Status',
        at: createdAt,
        by: 'HR Approved',
        status: 'done',
      },
    ]
  }

  if (status === 'Rejected') {
    return [
      submitted,
      { step: 'HOD Review', at: createdAt, by: hodBy, status: hodBy ? 'done' : 'skipped' },
      { step: 'HR Review', at: null, by: null, status: 'skipped' },
      { step: 'Final Status', at: createdAt, by: 'Rejected', status: 'done' },
    ]
  }

  if (status === 'Cancelled') {
    return [
      submitted,
      { step: 'HOD Review', at: null, by: null, status: 'skipped' },
      { step: 'HR Review', at: null, by: null, status: 'skipped' },
      {
        step: 'Final Status',
        at: createdAt,
        by: 'Cancelled',
        status: 'done',
      },
    ]
  }

  return [submitted]
}

export function mapLeave(row) {
  if (!row) return null
  const remarks = row.Remarks ?? row.reason ?? row.remarks ?? ''
  const rawDay = row.LeaveDayType ?? row.leaveDayType ?? 'FULL'
  const leaveDayType =
    String(rawDay).toUpperCase() === 'HALF' ||
    String(rawDay).toLowerCase() === 'half day'
      ? 'Half Day'
      : 'Full Day'

  return {
    id: toId(row.LeaveID ?? row.id),
    empId: toId(row.EmpID ?? row.empId),
    leaveType: row.LeaveType ?? row.leaveType ?? '',
    leaveDayType,
    fromDate: toDateOnly(row.FromDate ?? row.fromDate),
    toDate: toDateOnly(row.ToDate ?? row.toDate),
    status: row.Status ?? row.status ?? 'Pending',
    initiatedBy: toId(row.InitiatedBy ?? row.initiatedBy),
    initiatedRole: row.InitiatedRole ?? row.initiatedRole ?? '',
    hodApprovedBy: toId(row.HODApprovedBy ?? row.hodApprovedBy),
    hrApprovedBy: toId(row.HRApprovedBy ?? row.hrApprovedBy),
    reason: remarks,
    remarks,
    createdAt: toIso(row.CreatedAt ?? row.createdAt),
    timeline: buildLeaveTimeline(row),
  }
}

export function mapPassport(row) {
  if (!row) return null
  return {
    id: toId(row.PassportID ?? row.id),
    empId: toId(row.EmpID ?? row.empId),
    passportNumber: row.PassportNumber ?? row.passportNumber ?? '',
    nationality: row.Nationality ?? row.nationality ?? '',
    issueDate: toDateOnly(row.IssueDate ?? row.issueDate),
    expiryDate: toDateOnly(row.ExpiryDate ?? row.expiryDate),
    isActive: Boolean(row.IsActive ?? row.isActive),
  }
}

export function mapVehicle(row) {
  if (!row) return null
  const isActive = row.IsActive ?? (row.status === 'Active')
  return {
    id: toId(row.AllocationID ?? row.id),
    empId: toId(row.EmpID ?? row.empId),
    vehicleNumber: row.VehicleNumber ?? row.vehicleNumber ?? '',
    vehicleType: row.VehicleType ?? row.vehicleType ?? '',
    allocatedFrom: toDateOnly(row.AllocatedFrom ?? row.allocatedFrom),
    allocatedTo: toDateOnly(row.AllocatedTo ?? row.allocatedTo),
    status: isActive ? 'Active' : 'Closed',
    isActive: Boolean(isActive),
  }
}

export function mapFlight(row) {
  if (!row) return null
  return {
    id: toId(row.TicketID ?? row.id),
    empId: toId(row.EmpID ?? row.empId),
    ticketType: row.TicketType ?? row.ticketType ?? '',
    travelDate: toDateOnly(row.TravelDate ?? row.travelDate),
    returnDate: toDateOnly(row.ReturnDate ?? row.returnDate),
    sector: row.Sector ?? row.sector ?? '',
    bookingStatus: row.BookingStatus ?? row.bookingStatus ?? 'Pending',
    markedBy: toId(row.MarkedBy ?? row.markedBy),
    markedDate: toDateOnly(row.MarkedDate ?? row.markedDate),
  }
}

const ALERT_LABELS = {
  '180d': 'Passport Expiry — 180 days',
  '90d': 'Passport Expiry — 90 days',
  '30d': 'Passport Expiry — 30 days',
}

export function mapPassportAlert(row) {
  if (!row) return null
  const alertType = row.AlertType ?? row.alertType ?? ''
  const recipientsRaw = row.RecipientList ?? row.recipients ?? ''
  const recipients = Array.isArray(recipientsRaw)
    ? recipientsRaw
    : String(recipientsRaw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)

  return {
    id: toId(row.AlertID ?? row.id),
    alertType: ALERT_LABELS[alertType] || `Passport Alert — ${alertType}`,
    typeKey: `passport_expiry_${alertType}`,
    empId: toId(row.EmpID ?? row.empId),
    relatedId: toId(row.PassportID ?? row.relatedId),
    triggerDate: toDateOnly(row.SentDate ?? row.triggerDate),
    recipients,
    status: row.Status === 'Logged' ? 'Sent' : row.Status || row.status || 'Sent',
    sentDate: toIso(row.SentDate ?? row.sentDate),
    read: Boolean(row.read),
    proposed: alertType === '90d' || alertType === '30d',
  }
}

const NOTIFICATION_LABELS = {
  LEAVE_SUBMITTED: 'New Leave Request',
  LEAVE_APPROVED: 'Leave Approved',
  LEAVE_REJECTED: 'Leave Rejected',
  LEAVE_CANCELLED: 'Leave Cancelled',
  VEHICLE_ALLOCATED: 'Vehicle allocation',
  PASSPORT_CREATED: 'Passport created',
  PASSPORT_UPDATED: 'Passport updated',
  PASSPORT_ALERT: 'Passport expiry alert',
}

export function mapNotification(row) {
  if (!row) return null
  const type = row.Type ?? row.type ?? ''
  const isRead = row.IsRead === true || row.IsRead === 1 || row.read === true
  return {
    id: toId(row.NotificationID ?? row.id),
    type,
    typeKey: type,
    alertType: row.Title || NOTIFICATION_LABELS[type] || type || 'Notification',
    title: row.Title || row.title || NOTIFICATION_LABELS[type] || 'Notification',
    message: row.Message ?? row.message ?? '',
    empId: toId(row.RecipientEmpID ?? row.empId),
    relatedEntity: row.RelatedEntity ?? row.relatedEntity ?? '',
    relatedId: toId(row.RelatedEntityID ?? row.relatedId),
    read: isRead,
    createdAt: toIso(row.CreatedAt ?? row.createdAt),
    triggerDate: toDateOnly(row.CreatedAt ?? row.triggerDate),
    sentDate: toIso(row.CreatedAt ?? row.sentDate),
    status: isRead ? 'Read' : 'Unread',
  }
}
