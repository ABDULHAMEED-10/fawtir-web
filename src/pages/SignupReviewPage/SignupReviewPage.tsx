import { useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { OnboardingGate } from '../../components/auth/OnboardingGate'
import {
  EMPTY_PREVIEW,
  accentColor,
  initialsOf,
  onboardingStateFrom,
  type InvoicePreviewData,
} from '../../lib/onboarding'
import { BusinessIdentityHero } from '../BusinessIdentityPage/BusinessIdentityHero'
import { SignupReviewForm } from './SignupReviewForm'
import { candidateParticipantId } from '../../lib/peppolParticipant'

export function SignupReviewPage() {
  const { t } = useTranslation()
  const location = useLocation()
  const state = onboardingStateFrom(location.state)
  const { identity, address } = state

  const preview: InvoicePreviewData = identity
    ? {
        companyName: identity.companyName,
        crNumber: identity.crNumber,
        vatin: identity.vatin,
        peppolId: candidateParticipantId(identity.vatin) ?? t('businessIdentity.peppolPending'),
        initials: initialsOf(identity.companyName),
        accentColor: accentColor(identity.accent),
        logoUrl: identity.logoUrl,
        addressLine: address?.addressLine,
        addressLine2: address?.addressLine2,
        addressLine3: address?.addressLine3,
        city: address?.city,
        governorate: address ? t(`governorate.${address.governorate}`) : undefined,
        postalCode: address?.postalCode,
      }
    : EMPTY_PREVIEW

  return (
    <OnboardingGate ready={Boolean(address)}>
      <AuthLayout
        backTo="/address-contact"
        backState={location.state}
        showLanguageSwitcher={false}
        hero={<BusinessIdentityHero preview={preview} />}
      >
        <SignupReviewForm />
      </AuthLayout>
    </OnboardingGate>
  )
}
