import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/common/PageHeader'
import Badge, { statusBadgeVariant } from '../components/common/Badge'
import ActionMenu from '../components/common/ActionMenu'
import Modal from '../components/common/Modal'
import ConfirmDialog from '../components/common/ConfirmDialog'
import Button from '../components/common/Button'
import DataTable from '../components/tables/DataTable'
import EmpCell from '../components/tables/EmpCell'
import FormInput from '../components/forms/FormInput'
import FormSelect from '../components/forms/FormSelect'
import { useAuth } from '../context/AuthContext'
import { useSubsidiary } from '../context/SubsidiaryContext'
import { SUBSIDIARY_LIST, getEffectiveSubsidiaryId } from '../config/subsidiaries'
import {
  getRegionalRules,
  regionalEmailPlaceholder,
  validateRegionalEmail,
} from '../config/regionalRules'
import { useToast } from '../context/ToastContext'
import { canManageEmployees } from '../utils/permissions'
import { scopeEmployees } from '../utils/scope'
import {
  getEmployees,
  getDepartments,
  createEmployee,
  updateEmployee,
  deactivateEmployee,
  fullName,
  getDepartmentName,
  getEmployeeById,
} from '../services/api'

const emptyForm = {
  firstName: '',
  middleName: '',
  lastName: '',
  email: '',
  departmentId: '',
  reportsToId: '',
  status: 'Active',
  subsidiaryId: '',
}

