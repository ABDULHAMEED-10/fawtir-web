import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../api'
import type { GoingLivePhase } from '../lib/fawtaraStatus'
import {
  ROUTE_FOR_STAGE,
  isSubmittedStage,
  readSignupStatus,
  type SignupStatusResponse,
} from '../lib/identity/onboarding'
import {
  endOnboardingSession,
  hasEndedOnboardingSession,
  markOnboardingSubmitted,
  readOnboardingSession,
} from '../lib/identity/onboardingSession'

export type SignupProgress =
  | { kind: 'loading' }
  /**
   * `reopened`: a rejection that sent the draft back for correction (it reads as not submitted
   * with a REJECTED verification), so the screen offers the way back to it.
   */
  | { kind: 'phase'; phase: GoingLivePhase; reopened?: boolean; status?: SignupStatusResponse }
  /** This tab held a token the server no longer accepts: the registration exists. */
  | { kind: 'ended' }
  /** No onboarding token in this tab at all. */
  | { kind: 'none' }
  | { kind: 'redirect'; route: string }

/**
 * The real stage of the registration behind this tab, read once from `/signup/status` and never
 * polled. It is never presented as more advanced than the server says: only `ACTIVATED` (or a
 * login-enabled account) is "approved", and with no token there is no stage to show at all.
 */
export function phaseFor(status: SignupStatusResponse): SignupProgress {
  if (status.stage === 'ACTIVATED' || status.loginEnabled) {
    return { kind: 'phase', phase: 'request', status }
  }
  if (status.stage === 'REJECTED') return { kind: 'phase', phase: 'rejected', status }
  if (isSubmittedStage(status.stage)) return { kind: 'phase', phase: 'review', status }
  if (status.verificationStatus === 'REJECTED') {
    return { kind: 'phase', phase: 'rejected', reopened: true, status }
  }
  return { kind: 'redirect', route: ROUTE_FOR_STAGE[status.stage] }
}

/**
 * @param justSubmitted the tab arrives straight from a successful submission, so the stage is
 *   known (under review) and no request is made.
 */
export function useSignupProgress(justSubmitted: boolean): SignupProgress {
  const token = readOnboardingSession()?.onboardingToken
  const initial: SignupProgress = justSubmitted
    ? { kind: 'phase', phase: 'review' }
    : token
      ? { kind: 'loading' }
      : hasEndedOnboardingSession()
        ? { kind: 'ended' }
        : { kind: 'none' }
  const [progress, setProgress] = useState<SignupProgress>(initial)
  // StrictMode replays effects in development; the ref keeps that to one status request.
  const requested = useRef(false)

  useEffect(() => {
    if (initial.kind !== 'loading' || !token || requested.current) return
    requested.current = true
    readSignupStatus(token)
      .then((status) => {
        const next = phaseFor(status)
        // Keeps the closed pages closed while a reviewer holds the draft, and reopens them when a
        // rejection hands it back.
        markOnboardingSubmitted(next.kind === 'phase' && !next.reopened)
        setProgress(next)
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) endOnboardingSession()
        setProgress({ kind: 'ended' })
      })
  }, [initial.kind, token])

  return progress
}
