import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

const ToastContext = createContext(null)

let toastId = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (message, variant = 'info') => {
      const id = ++toastId
      setToasts((prev) => [...prev, { id, message, variant }])
      window.setTimeout(() => dismiss(id), 3500)
    },
    [dismiss],
  )

  const success = useCallback((m) => push(m, 'success'), [push])
  const error = useCallback((m) => push(m, 'error'), [push])
  const info = useCallback((m) => push(m, 'info'), [push])
  const warning = useCallback((m) => push(m, 'warning'), [push])
  const addToast = useCallback(
    (message, variant = 'info') => push(message, variant),
    [push],
  )

  const value = useMemo(
    () => ({
      toasts,
      push,
      addToast,
      dismiss,
      success,
      error,
      info,
      warning,
    }),
    [toasts, push, addToast, dismiss, success, error, info, warning],
  )

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