export default function EmployeesPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { activeId, active } = useSubsidiary()
  const effectiveSubId = getEffectiveSubsidiaryId(activeId, user?.subsidiaryId || 'uae')
  const toast = useToast()
  const canManage = canManageEmployees(user?.role)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [departments, setDepartments] = useState([])
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState('')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)

  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [deactivating, setDeactivating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [empRes, deptRes] = await Promise.all([
        getEmployees({ departmentId, status }),
        getDepartments(),
      ])
      setRows(scopeEmployees(user, empRes.data, activeId))
      setDepartments(deptRes.data)
    } catch (e) {
      setError(e.message || 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }, [departmentId, status, user, activeId])

  useEffect(() => {
    load()
  }, [load])

  const filteredRows = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((e) => {
      const name = fullName(e).toLowerCase()
      return (
        e.id.toLowerCase().includes(q) ||
        name.includes(q) ||
        getDepartmentName(e.departmentId).toLowerCase().includes(q)
      )
    })
  }, [rows, search])

  const managerOptions = useMemo(() => {
    const pool = form.departmentId
      ? rows.filter((e) => e.departmentId === form.departmentId)
      : rows
    return pool
      .filter((e) => e.status === 'Active' && e.id !== editing?.id)
      .map((e) => ({ value: e.id, label: `${e.id} — ${fullName(e)}` }))
  }, [rows, editing, form.departmentId])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, subsidiaryId: effectiveSubId })
    setErrors({})
    setFormOpen(true)
  }

  const openEdit = (emp) => {
    setEditing(emp)
    setForm({
      firstName: emp.firstName,
      middleName: emp.middleName || '',
      lastName: emp.lastName,
      email: emp.email || '',
      departmentId: emp.departmentId,
      reportsToId: emp.reportsToId || '',
      status: emp.status,
      subsidiaryId: emp.subsidiaryId || effectiveSubId,
    })
    setErrors({})
    setFormOpen(true)
  }

  const validate = () => {
    const next = {}
    const subId = form.subsidiaryId || effectiveSubId
    if (!form.firstName.trim()) next.firstName = 'First name is required'
    if (!form.lastName.trim()) next.lastName = 'Last name is required'
    if (!form.departmentId) next.departmentId = 'Department is required'
    if (!form.subsidiaryId) next.subsidiaryId = 'Subsidiary is required'
    const emailCheck = validateRegionalEmail(form.email, subId)
    if (!emailCheck.valid) next.email = emailCheck.message
    if (form.reportsToId && editing && form.reportsToId === editing.id) {
      next.reportsToId = 'Employee cannot report to themselves'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const formRules = getRegionalRules(form.subsidiaryId || effectiveSubId)

  const onSave = async () => {
    if (!validate()) return
    setSaving(true)
    try {
      const payload = {
        ...form,
        reportsToId: form.reportsToId || null,
      }
      if (editing) {
        await updateEmployee(editing.id, payload)
        toast.success('Employee updated')
      } else {
        await createEmployee(payload)
        toast.success('Employee created. A login account was added with role Employee.')
      }
      setFormOpen(false)
      await load()
    } catch (e) {
      toast.error(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const onDeactivate = async () => {
    if (!deactivateTarget) return
    setDeactivating(true)
    try {
      await deactivateEmployee(deactivateTarget.id)
      toast.success(`${fullName(deactivateTarget)} deactivated`)
      setDeactivateTarget(null)
      await load()
    } catch (e) {
      toast.error(e.message || 'Deactivate failed')
    } finally {
      setDeactivating(false)
    }
  }

  const columns = [
    {
      key: 'name',
      header: 'Employee',
      sortValue: (row) => fullName(row),
      render: (row) => <EmpCell emp={row} />,
    },
    {
      key: 'departmentId',
      header: 'Department',
      sortValue: (row) => getDepartmentName(row.departmentId),
      render: (row) => getDepartmentName(row.departmentId),
    },
    {
      key: 'subsidiaryId',
      header: 'Subsidiary',
      sortValue: (row) => row.subsidiaryId || '',
      render: (row) => {
        const sub = SUBSIDIARY_LIST.find((s) => s.id === row.subsidiaryId)
        if (!sub) return <span className="cell-secondary">—</span>
        return (
          <span className="emp-sub-badge" style={{ '--sub-badge': sub.branding.badge }}>
            <i aria-hidden="true" />
            {sub.shortLabel}
          </span>
        )
      },
    },
    {
      key: 'reportsToId',
      header: 'Reports To',
      sortValue: (row) => fullName(getEmployeeById(row.reportsToId)),
      render: (row) =>
        row.reportsToId ? (
          <EmpCell empId={row.reportsToId} />
        ) : (
          <span className="cell-secondary">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      sortable: false,
      align: 'right',
      render: (row) => (
        <ActionMenu
          items={[
            {
              label: 'View',
              onClick: () => navigate(`/employees/${row.id}`),
            },
            canManage && {
              label: 'Edit',
              onClick: () => openEdit(row),
            },
            canManage &&
              row.status === 'Active' && {
                label: 'Deactivate',
                danger: true,
                onClick: () => setDeactivateTarget(row),
              },
          ]}
        />
      ),
    },
  ]

  return (
    <div>
      <PageHeader
        title="Employee Master"
        subtitle="Create, update, deactivate, and search employee records."
        primaryAction={
          canManage
            ? { label: 'Add Employee', onClick: openCreate }
            : undefined
        }
      />

      {user?.role !== 'EMPLOYEE' ? (
      <div className="filters-bar">
          <>
            <div className="form-field form-field--grow">
              <label className="form-field__label" htmlFor="emp-search">
                Search employee
              </label>
              <input
                id="emp-search"
                className="form-control"
                placeholder="Name, Emp ID, department…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <FormSelect
              id="emp-dept"
              label="Department"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
              placeholder="All departments"
            />
            <FormSelect
              id="emp-status"
              label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={['Active', 'Inactive']}
              placeholder="All statuses"
            />
          </>
      </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={filteredRows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyTitle="No employees found"
        emptyDescription="Adjust filters or add a new employee record."
        onRowClick={(row) => navigate(`/employees/${row.id}`)}
      />

      <Modal
        open={formOpen}
        title={editing ? 'Edit Employee' : 'Add Employee'}
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
          {editing ? (
            <FormInput
              id="emp-id"
              label="Emp ID"
              value={editing.id}
              disabled
              hint="System-generated and immutable"
            />
          ) : (
            <div className="form-field">
              <span className="form-field__label">Emp ID</span>
              <p className="muted">Will be generated on save (e.g. EMP0013)</p>
            </div>
          )}
          <FormSelect
            id="emp-status-form"
            label="Status"
            required
            value={form.status}
            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
            options={['Active', 'Inactive']}
            placeholder=""
          />
          <FormInput
            id="emp-fn"
            label="First Name"
            required
            value={form.firstName}
            error={errors.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
          />
          <FormInput
            id="emp-mn"
            label="Middle Name"
            value={form.middleName}
            onChange={(e) => setForm((f) => ({ ...f, middleName: e.target.value }))}
          />
          <FormInput
            id="emp-ln"
            label="Last Name"
            required
            value={form.lastName}
            error={errors.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
          />
          <FormSelect
            id="emp-subsidiary"
            label="Subsidiary"
            required
            value={form.subsidiaryId}
            error={errors.subsidiaryId}
            hint={`Defaults to ${active.label}. Login accounts use regional email domains.`}
            onChange={(e) =>
              setForm((f) => ({ ...f, subsidiaryId: e.target.value }))
            }
            options={SUBSIDIARY_LIST.map((s) => ({
              value: s.id,
              label: s.label,
            }))}
            placeholder=""
          />
          <FormInput
            id="emp-email"
            label="Email"
            type="email"
            value={form.email}
            error={errors.email}
            hint={formRules.emailHint}
            placeholder={regionalEmailPlaceholder(form.subsidiaryId || effectiveSubId)}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          />
          <FormSelect
            id="emp-dept-form"
            label="Department"
            required
            value={form.departmentId}
            error={errors.departmentId}
            hint="Required. The department HOD will see this employee in Compliance Matrix and related lists."
            onChange={(e) =>
              setForm((f) => ({ ...f, departmentId: e.target.value }))
            }
            options={departments.map((d) => ({ value: d.id, label: d.name }))}
          />
          <FormSelect
            id="emp-reports"
            label="Reports To"
            value={form.reportsToId}
            error={errors.reportsToId}
            onChange={(e) =>
              setForm((f) => ({ ...f, reportsToId: e.target.value }))
            }
            options={managerOptions}
            placeholder="Select manager (optional)"
            hint="Must reference an existing active employee"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deactivateTarget)}
        title="Deactivate employee"
        message={`Are you sure you want to deactivate ${
          deactivateTarget ? fullName(deactivateTarget) : ''
        }? They will no longer appear as active in compliance workflows.`}
        confirmLabel="Deactivate"
        danger
        loading={deactivating}
        onCancel={() => setDeactivateTarget(null)}
        onConfirm={onDeactivate}
      />
      <style>{`
        .emp-sub-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.78rem;
          font-weight: 650;
        }
        .emp-sub-badge i {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          background: var(--sub-badge, #64748b);
        }
      `}</style>
    </div>
  )
}
