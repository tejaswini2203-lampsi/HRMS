import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/common/PageHeader'
import Badge, { statusBadgeVariant } from '../components/common/Badge'
import ActionMenu from '../components/common/ActionMenu'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import DataTable from '../components/tables/DataTable'
import EmpCell from '../components/tables/EmpCell'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormDatePicker from '../components/forms/FormDatePicker'
import { useAuth } from '../context/AuthContext'
import { useSubsidiary } from '../context/SubsidiaryContext'
import { useToast } from '../context/ToastContext'
import { useFeatureFlags } from '../context/FeatureFlagsContext'
import { canManageFlights } from '../utils/permissions'
import { scopeEmployees, scopeByEmpId } from '../utils/scope'
import { formatDate } from '../utils/dates'
import {
  getFlightTickets,
  createFlightTicket,
  updateFlightTicket,
  getEmployees,
  fullName,
  getEmployeeById,
} from '../services/api'
import { ticketTypes, bookingStatuses } from '../data/mockData'

const emptyForm = {
  empId: '',
  travelDate: '',
  returnDate: '',
  sector: '',
  ticketType: '',
  bookingStatus: 'Pending',
}

export default function FlightsPage() {
  const { user } = useAuth()
  const { activeId } = useSubsidiary()
  const toast = useToast()
  const { flags: featureFlags } = useFeatureFlags()
  const canManage = canManageFlights(user?.role)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])

  const [empId, setEmpId] = useState('')
  const [ticketType, setTicketType] = useState('')
  const [bookingStatus, setBookingStatus] = useState('')
  const [travelDate, setTravelDate] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [fRes, empRes] = await Promise.all([
        getFlightTickets({
          empId: empId || undefined,
          ticketType: ticketType || undefined,
          bookingStatus: bookingStatus || undefined,
          travelDate: travelDate || undefined,
        }),
        getEmployees(),
      ])
      setEmployees(scopeEmployees(user, empRes.data, activeId))
      setRows(scopeByEmpId(user, fRes.data, empRes.data, activeId))
    } catch (e) {
      setError(e.message || 'Failed to load flights')
    } finally {
      setLoading(false)
    }
  }, [empId, ticketType, bookingStatus, travelDate, user, activeId])

  useEffect(() => {
    load()
  }, [load])

  const historyFor = useMemo(() => {
    if (!detail) return []
    return rows
      .filter((f) => f.empId === detail.empId)
      .sort((a, b) => String(b.travelDate).localeCompare(String(a.travelDate)))
  }, [detail, rows])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setErrors({})
    setFormOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setForm({
      empId: row.empId,
      travelDate: row.travelDate,
      returnDate: row.returnDate || '',
      sector: row.sector,
      ticketType: row.ticketType,
      bookingStatus: row.bookingStatus,
    })
    setErrors({})
    setFormOpen(true)
  }

  const validate = () => {
    const next = {}
    if (!form.empId) next.empId = 'Employee is required'
    if (!form.travelDate) next.travelDate = 'Travel date is required'
    if (
      form.returnDate &&
      form.travelDate &&
      form.returnDate < form.travelDate
    ) {
      next.returnDate = 'Return date must be on or after travel date'
    }
    if (!form.sector.trim()) next.sector = 'Sector / route is required'
    if (!form.ticketType) next.ticketType = 'Ticket type is required'
    if (!form.bookingStatus) next.bookingStatus = 'Booking status is required'

    if (featureFlags.flightEligibilityRequired) {
      const emp = employees.find((e) => e.id === form.empId)
      if (emp && !emp.flightEligible) {
        next.empId = 'Selected employee is not marked flight-eligible'
      }
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      if (editing) {
        await updateFlightTicket(editing.id, form)
        toast.success('Flight ticket updated')
      } else {
        await createFlightTicket({
          ...form,
          markedBy: user.empId,
        })
        toast.success('Flight ticket added')
      }
      setFormOpen(false)
      await load()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const columns = [
    {
      key: 'empId',
      header: 'Employee',
      sortValue: (r) => fullName(getEmployeeById(r.empId)),
      render: (r) => <EmpCell empId={r.empId} />,
    },
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
      header: 'Booking Status',
      render: (r) => (
        <Badge variant={statusBadgeVariant(r.bookingStatus)}>
          {r.bookingStatus}
        </Badge>
      ),
    },
    {
      key: 'markedBy',
      header: 'Marked By',
      sortValue: (r) => fullName(getEmployeeById(r.markedBy)) || r.markedBy,
      render: (r) => fullName(getEmployeeById(r.markedBy)) || r.markedBy || '—',
    },
    {
      key: 'markedDate',
      header: 'Marked Date',
      render: (r) => formatDate(r.markedDate),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      align: 'right',
      render: (r) => (
        <ActionMenu
          items={[
            { label: 'View', onClick: () => setDetail(r) },
            canManage && { label: 'Edit', onClick: () => openEdit(r) },
          ]}
        />
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Flight Tickets"
        subtitle="Track travel bookings, status, and ticket history."
        primaryAction={
          canManage ? { label: 'Add Ticket', onClick: openCreate } : undefined
        }
      />

      <div className="filters-bar">
        {user?.role !== 'EMPLOYEE' ? (
          <FormSelect
            id="ft-emp"
            label="Employee"
            value={empId}
            onChange={(e) => setEmpId(e.target.value)}
            options={employees.map((e) => ({
              value: e.id,
              label: `${e.id} — ${fullName(e)}`,
            }))}
            placeholder="All employees"
          />
        ) : null}
        <FormSelect
          id="ft-type"
          label="Ticket Type"
          value={ticketType}
          onChange={(e) => setTicketType(e.target.value)}
          options={ticketTypes}
          placeholder="All types"
        />
        <FormSelect
          id="ft-status"
          label="Booking Status"
          value={bookingStatus}
          onChange={(e) => setBookingStatus(e.target.value)}
          options={bookingStatuses}
          placeholder="All statuses"
        />
        <FormDatePicker
          id="ft-date"
          label="Travel Date"
          value={travelDate}
          onChange={(e) => setTravelDate(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyTitle="No flight tickets"
        onRowClick={setDetail}
      />

      <Modal
        open={formOpen}
        title={editing ? 'Edit Flight Ticket' : 'Add Flight Ticket'}
        onClose={() => setFormOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} loading={saving}>
              Save
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <FormSelect
            id="ft-emp-form"
            label="Employee"
            required
            value={form.empId}
            error={errors.empId}
            onChange={(e) => setForm((f) => ({ ...f, empId: e.target.value }))}
            options={employees
              .filter((e) => e.status === 'Active')
              .map((e) => ({
                value: e.id,
                label: `${e.id} — ${fullName(e)}${
                  e.flightEligible ? '' : ' (eligibility unset)'
                }`,
              }))}
            hint={
              featureFlags.flightEligibilityRequired
                ? 'Only eligible employees can receive tickets'
                : 'Flight eligibility is tracked but not enforced (configurable)'
            }
          />
          <FormDatePicker
            id="ft-travel"
            label="Travel Date"
            required
            value={form.travelDate}
            error={errors.travelDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, travelDate: e.target.value }))
            }
          />
          <FormDatePicker
            id="ft-return"
            label="Return Date"
            value={form.returnDate}
            error={errors.returnDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, returnDate: e.target.value }))
            }
          />
          <FormInput
            id="ft-sector"
            label="Sector / Route"
            required
            placeholder="e.g. DXB → LHR"
            value={form.sector}
            error={errors.sector}
            onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
          />
          <FormSelect
            id="ft-tt"
            label="Ticket Type"
            required
            value={form.ticketType}
            error={errors.ticketType}
            onChange={(e) =>
              setForm((f) => ({ ...f, ticketType: e.target.value }))
            }
            options={ticketTypes}
          />
          <FormSelect
            id="ft-bs"
            label="Booking Status"
            required
            value={form.bookingStatus}
            error={errors.bookingStatus}
            onChange={(e) =>
              setForm((f) => ({ ...f, bookingStatus: e.target.value }))
            }
            options={bookingStatuses}
            placeholder=""
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(detail)}
        title="Flight Ticket Detail"
        onClose={() => setDetail(null)}
        size="lg"
      >
        {detail ? (
          <div className="stack-sm" style={{ gap: '1rem' }}>
            <div className="info-grid">
              <div className="info-item">
                <label>Employee</label>
                <p>{fullName(getEmployeeById(detail.empId))}</p>
              </div>
              <div className="info-item">
                <label>Travel Date</label>
                <p>{formatDate(detail.travelDate)}</p>
              </div>
              <div className="info-item">
                <label>Return Date</label>
                <p>{formatDate(detail.returnDate)}</p>
              </div>
              <div className="info-item">
                <label>Sector</label>
                <p>{detail.sector}</p>
              </div>
              <div className="info-item">
                <label>Ticket Type</label>
                <p>{detail.ticketType}</p>
              </div>
              <div className="info-item">
                <label>Booking Status</label>
                <p>
                  <Badge variant={statusBadgeVariant(detail.bookingStatus)}>
                    {detail.bookingStatus}
                  </Badge>
                </p>
              </div>
              <div className="info-item">
                <label>Marked By</label>
                <p>
                  {detail.markedBy} · {formatDate(detail.markedDate)}
                </p>
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                Employee Ticket History
              </h3>
              <ul className="list-plain">
                {historyFor.map((h) => (
                  <li key={h.id}>
                    <span>
                      {formatDate(h.travelDate)} · {h.sector} · {h.ticketType}
                    </span>
                    <Badge variant={statusBadgeVariant(h.bookingStatus)}>
                      {h.bookingStatus}
                    </Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
