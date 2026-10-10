import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ApiError } from '../../api'
import { PENDING_ROUTE, allowedRoute, readSignupStatus } from '../../lib/identity/onboarding'
import {
  endOnboardingSession,
  hasEndedOnboardingSession,
  readOnboardingSession,
} from '../../lib/identity/onboardingSession'
import { onboardingStateFromStatus } from '../../lib/identity/signupDraft'
import { onboardingStateFrom, type OnboardingState } from '../../lib/onboarding'

type OnboardingGateProps = {
  /** True when the page arrived through the flow and has the router state it needs. */
  ready: boolean
  children: ReactNode
}

type Resolved = { route: string; state: OnboardingState | unknown }

/**
 * Keeps onboarding pages behind a live onboarding session and in the server's step order.
 *
 * Arriving through the flow costs nothing — the previous step just saved, so the page renders
 * straight away. Only a page opened without its router state (a new tab, a typed URL, a bookmark)
 * asks `/signup/status` once where the registrant really is, and refills the router state from
 * the saved draft it returns, so every step and the review show the saved answers. The backend
 * still refuses an out-of-order step on its own.
 *
 * A tab that has submitted, or whose token has lapsed, goes to the waiting screen: the pages are
 * closed while a reviewer holds the draft, and a lapsed registrant must not be sent to sign up
 * again (backend signup guide §10c); that screen offers to continue the registration instead.
 */
export function OnboardingGate({ ready, children }: OnboardingGateProps) {
  const location = useLocation()
  const session = readOnboardingSession()
  const token = session?.onboardingToken
  const restored = onboardingStateFrom(location.state).restored === true
  const needsStatus = Boolean(token) && !session?.submitted && !ready && !restored
  const [resolved, setResolved] = useState<Resolved | null>(null)
  // StrictMode replays effects in development; the ref keeps that to one status request.
  const requested = useRef(false)

  useEffect(() => {
    if (!needsStatus || !token || requested.current) return
    requested.current = true
    readSignupStatus(token)
      .then((status) =>
        setResolved({
          route: allowedRoute(status.stage, location.pathname),
          state: onboardingStateFromStatus(status, onboardingStateFrom(location.state)),
        }),
      )
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          endOnboardingSession()
          setResolved({ route: PENDING_ROUTE, state: null })
          return
        }
        // Unknown progress is not a reason to strand the page; Continue is still checked.
        setResolved({ route: location.pathname, state: { ...onboardingStateFrom(location.state), restored: true } })
      })
  }, [needsStatus, token, location.pathname, location.state])

  if (!token) return <Navigate to={hasEndedOnboardingSession() ? PENDING_ROUTE : '/signup'} replace />
  if (session?.submitted) return <Navigate to={PENDING_ROUTE} replace />
  if (ready || restored) return children
  if (resolved === null) return null
  return <Navigate to={resolved.route} replace state={resolved.state} />
}
