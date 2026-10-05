import { Link } from 'react-router-dom'
import Badge, { statusBadgeVariant } from '../common/Badge'
import EmptyState from '../common/EmptyState'
import DataTable from '../tables/DataTable'
import { formatDate, formatDateTime, expiryCountdownLabel } from '../../utils/dates'
import { getPassportExpiryStatus } from '../../utils/passportStatus'
import { countdownBadge } from '../../utils/sla'
import { fullName, getDepartmentName, getEmployeeById } from '../../services/api'
import { TRACKER_COLORS } from '../../config/featureFlags'
import './EmployeeDetailTabs.css'

const EMPLOYEE_TABS = [
  'Overview',
  'Residency & Compliance',
  'Leave',
  'Passport',
  'Vehicle Allocation',
  'Flight Tickets',
  'Passport Alerts',
]

function resolveDesignation(employee) {
  if (employee?.designation) return employee.designation
  if (!employee?.reportsToId) return 'Department Lead'
  return 'Employee'
}

export default function EmployeeDetailTabs({
  tab,
  onTabChange,
  employee,
  leaves = [],
  passports = [],
  vehicles = [],
  flights = [],
  alerts = [],
}) {
  const manager = getEmployeeById(employee?.reportsToId)
  const activePassport = passports.find((p) => p.isActive)
  const activeVehicle = vehicles.find((v) => v.status === 'Active')

  return (
    <div className="edt">
      <div className="tabs" role="tablist" aria-label="Employee sections">
        {EMPLOYEE_TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={tab === t ? 'is-active' : ''}
            onClick={() => onTabChange(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="edt__content">
        {tab === 'Overview' ? (
          <div className="edt-flow">
            <section className="edt-section">
              <header className="edt-section__head">
                <p className="section-label">Overview</p>
                <h2>Personal & employment</h2>
              </header>
              <div className="info-grid">
                <div className="info-item">
                  <label>Full Name</label>
                  <p>{fullName(employee)}</p>
                </div>
                <div className="info-item">
                  <label>Emp ID</label>
                  <p className="mono">{employee.id}</p>
                </div>
                <div className="info-item">
                  <label>Department</label>
                  <p>{getDepartmentName(employee.departmentId)}</p>
                </div>
                <div className="info-item">
                  <label>Designation</label>
                  <p>{resolveDesignation(employee)}</p>
                </div>
                <div className="info-item">
                  <label>Email</label>
                  <p>{employee.email}</p>
                </div>
                <div className="info-item">
                  <label>Join Date</label>
                  <p>{formatDate(employee.joinDate)}</p>
                </div>
                <div className="info-item">
                  <label>Status</label>
                  <p>
                    <Badge variant={statusBadgeVariant(employee.status)}>
                      {employee.status}
                    </Badge>
                  </p>
                </div>
                <div className="info-item">
                  <label>Employment Type</label>
                  <p>{employee.employmentType || 'Fixed Term'}</p>
                </div>
                <div className="info-item">
                  <label>Region / Subsidiary</label>
                  <p>
                    {employee.countryRegion === 'saudi' ? '🇸🇦 Saudi Arabia' : employee.countryRegion === 'uae' ? '🇦🇪 UAE' : '🇮🇳 India'}
                  </p>
                </div>
                <div className="info-item">
                  <label>Gross Salary</label>
                  <p>
                    {employee.salary !== null && employee.salary !== undefined
                      ? `${employee.countryRegion === 'saudi' ? 'SAR' : 'AED'} ${Number(employee.salary).toLocaleString()}`
                      : '•••••• (Confidential)'}
                  </p>
                </div>
                <div className="info-item">
                  <label>Flight Eligibility</label>
                  <p>{employee.flightEligible ? 'Eligible' : 'Not marked'}</p>
                </div>
                <div className="info-item">
                  <label>Reports To</label>
                  <p>
                    {manager ? (
                      <Link to={`/employees/${manager.id}`}>
                        {fullName(manager)} ({manager.id})
                      </Link>
                    ) : (
                      <span className="muted">No reporting manager</span>
                    )}
                  </p>
                </div>
              </div>
            </section>

            <section className="edt-section">
              <header className="edt-section__head">
                <p className="section-label">At a glance</p>
                <h2>Compliance summary</h2>
              </header>
              <div className="edt-summary">
                <div className="edt-summary__item">
                  <span style={{ color: TRACKER_COLORS.leave }}>Leave</span>
                  <strong>
                    {leaves.length} record{leaves.length === 1 ? '' : 's'}
                  </strong>
                </div>
                <div className="edt-summary__item">
                  <span style={{ color: TRACKER_COLORS.passport }}>Passport</span>
                  <strong>
                    {activePassport
                      ? expiryCountdownLabel(activePassport.expiryDate)
                      : 'None'}
                  </strong>
                </div>
                <div className="edt-summary__item">
                  <span style={{ color: TRACKER_COLORS.vehicle }}>Vehicle</span>
                  <strong>{activeVehicle?.vehicleNumber || 'None'}</strong>
                </div>
                <div className="edt-summary__item">
                  <span style={{ color: TRACKER_COLORS.flight }}>Flights</span>
                  <strong>
                    {flights.length} record{flights.length === 1 ? '' : 's'}
                  </strong>
                </div>
              </div>
            </section>
          </div>
        ) : null}

        {tab === 'Residency & Compliance' ? (
          <div className="edt-flow">
            <section className="edt-section">
              <header className="edt-section__head">
                <p className="section-label">Residency & Regulatory Compliance</p>
                <h2>National ID, Visa & Labor Classification</h2>
              </header>
              <div className="info-grid">
                {employee.countryRegion === 'saudi' ? (
                  <>
                    <div className="info-item">
                      <label>Iqama Number</label>
                      <p className="mono">
                        <strong>{employee.iqamaNumber || 'Not Assigned'}</strong>
                      </p>
                    </div>
                    <div className="info-item">
                      <label>Iqama Expiry Date</label>
                      <p>
                        {employee.iqamaExpiry ? (
                          <Badge variant="warning">{formatDate(employee.iqamaExpiry)}</Badge>
                        ) : (
                          'Not Set'
                        )}
                      </p>
                    </div>
                    <div className="info-item">
                      <label>KSA Vendor / Labor Type</label>
                      <p>{employee.ksaVendorType || 'Ajeer Certified'}</p>
                    </div>
                    <div className="info-item">
                      <label>Sponsor / Entity</label>
                      <p>{employee.sponsor || 'EICS Saudi Arabia Commercial Services LLC'}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="info-item">
                      <label>Emirates ID (EID)</label>
                      <p className="mono">
                        <strong>{employee.emiratesId || '784-XXXX-XXXXXXX-X'}</strong>
                      </p>
                    </div>
                    <div className="info-item">
                      <label>Emirates ID Expiry</label>
                      <p>
                        {employee.emiratesIdExpiry ? (
                          <Badge variant="info">{formatDate(employee.emiratesIdExpiry)}</Badge>
                        ) : (
                          'Not Set'
                        )}
                      </p>
                    </div>
                    <div className="info-item">
                      <label>UAE Employee Category</label>
                      <p>
                        <Badge
                          variant={
                            employee.uaeEmployeeCategory === 'Labor'
                              ? 'warning'
                              : 'primary'
                          }
                        >
                          {employee.uaeEmployeeCategory || 'Skilled'} (
                          {employee.uaeEmployeeCategory === 'Labor'
                            ? 'Tawjeeh Required'
                            : 'Tawjeeh Skipped'}
                          )
                        </Badge>
                      </p>
                    </div>
                    <div className="info-item">
                      <label>Visa Type</label>
                      <p>{employee.uaeVisaType || 'Employment Residence'}</p>
                    </div>
                    <div className="info-item">
                      <label>Sponsor / Entity</label>
                      <p>{employee.sponsor || 'EICS UAE LLC'}</p>
                    </div>
                  </>
                )}

                <div className="info-item">
                  <label>Visa Number</label>
                  <p className="mono">{employee.visaNumber || 'Pending Issuance'}</p>
                </div>
                <div className="info-item">
                  <label>Visa Expiry Date</label>
                  <p>
                    {employee.visaExpiry ? (
                      <Badge variant="danger">{formatDate(employee.visaExpiry)}</Badge>
                    ) : (
                      'N/A'
                    )}
                  </p>
                </div>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', gap: '10px' }}>
                <Link to="/work-queue">
                  <Button variant="primary">Open What To Do Today</Button>
                </Link>
                {employee.countryRegion === 'saudi' ? (
                  <Link to="/compliance/ksa">
                    <Button variant="outline">Manage KSA Workflows →</Button>
                  </Link>
                ) : (
                  <Link to="/compliance/uae">
                    <Button variant="outline">Manage UAE 13-Stage Workflow →</Button>
                  </Link>
                )}
              </div>
            </section>
          </div>
        ) : null}

        {tab === 'Leave' ? (
          <section className="edt-section">
            <header className="edt-section__head">
              <p className="section-label">Leave</p>
              <h2>Leave requests</h2>
            </header>
            {leaves.length ? (
              <DataTable
                compact
                sortable={false}
                columns={[
                  { key: 'leaveType', header: 'Leave Type' },
                  {
                    key: 'leaveDayType',
                    header: 'Day Type',
                    render: (r) => r.leaveDayType || 'Full Day',
                  },
                  {
                    key: 'fromDate',
                    header: 'From',
                    render: (r) => formatDate(r.fromDate),
                  },
                  {
                    key: 'toDate',
                    header: 'To',
                    render: (r) => formatDate(r.toDate),
                  },
                  { key: 'reason', header: 'Reason' },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (r) => (
                      <Badge variant={statusBadgeVariant(r.status)}>
                        {r.status}
                      </Badge>
                    ),
                  },
                ]}
                rows={leaves}
              />
            ) : (
              <EmptyState
                title="No leave requests"
                description="No leave request records for this employee."
              />
            )}
          </section>
        ) : null}

        {tab === 'Passport' ? (
          <section className="edt-section">
            <header className="edt-section__head">
              <p className="section-label">Passport</p>
              <h2>Passport details</h2>
            </header>
            {passports.length ? (
              <DataTable
                compact
                sortable={false}
                columns={[
                  { key: 'passportNumber', header: 'Passport No.' },
                  { key: 'nationality', header: 'Nationality' },
                  {
                    key: 'expiryDate',
                    header: 'Expiry',
                    render: (r) => formatDate(r.expiryDate),
                  },
                  {
                    key: 'expiryStatus',
                    header: 'Status',
                    render: (r) => {
                      const s = getPassportExpiryStatus(r.expiryDate)
                      return <Badge variant={s.variant}>{s.label}</Badge>
                    },
                  },
                  {
                    key: 'countdown',
                    header: 'Countdown',
                    render: (r) => (
                      <span className="mono">{countdownBadge(r.expiryDate)}</span>
                    ),
                  },
                  {
                    key: 'isActive',
                    header: 'Active',
                    render: (r) => (r.isActive ? 'Active' : 'Archived'),
                  },
                ]}
                rows={passports}
              />
            ) : (
              <EmptyState title="No passport records" />
            )}
          </section>
        ) : null}

        {tab === 'Vehicle Allocation' ? (
          <section className="edt-section">
            <header className="edt-section__head">
              <p className="section-label">Vehicle</p>
              <h2>Vehicle allocation</h2>
            </header>
            {vehicles.length ? (
              <DataTable
                compact
                sortable={false}
                columns={[
                  { key: 'vehicleNumber', header: 'Vehicle Number' },
                  { key: 'vehicleType', header: 'Type' },
                  {
                    key: 'allocatedFrom',
                    header: 'From',
                    render: (r) => formatDate(r.allocatedFrom),
                  },
                  {
                    key: 'allocatedTo',
                    header: 'To',
                    render: (r) => formatDate(r.allocatedTo),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (r) => (
                      <Badge variant={statusBadgeVariant(r.status)}>
                        {r.status}
                      </Badge>
                    ),
                  },
                ]}
                rows={vehicles}
              />
            ) : (
              <EmptyState title="No vehicle allocations" />
            )}
          </section>
        ) : null}

        {tab === 'Flight Tickets' ? (
          <section className="edt-section">
            <header className="edt-section__head">
              <p className="section-label">Flights</p>
              <h2>Flight tickets</h2>
            </header>
            {flights.length ? (
              <DataTable
                compact
                sortable={false}
                columns={[
                  {
                    key: 'travelDate',
                    header: 'Travel Date',
                    render: (r) => formatDate(r.travelDate),
                  },
                  {
                    key: 'returnDate',
                    header: 'Return Date',
                    render: (r) => formatDate(r.returnDate),
                  },
                  { key: 'sector', header: 'Sector' },
                  { key: 'ticketType', header: 'Ticket Type' },
                  {
                    key: 'bookingStatus',
                    header: 'Status',
                    render: (r) => (
                      <Badge variant={statusBadgeVariant(r.bookingStatus)}>
                        {r.bookingStatus}
                      </Badge>
                    ),
                  },
                  { key: 'markedBy', header: 'Marked By' },
                  {
                    key: 'countdown',
                    header: 'Countdown',
                    render: (r) => (
                      <span className="mono">{countdownBadge(r.travelDate)}</span>
                    ),
                  },
                ]}
                rows={flights}
              />
            ) : (
              <EmptyState title="No flight tickets" />
            )}
          </section>
        ) : null}

        {tab === 'Passport Alerts' ? (
          <section className="edt-section">
            <header className="edt-section__head">
              <p className="section-label">Alerts</p>
              <h2>Passport alerts</h2>
            </header>
            {alerts.length ? (
              <DataTable
                compact
                sortable={false}
                columns={[
                  { key: 'alertType', header: 'Alert Type' },
                  {
                    key: 'triggerDate',
                    header: 'Trigger Date',
                    render: (r) => formatDate(r.triggerDate),
                  },
                  {
                    key: 'sentDate',
                    header: 'Sent',
                    render: (r) => formatDateTime(r.sentDate),
                  },
                  {
                    key: 'recipients',
                    header: 'Recipients',
                    render: (r) =>
                      Array.isArray(r.recipients)
                        ? r.recipients.join(', ')
                        : r.recipients,
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (r) => (
                      <Badge variant={statusBadgeVariant(r.status)}>
                        {r.status}
                      </Badge>
                    ),
                  },
                ]}
                rows={alerts}
              />
            ) : (
              <EmptyState
                title="No passport alerts"
                description="No passport expiry alerts for this employee."
              />
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}
