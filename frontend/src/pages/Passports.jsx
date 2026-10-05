import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'
import Badge from '../components/common/Badge'
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
import { canManagePassports } from '../utils/permissions'
import { scopeEmployees, scopeByEmpId } from '../utils/scope'
import { formatDate, expiryCountdownLabel } from '../utils/dates'
import { getPassportExpiryStatus } from '../utils/passportStatus'
import {
  getPassports,
  createPassport,
  updatePassport,
  getEmployees,
  getPassportAlerts,
  fullName,
  getEmployeeById,
} from '../services/api'

const emptyForm = {
  empId: '',
  passportNumber: '',
  nationality: '',
  issueDate: '',
  expiryDate: '',
}

export default function PassportsPage() {
  const { user } = useAuth()
  const { activeId } = useSubsidiary()
  const toast = useToast()
  const { flags: featureFlags } = useFeatureFlags()
  const canManage = canManagePassports(user?.role)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [alerts, setAlerts] = useState([])
  const [search, setSearch] = useState('')
  const [empId, setEmpId] = useState('')
  const [activeFilter, setActiveFilter] = useState('active')

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
      const [ppRes, empRes, nRes] = await Promise.all([
        getPassports({ empId: empId || undefined }),
        getEmployees(),
        getPassportAlerts(),
      ])
      setEmployees(scopeEmployees(user, empRes.data, activeId))
      setRows(scopeByEmpId(user, ppRes.data, empRes.data, activeId))
      setAlerts(scopeByEmpId(user, nRes.data, empRes.data, activeId))
    } catch (e) {
      setError(e.message || 'Failed to load passports')
    } finally {
      setLoading(false)
    }
  }, [empId, user, activeId])

  useEffect(() => {
    load()
  }, [load])

  const filtered = useMemo(() => {
    let list = [...rows]
    if (activeFilter === 'active') list = list.filter((p) => p.isActive)
    if (activeFilter === 'archived') list = list.filter((p) => !p.isActive)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.passportNumber.toLowerCase().includes(q) ||
          p.nationality.toLowerCase().includes(q) ||
          fullName(getEmployeeById(p.empId)).toLowerCase().includes(q),
      )
    }
    return list
  }, [rows, activeFilter, search])

  const stats = useMemo(() => {
    const active = rows.filter((p) => p.isActive)
    let expiring = 0
    let critical = 0
    let expired = 0
    active.forEach((p) => {
      const s = getPassportExpiryStatus(p.expiryDate, featureFlags)
      if (s.key === 'expiring') expiring += 1
      if (s.key === 'critical') critical += 1
      if (s.key === 'expired') expired += 1
    })
    return { total: active.length, expiring, critical, expired }
  }, [rows, featureFlags])

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
      passportNumber: row.passportNumber,
      nationality: row.nationality,
      issueDate: row.issueDate,
      expiryDate: row.expiryDate,
    })
    setErrors({})
    setFormOpen(true)
  }

  const validate = () => {
    const next = {}
    if (!form.empId) next.empId = 'Employee is required'
    if (!form.passportNumber.trim()) next.passportNumber = 'Passport number is required'
    if (!form.nationality.trim()) next.nationality = 'Nationality is required'
    if (!form.issueDate) next.issueDate = 'Issue date is required'
    if (!form.expiryDate) next.expiryDate = 'Expiry date is required'
    if (form.issueDate && form.expiryDate && form.expiryDate <= form.issueDate) {
      next.expiryDate = 'Expiry must be after issue date'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      if (editing) {
        await updatePassport(editing.id, form)
        toast.success('Passport updated')
      } else {
        await createPassport(form)
        toast.success('Passport added (previous active passport archived if any)')
      }
      setFormOpen(false)
      await load()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const historyFor = (passport) =>
    rows.filter((p) => p.empId === passport.empId && p.id !== passport.id)

  const alertHistoryFor = (passport) =>
    alerts.filter((a) => a.relatedId === passport.id || a.empId === passport.empId)

  const columns = [
    {
      key: 'empId',
      header: 'Employee',
      sortValue: (r) => fullName(getEmployeeById(r.empId)),
      render: (r) => <EmpCell empId={r.empId} />,
    },
    { key: 'passportNumber', header: 'Passport Number' },
    { key: 'nationality', header: 'Nationality' },
    {
      key: 'issueDate',
      header: 'Issue Date',
      render: (r) => formatDate(r.issueDate),
    },
    {
      key: 'expiryDate',
      header: 'Expiry Date',
      render: (r) => formatDate(r.expiryDate),
    },
    {
      key: 'expiryStatus',
      header: 'Expiry Status',
      sortValue: (r) => getPassportExpiryStatus(r.expiryDate, featureFlags).days,
      render: (r) => {
        const s = getPassportExpiryStatus(r.expiryDate, featureFlags)
        return <Badge variant={s.variant}>{s.label}</Badge>
      },
    },
    {
      key: 'isActive',
      header: 'Active',
      render: (r) => (
        <Badge variant={r.isActive ? 'success' : 'neutral'}>
          {r.isActive ? 'Active' : 'Archived'}
        </Badge>
      ),
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
            canManage &&
              r.isActive && {
                label: 'Renew (Add New)',
                onClick: () => {
                  setEditing(null)
                  setForm({ ...emptyForm, empId: r.empId })
                  setErrors({})
                  setFormOpen(true)
                },
              },
          ]}
        />
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Passport"
        subtitle="Track passport validity, renewals, and compliance alerts."
        primaryAction={
          canManage ? { label: 'Add Passport', onClick: openCreate } : undefined
        }
      />

      {user?.role !== 'EMPLOYEE' ? (
        <div className="stat-grid">
          <StatCard label="Total Passports" value={stats.total} tone="primary" />
          <StatCard label="Expiring Soon" value={stats.expiring} tone="warning" />
          <StatCard label="Critical" value={stats.critical} tone="danger" />
          <StatCard label="Expired" value={stats.expired} tone="danger" />
        </div>
      ) : null}

      <div className="filters-bar">
        {user?.role !== 'EMPLOYEE' ? (
          <>
            <div className="form-field form-field--grow">
              <label className="form-field__label" htmlFor="pp-search">
                Search
              </label>
              <input
                id="pp-search"
                className="form-control"
                placeholder="Passport no., nationality, employee…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <FormSelect
              id="pp-emp"
              label="Employee"
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              options={employees.map((e) => ({
                value: e.id,
                label: `${e.id} — ${fullName(e)}`,
              }))}
              placeholder="All employees"
            />
          </>
        ) : null}
        <FormSelect
          id="pp-active"
          label="Active Status"
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value)}
          options={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'archived', label: 'Archived' },
          ]}
          placeholder=""
        />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        loading={loading}
        error={error}
        onRetry={load}
        emptyTitle="No passport records"
        onRowClick={setDetail}
      />

      <Modal
        open={formOpen}
        title={editing ? 'Update Passport' : 'Add Passport'}
        onClose={() => setFormOpen(false)}
        size="lg"
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
            id="pp-emp-form"
            label="Employee"
            required
            value={form.empId}
            error={errors.empId}
            disabled={Boolean(editing)}
            onChange={(e) => setForm((f) => ({ ...f, empId: e.target.value }))}
            options={employees
              .filter((e) => e.status === 'Active')
              .map((e) => ({ value: e.id, label: `${e.id} — ${fullName(e)}` }))}
          />
          <FormInput
            id="pp-number"
            label="Passport Number"
            required
            value={form.passportNumber}
            error={errors.passportNumber}
            onChange={(e) =>
              setForm((f) => ({ ...f, passportNumber: e.target.value }))
            }
          />
          <FormInput
            id="pp-nat"
            label="Nationality"
            required
            value={form.nationality}
            error={errors.nationality}
            onChange={(e) =>
              setForm((f) => ({ ...f, nationality: e.target.value }))
            }
          />
          <FormDatePicker
            id="pp-issue"
            label="Issue Date"
            required
            value={form.issueDate}
            error={errors.issueDate}
            onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
          />
          <FormDatePicker
            id="pp-expiry"
            label="Expiry Date"
            required
            value={form.expiryDate}
            error={errors.expiryDate}
            onChange={(e) =>
              setForm((f) => ({ ...f, expiryDate: e.target.value }))
            }
          />
        </div>
        {!editing ? (
          <p className="muted" style={{ marginTop: '0.85rem', fontSize: '0.82rem' }}>
            Saving a new passport archives any existing active passport for the
            employee. Historical records are retained.
          </p>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(detail)}
        title="Passport Detail"
        onClose={() => setDetail(null)}
        size="xl"
      >
        {detail ? (
          <div className="stack-sm" style={{ gap: '1.25rem' }}>
            <div className="info-grid">
              <div className="info-item">
                <label>Employee</label>
                <p>{fullName(getEmployeeById(detail.empId))}</p>
              </div>
              <div className="info-item">
                <label>Passport Number</label>
                <p className="mono">{detail.passportNumber}</p>
              </div>
              <div className="info-item">
                <label>Nationality</label>
                <p>{detail.nationality}</p>
              </div>
              <div className="info-item">
                <label>Issue Date</label>
                <p>{formatDate(detail.issueDate)}</p>
              </div>
              <div className="info-item">
                <label>Expiry Date</label>
                <p>{formatDate(detail.expiryDate)}</p>
              </div>
              <div className="info-item">
                <label>Countdown</label>
                <p>
                  <strong>{expiryCountdownLabel(detail.expiryDate)}</strong>
                </p>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                Alert History
              </h3>
              {alertHistoryFor(detail).length ? (
                <ul className="list-plain">
                  {alertHistoryFor(detail).map((a) => (
                    <li key={a.id}>
                      <span>
                        {a.alertType}
                        {a.proposed ? ' (proposed)' : ''}
                      </span>
                      <span className="muted">{formatDate(a.triggerDate)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No alert history for this passport.</p>
              )}
            </div>

            <div>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                Previous Passport Records
              </h3>
              {historyFor(detail).length ? (
                <ul className="list-plain">
                  {historyFor(detail).map((p) => (
                    <li key={p.id}>
                      <span>
                        {p.passportNumber} · {formatDate(p.issueDate)} –{' '}
                        {formatDate(p.expiryDate)}
                      </span>
                      <Badge variant="neutral">
                        {p.isActive ? 'Active' : 'Archived'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">No previous records.</p>
              )}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
