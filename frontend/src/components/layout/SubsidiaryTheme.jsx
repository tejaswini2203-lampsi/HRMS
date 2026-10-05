import { useEffect } from 'react'
import { useSubsidiary } from '../../context/SubsidiaryContext'
import { DEFAULT_THEME } from '../../config/subsidiaries'

const OVERRIDES = [
  '--color-primary',
  '--color-primary-hover',
  '--color-primary-soft',
  '--color-primary-deep',
  '--color-accent',
  '--color-accent-soft',
  '--color-leave',
  '--color-flight',
  '--color-vehicle',
  '--color-leave-hatch',
  '--color-action-needed',
  '--sub-badge',
  '--sub-accent',
  '--sub-accent-soft',
  '--focus-ring',
  '--theme-gradient-start',
  '--theme-gradient-end',
  '--theme-ring-track',
  '--theme-pill-idle',
  '--theme-promo-start',
  '--theme-promo-end',
]

function clearOverrides(root) {
  OVERRIDES.forEach((key) => root.style.removeProperty(key))
  delete root.dataset.theme
  delete root.dataset.subsidiary
}

function applyThemeTokens(root, branding, { themeKey, subsidiaryId = null }) {
  const deep = branding.primaryDeep || branding.badge
  const gradStart = branding.gradientStart || branding.accent
  const gradEnd = branding.gradientEnd || deep

  root.dataset.theme = themeKey
  if (subsidiaryId) root.dataset.subsidiary = subsidiaryId
  else delete root.dataset.subsidiary

  root.style.setProperty('--color-primary', branding.badge)
  root.style.setProperty('--color-primary-hover', branding.primaryHover || deep)
  root.style.setProperty('--color-primary-soft', branding.accentSoft)
  root.style.setProperty('--color-primary-deep', deep)
  root.style.setProperty('--color-accent', branding.accent)
  root.style.setProperty('--color-accent-soft', branding.accentSoft)
  root.style.setProperty('--color-leave', branding.badge)
  root.style.setProperty('--color-flight', deep)
  root.style.setProperty('--color-vehicle', branding.accent)
  root.style.setProperty('--color-leave-hatch', branding.accentSoft)
  root.style.setProperty('--color-action-needed', branding.accentSoft)
  root.style.setProperty('--sub-badge', branding.badge)
  root.style.setProperty('--sub-accent', branding.accent)
  root.style.setProperty('--sub-accent-soft', branding.accentSoft)
  root.style.setProperty('--focus-ring', `0 0 0 3px ${branding.accentSoft}`)
  root.style.setProperty('--theme-gradient-start', gradStart)
  root.style.setProperty('--theme-gradient-end', gradEnd)
  if (branding.ringTrack) {
    root.style.setProperty('--theme-ring-track', branding.ringTrack)
  } else {
    root.style.removeProperty('--theme-ring-track')
  }
  if (branding.pillIdle) {
    root.style.setProperty('--theme-pill-idle', branding.pillIdle)
  } else {
    root.style.removeProperty('--theme-pill-idle')
  }
  if (branding.promoStart) {
    root.style.setProperty('--theme-promo-start', branding.promoStart)
  } else {
    root.style.removeProperty('--theme-promo-start')
  }
  if (branding.promoEnd) {
    root.style.setProperty('--theme-promo-end', branding.promoEnd)
  } else {
    root.style.removeProperty('--theme-promo-end')
  }
}

export default function SubsidiaryTheme() {
  const { active, activeId, isDefaultTheme } = useSubsidiary()

  useEffect(() => {
    const root = document.documentElement
    if (isDefaultTheme) {
      applyThemeTokens(root, DEFAULT_THEME.branding, { themeKey: 'default' })
    } else if (activeId) {
      applyThemeTokens(root, active.branding, {
        themeKey: 'subsidiary',
        subsidiaryId: activeId,
      })
    } else {
      clearOverrides(root)
    }
    return () => clearOverrides(root)
  }, [active, activeId, isDefaultTheme])

  return null
}
