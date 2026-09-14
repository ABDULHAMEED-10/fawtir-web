import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ApiError } from '../api'
import {
  commonFailureMessage,
  mapServerFieldErrors,
  type FormMessage,
  type ServerFieldMap,
} from '../lib/identity/errors'
import { PENDING_ROUTE, allowedRoute, readSignupStatus } from '../lib/identity/onboarding'
import {
  endOnboardingSession,
  markOnboardingSubmitted,
  readOnboardingSession,
} from '../lib/identity/onboardingSession'

export type StepSaveResult<F extends string> =
  | { saved: true }
  | { saved: false; fieldErrors: Partial<Record<F, string>> }

type StepOptions<F extends string> = {
  serverFields?: ServerFieldMap<F>
  /** Shown for a `409` that is not a missing earlier step. */
  conflictKey?: string
}

/**
 * The save half of every onboarding Continue: one request per action, the session check, and the
 * failures all five steps answer the same way. Each screen keeps its own fields and navigation.
 */
export function useOnboardingStep<F extends string = never>(options: StepOptions<F> = {}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<FormMessage | null>(null)
  // A disabled button alone cannot stop a second Continue: repeated Enter or a double click can
  // dispatch again before the re-render lands.
  const inFlight = useRef<AbortController | null>(null)

  // Leaving mid-request must not let the late answer navigate away from where the user went.
  useEffect(() => () => inFlight.current?.abort(), [])

  /**
   * A `409` from a step means either an earlier step is missing or the step's own rule refused
   * (a VATIN already registered). The problem type is the same for both, so the server's own
   * progress decides which — never the English detail.
   */
  const earlierStepThan = async (onboardingToken: string): Promise<string | null> => {
    try {
      const status = await readSignupStatus(onboardingToken)
      const route = allowedRoute(status.stage, location.pathname)
      return route === location.pathname ? null : route
    } catch {
      return null
    }
  }

  const explain = async (error: unknown, onboardingToken: string): Promise<StepSaveResult<F>> => {
    const unsaved: StepSaveResult<F> = { saved: false, fieldErrors: {} }
    if (error instanceof ApiError) {
      if (error.status === 401) {
        endOnboardingSession()
        setFormError({ key: 'onboarding.sessionExpired' })
        return unsaved
      }
      if (error.status === 409) {
        const route = await earlierStepThan(onboardingToken)
        if (route) {
          // A submission whose first answer was lost reads back as submitted: that is the success
          // the registrant was waiting for, not a conflict (backend signup guide §10a).
          if (route === PENDING_ROUTE) markOnboardingSubmitted(true)
          navigate(route, { state: location.state })
        } else {
          setFormError({ key: options.conflictKey ?? 'onboarding.conflict' })
        }
        return unsaved
      }
      if (error.problemType === 'validation-failed' && error.fieldErrors.length > 0 && options.serverFields) {
        const { fieldErrors, unattributed } = mapServerFieldErrors(error, options.serverFields)
        if (unattributed) setFormError(commonFailureMessage(error))
        return { saved: false, fieldErrors }
      }
    }
    setFormError(commonFailureMessage(error))
    return unsaved
  }

  const save = async (
    persist: (onboardingToken: string, signal: AbortSignal) => Promise<void>,
  ): Promise<StepSaveResult<F>> => {
    if (inFlight.current) return { saved: false, fieldErrors: {} }
    setFormError(null)
    const session = readOnboardingSession()
    if (!session) {
      setFormError({ key: 'onboarding.sessionExpired' })
      return { saved: false, fieldErrors: {} }
    }

    const controller = new AbortController()
    inFlight.current = controller
    setSubmitting(true)
    try {
      await persist(session.onboardingToken, controller.signal)
      return { saved: true }
    } catch (error) {
      if (controller.signal.aborted) return { saved: false, fieldErrors: {} }
      return await explain(error, session.onboardingToken)
    } finally {
      inFlight.current = null
      setSubmitting(false)
    }
  }

  return { save, submitting, formError, setFormError }
}
