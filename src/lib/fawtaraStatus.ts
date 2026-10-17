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
 * Fawtir approves a company only after it has accepted that connection request and the company's
 * Participant ID is confirmed (decided 14 Oct 2026), so the request comes before approval and the
 * SMP registration after it: Fawtir's SMP onboarding takes only an approved company.
 *
 * One screen follows the whole road (owner decisions, 8 Oct 2026): it closes sign-up, and is shown
 * again after sign-in until the account is connected. Steps run in time order, top to bottom; the
 * Figma frame drew them upward, the designer's slip.
 */

/**
 * Where the account stands: with Fawtir's reviewers, who wait for the taxpayer's request on the
 * portal; waiting for that request; waiting for Fawtir to accept it; accepted, approved and being
 * registered on the SMP; connected; or a request Fawtir declined or that expired, which the
 * taxpayer sends again. `rejected` is Fawtir's review turning the registration down: it claims
 * nothing about the request either way.
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
  'request',
  'accept',
  'review',
  'register',
  'connected',
]

/** The step each phase is waiting on. */
const CURRENT: Record<GoingLivePhase, number> = {
  review: 1,
  rejected: 3,
  request: 1,
  accepting: 2,
  registering: 4,
  connected: 6,
  declined: 2,
  expired: 2,
}

const STATUS: Partial<Record<GoingLivePhase, Partial<Record<GoingLiveStep['id'], string>>>> = {
  review: { request: 'requestNow' },
  rejected: { review: 'rejected' },
  request: { request: 'requestNow' },
  accepting: { request: 'requestSent', accept: 'accepting' },
  registering: {
    request: 'requestSent',
    accept: 'accepted',
    review: 'approved',
    register: 'registering',
  },
  connected: {
    request: 'requestSent',
    accept: 'accepted',
    review: 'approved',
    register: 'registered',
  },
  declined: { request: 'requestSent', accept: 'declined' },
  expired: { request: 'requestSent', accept: 'expired' },
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
        // A rejection says nothing about the portal request, so only the sent step is done.
        (index < at && (phase !== 'rejected' || index === 0)) || phase === 'connected'
          ? 'done'
          : index === at
            ? failed
              ? 'failed'
              : 'current'
            : 'upcoming',
    }
  })
}

/**
 * Phases in which the taxpayer has to (re)send the request on the Fawtara Portal. Under review it
 * is shown too: approval waits for the request, and nothing here can tell whether it was sent.
 */
export const needsPortalRequest = (phase: GoingLivePhase) =>
  phase === 'review' || phase === 'request' || phase === 'declined' || phase === 'expired'

export const FAWTARA_PORTAL_URL = 'https://tms.taxoman.gov.om/portal'

export const SUPPORT_EMAIL = 'support@fawtir.om'
