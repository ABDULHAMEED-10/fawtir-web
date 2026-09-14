import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ApiError } from '../../api'
import { PENDING_ROUTE, allowedRoute, readSignupStatus } from '../../lib/identity/onboarding'
import {
  endOnboardingSession,
  hasEndedOnboardingSession,
  readOnboardingSession,
} from '../../lib/identity/onboardingSession'

type OnboardingGateProps = {
  /** True when the page arrived through the flow and has the router state it needs. */
  ready: boolean
  children: ReactNode
}

/**
 * Keeps onboarding pages behind a live onboarding session and in the server's step order.
 *
 * Arriving through the flow costs nothing — the previous step just saved, so the page renders
 * straight away. Only a page opened without its router state (a typed URL, a bookmark) asks
 * `/signup/status` once where the registrant really is. That is a convenience; the backend
 * still refuses an out-of-order step on its own.
 *
 * A tab that has submitted, or whose token has lapsed, goes to the waiting screen: the pages are
 * closed while a reviewer holds the draft, and a lapsed registrant must not be sent to sign up
 * again (backend signup guide §10c).
 */
export function OnboardingGate({ ready, children }: OnboardingGateProps) {
  const location = useLocation()
  const session = readOnboardingSession()
  const token = session?.onboardingToken
  const needsStatus = Boolean(token) && !session?.submitted && !ready
  const [target, setTarget] = useState<string | null>(null)
  // StrictMode replays effects in development; the ref keeps that to one status request.
  const requested = useRef(false)

  useEffect(() => {
    if (!needsStatus || !token || requested.current) return
    requested.current = true
    readSignupStatus(token)
      .then((status) => setTarget(allowedRoute(status.stage, location.pathname)))
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) {
          endOnboardingSession()
          setTarget(PENDING_ROUTE)
          return
        }
        // Unknown progress is not a reason to strand the page; Continue is still checked.
        setTarget(location.pathname)
      })
  }, [needsStatus, token, location.pathname])

  if (!token) return <Navigate to={hasEndedOnboardingSession() ? PENDING_ROUTE : '/signup'} replace />
  if (session?.submitted) return <Navigate to={PENDING_ROUTE} replace />
  if (ready) return children
  if (target === null) return null
  if (target === location.pathname) return children
  return <Navigate to={target} replace state={location.state} />
}
