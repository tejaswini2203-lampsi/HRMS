import { NavLink } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useSubsidiary } from '../../context/SubsidiaryContext'
import { canAccessMenu } from '../../utils/permissions'
import BrandMark from '../common/BrandMark'
import './Sidebar.css'

function Icon({ name }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }
  if (name === 'dashboard') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="8" height="8" rx="1.6" />
        <rect x="13" y="3" width="8" height="5" rx="1.6" />
        <rect x="13" y="10" width="8" height="11" rx="1.6" />
        <rect x="3" y="13" width="8" height="8" rx="1.6" />
      </svg>
    )
  }
  if (name === 'workQueue') {
    return (
      <svg {...common}>
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    )
  }
  if (name === 'compliance') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1.4" />
        <rect x="14" y="3" width="7" height="7" rx="1.4" />
        <rect x="3" y="14" width="7" height="7" rx="1.4" />
        <rect x="14" y="14" width="7" height="7" rx="1.4" />
      </svg>
    )
  }
  if (name === 'ksa') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v10M8 12h8" />
      </svg>
    )
  }
  if (name === 'uae') {
    return (
      <svg {...common}>
        <path d="M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16" />
        <path d="M9 9h6M9 13h6M9 17h6" />
      </svg>
    )
  }
  if (name === 'employees') {
    return (
      <svg {...common}>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
        <circle cx="17" cy="9" r="2.2" />
        <path d="M16 19a4.2 4.2 0 0 1 5-4" />
      </svg>
    )
  }
  if (name === 'requests') {
    return (
      <svg {...common}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M12 8v8M8 12h8" />
      </svg>
    )
  }
  if (name === 'documents') {
    return (
      <svg {...common}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
      </svg>
    )
  }
  if (name === 'performance') {
    return (
      <svg {...common}>
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    )
  }
  if (name === 'leaves') {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </svg>
    )
  }
  if (name === 'passports') {
    return (
      <svg {...common}>
        <rect x="6" y="3" width="12" height="18" rx="2" />
        <circle cx="12" cy="10" r="2.4" />
        <path d="M8.5 16h7" />
      </svg>
    )
  }
  if (name === 'vehicles') {
    return (
      <svg {...common}>
        <path d="M4 14 6 9h12l2 5" />
        <path d="M3 14h18v3a2 2 0 0 1-2 2h-1" />
        <circle cx="7.5" cy="18.5" r="1.5" />
        <circle cx="16.5" cy="18.5" r="1.5" />
      </svg>
    )
  }
  if (name === 'flights') {
    return (
      <svg {...common}>
        <path d="M21 16v-2l-8-5V4.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
      </svg>
    )
  }
  if (name === 'reports') {
    return (
      <svg {...common}>
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    )
  }
  if (name === 'audit') {
    return (
      <svg {...common}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    )
  }
  if (name === 'administration') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    )
  }
  if (name === 'notifications') {
    return (
      <svg {...common}>
        <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 9H4c0-2 2-2 2-9" />
        <path d="M10 21a2 2 0 0 0 4 0" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

const PRIMARY = [
  { key: 'dashboard', to: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { key: 'workQueue', to: '/work-queue', label: 'What To Do Today', icon: 'workQueue' },
  { key: 'compliance', to: '/compliance', label: 'Compliance Overview', icon: 'compliance' },
  { key: 'compliance', to: '/compliance/ksa', label: '🇸🇦 KSA Compliance', icon: 'ksa' },
  { key: 'compliance', to: '/compliance/uae', label: '🇦🇪 UAE Compliance', icon: 'uae' },
  { key: 'employees', to: '/employees', label: 'Employee Master', icon: 'employees' },
  { key: 'requests', to: '/requests', label: 'Requests Hub', icon: 'requests' },
  { key: 'documents', to: '/documents', label: 'Document Center', icon: 'documents' },
  { key: 'performance', to: '/performance', label: 'Performance Notes', icon: 'performance' },
  { key: 'leaves', to: '/leaves', label: 'Leave Management', icon: 'leaves' },
  { key: 'passports', to: '/passports', label: 'Passport Expiries', icon: 'passports' },
  { key: 'vehicles', to: '/vehicles', label: 'Vehicle Allocation', icon: 'vehicles' },
  { key: 'flights', to: '/flights', label: 'Flight Tickets', icon: 'flights' },
  { key: 'reports', to: '/reports', label: 'HRMS Reports', icon: 'reports' },
  { key: 'audit', to: '/audit', label: 'Platform Audit Trail', icon: 'audit' },
  { key: 'administration', to: '/administration', label: 'Administration', icon: 'administration' },
  { key: 'notifications', to: '/notifications', label: 'Notifications', icon: 'notifications' },
]

export default function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onLogout,
  badges = {},
}) {
  const { user } = useAuth()
  const { activeId, active, isDefaultTheme } = useSubsidiary()
  const role = user?.role
  const primary = PRIMARY.filter((item) => canAccessMenu(role, item.key))
  const canSettings = canAccessMenu(role, 'settings')
  const productName = active?.branding?.productName || 'EICS'

  const renderLink = (item) => (
    <NavLink
      key={item.to}
      to={item.to}
      className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
      title={item.label}
      onClick={onCloseMobile}
    >
      <span className="sidebar__icon">
        <Icon name={item.icon} />
      </span>
      {!collapsed ? <span className="sidebar__label">{item.label}</span> : null}
      {!collapsed && badges[item.key] > 0 ? (
        <span className="sidebar__badge">{badges[item.key]}</span>
      ) : null}
    </NavLink>
  )

  return (
    <>
      <div
        className={`sidebar-overlay ${mobileOpen ? 'is-open' : ''}`}
        onClick={onCloseMobile}
        aria-hidden={!mobileOpen}
      />
      <aside
        className={`sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}
        aria-label="Main navigation"
      >
        <div className="sidebar__brand">
          <BrandMark size={34} subsidiaryId={activeId} />
          {!collapsed ? (
            <div className="sidebar__name-wrap">
              <div className="sidebar__name">{productName}</div>
              {!isDefaultTheme && active?.shortLabel ? (
                <div className="sidebar__region">{active.shortLabel}</div>
              ) : null}
            </div>
          ) : null}
        </div>

        <nav className="sidebar__nav">{primary.map(renderLink)}</nav>

        <div className="sidebar__footer">
          {canSettings ? (
            <NavLink
              to="/settings"
              className={({ isActive }) => `sidebar__link ${isActive ? 'is-active' : ''}`}
              onClick={onCloseMobile}
            >
              <span className="sidebar__icon">
                <Icon name="administration" />
              </span>
              {!collapsed ? <span className="sidebar__label">Settings</span> : null}
            </NavLink>
          ) : (
            <button type="button" className="sidebar__logout" onClick={onLogout}>
              <span className="sidebar__icon" aria-hidden="true">
                ⎋
              </span>
              {!collapsed ? <span>Logout</span> : null}
            </button>
          )}
        </div>
      </aside>
    </>
  )
}
