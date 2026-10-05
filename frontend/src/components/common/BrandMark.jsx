import { DEFAULT_THEME, SUBSIDIARIES } from '../../config/subsidiaries'
import './BrandMark.css'

function resolveBrand(subsidiaryId) {
  if (subsidiaryId && SUBSIDIARIES[subsidiaryId]) return SUBSIDIARIES[subsidiaryId]
  return DEFAULT_THEME
}

/** Distinct monogram / shield art per subsidiary. */
function LogoArt({ subsidiaryId, size }) {
  const stroke = '#fff'
  if (subsidiaryId === 'india') {
    return (
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <rect x="2" y="2" width="36" height="36" rx="11" fill="currentColor" />
        <circle cx="20" cy="20" r="9" fill="none" stroke={stroke} strokeWidth="2" />
        <circle cx="20" cy="20" r="2.2" fill={stroke} />
        <path
          d="M20 11.5v17M11.5 20h17M14.2 14.2l11.6 11.6M25.8 14.2 14.2 25.8"
          stroke={stroke}
          strokeWidth="1.35"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (subsidiaryId === 'uae') {
    return (
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <rect x="2" y="2" width="36" height="36" rx="11" fill="currentColor" />
        <path
          d="M10 26.5 20 10.5l10 16H10Z"
          fill="none"
          stroke={stroke}
          strokeWidth="2.1"
          strokeLinejoin="round"
        />
        <path d="M15.5 22.5h9" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
      </svg>
    )
  }
  if (subsidiaryId === 'saudi') {
    return (
      <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
        <rect x="2" y="2" width="36" height="36" rx="11" fill="currentColor" />
        <path
          d="M12 25c3.2-6.5 12.8-6.5 16 0"
          fill="none"
          stroke={stroke}
          strokeWidth="2.1"
          strokeLinecap="round"
        />
        <path
          d="M20 12.5v8.5M16.2 16.8 20 12.5l3.8 4.3"
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="20" cy="27.5" r="1.7" fill={stroke} />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" rx="11" fill="currentColor" />
      <path
        d="M20 8.5 29.5 12.5v7.2c0 6.1-4 10.4-9.5 11.8C14.5 30.1 10.5 25.8 10.5 19.7v-7.2L20 8.5Z"
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M15.2 20.2 18.6 23.5l6.4-6.6"
        fill="none"
        stroke={stroke}
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Subsidiary-aware brand mark.
 * Pass `subsidiaryId` explicitly, or rely on `accent`/`mark` overrides.
 */
export default function BrandMark({
  size = 36,
  subsidiaryId = null,
  accent,
  showWordmark = false,
  compact = false,
}) {
  const workspace = resolveBrand(subsidiaryId)
  const color = accent || workspace.branding.badge
  const productName = workspace.branding.productName || 'EICS'
  const mark = workspace.branding.logoMark || 'EICS'

  return (
    <span
      className={`brand-lockup${showWordmark ? ' brand-lockup--wordmark' : ''}${compact ? ' brand-lockup--compact' : ''}`}
      style={{ color }}
      title={productName}
    >
      <span
        className="brand-mark"
        style={{ width: size, height: size, color }}
        aria-hidden="true"
      >
        {workspace.branding.logo ? (
          <img src={workspace.branding.logo} alt="" width={size} height={size} />
        ) : (
          <LogoArt subsidiaryId={workspace.id} size={size} />
        )}
      </span>
      {showWordmark ? (
        <span className="brand-lockup__text">
          <strong>{productName}</strong>
          {!compact && workspace.id ? <small>{workspace.shortLabel}</small> : null}
          {!compact && !workspace.id ? <small>{mark}</small> : null}
        </span>
      ) : null}
    </span>
  )
}
