import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { TRACKER_COLORS } from '../../config/featureFlags'
import { useFeatureFlags } from '../../context/FeatureFlagsContext'
import { formatEmpCode, fullName } from '../../services/api'
import { formatDate } from '../../utils/dates'
import { ACTION_COLUMNS, countdownBadge, evaluateSla, complianceTone } from '../../utils/sla'
import { DEFAULT_THEME } from '../../config/subsidiaries'
import { useSubsidiary } from '../../context/SubsidiaryContext'
import {
  buildTimelineWindow,
  dateToX,
  spanToRect,
  todayX,
} from '../../utils/timeline'
import { TrackerIcon, ownerLabel } from './TrackerIcons'
import './ComplianceMatrixGrid.css'

const MARKER = {
  flight: { glyph: '✈', color: TRACKER_COLORS.flight },
  passport: { glyph: '●', color: TRACKER_COLORS.passport },
  vehicle: { glyph: '▣', color: TRACKER_COLORS.vehicle },
  leave: { glyph: '▬', color: TRACKER_COLORS.leave },
}

const MODULE_META = {
  leave: { label: 'Leave', color: TRACKER_COLORS.leave },
  passport: { label: 'Passport', color: TRACKER_COLORS.passport },
  vehicle: { label: 'Vehicle', color: TRACKER_COLORS.vehicle },
  flight: { label: 'Flight', color: TRACKER_COLORS.flight },
}

const SVG_W = 640
const SVG_H = 44
const ROW_PAD_Y = 22
const WINDOW_DAYS = 30

function pickActive(list) {
  return (list || []).find((r) => r.isActive || r.status === 'Active') || null
}

function upcomingLeave(leaves = []) {
  const today = new Date().toISOString().slice(0, 10)
  return (
    [...leaves]
      .filter(
        (l) => !['Rejected', 'Cancelled'].includes(l.status) && l.toDate >= today,
      )
      .sort((a, b) => a.fromDate.localeCompare(b.fromDate))[0] || null
  )
}

function upcomingFlight(flights = []) {
  const today = new Date().toISOString().slice(0, 10)
  return (
    [...flights]
      .filter((f) => f.bookingStatus !== 'Cancelled' && f.travelDate >= today)
      .sort((a, b) => a.travelDate.localeCompare(b.travelDate))[0] || null
  )
}

function buildEmployeeBundle(emp, data) {
  const leaves = data.leaves.filter((l) => l.empId === emp.id)
  const passports = data.passports.filter((p) => p.empId === emp.id)
  const vehicles = data.vehicles.filter((v) => v.empId === emp.id)
  const flights = data.flights.filter((f) => f.empId === emp.id)

  const passport = pickActive(passports)
  const vehicle = pickActive(vehicles.filter((v) => v.status === 'Active'))
  const leave = upcomingLeave(leaves)
  const flight = upcomingFlight(flights)

  return {
    emp,
    leaves,
    passports,
    vehicles,
    flights,
    dates: {
      leave: leave?.fromDate || null,
      passport: passport?.expiryDate || null,
      vehicle: vehicle?.allocatedFrom || null,
      flight: flight?.travelDate || null,
      flightReturn: flight?.returnDate || null,
    },
    records: { passport, vehicle, leave, flight },
  }
}

