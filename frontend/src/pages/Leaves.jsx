import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/common/PageHeader'
import Badge, { statusBadgeVariant } from '../components/common/Badge'
import ActionMenu from '../components/common/ActionMenu'
import Modal from '../components/common/Modal'
import Button from '../components/common/Button'
import ConfirmDialog from '../components/common/ConfirmDialog'
import DataTable from '../components/tables/DataTable'
import EmpCell from '../components/tables/EmpCell'
import FormSelect from '../components/forms/FormSelect'
import FormDatePicker from '../components/forms/FormDatePicker'
import FormTextarea from '../components/forms/FormTextarea'
import { useAuth } from '../context/AuthContext'
import { useSubsidiary } from '../context/SubsidiaryContext'
import { useToast } from '../context/ToastContext'
import { useFeatureFlags } from '../context/FeatureFlagsContext'
import {
  canApproveLeaveAsHod,
  canApproveLeaveAsHr,
} from '../utils/permissions'
import { scopeEmployees, scopeByEmpId } from '../utils/scope'
import { formatDate, formatDateTime } from '../utils/dates'
import {
  getLeaves,
  createLeave,
  updateLeave,
  approveLeave,
  rejectLeave,
  cancelLeave,
  getEmployees,
  fullName,
  getEmployeeById,
} from '../services/api'
import { leaveTypes } from '../data/mockData'

const emptyForm = {
  empId: '',
  leaveType: '',
  leaveDayType: 'Full Day',
  fromDate: '',
  toDate: '',
  reason: '',
}

