import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { Button, CheckCircleIcon, ChevronRightIcon } from '../../components/ui'
import { readOnboardingSession } from '../../lib/identity/onboardingSession'
import { isSignupVerificationState } from '../../lib/identity/verification'
import { SignupVerifyCodeForm } from './SignupVerifyCodeForm'

/**
 * Where Back from the first onboarding step lands. The single-use code is spent, so the screen
 * shows the step as done rather than an empty code box that could only fail, and Continue
 * returns to where the registrant left off.
 */
function VerifiedView() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="flex flex-col gap-3">
        <CheckCircleIcon size={40} className="text-success-700" />
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('verifyCode.verifiedTitle')}
        </h2>
        <p className="text-base font-medium leading-[1.4] text-text-quaternary">
          {t('verifyCode.verifiedDescription')}
        </p>
      </div>
      <Button type="button" onClick={() => navigate('/about-business')} className="w-full gap-1.5">
        {t('verifyCode.verifiedContinue')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </div>
  )
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

  // Already verified: the step is shown as done, so Back from the next step has a real screen.
  if (readOnboardingSession()) {
    return (
      <AuthLayout backTo="/signup" showLanguageSwitcher={false}>
        <VerifiedView />
      </AuthLayout>
    )
  }

  // Without the signup handle or a session there is nothing to verify.
  return <Navigate to="/signup" replace />
}
