import { useCallback, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import {
  shouldShowBusinessTypeScreen,
  type AboutBusinessAnswers,
} from '../../lib/onboarding'
import { BusinessIdentityForm } from './BusinessIdentityForm'
import {
  BusinessIdentityHero,
  type InvoicePreviewData,
} from './BusinessIdentityHero'

type LocationState = AboutBusinessAnswers & {
  businessType?: string
  subBusinessType?: string
}

const DEFAULT_PREVIEW: InvoicePreviewData = {
  companyName: 'Al Bahja Coffee Roasters LLC',
  crNumber: '1234567',
  vatin: 'OM1100112233',
  peppolId: '0248:OM1100112233',
  initials: 'AB',
  accentColor: '#2C4EB7',
}

export function BusinessIdentityPage() {
  const location = useLocation()
  const answers = (location.state as LocationState | null) ?? null
  const [preview, setPreview] = useState<InvoicePreviewData>(DEFAULT_PREVIEW)

  const fromPosFlow =
    answers != null &&
    shouldShowBusinessTypeScreen(answers.businessSize, answers.invoicingMethod)

  const backTo = fromPosFlow ? '/sub-business-type' : '/about-business'
  const backState = useMemo(() => answers, [answers])
  const handlePreviewChange = useCallback((next: InvoicePreviewData) => {
    setPreview(next)
  }, [])

  return (
    <AuthLayout
      backTo={backTo}
      backState={backState}
      showLanguageSwitcher={false}
      hero={<BusinessIdentityHero preview={preview} />}
    >
      <BusinessIdentityForm onPreviewChange={handlePreviewChange} />
    </AuthLayout>
  )
}
