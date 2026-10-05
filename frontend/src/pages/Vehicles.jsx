import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/common/PageHeader'
import Badge, { statusBadgeVariant } from '../components/common/Badge'
import ActionMenu from '../components/common/ActionMenu'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import ConfirmDialog from '../components/common/ConfirmDialog'
import DataTable from '../components/tables/DataTable'
import EmpCell from '../components/tables/EmpCell'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import FormDatePicker from '../components/forms/FormDatePicker'
import { useAuth } from '../context/AuthContext'
import { useSubsidiary } from '../context/SubsidiaryContext'
import { useToast } from '../context/ToastContext'
import { canManageVehicles } from '../utils/permissions'
import { scopeEmployees, scopeByEmpId } from '../utils/scope'
import { formatDate } from '../utils/dates'
import {
  getVehicleAllocations,
  createVehicleAllocation,
  updateVehicleAllocation,
  closeVehicleAllocation,
  getEmployees,
  fullName,
  getEmployeeById,
} from '../services/api'
import { vehicleTypes } from '../data/mockData'

const emptyForm = {
  empId: '',
  vehicleNumber: '',
  vehicleType: '',
  allocatedFrom: '',
}

export default function VehiclesPage() {
  const { user } = useAuth()
  const { activeId } = useSubsidiary()
  const toast = useToast()
  const canManage = canManageVehicles(user?.role)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])
  const [empId, setEmpId] = useState('')
  const [vehicleType, setVehicleType] = useState('')
  const [status, setStatus] = useState('')
  const [search, setSearch] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState(null)
  const [closeTarget, setCloseTarget] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [vRes, empRes] = await Promise.all([
        getVehicleAllocations({
          empId: empId || undefined,
          vehicleType: vehicleType || undefined,
          status: status || undefined,
        }),
        getEmployees(),
      ])
      setEmployees(scopeEmployees(user, empRes.data, activeId))
      setRows(scopeByEmpId(user, vRes.data, empRes.data, activeId))
    } catch (e) {
      setError(e.message || 'Failed to load vehicles')
    } finally {
      setLoading(false)
    }
  }, [empId, vehicleType, status, user, activeId])

  useEffect(() => {
    load()
  }, [load])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((v) =>
      String(v.vehicleNumber || '')
        .toLowerCase()
        .includes(q),
    )
  }, [rows, search])

  const historyFor = useMemo(() => {
    if (!detail) return []
    return rows
      .filter((v) => v.empId === detail.empId)
      .sort((a, b) => String(b.allocatedFrom).localeCompare(String(a.allocatedFrom)))
  }, [detail, rows])

  const openAllocate = () => {
    setEditing(null)
    setForm({
      ...emptyForm,
      allocatedFrom: new Date().toISOString().slice(0, 10),
    })
    setErrors({})
    setFormOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setForm({
      empId: row.empId,
      vehicleNumber: row.vehicleNumber,
      vehicleType: row.vehicleType,
      allocatedFrom: row.allocatedFrom,
    })
    setErrors({})
    setFormOpen(true)
  }

  const validate = () => {
    const next = {}
    if (!form.empId) next.empId = 'Employee is required'
    if (!form.vehicleNumber.trim()) next.vehicleNumber = 'Vehicle number is required'
    if (!form.vehicleType) next.vehicleType = 'Vehicle type is required'
    if (!form.allocatedFrom) next.allocatedFrom = 'Allocated from is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      if (editing) {
        await updateVehicleAllocation(editing.id, form)
        toast.success('Allocation updated')
      } else {
        await createVehicleAllocation(form)
        toast.success('Vehicle allocated (previous active allocation closed if any)')
      }
      setFormOpen(false)
      await load()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const onClose = async () => {
    if (!closeTarget) return
    setBusy(true)
    try {
      await closeVehicleAllocation(closeTarget.id)
      toast.success('Allocation closed')
      setCloseTarget(null)
      setDetail(null)
      await load()
    } catch (e) {
      toast.error(e.message || 'Close failed')
    } finally {
      setBusy(false)
    }
  }

  const columns = [
    {
      key: 'empId',
      header: 'Employee',
      sortValue: (r) => fullName(getEmployeeById(r.empId)),
      render: (r) => <EmpCell empId={r.empId} />,
    },
    { key: 'vehicleNumber', header: 'Vehicle Number' },
    { key: 'vehicleType', header: 'Vehicle Type' },
    {
      key: 'allocatedFrom',
      header: 'Allocated From',
      render: (r) => formatDate(r.allocatedFrom),
    },
    {
      key: 'allocatedTo',
      header: 'Allocation End',
      render: (r) => formatDate(r.allocatedTo),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
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
            canManage &&
              r.status === 'Active' && {
                label: 'Edit',
                onClick: () => openEdit(r),
              },
            canManage &&
              r.status === 'Active' && {
                label: 'Close Allocation',
                danger: true,
                onClick: () => setCloseTarget(r),
              },
          ]}
        />
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Vehicle Allocation"
        subtitle="Allocate vehicles and maintain assignment history"
        primaryAction={
          canManage ? { label: 'Allocate Vehicle', onClick: openAllocate } : undefined
        }
      />

      <div className="filters-bar">
        {user?.role !== 'EMPLOYEE' ? (
          <div className="form-field form-field--grow">
            <label className="form-field__label" htmlFor="veh-search">
              Vehicle number
            </label>
            <input
              id="veh-search"
              className="form-control"
              placeholder="Search vehicle number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        ) : null}
        {user?.role !== 'EMPLOYEE' ? (
          <FormSelect
            id="veh-emp"
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
          id="veh-type"
          label="Vehicle Type"
          value={vehicleType}
          onChange={(e) => setVehicleType(e.target.value)}
          options={vehicleTypes}
          placeholder="All types"
        />
        <FormSelect
          id="veh-status"
          label="Active Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={['Active', 'Closed']}
          placeholder="All statuses"
        />
      </div>

      <DataTable
        columns={columns}
        rows={filteredRows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyTitle="No vehicle allocations"
        onRowClick={setDetail}
      />

      <Modal
        open={formOpen}
        title={editing ? 'Edit Allocation' : 'Allocate Vehicle'}
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
            id="alloc-emp"
            label="Allocate To"
            required
            value={form.empId}
            error={errors.empId}
            disabled={Boolean(editing)}
            onChange={(e) => setForm((f) => ({ ...f, empId: e.target.value }))}
            options={employees
              .filter((e) => e.status === 'Active')
              .map((e) => ({ value: e.id, label: `${e.id} — ${fullName(e)}` }))}
            hint="Employee who will receive this vehicle"
          />
          <FormInput
            id="alloc-num"
            label="Vehicle Number"
            required
            value={form.vehicleNumber}
            error={errors.vehicleNumber}
            onChange={(e) =>
              setForm((f) => ({ ...f, vehicleNumber: e.target.value }))
            }
          />
          <FormSelect
            id="alloc-type"
            label="Vehicle Type"
            required
            value={form.vehicleType}
            error={errors.vehicleType}
            onChange={(e) =>
              setForm((f) => ({ ...f, vehicleType: e.target.value }))
            }
            options={vehicleTypes}
          />
          <FormDatePicker
            id="alloc-from"
            label="Allocation From"
            required
            value={form.allocatedFrom}
            error={errors.allocatedFrom}
            onChange={(e) =>
              setForm((f) => ({ ...f, allocatedFrom: e.target.value }))
            }
          />
        </div>
        {!editing ? (
          <p className="muted" style={{ marginTop: '0.85rem', fontSize: '0.82rem' }}>
            An employee may have only one active allocation. Creating a new one
            closes any previous active assignment.
          </p>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(detail)}
        title="Allocation Detail & History"
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
                <label>Vehicle</label>
                <p>
                  {detail.vehicleNumber} · {detail.vehicleType}
                </p>
              </div>
              <div className="info-item">
                <label>Status</label>
                <p>
                  <Badge variant={statusBadgeVariant(detail.status)}>
                    {detail.status}
                  </Badge>
                </p>
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                Allocation History
              </h3>
              <ul className="list-plain">
                {historyFor.map((h) => (
                  <li key={h.id}>
                    <span>
                      {h.vehicleNumber} · {formatDate(h.allocatedFrom)} –{' '}
                      {formatDate(h.allocatedTo)}
                    </span>
                    <Badge variant={statusBadgeVariant(h.status)}>{h.status}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(closeTarget)}
        title="Close allocation"
        message="Close this vehicle allocation? The employee will have no active vehicle until a new one is assigned."
        confirmLabel="Close allocation"
        danger
        loading={busy}
        onCancel={() => setCloseTarget(null)}
        onConfirm={onClose}
      />
    </div>
  )
}
