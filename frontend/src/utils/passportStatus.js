import { daysUntil } from './dates'
import { defaultFeatureFlags } from '../config/featureFlags'

/**
 * Visual expiry status for passport records.
 * Pass runtime flags from useFeatureFlags() when available.
 */
export function getPassportExpiryStatus(expiryDate, flags = defaultFeatureFlags) {
  const days = daysUntil(expiryDate)

  if (days < 0) {
    return { key: 'expired', label: 'Expired', variant: 'danger', days }
  }

  const criticalThreshold = flags.passportEscalation30Days
    ? 30
    : flags.passportWarning40Days
      ? 40
      : 30
  const soonThreshold = flags.passportEscalation90Days
    ? 90
    : flags.passportAlert180Days
      ? 180
      : 180

  if (days <= criticalThreshold) {
    return { key: 'critical', label: 'Critical', variant: 'danger', days }
  }
  if (days <= soonThreshold) {
    return { key: 'expiring', label: 'Expiring Soon', variant: 'warning', days }
  }
  return { key: 'safe', label: 'Safe', variant: 'success', days }
}
