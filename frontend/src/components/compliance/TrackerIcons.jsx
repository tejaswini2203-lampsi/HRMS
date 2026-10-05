/** Compact line icons for compliance matrix modules. */

const sizeMap = { sm: 14, md: 16, lg: 28 }

export function TrackerIcon({ type, size = 'sm', className = '' }) {
  const px = sizeMap[size] || sizeMap.sm
  const common = {
    width: px,
    height: px,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': true,
    className: `tracker-icon tracker-icon--${type} ${className}`.trim(),
  }

  if (type === 'leave') {
    return (
      <svg {...common}>
        <rect
          x="3.5"
          y="5"
          width="17"
          height="15"
          rx="2.5"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M3.5 10h17M8 3.5v3.5M16 3.5v3.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M8 14h3.5M13.5 14H16M8 17h8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  if (type === 'passport') {
    return (
      <svg {...common}>
        <rect
          x="5"
          y="3"
          width="14"
          height="18"
          rx="2.2"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <circle
          cx="12"
          cy="10"
          r="2.6"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M8.2 16.5h7.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M9.2 18.5h5.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  if (type === 'vehicle') {
    return (
      <svg {...common}>
        <path
          d="M5 14.5 6.4 9.8A2.4 2.4 0 0 1 8.7 8h6.6a2.4 2.4 0 0 1 2.3 1.8l1.4 4.7"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <path
          d="M4 14.5h16v2.2a1.8 1.8 0 0 1-1.8 1.8h-.7M6.5 18.5h-.7A1.8 1.8 0 0 1 4 16.7V14.5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinejoin="round"
        />
        <circle cx="7.8" cy="18.2" r="1.55" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="16.2" cy="18.2" r="1.55" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M9.6 11h4.8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  if (type === 'contract') {
    return (
      <svg {...common}>
        <path
          d="M7 3.5h7.2L19 8.3V20a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 6 20V5A1.5 1.5 0 0 1 7.5 3.5"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M14 3.8V8h4.2"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M9 12.2h6M9 15.5h6M9 18.5h3.8"
          stroke="currentColor"
          strokeWidth="1.55"
          strokeLinecap="round"
        />
      </svg>
    )
  }

  if (type === 'iqm') {
    return (
      <svg {...common}>
        <circle
          cx="12"
          cy="12"
          r="8.25"
          stroke="currentColor"
          strokeWidth="1.75"
        />
        <path
          d="M12 7.6v5.1"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <circle cx="12" cy="16.2" r="1.05" fill="currentColor" />
      </svg>
    )
  }

  if (type === 'flight') {
    return (
      <svg {...common}>
        <path
          d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"
          fill="currentColor"
        />
      </svg>
    )
  }

  // fallback
  return (
    <svg {...common}>
      <path
        d="M3.8 12.8 20.2 7.4c.7-.24 1.3.5.95 1.16L15.4 17.2a1.2 1.2 0 0 1-1.05.6H11.7l-2.2 3.3a.7.7 0 0 1-1.22-.14l-.55-2.05-2.05-.55a.7.7 0 0 1-.14-1.22l3.3-2.2V12.8Z"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function WarningMark({ className = '' }) {
  return (
    <svg
      className={`cmg-warn-mark ${className}`.trim()}
      width="10"
      height="10"
      viewBox="0 0 12 12"
      aria-hidden="true"
    >
      <path d="M6 1.2 11.2 10.5H.8L6 1.2Z" fill="currentColor" />
      <path
        d="M6 4.2v3.1M6 8.7h.01"
        stroke="#fff"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ownerLabel(owner) {
  if (owner === 'H') return 'HOD'
  if (owner === 'F') return 'Finance'
  if (owner === 'HR') return 'HR'
  return owner || ''
}
