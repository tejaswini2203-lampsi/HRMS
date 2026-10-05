import { useEffect, useId, useRef } from 'react'
import Button from './Button'
import './Modal.css'

export default function Modal({
  open,
  isOpen,
  title,
  onClose,
  children,
  footer,
  size = 'md',
  labelledBy,
}) {
  const active = Boolean(open ?? isOpen)
  const titleId = useId()
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!active) {
      wasOpenRef.current = false
      return undefined
    }

    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current?.()
    }
    window.addEventListener('keydown', onKey)

    // Focus the dialog only when it first opens — not on every parent re-render.
    if (!wasOpenRef.current) {
      dialogRef.current?.focus()
      wasOpenRef.current = true
    }

    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [active])

  if (!active) return null

  return (
    <div className="modal-backdrop" onClick={() => onCloseRef.current?.()} role="presentation">
      <div
        className={`modal modal--${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || titleId}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__header">
          <h2 id={labelledBy || titleId}>{title}</h2>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Close dialog"
            onClick={() => onCloseRef.current?.()}
          >
            ✕
          </Button>
        </header>
        <div className="modal__body">{children}</div>
        {footer ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>
  )
}
