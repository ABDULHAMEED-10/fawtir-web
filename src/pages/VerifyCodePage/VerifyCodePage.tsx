import { Navigate, useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { readOnboardingSession } from '../../lib/identity/onboardingSession'
import { isSignupVerificationState } from '../../lib/identity/verification'
import { ForgotPasswordVerifyForm } from './ForgotPasswordVerifyForm'
import { SignupVerifyCodeForm } from './SignupVerifyCodeForm'

type ForgotPasswordVerifyState = {
  from: 'forgot-password'
  contact: string
}

function isForgotPasswordState(value: unknown): value is ForgotPasswordVerifyState {
  if (typeof value !== 'object' || value === null) return false
  const state = value as Record<string, unknown>
  return state.from === 'forgot-password' && typeof state.contact === 'string'
}

export function VerifyCodePage() {
  const state = useLocation().state

  if (isSignupVerificationState(state)) {
    return (
      <AuthLayout backTo="/signup" showLanguageSwitcher={false}>
        <SignupVerifyCodeForm verification={state} />
      </AuthLayout>
    )
  }

  if (isForgotPasswordState(state)) {
    return (
      <AuthLayout backTo="/forgot-password" showLanguageSwitcher={false}>
        <ForgotPasswordVerifyForm contact={state.contact} />
      </AuthLayout>
    )
  }

  // Without the signup handle there is nothing to verify. A registrant who has already verified
  // (for instance by pressing Back on the first onboarding step) belongs on that step; the
  // single-use code cannot be entered twice.
  return <Navigate to={readOnboardingSession() ? '/about-business' : '/signup'} replace />
}
