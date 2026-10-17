import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { SignupResumePrompt } from '../../components/auth/SignupResumePrompt'
import { Button, ChevronRightIcon } from '../../components/ui'
import { useSignupProgress } from '../../hooks/useSignupProgress'
import { REVIEW_ROUTE } from '../../lib/identity/onboarding'
import { onboardingStateFromStatus } from '../../lib/identity/signupDraft'
import { onboardingStateFrom } from '../../lib/onboarding'
import { FawtaraStatusHero } from '../FawtaraStatusPage/FawtaraStatusHero'
import { FawtaraStatusPanel } from '../FawtaraStatusPage/FawtaraStatusPanel'
import { SignupClosedPanel } from './SignupClosedPanel'

/**
 * The waiting screen after final submission, drawn as the "getting you live" road in the Fawtara
 * status frame's layout (owner decision, 8 Oct 2026): sent, Fawtir review, Fawtara, connected.
 *
 * It shows the stage the server reports and nothing more advanced: under review, rejected (with
 * the way back when the draft was reopened), or approved. The decision arrives by email, and the
 * two-hour token usually dies long before a reviewer acts, so an expired token means "we can no
 * longer look", never "still under review" or "sign up again" (backend signup guide §10b–c); the
 * registrant can continue with a fresh code instead. The status is read once, and only when the
 * page was not reached straight from submitting; it is not polled.
 */
export function SignupPendingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const carried = location.state as { submitted?: boolean; email?: string } | null
  const progress = useSignupProgress(carried?.submitted === true)

  if (progress.kind === 'redirect') return <Navigate to={progress.route} replace />

  // The tab's own answers first, then whatever the server saved (rows 1.4 and 1.8).
  const restored =
    progress.kind === 'phase' && progress.status
      ? onboardingStateFromStatus(progress.status, onboardingStateFrom(location.state))
      : onboardingStateFrom(location.state)
  const email = carried?.email ?? restored.accountEmail

  return (
    <AuthLayout showLanguageSwitcher align="start" hero={<FawtaraStatusHero />}>
      {progress.kind === 'ended' || progress.kind === 'none' ? (
        <SignupResumePrompt
          titleKey="signupPending.ended.title"
          descriptionKey="signupPending.ended.description"
        />
      ) : progress.kind === 'closed' ? (
        <SignupClosedPanel status={progress.status} />
      ) : progress.kind === 'phase' ? (
        <FawtaraStatusPanel
          // TODO(backend): approval is all the status read reports. Approval follows Fawtir's
          // acceptance of the portal request, so an approved account is shown as being registered
          // on the SMP until a read reports the connection. ONBOARDING.md row 1.9.
          phase={progress.phase}
          email={email}
          choice={restored.plan ? restored : undefined}
          action={
            progress.phase === 'registering' ? (
              <Button type="button" className="gap-1.5" onClick={() => navigate('/login')}>
                {t('signupPending.approved.signIn')}
                <ChevronRightIcon size={18} className="rtl:rotate-180" />
              </Button>
            ) : progress.reopened ? (
              <Button
                type="button"
                className="gap-1.5"
                onClick={() => navigate(REVIEW_ROUTE, { state: restored })}
              >
                {t('signupPending.rejected.correct')}
                <ChevronRightIcon size={18} className="rtl:rotate-180" />
              </Button>
            ) : undefined
          }
        />
      ) : null}
    </AuthLayout>
  )
}
