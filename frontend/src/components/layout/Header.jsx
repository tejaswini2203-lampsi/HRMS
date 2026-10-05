import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ROLE_LABELS } from '../../config/featureFlags'
import { canAccessMenu } from '../../utils/permissions'
import Breadcrumbs from './Breadcrumbs'
import SubsidiarySwitcher from './SubsidiarySwitcher'
import './Header.css'

const SEARCH_MODULES = [
  { key: 'dashboard', to: '/dashboard', label: 'Dashboard' },
  { key: 'compliance', to: '/compliance', label: 'Compliance Matrix' },
  { key: 'employees', to: '/employees', label: 'Employees' },
  { key: 'leaves', to: '/leaves', label: 'Leave Management' },
  { key: 'passports', to: '/passports', label: 'Passport' },
  { key: 'vehicles', to: '/vehicles', label: 'Vehicle Allocation' },
  { key: 'flights', to: '/flights', label: 'Flights' },
  { key: 'notifications', to: '/notifications', label: 'Notifications' },
  { key: 'settings', to: '/settings', label: 'Settings' },
]

export default function Header({
  breadcrumbs = [],
  unreadCount = 0,
  onLogout,
  onOpenNav,
}) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const initials = (user?.name || 'U')
    .split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const handleLogout = () => {
    setOpen(false)
    if (onLogout) onLogout()
    else {
      logout()
      navigate('/login')
    }
  }

  const onSearch = (event) => {
    event.preventDefault()
    const term = query.trim().toLowerCase()
    if (!term) return
    const match = SEARCH_MODULES.find(
      (item) =>
        canAccessMenu(user?.role, item.key) &&
        item.label.toLowerCase().includes(term),
    )
    if (match) {
      navigate(match.to)
      setQuery('')
    }
  }

  return (
    <header className="app-header">
      <div className="app-header__top">
        <div className="app-header__left">
          <button
            type="button"
            className="app-header__nav-toggle"
            aria-label="Open navigation"
            onClick={onOpenNav}
          >
            ☰
          </button>
          <Breadcrumbs items={breadcrumbs} />
        </div>

        <form className="app-header__search" onSubmit={onSearch} role="search">
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anything..."
            aria-label="Search anything"
          />
        </form>

        <div className="app-header__right">
          <SubsidiarySwitcher />
          {canAccessMenu(user?.role, 'settings') ? (
            <button
              type="button"
              className="app-header__notify"
              aria-label="Administration"
              onClick={() => navigate('/settings')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 4v2M12 18v2M4 12h2M18 12h2M6.2 6.2l1.4 1.4M16.4 16.4l1.4 1.4M6.2 17.8l1.4-1.4M16.4 7.6l1.4-1.4" />
              </svg>
            </button>
          ) : null}
          <button
            type="button"
            className="app-header__notify"
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            onClick={() => navigate('/notifications')}
          >
            <span aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M6 9a6 6 0 1 1 12 0c0 7 2 7 2 9H4c0-2 2-2 2-9" />
                <path d="M10 21a2 2 0 0 0 4 0" />
              </svg>
            </span>
            {unreadCount > 0 ? (
              <span className="app-header__badge">{unreadCount}</span>
            ) : (
              <span className="app-header__dot" aria-hidden="true" />
            )}
          </button>

          <div className="app-header__user" ref={ref}>
            <button
              type="button"
              className="app-header__profile"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              <span className="app-header__avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="app-header__meta">
                <strong>{user?.name}</strong>
                <small>{ROLE_LABELS[user?.role] || user?.role}</small>
              </span>
            </button>

            {open ? (
              <div className="app-header__dropdown" role="menu">
                <div className="app-header__dropdown-head">
                  <strong>{user?.name}</strong>
                  <span>{user?.email}</span>
                </div>
                {canAccessMenu(user?.role, 'settings') ? (
                  <Link
                    to="/settings"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    Profile & Settings
                  </Link>
                ) : null}
                <button type="button" role="menuitem" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
