import { useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { OnboardingGate } from '../../components/auth/OnboardingGate'
import { backendCategoryFor } from '../../lib/identity/onboarding'
import { onboardingStateFrom } from '../../lib/onboarding'
import { SubBusinessTypeForm } from './SubBusinessTypeForm'

export function SubBusinessTypePage() {
  const location = useLocation()
  const state = onboardingStateFrom(location.state)
  const cameFromSavedCategory = Boolean(state.businessType && backendCategoryFor(state.businessType))

  return (
    <OnboardingGate ready={cameFromSavedCategory}>
      <AuthLayout backTo="/business-type" backState={location.state} showLanguageSwitcher={false}>
        <SubBusinessTypeForm />
      </AuthLayout>
    </OnboardingGate>
  )
}
