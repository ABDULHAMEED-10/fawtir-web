import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { Button, ChevronRightIcon } from '../../components/ui'
import { onboardingStateFrom } from '../../lib/onboarding'
import { FawtaraStatusHero } from '../FawtaraStatusPage/FawtaraStatusHero'
import { FawtaraStatusPanel } from '../FawtaraStatusPage/FawtaraStatusPanel'
import { ROUTE_FOR_STAGE, isSubmittedStage, readSignupStatus } from '../../lib/identity/onboarding'
import {
  endOnboardingSession,
  markOnboardingSubmitted,
  readOnboardingSession,
} from '../../lib/identity/onboardingSession'

type Outcome = 'received' | 'approved' | 'ended'

/**
 * The waiting screen after final submission, drawn as the "getting you live" road in the Fawtara
 * status frame's layout (owner decision, 8 Oct 2026): sent, Fawtir review, Fawtara, connected.
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
  const carried = location.state as { submitted?: boolean; email?: string } | null
  const arrivedFromSubmit = carried?.submitted === true
  // Known only in the tab that submitted. TODO(backend): the status read could name both the
  // email and the plan choice, ONBOARDING.md rows 1.4 and 1.8.
  const email = carried?.email
  const choice = onboardingStateFrom(location.state)
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
    <AuthLayout showLanguageSwitcher align="start" hero={<FawtaraStatusHero />}>
      {outcome === 'ended' ? (
        <div className="flex w-full max-w-[660px] flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('signupPending.ended.title')}
          </h2>
          <p className="text-base font-medium leading-[1.4] text-text-quaternary">
            {t('signupPending.ended.description')}
          </p>
        </div>
      ) : outcome ? (
        <FawtaraStatusPanel
          phase={outcome === 'approved' ? 'fawtara' : 'review'}
          email={email}
          choice={choice.plan ? choice : undefined}
          action={
            outcome === 'approved' ? (
              <Button type="button" className="gap-1.5" onClick={() => navigate('/login')}>
                {t('signupPending.approved.signIn')}
                <ChevronRightIcon size={18} className="rtl:rotate-180" />
              </Button>
            ) : undefined
          }
        />
      ) : null}
    </AuthLayout>
  )
}
