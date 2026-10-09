/**
 * Getting a new account live, from the registration to its first invoice reaching the OTA.
 *
 * Under the OTA's 5-corner Peppol model a taxpayer cannot report invoices directly; an Accredited
 * Service Provider (ASP) carries them. The connection is made on the Fawtara Portal, by the OTA's
 * "Service Provider and Taxpayer Association Management User Manual":
 *
 * 1. The taxpayer opens Accredited Service Providers, picks Fawtir, records every engagement stage
 *    (up to Agreement/Contract Signed), uploads the documents, optionally sets a current or future
 *    effective date, and presses Connect (manual §3.4 to §3.8). If they are connected to another
 *    provider, that provider is told it has been disconnected and has 1 day to remove them from
 *    the SMP (§3.8.1).
 * 2. Fawtir accepts or rejects the request with a reason (§7.4 to §7.8). A request left unanswered
 *    expires; the taxpayer may also withdraw it (§3.9, §6).
 * 3. Once accepted, Fawtir must register the taxpayer as a participant on the Oman SMP within 3
 *    business days (§7.5.1). The SMP checks the connection on the portal before it adds them
 *    (§11.2). Without an effective date the connection takes effect on acceptance (§3.7).
 *
 * One screen follows the whole road (owner decisions, 8 Oct 2026): it closes sign-up, and is shown
 * again after sign-in until the account is connected. Steps run in time order, top to bottom; the
 * Figma frame drew them upward, the designer's slip.
 */

/**
 * Where the account stands: with Fawtir's reviewers; waiting for the taxpayer's request on the
 * portal; waiting for Fawtir to accept it; accepted and being registered on the SMP; connected;
 * or a request Fawtir declined or that expired, which the taxpayer sends again. `rejected` is
 * Fawtir's review turning the registration down: nothing after it has started.
 */
export type GoingLivePhase =
  | 'review'
  | 'rejected'
  | 'request'
  | 'accepting'
  | 'registering'
  | 'connected'
  | 'declined'
  | 'expired'

export type GoingLiveStepState = 'done' | 'current' | 'upcoming' | 'failed'

export type GoingLiveStep = {
  id: 'sent' | 'review' | 'request' | 'accept' | 'register' | 'connected'
  labelKey: string
  /** A second, quieter line: what the step is waiting on, or how it ended. */
  statusKey?: string
  state: GoingLiveStepState
}

const STEP_IDS: GoingLiveStep['id'][] = [
  'sent',
  'review',
  'request',
  'accept',
  'register',
  'connected',
]

/** The step each phase is waiting on. */
const CURRENT: Record<GoingLivePhase, number> = {
  review: 1,
  rejected: 1,
  request: 2,
  accepting: 3,
  registering: 4,
  connected: 6,
  declined: 3,
  expired: 3,
}

const STATUS: Partial<Record<GoingLivePhase, Partial<Record<GoingLiveStep['id'], string>>>> = {
  review: { review: 'reviewing' },
  rejected: { review: 'rejected' },
  request: { review: 'approved', request: 'requestNow' },
  accepting: { review: 'approved', request: 'requestSent', accept: 'accepting' },
  registering: {
    review: 'approved',
    request: 'requestSent',
    accept: 'accepted',
    register: 'registering',
  },
  connected: {
    review: 'approved',
    request: 'requestSent',
    accept: 'accepted',
    register: 'registered',
  },
  declined: { review: 'approved', request: 'requestSent', accept: 'declined' },
  expired: { review: 'approved', request: 'requestSent', accept: 'expired' },
}

export function goingLiveSteps(phase: GoingLivePhase): GoingLiveStep[] {
  const at = CURRENT[phase]
  const failed = phase === 'declined' || phase === 'expired' || phase === 'rejected'
  return STEP_IDS.map((id, index) => {
    const statusKey = STATUS[phase]?.[id]
    return {
      id,
      labelKey: `fawtaraStatus.steps.${id}`,
      statusKey: statusKey ? `fawtaraStatus.steps.${statusKey}` : undefined,
      state:
        index < at || phase === 'connected'
          ? 'done'
          : index === at
            ? failed
              ? 'failed'
              : 'current'
            : 'upcoming',
    }
  })
}

/** Phases in which the taxpayer has to (re)send the request on the Fawtara Portal. */
export const needsPortalRequest = (phase: GoingLivePhase) =>
  phase === 'request' || phase === 'declined' || phase === 'expired'

export const FAWTARA_PORTAL_URL = 'https://tms.taxoman.gov.om/portal'

export const SUPPORT_EMAIL = 'support@fawtir.om'