export default function LeavesPage() {
  const { user } = useAuth()
  const { activeId } = useSubsidiary()
  const toast = useToast()
  const { flags: featureFlags } = useFeatureFlags()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [employees, setEmployees] = useState([])

  const [empId, setEmpId] = useState('')
  const [leaveType, setLeaveType] = useState('')
  const [status, setStatus] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const [detail, setDetail] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [leaveRes, empRes] = await Promise.all([
        getLeaves({ empId, leaveType, status, fromDate, toDate }),
        getEmployees(),
      ])
      const visibleEmps = scopeEmployees(user, empRes.data, activeId).filter(
        (e) => e.status === 'Active',
      )
      setEmployees(visibleEmps)
      setRows(scopeByEmpId(user, leaveRes.data, empRes.data, activeId))
    } catch (e) {
      setError(e.message || 'Failed to load leaves')
    } finally {
      setLoading(false)
    }
  }, [empId, leaveType, status, fromDate, toDate, user, activeId])

  useEffect(() => {
    load()
  }, [load])

  const employeeOptions = useMemo(
    () => employees.map((e) => ({ value: e.id, label: `${e.id} — ${fullName(e)}` })),
    [employees],
  )

  const openApply = () => {
    setEditing(null)
    setForm({
      ...emptyForm,
      empId: user?.role === 'EMPLOYEE' ? user.empId : '',
    })
    setErrors({})
    setFormOpen(true)
  }

  const openEdit = (row) => {
    setEditing(row)
    setForm({
      empId: row.empId,
      leaveType: row.leaveType,
      leaveDayType: row.leaveDayType || 'Full Day',
      fromDate: row.fromDate,
      toDate: row.toDate,
      reason: row.reason,
    })
    setErrors({})
    setFormOpen(true)
  }

  const validate = () => {
    const next = {}
    if (!form.empId) next.empId = 'Employee is required'
    if (!form.leaveType) next.leaveType = 'Leave type is required'
    if (!form.leaveDayType) next.leaveDayType = 'Leave day type is required'
    if (!form.fromDate) next.fromDate = 'From date is required'
    if (!form.toDate) next.toDate = 'To date is required'
    if (form.fromDate && form.toDate && form.toDate < form.fromDate) {
      next.toDate = 'To date must be on or after From date'
    }
    if (!form.reason.trim()) next.reason = 'Reason is required'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const onSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      if (editing) {
        await updateLeave(editing.id, form)
        toast.success('Leave request updated')
      } else {
        await createLeave({
          ...form,
          initiatedBy: user.empId,
          initiatedRole: user.role,
          initiatedByName: user.name,
        })
        toast.success('Leave request submitted')
      }
      setFormOpen(false)
      await load()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const runAction = async () => {
    if (!confirm) return
    setBusy(true)
    try {
      const { type, row } = confirm
      if (type === 'approve') {
        await approveLeave(row.id, { role: user.role, by: user.empId })
        toast.success('Leave approved')
      } else if (type === 'reject') {
        await rejectLeave(row.id, { by: user.empId })
        toast.success('Leave rejected')
      } else if (type === 'cancel') {
        await cancelLeave(row.id)
        toast.success('Leave cancelled')
      }
      setConfirm(null)
      setDetail(null)
      await load()
    } catch (e) {
      toast.error(e.message || 'Action failed')
    } finally {
      setBusy(false)
    }
  }

  const actionsFor = (row) => {
    const items = [{ label: 'View', onClick: () => setDetail(row) }]
    if (row.status === 'Pending') {
      items.push({ label: 'Edit', onClick: () => openEdit(row) })
      if (canApproveLeaveAsHod(user?.role) && featureFlags.leaveHodApprovalMandatory) {
        items.push({ label: 'Approve (HOD)', onClick: () => setConfirm({ type: 'approve', row }) })
      }
      if (
        canApproveLeaveAsHr(user?.role) &&
        (featureFlags.leaveHrCanApproveDirectly || !featureFlags.leaveHodApprovalMandatory)
      ) {
        items.push({ label: 'Approve (HR)', onClick: () => setConfirm({ type: 'approve', row }) })
      }
      if (canApproveLeaveAsHod(user?.role) || canApproveLeaveAsHr(user?.role)) {
        items.push({
          label: 'Reject',
          danger: true,
          onClick: () => setConfirm({ type: 'reject', row }),
        })
      }
      items.push({
        label: 'Cancel',
        danger: true,
        onClick: () => setConfirm({ type: 'cancel', row }),
      })
    }
    if (row.status === 'HOD Approved' && canApproveLeaveAsHr(user?.role)) {
      items.push({ label: 'Confirm (HR)', onClick: () => setConfirm({ type: 'approve', row }) })
      items.push({
        label: 'Reject',
        danger: true,
        onClick: () => setConfirm({ type: 'reject', row }),
      })
    }
    if (row.status === 'HOD Approved') {
      items.push({
        label: 'Cancel',
        danger: true,
        onClick: () => setConfirm({ type: 'cancel', row }),
      })
    }
    return items
  }

  const columns = [
    {
      key: 'empId',
      header: 'Employee',
      sortValue: (r) => fullName(getEmployeeById(r.empId)),
      render: (r) => <EmpCell empId={r.empId} />,
    },
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
      key: 'initiatedBy',
      header: 'Initiated By',
      sortValue: (r) => fullName(getEmployeeById(r.initiatedBy)) || r.initiatedBy,
      render: (r) => {
        const name =
          fullName(getEmployeeById(r.initiatedBy)) || r.initiatedBy || '—'
        return (
          <span>
            <span className="cell-primary">{name}</span>
            {r.initiatedRole ? (
              <span className="cell-secondary"> · {r.initiatedRole}</span>
            ) : null}
          </span>
        )
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge>
      ),
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (r) => formatDate(r.createdAt),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      align: 'right',
      render: (r) => <ActionMenu items={actionsFor(r)} />,
    },
  ]

  const confirmCopy = {
    approve: 'Approve this leave request?',
    reject: 'Reject this leave request?',
    cancel: 'Cancel this leave request?',
  }

  return (
    <div>
      <PageHeader
        title="Leave Management"
        subtitle="Apply, review, and track employee leave requests"
        primaryAction={{ label: 'Apply Leave', onClick: openApply }}
      />

      <div className="filters-bar">
        {user?.role !== 'EMPLOYEE' ? (
          <FormSelect
            id="leave-emp"
            label="Employee"
            value={empId}
            onChange={(e) => setEmpId(e.target.value)}
            options={employeeOptions}
            placeholder="All employees"
          />
        ) : null}
        <FormSelect
          id="leave-type"
          label="Leave Type"
          value={leaveType}
          onChange={(e) => setLeaveType(e.target.value)}
          options={leaveTypes}
          placeholder="All types"
        />
        <FormSelect
          id="leave-status"
          label="Status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            'Pending',
            'HOD Approved',
            'HR Approved',
            'Rejected',
            'Cancelled',
          ]}
          placeholder="All statuses"
        />
        <FormDatePicker
          id="leave-from"
          label="From"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
        />
        <FormDatePicker
          id="leave-to"
          label="To"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
        />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyTitle="No leave requests"
        onRowClick={setDetail}
      />

      <Modal
        open={formOpen}
        title={editing ? 'Update Leave Request' : 'Apply Leave'}
        onClose={() => setFormOpen(false)}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={onSave} loading={saving}>
              {editing ? 'Save changes' : 'Submit'}
            </Button>
          </>
        }
      >
        <div className="form-grid">
          <FormSelect
            id="apply-emp"
            label="Employee"
            required
            value={form.empId}
            error={errors.empId}
            onChange={(e) => setForm((f) => ({ ...f, empId: e.target.value }))}
            options={employeeOptions}
            disabled={user?.role === 'EMPLOYEE'}
          />
          <FormSelect
            id="apply-type"
            label="Leave Type"
            required
            value={form.leaveType}
            error={errors.leaveType}
            onChange={(e) => setForm((f) => ({ ...f, leaveType: e.target.value }))}
            options={leaveTypes}
          />
          <FormSelect
            id="apply-day-type"
            label="Leave Day Type"
            required
            value={form.leaveDayType}
            error={errors.leaveDayType}
            onChange={(e) =>
              setForm((f) => ({ ...f, leaveDayType: e.target.value }))
            }
            options={['Full Day', 'Half Day']}
          />
          <FormDatePicker
            id="apply-from"
            label="From Date"
            required
            value={form.fromDate}
            error={errors.fromDate}
            onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
          />
          <FormDatePicker
            id="apply-to"
            label="To Date"
            required
            value={form.toDate}
            error={errors.toDate}
            onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
          />
          <div className="form-span-2">
            <FormTextarea
              id="apply-reason"
              label="Reason"
              required
              value={form.reason}
              error={errors.reason}
              onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(detail)}
        title="Leave Request Detail"
        onClose={() => setDetail(null)}
        size="lg"
      >
        {detail ? (
          <div className="stack-sm" style={{ gap: '1.25rem' }}>
            <div className="info-grid">
              <div className="info-item">
                <label>Employee</label>
                <p>{fullName(getEmployeeById(detail.empId))}</p>
              </div>
              <div className="info-item">
                <label>Leave Type</label>
                <p>{detail.leaveType}</p>
              </div>
              <div className="info-item">
                <label>Leave Day Type</label>
                <p>{detail.leaveDayType || 'Full Day'}</p>
              </div>
              <div className="info-item">
                <label>Status</label>
                <p>
                  <Badge variant={statusBadgeVariant(detail.status)}>
                    {detail.status}
                  </Badge>
                </p>
              </div>
              <div className="info-item">
                <label>From</label>
                <p>{formatDate(detail.fromDate)}</p>
              </div>
              <div className="info-item">
                <label>To</label>
                <p>{formatDate(detail.toDate)}</p>
              </div>
              <div className="info-item">
                <label>Initiated</label>
                <p>
                  {detail.initiatedRole} · {formatDateTime(detail.createdAt)}
                </p>
              </div>
            </div>
            <div>
              <label className="form-field__label">Reason</label>
              <p>{detail.reason}</p>
            </div>
            <div>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '0.75rem' }}>
                Approval Timeline
              </h3>
              <ul className="timeline">
                {detail.timeline?.map((step) => (
                  <li
                    key={step.step}
                    className={`timeline__item ${
                      step.status === 'done'
                        ? 'is-done'
                        : step.status === 'current'
                          ? 'is-current'
                          : ''
                    }`}
                  >
                    <span className="timeline__dot" aria-hidden="true" />
                    <div>
                      <div className="timeline__title">{step.step}</div>
                      <div className="timeline__meta">
                        {step.by || '—'}
                        {step.at ? ` · ${formatDateTime(step.at)}` : ''}
                        {step.status === 'skipped' ? ' · Skipped' : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title="Confirm leave action"
        message={confirm ? confirmCopy[confirm.type] : ''}
        confirmLabel="Confirm"
        danger={confirm && ['reject', 'cancel'].includes(confirm.type)}
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={runAction}
      />
    </div>
  )
}
