/**
 * Getting a new account live, from the registration to its first invoice reaching the OTA.
 *
 * Under the OTA's 5-corner Peppol model a taxpayer cannot report invoices directly: they must
 * authorise an Accredited Service Provider (ASP) on the Fawtara Portal, and the OTA approves the
 * connection before invoices can flow. A taxpayer may be linked to exactly one ASP at a time.
 *
 * One screen follows the whole road (owner decision, 8 Oct 2026): it closes sign-up, and is shown
 * again after sign-in until the account is connected. Steps run in time order, top to bottom; the
 * Figma frame drew them upward, the designer's slip.
 */

/** Where the account stands: with Fawtir's reviewers, waiting on Fawtara, or connected. */
export type GoingLivePhase = 'review' | 'fawtara' | 'connected'

export type GoingLiveStepState = 'done' | 'current' | 'upcoming'

export type GoingLiveStep = {
  id: 'sent' | 'review' | 'authorise' | 'connected'
  labelKey: string
  /** A second, quieter line: what the step is waiting on, or how it ended. */
  statusKey?: string
  state: GoingLiveStepState
}

const PHASE_ORDER: GoingLivePhase[] = ['review', 'fawtara', 'connected']

export function goingLiveSteps(phase: GoingLivePhase): GoingLiveStep[] {
  const at = PHASE_ORDER.indexOf(phase)
  const state = (step: number): GoingLiveStepState =>
    step < at ? 'done' : step === at ? 'current' : 'upcoming'
  return [
    { id: 'sent', labelKey: 'fawtaraStatus.steps.sent', state: 'done' },
    {
      id: 'review',
      labelKey: 'fawtaraStatus.steps.review',
      statusKey: at === 0 ? 'fawtaraStatus.steps.reviewing' : 'fawtaraStatus.steps.approved',
      state: state(0),
    },
    {
      id: 'authorise',
      labelKey: 'fawtaraStatus.steps.authorise',
      statusKey: at === 1 ? 'fawtaraStatus.steps.awaitingOta' : undefined,
      state: state(1),
    },
    // Connected is the end of the road: reaching it completes it.
    {
      id: 'connected',
      labelKey: 'fawtaraStatus.steps.connected',
      state: at === 2 ? 'done' : 'upcoming',
    },
  ]
}

export const FAWTARA_PORTAL_URL = 'https://tms.taxoman.gov.om/portal'

export const SUPPORT_EMAIL = 'support@fawtir.om'
