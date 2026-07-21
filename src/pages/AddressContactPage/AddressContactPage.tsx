import { useCallback, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AuthLayout } from '../../components/auth/AuthLayout'
import {
  BusinessIdentityHero,
  type InvoicePreviewData,
} from '../BusinessIdentityPage/BusinessIdentityHero'
import { AddressContactForm } from './AddressContactForm'

const DEFAULT_PREVIEW: InvoicePreviewData = {
  companyName: 'Al Bahja Coffee Roasters LLC',
  crNumber: '1234567',
  vatin: 'OM1100112233',
  peppolId: '0248:OM1100112233',
  initials: 'AB',
  accentColor: '#2C4EB7',
  addressLine: 'Building 22, Al Khuwair Street, Block 33',
  city: 'Muscat',
  governorate: 'Muscat',
  postalCode: '133',
}

export function AddressContactPage() {
  const location = useLocation()
  const [preview, setPreview] = useState<InvoicePreviewData>(DEFAULT_PREVIEW)
  const backState = useMemo(() => location.state, [location.state])
  const handlePreviewChange = useCallback((next: InvoicePreviewData) => {
    setPreview(next)
  }, [])

  return (
    <AuthLayout
      backTo="/business-identity"
      backState={backState}
      showLanguageSwitcher={false}
      hero={<BusinessIdentityHero preview={preview} noteVariant="compliance" />}
    >
      <AddressContactForm onPreviewChange={handlePreviewChange} />
    </AuthLayout>
  )
}
