/**
 * Configurable feature flags for open specification questions.
 * Runtime toggles live in FeatureFlagsContext; this is the default seed.
 */
export const defaultFeatureFlags = {
  /** Q1: Is HOD approval mandatory for all leave types? */
  leaveHodApprovalMandatory: true,

  /** Q2: Can HR approve leave directly in some cases? */
  leaveHrCanApproveDirectly: true,

  /** Q3: Should 90/30-day passport escalation reminders be enabled? */
  passportEscalation90Days: false,
  passportEscalation30Days: false,

  /** Confirmed: 180-day passport reminder */
  passportAlert180Days: true,

  /** Passport 40-day warning */
  passportWarning40Days: true,

  /** Q4: In-app notifications in addition to email? */
  inAppPassportNotifications: true,

  /** Q5: Should vehicle require an approval workflow? */
  vehicleApprovalWorkflow: false,

  /** Q6: Should flight ticket require an approval workflow? */
  flightApprovalWorkflow: false,

  /** Q7: Is flight eligibility explicitly marked per employee? */
  flightEligibilityRequired: false,

  /** Q8: Standalone vs extension — UI assumes standalone for now */
  standaloneModule: true,
}

/** @deprecated Use useFeatureFlags() for runtime values; kept for static imports */
export const featureFlags = defaultFeatureFlags

export const ROLES = {
  EMPLOYEE: 'EMPLOYEE',
  HOD: 'HOD',
  HR: 'HR',
  ADMIN: 'ADMIN',
}

export const ROLE_LABELS = {
  EMPLOYEE: 'Employee',
  HOD: 'Head of Department',
  HR: 'Human Resources',
  ADMIN: 'Administrator',
}

/** Tracker module accents */
export const TRACKER_COLORS = {
  headerNavy: '#1E3668',
  headerNavyDark: '#15284E',
  flight: '#3F8AB8',
  leave: '#D4893F',
  leaveHatch: 'rgba(212, 137, 63, 0.18)',
  passport: '#C0578A',
  vehicle: '#3F9A88',
  contract: '#7C3AED',
  iqm: '#2563EB',
  actionNeeded: 'rgba(212, 137, 63, 0.16)',
  beyondWindow: 'rgba(91, 124, 250, 0.12)',
}

/**
 * SLA lead-time rules for the active 4-module scope.
 * daysBefore = notify when days-until-event <= this value
 */
export const SLA_RULES = {
  passport: {
    baselineDays: 180,
    warningDays: 40,
    escalation90: 90,
    escalation30: 30,
    owner: '', // HR
  },
  flight: {
    leadDays: 17,
    financeCutoffDay: 15,
    owner: 'F',
  },
  vehicle: {
    leadDays: 30,
    owner: '',
  },
  leave: {
    owner: 'H',
  },
}
