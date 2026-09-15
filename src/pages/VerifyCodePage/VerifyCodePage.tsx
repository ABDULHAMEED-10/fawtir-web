import { Navigate, useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { readOnboardingSession } from '../../lib/identity/onboardingSession'
import { isSignupVerificationState } from '../../lib/identity/verification'
import { SignupVerifyCodeForm } from './SignupVerifyCodeForm'

export function VerifyCodePage() {
  const state = useLocation().state

  if (isSignupVerificationState(state)) {
    return (
      <AuthLayout backTo="/signup" showLanguageSwitcher={false}>
        <SignupVerifyCodeForm verification={state} />
      </AuthLayout>
    )
  }

  // Without the signup handle there is nothing to verify. A registrant who has already verified
  // (for instance by pressing Back on the first onboarding step) belongs on that step; the
  // single-use code cannot be entered twice.
  return <Navigate to={readOnboardingSession() ? '/about-business' : '/signup'} replace />
}
