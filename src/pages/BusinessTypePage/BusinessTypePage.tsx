import { useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { OnboardingGate } from '../../components/auth/OnboardingGate'
import { onboardingStateFrom } from '../../lib/onboarding'
import { BusinessTypeForm } from './BusinessTypeForm'

export function BusinessTypePage() {
  const location = useLocation()
  const state = onboardingStateFrom(location.state)

  return (
    <OnboardingGate ready={Boolean(state.businessSize && state.invoicingMethod)}>
      <AuthLayout backTo="/about-business" backState={location.state} showLanguageSwitcher={false}>
        <BusinessTypeForm />
      </AuthLayout>
    </OnboardingGate>
  )
}
