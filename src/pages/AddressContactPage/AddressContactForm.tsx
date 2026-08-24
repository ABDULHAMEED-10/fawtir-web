import { useEffect, useId, useMemo, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BuildingIcon,
  Button,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  HashIcon,
  IdCardIcon,
  Input,
  LocationPinIcon,
  MailIcon,
  PhoneInput,
  UserIcon,
} from '../../components/ui'
import type { InvoicePreviewData } from '../BusinessIdentityPage/BusinessIdentityHero'
import {
  email as validateEmail,
  isClean,
  omanPhone,
  postalCode as validatePostal,
  required,
  type FieldError,
} from '../../lib/validation'

type LocationState = {
  businessSize?: string
  invoicingMethod?: string
  businessType?: string
  subBusinessType?: string
  companyName?: string
  crNumber?: string
  vatin?: string
  peppolId?: string
  accentColor?: string
  logoUrl?: string | null
}

type AddressContactFormProps = {
  onPreviewChange: (preview: InvoicePreviewData) => void
}

const GOVERNORATES = [
  'Muscat',
  'Dhofar',
  'Musandam',
  'Al Batinah North',
  'Al Batinah South',
  'Ash Sharqiyah North',
  'Ash Sharqiyah South',
  'Ad Dakhiliyah',
  'Al Wusta',
  'Al Buraimi',
  'Ad Dhahirah',
] as const

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'AB'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

export function AddressContactForm({ onPreviewChange }: AddressContactFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const answers = (location.state as LocationState | null) ?? {}
  const governorateId = useId()

  const companyName = answers.companyName ?? 'Al Bahja Coffee Roasters LLC'
  const crNumber = answers.crNumber ?? '1234567'
  const vatin = answers.vatin ?? 'OM1100112233'
  const peppolId = answers.peppolId ?? (vatin ? `0248:${vatin}` : '')
  const accentColor = answers.accentColor ?? '#2C4EB7'
  const logoUrl = answers.logoUrl ?? null

  const [addressLine, setAddressLine] = useState('Building 22, Al Khuwair Street, Block 33')
  const [postalCode, setPostalCode] = useState('133')
  const [city, setCity] = useState('Muscat')
  const [governorate, setGovernorate] = useState('Muscat')
  const [contactName, setContactName] = useState('Hafidh Saif Al Balushi')
  const [role, setRole] = useState('Owner')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('hafidh@albahja.om')
  const [errors, setErrors] = useState<Record<string, FieldError>>({})

  const clearError = (field: string) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const preview = useMemo<InvoicePreviewData>(
    () => ({
      companyName,
      crNumber,
      vatin,
      peppolId,
      initials: getInitials(companyName),
      accentColor,
      logoUrl,
      addressLine,
      city,
      governorate,
      postalCode,
    }),
    [
      accentColor,
      logoUrl,
      addressLine,
      city,
      companyName,
      crNumber,
      governorate,
      peppolId,
      postalCode,
      vatin,
    ],
  )

  useEffect(() => {
    onPreviewChange(preview)
  }, [onPreviewChange, preview])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Record<string, FieldError> = {
      addressLine: required(addressLine),
      postalCode: validatePostal(postalCode),
      city: required(city),
      contactName: required(contactName),
      phone: omanPhone(phone),
      email: validateEmail(email),
    }
    setErrors(next)
    if (!isClean(next)) return
    navigate('/plans', {
      state: {
        ...answers,
        addressLine,
        postalCode,
        city,
        governorate,
        contactName,
        role,
        phone,
        email,
      },
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-[700px] flex-col items-center gap-11"
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('addressContact.title')}
          </h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">
            {t('addressContact.description')}
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase leading-[1.2] text-text-muted">
            {t('addressContact.registeredAddress')}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label={t('addressContact.addressLine')}
              requiredMark
              value={addressLine}
              onChange={(e) => {
                setAddressLine(e.target.value)
                clearError('addressLine')
              }}
              error={errors.addressLine ? t(errors.addressLine) : undefined}
              leadingIcon={<LocationPinIcon size={20} />}
              trailingIcon={
                addressLine ? (
                  <button
                    type="button"
                    onClick={() => setAddressLine('')}
                    className="inline-flex text-text-quaternary hover:text-text-secondary"
                    aria-label={t('common.clear')}
                  >
                    <CloseIcon />
                  </button>
                ) : null
              }
            />
            <Input
              label={t('addressContact.postalCode')}
              value={postalCode}
              onChange={(e) => {
                setPostalCode(e.target.value)
                clearError('postalCode')
              }}
              error={errors.postalCode ? t(errors.postalCode) : undefined}
              leadingIcon={<HashIcon size={14} />}
            />
            <Input
              label={t('addressContact.city')}
              requiredMark
              value={city}
              onChange={(e) => {
                setCity(e.target.value)
                clearError('city')
              }}
              error={errors.city ? t(errors.city) : undefined}
              leadingIcon={<BuildingIcon size={20} />}
            />
            <div className="flex w-full flex-col gap-1">
              <label
                htmlFor={governorateId}
                className="inline-flex items-center gap-0.5 text-sm font-medium text-text-primary"
              >
                {t('addressContact.governorate')}
                <span className="text-xl leading-4 text-primary-700">*</span>
              </label>
              <div className="relative flex h-[50px] items-center rounded-sm bg-surface-card px-4 transition-shadow focus-within:ring-1 focus-within:ring-border-brand">
                <span className="pointer-events-none absolute start-4 inline-flex text-primary-700">
                  <BuildingIcon size={20} />
                </span>
                <select
                  id={governorateId}
                  value={governorate}
                  onChange={(e) => setGovernorate(e.target.value)}
                  className="h-full w-full appearance-none border-0 bg-transparent pe-8 ps-8 text-sm font-medium text-text-secondary outline-none"
                >
                  {GOVERNORATES.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <span className="pointer-events-none absolute end-4 inline-flex text-text-quaternary">
                  <ChevronDownIcon size={20} />
                </span>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <p className="text-sm font-semibold uppercase leading-[1.2] text-text-quaternary">
            {t('addressContact.primaryContact')}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label={t('addressContact.contactName')}
              requiredMark
              value={contactName}
              onChange={(e) => {
                setContactName(e.target.value)
                clearError('contactName')
              }}
              error={errors.contactName ? t(errors.contactName) : undefined}
              leadingIcon={<UserIcon size={20} />}
            />
            <Input
              label={t('addressContact.role')}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              leadingIcon={<IdCardIcon size={20} />}
            />
            <PhoneInput
              label={t('addressContact.phone')}
              requiredMark
              placeholder={t('signup.phonePlaceholder')}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                clearError('phone')
              }}
              error={errors.phone ? t(errors.phone) : undefined}
            />
            <Input
              label={t('addressContact.email')}
              requiredMark
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                clearError('email')
              }}
              error={errors.email ? t(errors.email) : undefined}
              leadingIcon={<MailIcon size={20} />}
            />
          </div>
        </section>
      </div>

      <Button type="submit" className="w-full max-w-[400px] gap-1.5">
        {t('addressContact.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
