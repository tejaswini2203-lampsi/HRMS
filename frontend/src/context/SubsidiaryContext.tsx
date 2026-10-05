import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from './AuthContext'
import { ROLES } from '../config/featureFlags'
import {
  DEFAULT_THEME,
  SUBSIDIARIES,
  SUBSIDIARY_LIST,
  getActiveWorkspace,
} from '../config/subsidiaries'
import {
  clearStoredSubsidiary,
  readStoredSubsidiaryId,
  writeStoredSubsidiaryId,
} from '../utils/subsidiaryStorage'

export type SubsidiaryId = 'uae' | 'saudi' | 'india'

type SubsidiaryContextValue = {
  subsidiaries: typeof SUBSIDIARY_LIST
  /** Data filter — null for admin means all subsidiaries */
  activeId: SubsidiaryId | null
  active: typeof DEFAULT_THEME | (typeof SUBSIDIARIES)[SubsidiaryId]
  isDefaultTheme: boolean
  canSwitch: boolean
  setActiveSubsidiary: (id: SubsidiaryId | null) => void
}

const SubsidiaryContext = createContext<SubsidiaryContextValue | null>(null)

function isSubsidiaryId(value: unknown): value is SubsidiaryId {
  return value === 'uae' || value === 'saudi' || value === 'india'
}

export function SubsidiaryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const canSwitch = user?.role === ROLES.ADMIN
  const assignedId = isSubsidiaryId(user?.subsidiaryId) ? user.subsidiaryId : 'uae'
  const [adminId, setAdminId] = useState<SubsidiaryId | null>(null)

  useEffect(() => {
    if (!user) {
      setAdminId(null)
      return
    }
    if (canSwitch) {
      setAdminId(readStoredSubsidiaryId())
    } else {
      setAdminId(assignedId)
    }
  }, [user?.empId, user?.subsidiaryId, assignedId, canSwitch])

  const activeId = canSwitch ? adminId : assignedId
  const isDefaultTheme = canSwitch && !activeId
  const active = getActiveWorkspace(activeId)

  const setActiveSubsidiary = useCallback(
    (id: SubsidiaryId | null) => {
      if (!canSwitch) return
      if (id === null) {
        setAdminId(null)
        clearStoredSubsidiary()
        return
      }
      if (!isSubsidiaryId(id)) return
      setAdminId(id)
      writeStoredSubsidiaryId(id)
    },
    [canSwitch],
  )

  const value = useMemo(
    () => ({
      subsidiaries: SUBSIDIARY_LIST,
      activeId,
      active,
      isDefaultTheme,
      canSwitch,
      setActiveSubsidiary,
    }),
    [active, activeId, isDefaultTheme, canSwitch, setActiveSubsidiary],
  )

  return (
    <SubsidiaryContext.Provider value={value}>
      {children}
    </SubsidiaryContext.Provider>
  )
}

export function useSubsidiary() {
  const ctx = useContext(SubsidiaryContext)
  if (!ctx) throw new Error('useSubsidiary must be used within SubsidiaryProvider')
  return ctx
}
