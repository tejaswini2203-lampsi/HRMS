import { useEffect, useId, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import LoadingState from '../components/common/LoadingState'
import { TrackerIcon } from '../components/compliance/TrackerIcons'
import {
  getEmployees,
  getDepartments,
  getLeaves,
  getPassports,
  getVehicleAllocations,
  getFlightTickets,
  getNotifications,
  fullName,
  getEmployeeById,
  getDepartmentName,
} from '../services/api'
import { evaluateSla } from '../utils/sla'
import { scopeEmployees, scopeByEmpId } from '../utils/scope'
import { useFeatureFlags } from '../context/FeatureFlagsContext'
import { useAuth } from '../context/AuthContext'
import { useSubsidiary } from '../context/SubsidiaryContext'
import {
  canApproveLeaveAsHod,
  canApproveLeaveAsHr,
  canManageEmployees,
  canManageFlights,
  canManagePassports,
  canManageVehicles,
} from '../utils/permissions'
import { daysUntil, expiryCountdownLabel, formatDate } from '../utils/dates'
import { getRegionalComplianceWidgets } from '../config/regionalRules'
import './Dashboard.css'

function employeeName(empId) {
  return fullName(getEmployeeById(empId)) || 'Employee'
}

function initials(name) {
  return String(name || 'E')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

function monthKey(date) {
  const value = new Date(date)
  if (Number.isNaN(value.getTime())) return ''
  return `${value.getFullYear()}-${value.getMonth()}`
}

function lastSixMonths() {
  const now = new Date()
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1)
    return {
      key: `${date.getFullYear()}-${date.getMonth()}`,
      label: date.toLocaleString('en', { month: 'short' }),
    }
  })
}

function ProgressRing({ value = 0, max = 1, tone = 'teal' }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0
  const radius = 22
  const circ = 2 * Math.PI * radius
  return (
    <svg className={`dash-ring dash-ring--${tone}`} viewBox="0 0 56 56" aria-hidden="true">
      <circle cx="28" cy="28" r={radius} className="dash-ring__track" />
      <circle
        cx="28"
        cy="28"
        r={radius}
        className="dash-ring__value"
        strokeDasharray={`${(pct / 100) * circ} ${circ}`}
      />
    </svg>
  )
}

