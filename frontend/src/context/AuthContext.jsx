import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { fullName, getEmployees, getEmployeeById, getDepartments } from '../services/api'
import { resolveSubsidiaryId } from '../config/subsidiaries'
import { clearStoredSubsidiary } from '../utils/subsidiaryStorage'
import { loginApi, logoutApi } from '../services/api/auth'
import { clearAccessToken, getAccessToken } from '../services/api/client'

const AuthContext = createContext(null)

const STORAGE_KEY = 'eics_dev_session'

function loadSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const user = raw ? JSON.parse(raw) : null
    if (!user || !getAccessToken()) return null
    return user
  } catch {
    return null
  }
}

function persistSession(user) {
  if (!user) {
    sessionStorage.removeItem(STORAGE_KEY)
    return
  }
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user))
}

function mapAuthUser(apiUser) {
  return {
    id: `u-${apiUser.userId}`,
    userId: apiUser.userId,
    empId: String(apiUser.empId),
    role: apiUser.role,
    name: apiUser.name || '',
    email: apiUser.email || apiUser.username || '',
    username: apiUser.username,
    subsidiaryId: apiUser.subsidiaryId || null,
  }
}

async function enrichUser(base) {
  if (!base?.empId) return base
  try {
    const [, deptRes] = await Promise.all([getEmployees(), getDepartments()])
    const emp = getEmployeeById(base.empId)
    return {
      ...base,
      name: fullName(emp) || base.name,
      email: emp?.email || base.email,
      subsidiaryId:
        base.subsidiaryId ||
        (emp ? resolveSubsidiaryId(emp, deptRes.data) : 'uae'),
    }
  } catch {
    return { ...base, subsidiaryId: base.subsidiaryId || 'uae' }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => loadSession())

  useEffect(() => {
    if (!user?.empId || user.subsidiaryId) return undefined
    let cancelled = false
    enrichUser(user).then((next) => {
      if (cancelled) return
      persistSession(next)
      setUser(next)
    })
    return () => {
      cancelled = true
    }
  }, [user])

  const login = useCallback(async (username, password) => {
    const result = await loginApi(username, password)
    const mapped = mapAuthUser(result.user)
    const enriched = await enrichUser(mapped)
    persistSession(enriched)
    setUser(enriched)
    return enriched
  }, [])

  const logout = useCallback(async () => {
    await logoutApi()
    clearAccessToken()
    clearStoredSubsidiary()
    persistSession(null)
    setUser(null)
  }, [])

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user) && Boolean(getAccessToken()),
      login,
      logout,
    }),
    [user, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
