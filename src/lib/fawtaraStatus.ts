/**
 * Fawtara (Oman e-invoicing) onboarding status.
 *
 * Under the OTA's 5-corner Peppol model a taxpayer cannot report invoices directly: they must
 * authorize an Accredited Service Provider (ASP) on the Fawtara Portal, and the ASP approves the
 * connection before invoices can flow. A taxpayer may be linked to exactly one ASP at a time.
 * This screen is what the taxpayer sees while that approval is outstanding.
 */

export type FawtaraStatus = 'requested' | 'pending' | 'connected' | 'rejected'

export type FawtaraStepState = 'done' | 'current' | 'upcoming'

export type FawtaraStep = {
  id: string
  labelKey: string
  state: FawtaraStepState
  /** Shown inside the marker while the step is `current`. */
  index?: number
}

/**
 * Ordered top-to-bottom as drawn in Figma — the timeline runs *upward*, so the furthest-along
 * state sits at the top and the completed one at the bottom.
 */
export const FAWTARA_STEPS: FawtaraStep[] = [
  { id: 'connected', labelKey: 'fawtaraStatus.steps.connected', state: 'upcoming' },
  { id: 'awaitingApproval', labelKey: 'fawtaraStatus.steps.awaitingApproval', state: 'current', index: 2 },
  { id: 'requestSent', labelKey: 'fawtaraStatus.steps.requestSent', state: 'done' },
]

export const FAWTARA_PORTAL_URL = 'https://tms.taxoman.gov.om/portal'

/** Address the approval notification is sent to — replace with the signed-in user's email. */
export const FAWTARA_NOTIFY_EMAIL = 'dana@muscatgrand.om'

export const FAWTARA_CURRENT_STATUS: FawtaraStatus = 'pending'
