/**
 * Build a strict 1-month (30-day) rolling timeline window.
 * @param {Date} anchor - window start date (defaults to today at midnight)
 * @param {number} days - span length (default 30)
 */
export function buildTimelineWindow(anchor = new Date(), days = 30) {
  const start = new Date(anchor)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + days - 1)
  end.setHours(23, 59, 59, 999)

  const dayTicks = []
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    dayTicks.push({
      key: d.toISOString().slice(0, 10),
      label: String(d.getDate()),
      fullLabel: d.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
      }),
      date: d,
      isMajor: d.getDate() === 1 || i === 0 || i === days - 1 || i % 5 === 0,
    })
  }

  return {
    start,
    end,
    days,
    dayTicks,
    /** @deprecated use dayTicks — kept for any residual callers */
    monthTicks: [],
    totalMs: end - start,
    label: `${start.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    })} – ${end.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    })}`,
  }
}

export function dateToX(dateStr, window, width) {
  if (!dateStr || !window) return null
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return null
  const ratio = (d - window.start) / window.totalMs
  if (ratio < -0.02 || ratio > 1.02) return null
  return Math.max(0, Math.min(width, ratio * width))
}

export function spanToRect(fromDate, toDate, window, width) {
  const d0 = new Date(fromDate)
  const d1 = new Date(toDate)
  if (Number.isNaN(d0.getTime()) || Number.isNaN(d1.getTime())) return null
  if (d1 < window.start || d0 > window.end) return null
  const clampedStart = Math.max(d0.getTime(), window.start.getTime())
  const clampedEnd = Math.min(d1.getTime(), window.end.getTime())
  const x = ((clampedStart - window.start) / window.totalMs) * width
  const w = Math.max(4, ((clampedEnd - clampedStart) / window.totalMs) * width)
  return { x, width: w }
}

export function todayX(window, width) {
  return dateToX(new Date().toISOString().slice(0, 10), window, width)
}
