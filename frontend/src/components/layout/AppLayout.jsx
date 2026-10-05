import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getNotifications } from '../../services/api'
import Header from './Header'
import Sidebar from './Sidebar'
import SubsidiaryTheme from './SubsidiaryTheme'
import './AppLayout.css'

const TITLES = {
  '/dashboard': 'Dashboard',
  '/compliance': 'Compliance Matrix',
  '/employees': 'Employee Master',
  '/leaves': 'Leave Management',
  '/passports': 'Passport',
  '/vehicles': 'Vehicle Allocation',
  '/flights': 'Flight Tickets',
  '/notifications': 'Notifications',
  '/settings': 'Administration',
}

function buildBreadcrumbs(pathname) {
  if (pathname === '/dashboard') {
    return [{ label: 'Dashboard', to: '/dashboard' }, { label: 'Overview' }]
  }
  const parts = pathname.split('/').filter(Boolean)
  const items = [{ label: 'Dashboard', to: '/dashboard' }]
  let acc = ''
  parts.forEach((part, idx) => {
    acc += `/${part}`
    const last = idx === parts.length - 1
    const label =
      TITLES[acc] ||
      (part.startsWith('EMP') ? part : part.charAt(0).toUpperCase() + part.slice(1))
    items.push({ label, to: last ? undefined : acc })
  })
  return items
}

export default function AppLayout() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [unread, setUnread] = useState(0)
  const [mobileNav, setMobileNav] = useState(false)

  useEffect(() => {
    let mounted = true
    getNotifications().then((res) => {
      if (!mounted) return
      setUnread(res.data.filter((n) => !n.read).length)
    })
    return () => {
      mounted = false
    }
  }, [location.pathname])

  useEffect(() => {
    setMobileNav(false)
  }, [location.pathname])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="app-shell">
      <SubsidiaryTheme />
      <Sidebar
        mobileOpen={mobileNav}
        onCloseMobile={() => setMobileNav(false)}
        onLogout={handleLogout}
        badges={{ notifications: unread }}
      />
      <div className="app-shell__main">
        <Header
          breadcrumbs={buildBreadcrumbs(location.pathname)}
          unreadCount={unread}
          onOpenNav={() => setMobileNav(true)}
          onLogout={handleLogout}
        />
        <main className="app-shell__content">
          <Outlet context={{ setUnreadCount: setUnread }} />
        </main>
        <footer className="app-footer">
          <span>EICS Enterprise · Stable</span>
          <span>Privacy · Security · System Docs</span>
        </footer>
      </div>
    </div>
  )
}
