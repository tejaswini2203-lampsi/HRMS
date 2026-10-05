import { useEffect, useRef, useState } from 'react'
import { useSubsidiary } from '../../context/SubsidiaryContext'
import { DEFAULT_THEME } from '../../config/subsidiaries'
import './SubsidiarySwitcher.css'

export default function SubsidiarySwitcher() {
  const {
    active,
    activeId,
    subsidiaries,
    canSwitch,
    isDefaultTheme,
    setActiveSubsidiary,
  } = useSubsidiary()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => {
      if (!ref.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const badge = active.branding.badge

  if (!canSwitch) {
    return (
      <div
        className="sub-switcher sub-switcher--static"
        style={{ '--sub-badge': badge }}
        title={`${active.label} · ${active.complianceStandards.join(', ')}`}
        aria-label={`${active.label} (${active.currency})`}
      >
        <i aria-hidden="true" />
        <span>
          <strong>{active.label}</strong>
          <small>{active.currency}</small>
        </span>
      </div>
    )
  }

  return (
    <div className="sub-switcher" ref={ref}>
      <button
        type="button"
        className={`sub-switcher__trigger${isDefaultTheme ? ' sub-switcher__trigger--default' : ''}`}
        style={{ '--sub-badge': badge }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${active.label} workspace`}
        onClick={() => setOpen((v) => !v)}
      >
        <i aria-hidden="true" />
        <span>
          <strong>{active.label}</strong>
          <small>{isDefaultTheme ? 'Teal · All regions' : active.currency}</small>
        </span>
      </button>
      {open ? (
        <ul className="sub-switcher__menu" role="listbox" aria-label="Subsidiary">
          <li>
            <button
              type="button"
              role="option"
              aria-selected={isDefaultTheme}
              className={isDefaultTheme ? 'is-active' : ''}
              onClick={() => {
                setActiveSubsidiary(null)
                setOpen(false)
              }}
            >
              <i
                style={{ background: DEFAULT_THEME.branding.badge }}
                aria-hidden="true"
              />
              <span>
                <strong>{DEFAULT_THEME.label}</strong>
                <small>Default teal theme · view all regions</small>
              </span>
            </button>
          </li>
          {subsidiaries.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={item.id === activeId}
                className={item.id === activeId ? 'is-active' : ''}
                onClick={() => {
                  setActiveSubsidiary(item.id)
                  setOpen(false)
                }}
              >
                <i style={{ background: item.branding.badge }} aria-hidden="true" />
                <span>
                  <strong>{item.label}</strong>
                  <small>
                    {item.city} · {item.currency}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
