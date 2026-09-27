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
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import { focusFirstInvalid } from '../../lib/forms'
import { GOVERNORATES, isGovernorateId, type GovernorateId } from '../../lib/governorates'
import {
  ADDRESS_CONTACT_FIELD_ORDER,
  ADDRESS_CONTACT_SERVER_FIELDS,
  REVIEW_ROUTE,
  buildAddressContactRequest,
  recordAddressContact,
  validateAddressContact,
  type AddressContactField,
} from '../../lib/identity/onboarding'
import {
  INVOICE_ACCENTS,
  accentColor,
  initialsOf,
  onboardingStateFrom,
  type InvoicePreviewData,
  type OnboardingState,
} from '../../lib/onboarding'
import { isClean, type FieldError } from '../../lib/validation'
import { candidateParticipantId } from '../../lib/peppolParticipant'

type AddressContactFormProps = {
  onPreviewChange: (preview: InvoicePreviewData) => void
}

export function AddressContactForm({ onPreviewChange }: AddressContactFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const state = onboardingStateFrom(useLocation().state)
  const identity = state.identity
  const saved = state.address
  const governorateId = useId()

  // Empty unless coming back from review, not the prototype's sample business and person: a
  // contact's phone and email are personal data, and pre-filled ones would be saved unedited.
  // Muscat stays the default only because a native select always shows a value.
  const [addressLine, setAddressLine] = useState(saved?.addressLine ?? '')
  const [postalCode, setPostalCode] = useState(saved?.postalCode ?? '')
  const [city, setCity] = useState(saved?.city ?? '')
  const [governorate, setGovernorate] = useState<GovernorateId>(saved?.governorate ?? 'muscat')
  const [contactName, setContactName] = useState(saved?.contactName ?? '')
  const [role, setRole] = useState(saved?.role ?? '')
  const [phone, setPhone] = useState(saved?.phone ?? '')
  const [email, setEmail] = useState(saved?.email ?? '')
  const [errors, setErrors] = useState<Partial<Record<AddressContactField, FieldError>>>({})
  const { save, submitting, formError } = useOnboardingStep<AddressContactField>({
    serverFields: ADDRESS_CONTACT_SERVER_FIELDS,
  })

  const clearError = (field: AddressContactField) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const peppolPending =
    candidateParticipantId(identity?.vatin) ?? t('businessIdentity.peppolPending')
  const governorateLabel = t(`governorate.${governorate}`)

  const preview = useMemo<InvoicePreviewData>(
    () => ({
      companyName: identity?.companyName ?? '',
      crNumber: identity?.crNumber ?? '',
      vatin: identity?.vatin ?? '',
      peppolId: peppolPending,
      initials: initialsOf(identity?.companyName ?? ''),
      accentColor: accentColor(identity?.accent ?? INVOICE_ACCENTS[0].id),
      logoUrl: identity?.logoUrl ?? null,
      addressLine,
      city,
      governorate: governorateLabel,
      postalCode,
    }),
    [addressLine, city, governorateLabel, identity, peppolPending, postalCode],
  )

  useEffect(() => {
    onPreviewChange(preview)
  }, [onPreviewChange, preview])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = { addressLine, postalCode, city, governorate, contactName, role, phone, email }
    const next = validateAddressContact(values)
    setErrors(next)
    if (!isClean(next)) {
      focusFirstInvalid(form, ADDRESS_CONTACT_FIELD_ORDER, next)
      return
    }

    const request = buildAddressContactRequest(values)
    const result = await save((token, signal) => recordAddressContact(token, request, signal))
    if (!result.saved) {
      setErrors(result.fieldErrors)
      focusFirstInvalid(form, ADDRESS_CONTACT_FIELD_ORDER, result.fieldErrors)
      return
    }
    const nextState: OnboardingState = { ...state, address: values }
    navigate(REVIEW_ROUTE, { state: nextState })
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
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
              name="addressLine"
              autoComplete="address-line1"
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
              name="postalCode"
              autoComplete="postal-code"
              inputMode="numeric"
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
              name="city"
              autoComplete="address-level2"
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
                  name="governorate"
                  value={governorate}
                  onChange={(e) => {
                    if (isGovernorateId(e.target.value)) setGovernorate(e.target.value)
                  }}
                  className="h-full w-full appearance-none border-0 bg-transparent pe-8 ps-8 text-sm font-medium text-text-secondary outline-none"
                >
                  {GOVERNORATES.map((id) => (
                    <option key={id} value={id}>
                      {t(`governorate.${id}`)}
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
              name="contactName"
              autoComplete="name"
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
              name="role"
              autoComplete="organization-title"
              value={role}
              onChange={(e) => {
                setRole(e.target.value)
                clearError('role')
              }}
              error={errors.role ? t(errors.role) : undefined}
              leadingIcon={<IdCardIcon size={20} />}
            />
            <PhoneInput
              label={t('addressContact.phone')}
              requiredMark
              name="phone"
              autoComplete="tel-national"
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
              name="email"
              autoComplete="email"
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

      {formError ? (
        <p className="text-xs font-medium text-text-danger" role="alert">
          {t(formError.key, formError.values)}
        </p>
      ) : null}

      <Button type="submit" disabled={submitting} className="w-full max-w-[400px] gap-1.5">
        {t('addressContact.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
