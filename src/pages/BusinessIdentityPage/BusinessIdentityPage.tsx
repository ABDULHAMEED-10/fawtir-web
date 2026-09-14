import { useCallback, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { OnboardingGate } from '../../components/auth/OnboardingGate'
import { EMPTY_PREVIEW, onboardingStateFrom, type InvoicePreviewData } from '../../lib/onboarding'
import { BusinessIdentityForm } from './BusinessIdentityForm'
import { BusinessIdentityHero } from './BusinessIdentityHero'

export function BusinessIdentityPage() {
  const location = useLocation()
  const state = onboardingStateFrom(location.state)
  const [preview, setPreview] = useState<InvoicePreviewData>(EMPTY_PREVIEW)
  const handlePreviewChange = useCallback((next: InvoicePreviewData) => {
    setPreview(next)
  }, [])

  return (
    <OnboardingGate ready={Boolean(state.subBusinessType)}>
      <AuthLayout
        backTo="/sub-business-type"
        backState={location.state}
        showLanguageSwitcher={false}
        hero={<BusinessIdentityHero preview={preview} />}
      >
        <BusinessIdentityForm onPreviewChange={handlePreviewChange} />
      </AuthLayout>
    </OnboardingGate>
  )
}
