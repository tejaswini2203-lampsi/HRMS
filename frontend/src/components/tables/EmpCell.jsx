import { Link } from 'react-router-dom'
import { formatEmpCode, fullName, getEmployeeById } from '../../services/api'

/**
 * Compact employee identity cell for lists/tables.
 * Shows primary name + secondary Emp ID.
 */
export default function EmpCell({ emp, empId, link = true }) {
  const employee = emp || getEmployeeById(empId)
  if (!employee) {
    return <span className="emp-cell emp-cell--empty">—</span>
  }

  const body = (
    <>
      <span className="emp-cell__name">{fullName(employee)}</span>
      <span className="emp-cell__id">{formatEmpCode(employee.id)}</span>
    </>
  )

  if (!link) {
    return <span className="emp-cell">{body}</span>
  }

  return (
    <Link
      to={`/employees/${employee.id}`}
      className="emp-cell emp-cell--link"
      onClick={(e) => e.stopPropagation()}
    >
      {body}
    </Link>
  )
}
