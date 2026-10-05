import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { defaultFeatureFlags } from '../config/featureFlags'

const FeatureFlagsContext = createContext(null)
const STORAGE_KEY = 'eics_feature_flags'

function loadFlags() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...defaultFeatureFlags }
    return { ...defaultFeatureFlags, ...JSON.parse(raw) }
  } catch {
    return { ...defaultFeatureFlags }
  }
}

export function FeatureFlagsProvider({ children }) {
  const [flags, setFlags] = useState(loadFlags)

  const setFlag = useCallback((key, value) => {
    setFlags((prev) => {
      const next = { ...prev, [key]: value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const toggleFlag = useCallback((key) => {
    setFlags((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  const resetFlags = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setFlags({ ...defaultFeatureFlags })
  }, [])

  const value = useMemo(
    () => ({ flags, setFlag, toggleFlag, resetFlags }),
    [flags, setFlag, toggleFlag, resetFlags],
  )

  return (
    <FeatureFlagsContext.Provider value={value}>
      {children}
    </FeatureFlagsContext.Provider>
  )
}

export function useFeatureFlags() {
  const ctx = useContext(FeatureFlagsContext)
  if (!ctx) {
    throw new Error('useFeatureFlags must be used within FeatureFlagsProvider')
  }
  return ctx
}
