import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import Badge, { statusBadgeVariant } from '../components/common/Badge'
import Button from '../components/common/Button'
import ConfirmDialog from '../components/common/ConfirmDialog'
import LoadingState, { ErrorState } from '../components/common/LoadingState'
import EmployeeDetailTabs from '../components/employees/EmployeeDetailTabs'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { canManageEmployees } from '../utils/permissions'
import { canAccessEmployee } from '../utils/scope'
import {
  getEmployeeByIdApi,
  deactivateEmployee,
  getLeaves,
  getPassports,
  getVehicleAllocations,
  getFlightTickets,
  getPassportAlerts,
  getEmployees,
  fullName,
  getDepartmentName,
} from '../services/api'

function resolveDesignation(employee) {
  if (employee?.designation) return employee.designation
  if (!employee?.reportsToId) return 'Department Lead'
  return 'Employee'
}

export default function EmployeeDetailsPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const toast = useToast()
  const canManage = canManageEmployees(user?.role)

  const [tab, setTab] = useState('Overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [employee, setEmployee] = useState(null)
  const [leaves, setLeaves] = useState([])
  const [passports, setPassports] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [flights, setFlights] = useState([])
  const [alerts, setAlerts] = useState([])
  const [deactivateOpen, setDeactivateOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const allEmps = await getEmployees()
      if (!canAccessEmployee(user, id, allEmps.data)) {
        setError('You do not have permission to view this employee record.')
        setLoading(false)
        return
      }
      const [empRes, leaveRes, ppRes, vRes, fRes, nRes] = await Promise.all([
        getEmployeeByIdApi(id),
        getLeaves({ empId: id }),
        getPassports({ empId: id }),
        getVehicleAllocations({ empId: id }),
        getFlightTickets({ empId: id }),
        getPassportAlerts(),
      ])
      setEmployee(empRes.data)
      setLeaves(leaveRes.data)
      setPassports(ppRes.data)
      setVehicles(vRes.data)
      setFlights(fRes.data)
      setAlerts((nRes.data || []).filter((n) => n.empId === id))
    } catch (e) {
      setError(e.message || 'Employee not found')
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    load()
  }, [load])

  const onDeactivate = async () => {
    setBusy(true)
    try {
      await deactivateEmployee(employee.id)
      toast.success('Employee deactivated')
      setDeactivateOpen(false)
      await load()
    } catch (e) {
      toast.error(e.message || 'Failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingState label="Loading employee…" />
  if (error || !employee) {
    return (
      <ErrorState
        message={error || 'Employee not found'}
        onRetry={() => navigate('/dashboard')}
      />
    )
  }

  const initials = `${employee.firstName[0] || ''}${employee.lastName[0] || ''}`

  return (
    <div>
      <div className="profile-hero">
        <div className="profile-hero__banner" aria-hidden="true" />
        <div className="profile-hero__body">
          <div className="profile-hero__identity">
            <div className="profile-hero__avatar" aria-hidden="true">
              {initials}
            </div>
            <div>
              <p className="profile-hero__kicker">Employee Profile</p>
              <h1 className="profile-hero__name">{fullName(employee)}</h1>
              <div className="profile-hero__meta">
                <span className="profile-hero__meta-item mono">
                  <strong>{employee.id}</strong>
                </span>
                <span className="profile-hero__meta-item">
                  {getDepartmentName(employee.departmentId)}
                </span>
                <span className="profile-hero__meta-item">
                  {resolveDesignation(employee)}
                </span>
                <Badge variant={statusBadgeVariant(employee.status)}>
                  {employee.status}
                </Badge>
              </div>
            </div>
          </div>
          <div className="inline-actions">
            <Button variant="subtle" onClick={() => navigate('/compliance')}>
              Compliance Matrix
            </Button>
            {canManage ? (
              <Button variant="secondary" onClick={() => navigate('/employees')}>
                Employee Master
              </Button>
            ) : null}
            {canManage && employee.status === 'Active' ? (
              <Button variant="danger" onClick={() => setDeactivateOpen(true)}>
                Deactivate
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <EmployeeDetailTabs
        tab={tab}
        onTabChange={setTab}
        employee={employee}
        leaves={leaves}
        passports={passports}
        vehicles={vehicles}
        flights={flights}
        alerts={alerts}
      />

      <ConfirmDialog
        open={deactivateOpen}
        title="Deactivate employee"
        message={`Deactivate ${fullName(employee)}? This can be reviewed later by HR/Admin.`}
        confirmLabel="Deactivate"
        danger
        loading={busy}
        onCancel={() => setDeactivateOpen(false)}
        onConfirm={onDeactivate}
      />
    </div>
  )
}
