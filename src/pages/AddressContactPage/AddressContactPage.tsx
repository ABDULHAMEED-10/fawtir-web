import { useCallback, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { OnboardingGate } from '../../components/auth/OnboardingGate'
import { EMPTY_PREVIEW, onboardingStateFrom, type InvoicePreviewData } from '../../lib/onboarding'
import { BusinessIdentityHero } from '../BusinessIdentityPage/BusinessIdentityHero'
import { AddressContactForm } from './AddressContactForm'

export function AddressContactPage() {
  const location = useLocation()
  const state = onboardingStateFrom(location.state)
  const [preview, setPreview] = useState<InvoicePreviewData>(EMPTY_PREVIEW)
  const handlePreviewChange = useCallback((next: InvoicePreviewData) => {
    setPreview(next)
  }, [])

  return (
    <OnboardingGate ready={Boolean(state.identity)}>
      <AuthLayout
        backTo="/business-identity"
        backState={location.state}
        showLanguageSwitcher={false}
        hero={<BusinessIdentityHero preview={preview} noteVariant="compliance" />}
      >
        <AddressContactForm onPreviewChange={handlePreviewChange} />
      </AuthLayout>
    </OnboardingGate>
  )
}
