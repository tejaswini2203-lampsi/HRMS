import { useCallback, useEffect, useMemo, useState } from 'react'
import PageHeader from '../components/common/PageHeader'
import Badge from '../components/common/Badge'
import Button from '../components/common/Button'
import DataTable from '../components/tables/DataTable'
import FormSelect from '../components/forms/FormSelect'
import { useAuth } from '../context/AuthContext'
import { useSubsidiary } from '../context/SubsidiaryContext'
import { useFeatureFlags } from '../context/FeatureFlagsContext'
import { useToast } from '../context/ToastContext'
import SubsidiarySwitcher from '../components/layout/SubsidiarySwitcher'
import { ROLES, ROLE_LABELS, SLA_RULES } from '../config/featureFlags'
import { canManageRoles, ROLE_CAPABILITIES } from '../utils/permissions'
import {
  getAuthUsers,
  updateAuthUserRole,
  updateAuthUserStatus,
} from '../services/api/auth'
import { formatEmpCode } from '../services/api'

const ROLE_LIST_ORDER = { ADMIN: 1, HR: 2, HOD: 3, EMPLOYEE: 4 }

function sortUsersByRole(list) {
  return [...list].sort(
    (a, b) => (ROLE_LIST_ORDER[a.role] || 9) - (ROLE_LIST_ORDER[b.role] || 9),
  )
}

const TOGGLE_FLAGS = [
  {
    key: 'leaveHodApprovalMandatory',
    label: 'HOD approval mandatory for all leave types',
    question: 'Open Q1',
  },
  {
    key: 'flightEligibilityRequired',
    label: 'Flight eligibility required per employee',
    question: 'Open Q7',
  },
  {
    key: 'passportEscalation90Days',
    label: 'Passport 90-day escalation reminders',
    question: 'Proposed / Q3',
  },
  {
    key: 'passportEscalation30Days',
    label: 'Passport 30-day escalation reminders',
    question: 'Proposed / Q3',
  },
]

const READONLY_FLAGS = [
  {
    key: 'passportAlert180Days',
    label: 'Passport 180-day baseline email alert',
    question: 'Confirmed',
  },
  {
    key: 'passportWarning40Days',
    label: 'Passport 40-day warning',
    question: 'Draft v1.0',
  },
  {
    key: 'leaveHrCanApproveDirectly',
    label: 'HR can approve leave directly',
    question: 'Open Q2',
  },
  {
    key: 'vehicleApprovalWorkflow',
    label: 'Vehicle approval workflow',
    question: 'Open Q5',
  },
  {
    key: 'flightApprovalWorkflow',
    label: 'Flight approval workflow',
    question: 'Open Q6',
  },
]

