import { Navigate, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { SignupResumePrompt } from '../../components/auth/SignupResumePrompt'
import { Button, ChevronRightIcon } from '../../components/ui'
import { useSignupProgress } from '../../hooks/useSignupProgress'
import { REVIEW_ROUTE } from '../../lib/identity/onboarding'
import { onboardingStateFromStatus } from '../../lib/identity/signupDraft'
import { FawtaraStatusHero } from './FawtaraStatusHero'
import { FawtaraStatusPanel } from './FawtaraStatusPanel'

/**
 * The same "getting you live" screen, opened on its own.
 *
 * It shows the stage `/signup/status` reports for this tab's registration and nothing more: under
 * review is never "approved", and without an onboarding token there is no stage to show, so it
 * asks the reader to sign in or continue the registration instead of assuming one.
 *
 * TODO(backend): nothing reports the portal connection yet (requested, accepted, registered on
 * the SMP, declined, expired), so an approved account is shown as still to send its request, and
 * a signed-in session has no read of its own here; once one reports it, sign-in should land here
 * until the account is connected, then on the dashboard. ONBOARDING.md rows 1.7 to 1.9.
 */
export function FawtaraStatusPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const progress = useSignupProgress(false)

  if (progress.kind === 'redirect') return <Navigate to={progress.route} replace />
  const restored =
    progress.kind === 'phase' && progress.status ? onboardingStateFromStatus(progress.status) : {}

  return (
    <AuthLayout
      backTo="/dashboard"
      showLanguageSwitcher={false}
      align="start"
      hero={<FawtaraStatusHero />}
    >
      {progress.kind === 'ended' || progress.kind === 'none' ? (
        <SignupResumePrompt
          titleKey="fawtaraStatus.signedOut.title"
          descriptionKey="fawtaraStatus.signedOut.description"
        />
      ) : progress.kind === 'phase' ? (
        <FawtaraStatusPanel
          phase={progress.phase}
          email={restored.accountEmail}
          action={
            progress.reopened ? (
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
