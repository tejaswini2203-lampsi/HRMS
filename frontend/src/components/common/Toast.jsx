import { useToast } from '../../context/ToastContext'
import './Toast.css'

export default function ToastViewport() {
  const { toasts, dismiss } = useToast()

  if (!toasts.length) return null

  return (
    <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.variant}`} role="status">
          <span>{t.message}</span>
          <button
            type="button"
            className="toast__close"
            aria-label="Dismiss notification"
            onClick={() => dismiss(t.id)}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  )
}
