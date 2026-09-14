import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { Button, ChevronRightIcon } from '../../components/ui'
import { ROUTE_FOR_STAGE, isSubmittedStage, readSignupStatus } from '../../lib/identity/onboarding'
import {
  endOnboardingSession,
  markOnboardingSubmitted,
  readOnboardingSession,
} from '../../lib/identity/onboardingSession'

type Outcome = 'received' | 'approved' | 'ended'

/**
 * The waiting screen after final submission.
 *
 * It never presents the outcome as decided when it is not: the decision arrives by email, and the
 * two-hour token usually dies long before a reviewer acts, so an expired token means "we can no
 * longer look", never "still under review" or "sign up again" (backend signup guide §10b–c). The
 * status is read once, and only when the page was not reached straight from submitting; it is not
 * polled.
 */
export function SignupPendingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const session = readOnboardingSession()
  const token = session?.onboardingToken
  const arrivedFromSubmit = (location.state as { submitted?: boolean } | null)?.submitted === true
  const known: Outcome | null = arrivedFromSubmit || session?.submitted ? 'received' : token ? null : 'ended'
  const [outcome, setOutcome] = useState<Outcome | null>(known)
  const [redirect, setRedirect] = useState<string | null>(null)
  const requested = useRef(false)

  useEffect(() => {
    if (known || !token || requested.current) return
    requested.current = true
    readSignupStatus(token)
      .then((status) => {
        if (status.stage === 'ACTIVATED' || status.loginEnabled) {
          setOutcome('approved')
        } else if (isSubmittedStage(status.stage)) {
          markOnboardingSubmitted(true)
          setOutcome('received')
        } else {
          // Not submitted — or reopened by a rejection, which the decision email explains.
          markOnboardingSubmitted(false)
          setRedirect(ROUTE_FOR_STAGE[status.stage])
        }
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) endOnboardingSession()
        setOutcome('ended')
      })
  }, [known, token])

  if (redirect) return <Navigate to={redirect} replace />

  return (
    <AuthLayout>
      {outcome ? (
        <div className="flex w-full max-w-[400px] flex-col gap-11">
          <div className="flex flex-col gap-3">
            {outcome === 'ended' ? null : (
              <span className="inline-flex h-[29px] w-fit items-center justify-center rounded-sm border border-primary-150 px-2.5 text-base font-medium text-primary-700">
                {t(`signupPending.${outcome}.badge`)}
              </span>
            )}
            <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t(`signupPending.${outcome}.title`)}
            </h2>
            <p className="text-base font-medium leading-[1.2] text-text-quaternary">
              {t(`signupPending.${outcome}.description`)}
            </p>
          </div>
          {outcome === 'approved' ? (
            <Button type="button" fullWidth className="gap-1.5" onClick={() => navigate('/login')}>
              {t('signupPending.approved.signIn')}
              <ChevronRightIcon size={18} className="rtl:rotate-180" />
            </Button>
          ) : null}
        </div>
      ) : null}
    </AuthLayout>
  )
}
