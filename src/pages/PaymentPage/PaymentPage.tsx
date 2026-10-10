import { Navigate, useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { OnboardingGate } from '../../components/auth/OnboardingGate'
import { PLANS_ROUTE } from '../../lib/identity/onboarding'
import { onboardingStateFrom } from '../../lib/onboarding'
import { PaymentForm } from './PaymentForm'
import { PaymentHero } from './PaymentHero'

export function PaymentPage() {
  const location = useLocation()
  const state = onboardingStateFrom(location.state)

  return (
    <OnboardingGate ready={Boolean(state.address && state.plan)}>
      {/* Opened without a plan (a typed URL): the plan comes first. Enterprise has no payment
          step at all, its terms are agreed on a call. */}
      {!state.plan || state.plan === 'enterprise' ? (
        <Navigate to={PLANS_ROUTE} replace state={location.state} />
      ) : (
        <AuthLayout
          backTo={PLANS_ROUTE}
          backState={location.state}
          showLanguageSwitcher={false}
          hero={<PaymentHero />}
        >
          <PaymentForm />
        </AuthLayout>
      )}
    </OnboardingGate>
  )
}