function AreaChart({ points }) {
  const gradId = useId()
  const width = 360
  const height = 128
  const pad = 12
  const max = Math.max(...points.map((point) => point.value), 1)
  const coords = points.map((point, index) => {
    const x = pad + (index / Math.max(points.length - 1, 1)) * (width - pad * 2)
    const y = height - pad - (point.value / max) * (height - pad * 2)
    return { x, y, label: point.label, value: point.value }
  })
  const line = coords.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`

  return (
    <div className="dash-area">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#${gradId})`} />
        <polyline points={line} className="dash-area__line" />
        {coords.map((point) => (
          <circle key={point.label} cx={point.x} cy={point.y} r="3.2" className="dash-area__dot" />
        ))}
      </svg>
      <div className="dash-area__labels">
        {points.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const { activeId, active, isDefaultTheme } = useSubsidiary()
  const { flags } = useFeatureFlags()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState([])
  const [leaves, setLeaves] = useState([])
  const [passports, setPassports] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [flights, setFlights] = useState([])
  const [alerts, setAlerts] = useState([])
  const [taskTab, setTaskTab] = useState('approvals')

  const canReviewLeave =
    canApproveLeaveAsHod(user?.role) || canApproveLeaveAsHr(user?.role)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    Promise.all([
      getEmployees(),
      getDepartments(),
      getLeaves(),
      getPassports(),
      getVehicleAllocations(),
      getFlightTickets(),
      getNotifications(),
    ]).then(([empRes, , leaveRes, ppRes, vRes, fRes, nRes]) => {
      if (!mounted) return
      const scopedEmps = scopeEmployees(user, empRes.data, activeId)
      setEmployees(scopedEmps)
      setLeaves(scopeByEmpId(user, leaveRes.data, empRes.data, activeId))
      setPassports(scopeByEmpId(user, ppRes.data, empRes.data, activeId))
      setVehicles(scopeByEmpId(user, vRes.data, empRes.data, activeId))
      setFlights(scopeByEmpId(user, fRes.data, empRes.data, activeId))
      setAlerts(scopeByEmpId(user, nRes.data, empRes.data, activeId))
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [user, activeId])

  const buckets = useMemo(() => {
    const pendingStatuses = canApproveLeaveAsHr(user?.role)
      ? ['Pending', 'HOD Approved']
      : ['Pending']
    const approvals = leaves.filter((leave) =>
      pendingStatuses.includes(leave.status),
    )
    const attentionPassports = passports
      .filter((passport) => passport.isActive)
      .map((passport) => ({
        passport,
        sla: evaluateSla('passport', passport.expiryDate, flags),
        days: daysUntil(passport.expiryDate),
      }))
      .filter((item) => item.sla.warn)
      .sort((a, b) => (a.days ?? 999) - (b.days ?? 999))
    const followUps = alerts.filter((alert) => !alert.read)
    const vehicleReviews = vehicles.filter((vehicle) => {
      if (!vehicle.isActive) return false
      return evaluateSla('vehicle', vehicle.allocatedTo, flags).warn
    })
    const upcomingLeaves = leaves.filter(
      (leave) =>
        ['HR Approved', 'HOD Approved'].includes(leave.status) &&
        daysUntil(leave.fromDate) >= 0 &&
        daysUntil(leave.fromDate) <= 14,
    )
    const upcomingFlights = flights.filter((flight) => {
      const sla = evaluateSla('flight', flight.travelDate, flags)
      return sla.warn || (sla.days != null && sla.days >= 0 && sla.days <= 14)
    })
    const completedLeaves = leaves.filter((leave) =>
      ['HR Approved', 'Rejected', 'Cancelled'].includes(leave.status),
    )
    const completedAlerts = alerts.filter((alert) => alert.read)

    return {
      approvals,
      attentionPassports,
      followUps,
      vehicleReviews,
      upcoming: [...upcomingLeaves, ...upcomingFlights],
      completed: [...completedLeaves, ...completedAlerts],
    }
  }, [alerts, flags, flights, leaves, passports, user?.role, vehicles])

  const taskRows = useMemo(() => {
    if (taskTab === 'approvals') {
      return buckets.approvals.map((leave) => ({
        id: `task-leave-${leave.id}`,
        title: `${employeeName(leave.empId)} — ${leave.leaveType || 'Leave'} Request`,
        meta: `${leave.status} · ${formatDate(leave.fromDate)}`,
        to: '/leaves',
        action: canReviewLeave ? 'Review' : 'View',
        tag: leave.leaveType || 'Leave',
      }))
    }
    if (taskTab === 'followups') {
      return [
        ...buckets.attentionPassports.map(({ passport }) => ({
          id: `task-ppt-${passport.id}`,
          title: `${employeeName(passport.empId)} — Passport`,
          meta: expiryCountdownLabel(passport.expiryDate),
          to: '/passports',
          action: 'Review',
          tag: 'Passport',
        })),
        ...buckets.followUps.map((alert) => ({
          id: `task-alert-${alert.id}`,
          title: alert.alertType || alert.title || 'Follow-up',
          meta: employeeName(alert.empId),
          to: '/notifications',
          action: 'Follow Up',
          tag: 'Alert',
        })),
      ]
    }
    if (taskTab === 'upcoming') {
      return [
        ...leaves
          .filter(
            (leave) =>
              !['Rejected', 'Cancelled', 'Pending'].includes(leave.status) &&
              daysUntil(leave.fromDate) >= 0 &&
              daysUntil(leave.fromDate) <= 14,
          )
          .map((leave) => ({
            id: `task-up-leave-${leave.id}`,
            title: `${employeeName(leave.empId)} — Upcoming Leave`,
            meta: formatDate(leave.fromDate),
            to: '/leaves',
            action: 'View',
            tag: 'Leave',
          })),
        ...flights
          .filter((flight) => {
            const days = daysUntil(flight.travelDate)
            return days >= 0 && days <= 14
          })
          .map((flight) => ({
            id: `task-up-flight-${flight.id}`,
            title: `${employeeName(flight.empId)} — Flight`,
            meta: `${flight.sector || 'Travel'} · ${formatDate(flight.travelDate)}`,
            to: '/flights',
            action: 'View',
            tag: 'Flight',
          })),
      ]
    }
    return buckets.completed.slice(0, 8).map((item) => ({
      id: `task-done-${item.id}`,
      title: item.leaveType
        ? `${employeeName(item.empId)} — ${item.leaveType}`
        : item.alertType || item.title || 'Completed item',
      meta: item.status || 'Done',
      to: item.leaveType ? '/leaves' : '/notifications',
      action: 'View',
      tag: item.leaveType ? 'Leave' : 'Done',
    }))
  }, [buckets, canReviewLeave, flights, leaves, taskTab])

  const quickActions = [
    canManageEmployees(user?.role)
      ? { label: 'Add Employee', to: '/employees', icon: 'contract' }
      : null,
    { label: 'Apply Leave', to: '/leaves', icon: 'leave' },
    canManageVehicles(user?.role)
      ? { label: 'Allocate Vehicle', to: '/vehicles', icon: 'vehicle' }
      : { label: 'View Vehicle', to: '/vehicles', icon: 'vehicle' },
    canManagePassports(user?.role)
      ? { label: 'Update Passport', to: '/passports', icon: 'passport' }
      : { label: 'View Passport', to: '/passports', icon: 'passport' },
    canManageFlights(user?.role)
      ? { label: 'Add Flight', to: '/flights', icon: 'flight' }
      : { label: 'View Flights', to: '/flights', icon: 'flight' },
    { label: 'Send Reminder', to: '/notifications', icon: 'iqm' },
  ].filter(Boolean)

  const activeEmployees = employees.filter((emp) => emp.status === 'Active').length
  const activeVehicles = vehicles.filter((vehicle) => vehicle.isActive).length
  const activeShare = employees.length
    ? Math.round((activeEmployees / employees.length) * 100)
    : 0

  const activityPoints = useMemo(() => {
    const months = lastSixMonths()
    return months.map((month) => ({
      label: month.label,
      value:
        leaves.filter((leave) => monthKey(leave.fromDate) === month.key).length +
        flights.filter((flight) => monthKey(flight.travelDate) === month.key).length,
    }))
  }, [flights, leaves])

  const departmentBars = useMemo(() => {
    const counts = new Map()
    employees.forEach((emp) => {
      const name = getDepartmentName(emp.departmentId) || 'Unassigned'
      counts.set(name, (counts.get(name) || 0) + 1)
    })
    const rows = [...counts.entries()]
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
    const max = Math.max(...rows.map((row) => row.value), 1)
    return rows.map((row) => ({ ...row, pct: Math.round((row.value / max) * 100) }))
  }, [employees])

  const mixRows = useMemo(() => {
    const regionalMix =
      activeId === 'saudi'
        ? [
            { label: 'Leave', value: leaves.length, to: '/leaves' },
            { label: 'Iqama / Qiwa', value: passports.length, to: '/passports' },
            { label: 'Vehicle', value: vehicles.length, to: '/vehicles' },
            { label: 'Flight', value: flights.length, to: '/flights' },
          ]
        : activeId === 'uae'
          ? [
              { label: 'Leave', value: leaves.length, to: '/leaves' },
              { label: 'Visa / WPS', value: passports.length, to: '/passports' },
              { label: 'Vehicle', value: vehicles.length, to: '/vehicles' },
              { label: 'Flight', value: flights.length, to: '/flights' },
            ]
          : activeId === 'india'
            ? [
                { label: 'Leave', value: leaves.length, to: '/leaves' },
                { label: 'PF / Passport', value: passports.length, to: '/passports' },
                { label: 'Vehicle', value: vehicles.length, to: '/vehicles' },
                { label: 'Flight', value: flights.length, to: '/flights' },
              ]
            : [
                { label: 'Leave', value: leaves.length, to: '/leaves' },
                { label: 'Passport', value: passports.length, to: '/passports' },
                { label: 'Vehicle', value: vehicles.length, to: '/vehicles' },
                { label: 'Flight', value: flights.length, to: '/flights' },
              ]
    const max = Math.max(...regionalMix.map((row) => row.value), 1)
    return regionalMix.map((row) => ({ ...row, pct: Math.round((row.value / max) * 100) }))
  }, [activeId, flights.length, leaves.length, passports.length, vehicles.length])

  const schedule = useMemo(() => {
    const leaveItems = leaves
      .filter((leave) => daysUntil(leave.fromDate) >= 0 && daysUntil(leave.fromDate) <= 21)
      .map((leave) => ({
        id: `sch-leave-${leave.id}`,
        title: `${leave.leaveType || 'Leave'} review`,
        meta: employeeName(leave.empId),
        when: formatDate(leave.fromDate),
        to: '/leaves',
        tone: 'mint',
      }))
    const flightItems = flights
      .filter((flight) => daysUntil(flight.travelDate) >= 0 && daysUntil(flight.travelDate) <= 21)
      .map((flight) => ({
        id: `sch-flight-${flight.id}`,
        title: flight.sector || 'Travel booking',
        meta: employeeName(flight.empId),
        when: formatDate(flight.travelDate),
        to: '/flights',
        tone: 'teal',
      }))
    const passportItems = buckets.attentionPassports.slice(0, 3).map(({ passport }) => ({
      id: `sch-ppt-${passport.id}`,
      title: 'Passport follow-up',
      meta: employeeName(passport.empId),
      when: expiryCountdownLabel(passport.expiryDate),
      to: '/passports',
      tone: 'rose',
    }))
    return [...leaveItems, ...flightItems, ...passportItems].slice(0, 5)
  }, [buckets.attentionPassports, flights, leaves])

  const modules = useMemo(() => {
    const leaveModule = {
      label: 'Leave Management',
      hint: `${buckets.approvals.length} waiting for review`,
      tag: 'Approvals',
      to: '/leaves',
      icon: 'leave',
      regional: false,
    }
    const vehicleModule = {
      label: 'Vehicle Allocation',
      hint: `${activeVehicles} active assignments`,
      tag: 'Assets',
      to: '/vehicles',
      icon: 'vehicle',
      regional: false,
    }
    const flightModule = {
      label: 'Flight Tickets',
      hint: `${flights.length} bookings on file`,
      tag: 'Travel',
      to: '/flights',
      icon: 'flight',
      regional: false,
    }
    const passportModule = {
      label: 'Passport Tracking',
      hint: `${buckets.attentionPassports.length} need a response`,
      tag: 'Compliance',
      to: '/passports',
      icon: 'passport',
      regional: false,
    }

    const regional = getRegionalComplianceWidgets(activeId, {
      attentionPassports: buckets.attentionPassports.length,
      activeEmployees,
      activeVehicles,
      statutoryReady: Math.max(0, activeEmployees - Math.ceil(buckets.attentionPassports.length / 2)),
    })

    if (regional?.length) {
      return [leaveModule, regional[0], regional[1] || vehicleModule, flightModule]
    }
    return [leaveModule, passportModule, vehicleModule, flightModule]
  }, [
    activeId,
    activeEmployees,
    buckets.approvals.length,
    buckets.attentionPassports.length,
    flights.length,
    activeVehicles,
  ])

  const regionLabel = !isDefaultTheme && activeId ? active?.shortLabel || active?.label : null
  const subtitle = regionLabel
    ? `${active.label} workspace · metrics follow ${active.complianceStandards.slice(0, 2).join(' & ')} rules.`
    : 'A live picture of people, compliance, and operational work.'

  if (loading) return <LoadingState label="Loading dashboard…" />

  return (
    <div className="dash">
      <PageHeader
        title={user?.role === 'EMPLOYEE' ? 'Dashboard' : 'Administration Portal'}
        subtitle={subtitle}
      />

      <div className="dash-board">
        <div className="dash-main">
          <section className="dash-metrics">
            <button type="button" className="dash-hero" onClick={() => navigate('/employees')}>
              <div>
                <span>{regionLabel ? `${regionLabel} headcount` : 'Total Employees'}</span>
                <strong>{employees.length}</strong>
                <em>{activeShare}% active</em>
              </div>
              <i aria-hidden="true">
                <TrackerIcon type="contract" size="lg" />
              </i>
            </button>
            <button type="button" className="dash-metric" onClick={() => navigate('/employees')}>
              <ProgressRing value={activeEmployees} max={employees.length || 1} />
              <div>
                <span>Active staff</span>
                <strong>{activeEmployees}</strong>
              </div>
            </button>
            <button type="button" className="dash-metric" onClick={() => navigate('/leaves')}>
              <ProgressRing
                value={buckets.approvals.length}
                max={leaves.length || 1}
                tone="forest"
              />
              <div>
                <span>Pending approvals</span>
                <strong>{buckets.approvals.length}</strong>
              </div>
            </button>
            <article className="dash-chart">
              <div className="dash-card__head">
                <h2>Activity</h2>
                <small>Leaves and travel over six months</small>
              </div>
              <AreaChart points={activityPoints} />
            </article>
          </section>

          <section>
            <div className="dash-card__head">
              <h2>{regionLabel ? `${regionLabel} operations & compliance` : 'Current operations'}</h2>
              {regionLabel ? (
                <small className="dash-regional-note">
                  Adapted for {active.complianceStandards.join(' · ')}
                </small>
              ) : null}
            </div>
            <div className="dash-modules">
              {modules.map((item) => (
                <button
                  key={item.key || item.label}
                  type="button"
                  className={`dash-module${item.regional ? ' dash-module--regional' : ''}`}
                  onClick={() => navigate(item.to)}
                >
                  <em>
                    <TrackerIcon type={item.icon} size="md" />
                  </em>
                  <strong>{item.label}</strong>
                  <small>{item.hint}</small>
                  <span>{item.tag}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="dash-split">
            <article className="dash-card">
              <div className="dash-card__head">
                <h2>Workforce by department</h2>
              </div>
              <ul className="dash-bars">
                {departmentBars.length === 0 ? (
                  <li className="dash-empty">No department data yet.</li>
                ) : (
                  departmentBars.map((row) => (
                    <li key={row.label}>
                      <div>
                        <strong>{row.label}</strong>
                        <small>{row.value}</small>
                      </div>
                      <b style={{ width: `${row.pct}%` }} />
                    </li>
                  ))
                )}
              </ul>
            </article>

            <article className="dash-card">
              <div className="dash-card__head">
                <h2>My Tasks</h2>
              </div>
              <div className="dash-pills" role="tablist" aria-label="Task lists">
                {[
                  ['approvals', `Approvals (${buckets.approvals.length})`],
                  [
                    'followups',
                    `Follow-ups (${buckets.attentionPassports.length + buckets.followUps.length})`,
                  ],
                  ['upcoming', `Upcoming (${buckets.upcoming.length})`],
                  ['completed', `Completed (${buckets.completed.length})`],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={taskTab === key}
                    className={taskTab === key ? 'is-active' : ''}
                    onClick={() => setTaskTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ul className="dash-task-list">
                {taskRows.length === 0 ? (
                  <li className="dash-empty">Nothing in this list.</li>
                ) : (
                  taskRows.slice(0, 5).map((row) => (
                    <li key={row.id}>
                      <span className="dash-avatar" aria-hidden="true">
                        {initials(row.title)}
                      </span>
                      <div>
                        <strong>{row.title}</strong>
                        <small>{row.meta}</small>
                      </div>
                      <em>{row.tag}</em>
                      <button type="button" className="dash-mini" onClick={() => navigate(row.to)}>
                        {row.action}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </article>
          </section>

          <section className="dash-quick">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                className="dash-quick__tile"
                onClick={() => navigate(action.to)}
              >
                <TrackerIcon type={action.icon} size="md" />
                {action.label}
              </button>
            ))}
          </section>
        </div>

        <aside className="dash-side">
          <article className="dash-card">
            <div className="dash-card__head">
              <h2>Record mix</h2>
            </div>
            <ul className="dash-mix">
              {mixRows.map((row) => (
                <li key={row.label}>
                  <button type="button" onClick={() => navigate(row.to)}>
                    <span>
                      {row.label}
                      <small>{row.value}</small>
                    </span>
                    <b style={{ width: `${row.pct}%` }} />
                  </button>
                </li>
              ))}
            </ul>
          </article>

          <article className="dash-card">
            <div className="dash-card__head">
              <h2>Upcoming schedule</h2>
            </div>
            <ul className="dash-schedule">
              {schedule.length === 0 ? (
                <li className="dash-empty">No upcoming items in the next 21 days.</li>
              ) : (
                schedule.map((item) => (
                  <li key={item.id}>
                    <button type="button" className={`is-${item.tone}`} onClick={() => navigate(item.to)}>
                      <small>{item.when}</small>
                      <strong>{item.title}</strong>
                      <span>{item.meta}</span>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </article>
        </aside>
      </div>
    </div>
  )
}