export default function SettingsPage() {
  const { user } = useAuth()
  const { active, activeId, canSwitch, subsidiaries, isDefaultTheme } = useSubsidiary()
  const toast = useToast()
  const { flags, toggleFlag, setFlag, resetFlags } = useFeatureFlags()
  const isAdmin = canManageRoles(user?.role)

  const [users, setUsers] = useState([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [usersError, setUsersError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const loadUsers = useCallback(async () => {
    if (!isAdmin) return
    setUsersLoading(true)
    setUsersError(null)
    try {
      const res = await getAuthUsers()
      setUsers(sortUsersByRole(res.data))
    } catch (e) {
      setUsersError(e.message || 'Failed to load users')
    } finally {
      setUsersLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  const onRoleChange = async (row, role) => {
    setBusyId(row.userId)
    try {
      const res = await updateAuthUserRole(row.userId, role)
      setUsers((list) =>
        sortUsersByRole(list.map((u) => (u.userId === row.userId ? res.data : u))),
      )
      toast.success('Role updated')
    } catch (e) {
      toast.error(e.message || 'Failed to update role')
    } finally {
      setBusyId(null)
    }
  }

  const onToggleActive = async (row) => {
    setBusyId(row.userId)
    try {
      const res = await updateAuthUserStatus(row.userId, !row.isActive)
      setUsers((list) =>
        sortUsersByRole(list.map((u) => (u.userId === row.userId ? res.data : u))),
      )
      toast.success(res.data.isActive ? 'User activated' : 'User deactivated')
    } catch (e) {
      toast.error(e.message || 'Failed to update status')
    } finally {
      setBusyId(null)
    }
  }

  const userColumns = useMemo(
    () => [
      {
        key: 'username',
        header: 'Username',
        render: (r) => <span className="cell-primary">{r.username}</span>,
      },
      {
        key: 'employee',
        header: 'Employee',
        render: (r) => (
          <span>
            <span className="cell-primary">{r.employeeName || '—'}</span>
            <div className="muted mono" style={{ fontSize: '0.75rem' }}>
              {formatEmpCode(r.empId)}
            </div>
          </span>
        ),
      },
      {
        key: 'role',
        header: 'Role',
        render: (r) => (
          <FormSelect
            id={`role-${r.userId}`}
            label=""
            value={r.role}
            disabled={busyId === r.userId}
            onChange={(e) => onRoleChange(r, e.target.value)}
            options={Object.values(ROLES).map((role) => ({
              value: role,
              label: ROLE_LABELS[role],
            }))}
            placeholder=""
          />
        ),
      },
      {
        key: 'status',
        header: 'Status',
        render: (r) => (
          <Badge variant={r.isActive ? 'success' : 'neutral'}>
            {r.isActive ? 'Active' : 'Inactive'}
          </Badge>
        ),
      },
      {
        key: 'actions',
        header: '',
        render: (r) => (
          <Button
            variant="secondary"
            size="sm"
            disabled={busyId === r.userId}
            onClick={() => onToggleActive(r)}
          >
            {r.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        ),
      },
    ],
    [busyId],
  )

  return (
    <div>
      <PageHeader
        title="Administration"
        subtitle="Profile, role management, and runtime configuration flags."
        actions={
          <Button variant="secondary" onClick={resetFlags}>
            Reset flags
          </Button>
        }
      />

      <div className="content-grid">
        <section className="panel" id="profile">
          <div className="panel__header">
            <h2>Profile</h2>
          </div>
          <div className="panel__body info-grid">
            <div className="info-item">
              <label>Name</label>
              <p>{user?.name}</p>
            </div>
            <div className="info-item">
              <label>Email</label>
              <p>{user?.email}</p>
            </div>
            <div className="info-item">
              <label>Employee ID</label>
              <p className="mono">{formatEmpCode(user?.empId)}</p>
            </div>
            <div className="info-item">
              <label>Current Role</label>
              <p>
                <Badge variant="primary">
                  {ROLE_LABELS[user?.role] || user?.role}
                </Badge>
              </p>
            </div>
          </div>
          <div style={{ marginTop: '1rem' }}>
            <h3 style={{ fontSize: '0.82rem', marginBottom: '0.4rem' }}>
              Role capabilities (Draft v1.0)
            </h3>
            <ul
              style={{
                margin: 0,
                paddingLeft: '1.1rem',
                color: 'var(--color-text-secondary)',
                fontSize: '0.85rem',
              }}
            >
              {(ROLE_CAPABILITIES[user?.role] || []).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <h2>Account</h2>
          </div>
          <div className="panel__body">
            <p className="muted" style={{ fontSize: '0.88rem' }}>
              Authentication is validated by the backend. Session tokens are
              stored for this browser tab until logout.
            </p>
            <div className="info-item" style={{ marginTop: '0.85rem' }}>
              <label>Username</label>
              <p>{user?.username || user?.email || '—'}</p>
            </div>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: '1rem' }} id="workspace">
        <div className="panel__header">
          <h2>Subsidiary Workspace</h2>
          {canSwitch ? (
            <SubsidiarySwitcher />
          ) : (
            <span
              className="settings-sub-pill"
              style={{
                '--sub-badge': active.branding.badge,
                background: active.branding.accentSoft,
              }}
            >
              <i aria-hidden="true" />
              {active.label}
            </span>
          )}
        </div>
        <div className="panel__body">
          <p className="muted" style={{ fontSize: '0.86rem', marginBottom: '1rem' }}>
            {canSwitch
              ? isDefaultTheme
                ? 'You are in the default enterprise (teal) theme viewing all regions. Switch to a subsidiary to apply regional colors and filter data.'
                : 'Regional theme and data filters are active for the selected subsidiary.'
              : 'Your account is assigned to this subsidiary. Data views and validation rules follow regional labour requirements.'}
          </p>
          <div className="settings-sub-grid">
            {canSwitch ? (
              <article
                className={isDefaultTheme ? 'is-active' : ''}
                style={{
                  '--sub-badge': active.branding.badge,
                  '--sub-soft': active.branding.accentSoft,
                }}
              >
                <header>
                  <i aria-hidden="true" />
                  <strong>{active.label}</strong>
                  {isDefaultTheme ? <span>Active</span> : null}
                </header>
                <p>Default teal theme · all regions</p>
                <ul>
                  {active.complianceStandards.map((std) => (
                    <li key={std}>{std}</li>
                  ))}
                </ul>
              </article>
            ) : null}
            {subsidiaries.map((sub) => (
              <article
                key={sub.id}
                className={!isDefaultTheme && sub.id === activeId ? 'is-active' : ''}
                style={{
                  '--sub-badge': sub.branding.badge,
                  '--sub-soft': sub.branding.accentSoft,
                }}
              >
                <header>
                  <i aria-hidden="true" />
                  <strong>{sub.label}</strong>
                  {!isDefaultTheme && sub.id === activeId ? <span>Active</span> : null}
                </header>
                <p>{sub.city} · {sub.currency}</p>
                <ul>
                  {sub.complianceStandards.map((std) => (
                    <li key={std}>{std}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </div>
      </section>

      {isAdmin ? (
        <section className="panel" style={{ marginTop: '1rem' }} id="users">
          <div className="panel__header">
            <h2>User Role Management</h2>
            <Button variant="secondary" size="sm" onClick={loadUsers}>
              Refresh
            </Button>
          </div>
          <div className="panel__body" style={{ paddingTop: 0 }}>
            <p className="muted" style={{ fontSize: '0.82rem', marginBottom: '0.75rem' }}>
              New employees automatically receive an Employee-role login.
              Username is the employee email when provided. The initial
              password is set by the server (EICS_DEFAULT_PASSWORD) and is
              never shown here.
            </p>
            <DataTable
              columns={userColumns}
              rows={users}
              loading={usersLoading}
              error={usersError}
              onRetry={loadUsers}
              emptyTitle="No application users"
              emptyDescription="Seed AppUser records via the backend schema script."
            />
          </div>
        </section>
      ) : null}

      <section className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel__header">
          <h2>Runtime Configuration Switches</h2>
          <span className="config-note">Persisted in this browser</span>
        </div>
        <div className="panel__body" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <ul className="list-plain">
            {TOGGLE_FLAGS.map((row) => (
              <li key={row.key}>
                <div>
                  <strong>{row.label}</strong>
                  <div className="muted">{row.question}</div>
                </div>
                <button
                  type="button"
                  className={`flag-toggle ${flags[row.key] ? 'is-on' : ''}`}
                  aria-pressed={Boolean(flags[row.key])}
                  onClick={() => toggleFlag(row.key)}
                >
                  {flags[row.key]
                    ? row.key.includes('Escalation')
                      ? 'Active'
                      : 'Enabled'
                    : row.key.includes('Escalation')
                      ? 'Proposed'
                      : 'Disabled'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel__header">
          <h2>Additional Flags</h2>
        </div>
        <div className="panel__body" style={{ paddingTop: 0, paddingBottom: 0 }}>
          <ul className="list-plain">
            {READONLY_FLAGS.map((row) => (
              <li key={row.key}>
                <div>
                  <strong>{row.label}</strong>
                  <div className="muted">{row.question}</div>
                </div>
                <button
                  type="button"
                  className={`flag-toggle ${flags[row.key] ? 'is-on' : ''}`}
                  aria-pressed={Boolean(flags[row.key])}
                  onClick={() => setFlag(row.key, !flags[row.key])}
                >
                  {flags[row.key] ? 'Enabled' : 'Disabled'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <div className="panel__header">
          <h2>SLA Lead-Time Rules</h2>
        </div>
        <div className="panel__body info-grid">
          <div className="info-item">
            <label>Leave</label>
            <p>Leave request workflow (HOD / HR) — status tracked in LVE column</p>
          </div>
          <div className="info-item">
            <label>Passport</label>
            <p>
              {SLA_RULES.passport.baselineDays}d baseline +{' '}
              {SLA_RULES.passport.warningDays}d warning
              {flags.passportEscalation90Days || flags.passportEscalation30Days
                ? ' + escalation active'
                : ' (90/30 proposed)'}
            </p>
          </div>
          <div className="info-item">
            <label>Vehicle</label>
            <p>{SLA_RULES.vehicle.leadDays}-day review window</p>
          </div>
          <div className="info-item">
            <label>Flight</label>
            <p>
              {SLA_RULES.flight.leadDays}-day / prior-month{' '}
              {SLA_RULES.flight.financeCutoffDay}th finance cutoff
            </p>
          </div>
        </div>
      </section>

      <style>{`
        .settings-sub-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          padding: 0.35rem 0.75rem;
          border-radius: 999px;
          font-size: 0.78rem;
          font-weight: 700;
        }
        .settings-sub-pill i {
          width: 9px;
          height: 9px;
          border-radius: 999px;
          background: var(--sub-badge, #64748b);
        }
        .settings-sub-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.75rem;
        }
        .settings-sub-grid article {
          border: 1px solid var(--color-border);
          border-radius: 14px;
          padding: 0.85rem;
          background: #fff;
        }
        .settings-sub-grid article.is-active {
          border-color: var(--sub-badge, var(--color-primary));
          background: var(--sub-soft, var(--color-primary-soft));
        }
        .settings-sub-grid header {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          margin-bottom: 0.35rem;
        }
        .settings-sub-grid header i {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          background: var(--sub-badge, #64748b);
        }
        .settings-sub-grid header span {
          margin-left: auto;
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--sub-badge, var(--color-primary));
        }
        .settings-sub-grid p {
          margin: 0 0 0.5rem;
          font-size: 0.78rem;
          color: var(--color-text-muted);
        }
        .settings-sub-grid ul {
          margin: 0;
          padding-left: 1rem;
          font-size: 0.76rem;
          color: var(--color-text-secondary);
        }
        @media (max-width: 900px) {
          .settings-sub-grid {
            grid-template-columns: 1fr;
          }
        }
        .flag-toggle {
          min-width: 96px;
          height: 32px;
          border-radius: 999px;
          border: 1px solid var(--color-border);
          background: var(--color-neutral-bg);
          color: var(--color-neutral);
          font: inherit;
          font-size: 0.78rem;
          font-weight: 650;
          cursor: pointer;
        }
        .flag-toggle.is-on {
          background: #ecfdf5;
          border-color: #99f6e4;
          color: #0f766e;
        }
      `}</style>
    </div>
  )
}