function TimelineSvg({ bundle, window, onMarkerClick }) {
  const leaveSpan = bundle.records.leave
    ? spanToRect(
        bundle.records.leave.fromDate,
        bundle.records.leave.toDate,
        window,
        SVG_W,
      )
    : null

  const markers = [
    { type: 'passport', date: bundle.dates.passport },
    { type: 'vehicle', date: bundle.dates.vehicle },
    { type: 'flight', date: bundle.dates.flight },
  ]
    .map((m) => ({ ...m, x: dateToX(m.date, window, SVG_W) }))
    .filter((m) => m.x != null)

  const tx = todayX(window, SVG_W)

  return (
    <svg
      className="cmg-svg"
      viewBox={`0 0 ${SVG_W} ${SVG_H}`}
      width="100%"
      height={SVG_H}
      role="img"
      aria-label={`30-day timeline for ${fullName(bundle.emp)}`}
    >
      {window.dayTicks.map((d, idx) => {
        const x0 = (idx / window.days) * SVG_W
        const w = SVG_W / window.days
        return (
          <rect
            key={d.key}
            x={x0}
            y={0}
            width={w}
            height={SVG_H}
            fill={idx % 2 === 0 ? '#F8FBFD' : '#FFFFFF'}
          />
        )
      })}

      {window.dayTicks
        .filter((d) => d.isMajor)
        .map((d, idx, arr) => {
          const dayIndex = window.dayTicks.findIndex((t) => t.key === d.key)
          const x = (dayIndex / window.days) * SVG_W
          return (
            <g key={`tick-${d.key}`}>
              <line
                x1={x}
                y1={SVG_H - 8}
                x2={x}
                y2={SVG_H}
                stroke="#C5D3DE"
                strokeWidth="1"
              />
              {(idx === 0 || idx === arr.length - 1 || dayIndex % 5 === 0) && (
                <text
                  x={x + 2}
                  y={SVG_H - 1}
                  fontSize="7"
                  fill="#6B7785"
                  fontFamily="IBM Plex Mono, monospace"
                >
                  {d.label}
                </text>
              )}
            </g>
          )
        })}

      <line
        x1="0"
        y1={ROW_PAD_Y}
        x2={SVG_W}
        y2={ROW_PAD_Y}
        stroke="#D7E2EA"
        strokeWidth="1"
      />

      {tx != null ? (
        <line
          x1={tx}
          y1="2"
          x2={tx}
          y2={SVG_H - 2}
          stroke={TRACKER_COLORS.headerNavy}
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
      ) : null}

      {leaveSpan ? (
        <g>
          <defs>
            <pattern
              id={`leave-hatch-${bundle.emp.id}`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="6"
                stroke={TRACKER_COLORS.leave}
                strokeWidth="1.5"
                opacity="0.35"
              />
            </pattern>
          </defs>
          <rect
            x={leaveSpan.x}
            y={10}
            width={leaveSpan.width}
            height={24}
            rx="4"
            fill={TRACKER_COLORS.leaveHatch}
            stroke={TRACKER_COLORS.leave}
            strokeWidth="1.25"
          />
          <rect
            x={leaveSpan.x}
            y={10}
            width={leaveSpan.width}
            height={24}
            rx="4"
            fill={`url(#leave-hatch-${bundle.emp.id})`}
          />
          <title>
            Leave span: {bundle.records.leave.fromDate} →{' '}
            {bundle.records.leave.toDate} ({bundle.records.leave.leaveType})
          </title>
        </g>
      ) : null}

      {markers
        .filter((m) => ['passport', 'flight'].includes(m.type))
        .map((m) =>
          tx != null ? (
            <line
              key={`sla-${m.type}`}
              x1={tx}
              y1={ROW_PAD_Y}
              x2={m.x}
              y2={ROW_PAD_Y}
              stroke={MARKER[m.type].color}
              strokeWidth="1"
              strokeDasharray="2 3"
              opacity="0.45"
            />
          ) : null,
        )}

      {markers.map((m) => (
        <g
          key={m.type}
          className="cmg-marker"
          transform={`translate(${m.x}, ${ROW_PAD_Y})`}
          onClick={(e) => {
            e.stopPropagation()
            onMarkerClick?.(m.type)
          }}
          style={{ cursor: 'pointer' }}
        >
          <circle
            r="9"
            fill="#fff"
            stroke={MARKER[m.type].color}
            strokeWidth="2"
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="8"
            fill={MARKER[m.type].color}
            fontFamily="IBM Plex Sans, sans-serif"
          >
            {MARKER[m.type].glyph}
          </text>
          <title>
            {m.type}: {m.date}
          </title>
        </g>
      ))}
    </svg>
  )
}

function ActionCell({ type, date, endDate, flags }) {
  const meta = MODULE_META[type] || { label: type, color: '#64748b' }
  const sla = evaluateSla(type, date, flags)
  const owner = ownerLabel(sla.owner)

  if (!date) {
    return (
      <div
        className="cmg-action cmg-action--empty"
        title={`No upcoming ${meta.label.toLowerCase()} item`}
        style={{ '--module-color': meta.color }}
      >
        <TrackerIcon type={type} size="lg" />
        <span className="cmg-action__sr">{meta.label}: none</span>
      </div>
    )
  }

  const tone = complianceTone(date)
  const levelClass =
    tone === 'critical'
      ? 'is-critical'
      : tone === 'renewal'
        ? 'is-renewal'
        : 'is-ok'

  const tip = [
    meta.label,
    sla.label,
    `Owner: ${owner || 'HR'}`,
    type === 'flight' && endDate
      ? `Travel ${formatDate(date)} · Return ${formatDate(endDate)}`
      : formatDate(date),
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      className={`cmg-action ${levelClass}${
        owner &&
        (sla.level === 'action' ||
          sla.level === 'watch' ||
          sla.level === 'overdue')
          ? ' has-owner'
          : ''
      }`}
      title={tip}
      style={{ '--module-color': meta.color }}
      aria-label={tip}
    >
      <TrackerIcon type={type} size="lg" />
      {owner &&
      (sla.level === 'action' ||
        sla.level === 'watch' ||
        sla.level === 'overdue') ? (
        <span className="cmg-action__owner">{owner === 'Finance' ? 'FIN' : owner}</span>
      ) : null}
    </div>
  )
}

function DetailCard({ bundle }) {
  const items = [
    {
      key: 'leave',
      label: 'Leave Request',
      color: TRACKER_COLORS.leave,
      active: bundle.records.leave,
      history: bundle.leaves,
      dateKey: 'fromDate',
      endKey: 'toDate',
      idKey: 'leaveType',
    },
    {
      key: 'passport',
      label: 'Passport',
      color: TRACKER_COLORS.passport,
      active: bundle.records.passport,
      history: bundle.passports,
      dateKey: 'expiryDate',
      idKey: 'passportNumber',
    },
    {
      key: 'vehicle',
      label: 'Vehicle',
      color: TRACKER_COLORS.vehicle,
      active: bundle.records.vehicle,
      history: bundle.vehicles,
      dateKey: 'allocatedFrom',
      idKey: 'vehicleNumber',
    },
    {
      key: 'flight',
      label: 'Flight',
      color: TRACKER_COLORS.flight,
      active: bundle.records.flight,
      history: bundle.flights,
      dateKey: 'travelDate',
      endKey: 'returnDate',
      idKey: 'sector',
      endLabel: 'Return',
    },
  ]

  return (
    <div className="cmg-detail">
      <div className="cmg-detail__head">
        <div>
          <strong>{fullName(bundle.emp)}</strong>
          <span className="mono"> · {formatEmpCode(bundle.emp.id)}</span>
        </div>
        <Link to={`/employees/${bundle.emp.id}`} className="cmg-detail__link">
          Open full profile →
        </Link>
      </div>
      <div className="cmg-detail__grid cmg-detail__grid--4">
        {items.map((item) => (
          <article key={item.key} className="cmg-detail__card">
            <header style={{ borderColor: item.color }}>
              <span style={{ color: item.color }} className="cmg-detail__title">
                <TrackerIcon type={item.key} size="sm" />
                {item.label}
              </span>
              {item.active?.[item.dateKey] ? (
                <span className="cmg-countdown">
                  {countdownBadge(item.active[item.dateKey])}
                </span>
              ) : (
                <span className="muted">None</span>
              )}
            </header>
            {item.active ? (
              <div className="cmg-kv">
                <span className="cmg-kv__badge">{item.active[item.idKey] || '—'}</span>
                <span className="cmg-kv__badge">
                  {item.key === 'leave' && item.endKey
                    ? `${formatDate(item.active[item.dateKey])} – ${formatDate(item.active[item.endKey])}`
                    : item.key === 'flight'
                      ? `Travel ${formatDate(item.active[item.dateKey])}`
                      : `Due ${formatDate(item.active[item.dateKey])}`}
                </span>
                {item.key === 'flight' && item.active[item.endKey] ? (
                  <span className="cmg-kv__badge">
                    Return {formatDate(item.active[item.endKey])}
                  </span>
                ) : null}
                <span className={`cmg-kv__badge is-${complianceTone(item.active[item.dateKey])}`}>
                  {countdownBadge(item.active[item.dateKey])}
                </span>
              </div>
            ) : (
              <p className="muted">No active record</p>
            )}
            {item.history?.length > 1 ? (
              <details>
                <summary>History ({item.history.length})</summary>
                <ul>
                  {item.history.map((h) => (
                    <li key={h.id}>
                      <span className="mono">{h[item.idKey] || h.id}</span>
                      <span className="muted">
                        {' '}
                        · {formatDate(h[item.dateKey] || h.toDate)}
                        {h.isActive === false || h.status === 'Closed'
                          ? ' · archived'
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  )
}

export default function ComplianceMatrixGrid({
  employees = [],
  departments = [],
  leaves = [],
  passports = [],
  vehicles = [],
  flights = [],
}) {
  const { flags } = useFeatureFlags()
  const { active, subsidiaries, canSwitch, setActiveSubsidiary, activeId, isDefaultTheme } =
    useSubsidiary()
  const [expandedId, setExpandedId] = useState(null)
  const [dayOffset, setDayOffset] = useState(0)

  const window = useMemo(() => {
    const anchor = new Date()
    anchor.setHours(0, 0, 0, 0)
    anchor.setDate(anchor.getDate() + dayOffset)
    return buildTimelineWindow(anchor, WINDOW_DAYS)
  }, [dayOffset])

  const grouped = useMemo(() => {
    const data = { leaves, passports, vehicles, flights }
    const activeEmps = employees.filter((e) => e.status === 'Active')
    const depts = [...departments].sort((a, b) => (a.order || 0) - (b.order || 0))

    return depts
      .map((dept) => ({
        dept,
        rows: activeEmps
          .filter((e) => e.departmentId === dept.id)
          .map((e) => buildEmployeeBundle(e, data)),
      }))
      .filter((g) => g.rows.length > 0)
  }, [employees, departments, leaves, passports, vehicles, flights])

  const toggle = (id) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="cmg">
      <div className="cmg-toolbar">
        <div className="cmg-pills" aria-label="Subsidiary filter">
          {canSwitch ? (
            <>
              <button
                type="button"
                className={`cmg-pill ${isDefaultTheme ? 'is-active' : ''}`}
                onClick={() => setActiveSubsidiary(null)}
              >
                {DEFAULT_THEME.label}
              </button>
              {subsidiaries.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`cmg-pill ${!isDefaultTheme && item.id === activeId ? 'is-active' : ''}`}
                  onClick={() => setActiveSubsidiary(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </>
          ) : (
                <span className="cmg-pill is-active">{active.label}</span>
              )}
        </div>
        <div className="cmg-legend">
          {ACTION_COLUMNS.map((c) => (
            <span key={c.key} className="cmg-legend__item">
              <span
                className="cmg-legend__icon"
                style={{ color: MODULE_META[c.type].color }}
              >
                <TrackerIcon type={c.type} size="sm" />
              </span>
              {c.label}
            </span>
          ))}
          <span className="cmg-legend__item">
            <i
              style={{
                background: TRACKER_COLORS.leaveHatch,
                border: `1px solid ${TRACKER_COLORS.leave}`,
              }}
            />
            Leave Span
          </span>
        </div>
        <div className="cmg-window-controls">
          <button
            type="button"
            onClick={() => setDayOffset((v) => v - 7)}
            aria-label="Previous week"
            title="Shift window back 7 days"
          >
            ‹
          </button>
          <span className="mono" title="1-month (30-day) rolling window">
            {window.label}
          </span>
          <button
            type="button"
            onClick={() => setDayOffset((v) => v + 7)}
            aria-label="Next week"
            title="Shift window forward 7 days"
          >
            ›
          </button>
          {dayOffset !== 0 ? (
            <button
              type="button"
              className="cmg-reset"
              onClick={() => setDayOffset(0)}
            >
              Today
            </button>
          ) : null}
        </div>
      </div>

      <div className="cmg-scroll">
        <div className="cmg-table" role="table" aria-label="Compliance matrix">
          <div className="cmg-head" role="row">
            <div className="cmg-col-emp" role="columnheader">
              Employee
            </div>
            <div className="cmg-col-timeline" role="columnheader">
              <div className="cmg-day-axis">
                <span>30-day window</span>
                <span className="mono">{window.label}</span>
              </div>
            </div>
            <div className="cmg-col-actions" role="columnheader">
              <div className="cmg-actions-head">
                {ACTION_COLUMNS.map((c) => (
                  <span
                    key={c.key}
                    title={c.label}
                    className="cmg-actions-head__item"
                    style={{ color: MODULE_META[c.type].color }}
                  >
                    <TrackerIcon type={c.type} size="lg" />
                    <em>{c.key}</em>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {grouped.map(({ dept, rows }) => (
            <div key={dept.id} className="cmg-dept-block">
              <div
                className="cmg-dept-header"
                style={{ background: dept.color || TRACKER_COLORS.headerNavy }}
                role="rowheader"
              >
                <strong>{dept.name}</strong>
                <span>{rows.length} employees</span>
              </div>

              {rows.map((bundle) => {
                const open = expandedId === bundle.emp.id
                return (
                  <div
                    key={bundle.emp.id}
                    className={`cmg-row-wrap ${open ? 'is-open' : ''}`}
                  >
                    <div
                      className="cmg-row"
                      role="row"
                      tabIndex={0}
                      onClick={() => toggle(bundle.emp.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          toggle(bundle.emp.id)
                        }
                      }}
                      aria-expanded={open}
                    >
                      <div className="cmg-col-emp" role="cell">
                        <Link
                          to={`/employees/${bundle.emp.id}`}
                          className="cmg-emp-link"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="cmg-emp-name">
                            {fullName(bundle.emp)}
                          </span>
                          <span className="mono cmg-emp-id">
                            {formatEmpCode(bundle.emp.id)}
                          </span>
                        </Link>
                      </div>
                      <div className="cmg-col-timeline" role="cell">
                        <TimelineSvg
                          bundle={bundle}
                          window={window}
                          onMarkerClick={() => toggle(bundle.emp.id)}
                        />
                      </div>
                      <div className="cmg-col-actions" role="cell">
                        <div className="cmg-actions-row">
                          {ACTION_COLUMNS.map((c) => (
                            <ActionCell
                              key={c.key}
                              type={c.type}
                              date={bundle.dates[c.type]}
                              endDate={
                                c.type === 'flight'
                                  ? bundle.dates.flightReturn
                                  : null
                              }
                              flags={flags}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                    {open ? <DetailCard bundle={bundle} /> : null}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
