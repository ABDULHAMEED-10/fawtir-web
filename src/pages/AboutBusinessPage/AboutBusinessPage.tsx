import { useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { OnboardingGate } from '../../components/auth/OnboardingGate'
import { onboardingStateFrom } from '../../lib/onboarding'
import { AboutBusinessForm } from './AboutBusinessForm'

export function AboutBusinessPage() {
  const state = onboardingStateFrom(useLocation().state)
  return (
    // Nothing before this step can be missing, but a tab that did not just verify (a new tab, the
    // "verified" screen's Continue, a resumed registration) asks the status once so the answers
    // saved earlier are shown rather than the defaults.
    <OnboardingGate ready={Boolean(state.businessSize || state.accountEmail)}>
      {/* Back to the code step, which shows itself as done once the email is verified. */}
      <AuthLayout backTo="/verify-code" showLanguageSwitcher={false}>
        <AboutBusinessForm />
      </AuthLayout>
    </OnboardingGate>
  )
}
