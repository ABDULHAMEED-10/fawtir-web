import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { OnboardingFormError } from '../../components/auth/OnboardingFormError'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  CameraIcon,
  ChevronRightIcon,
  CloseIcon,
  Combobox,
  HashIcon,
  Input,
  UserIcon,
  type SelectOption,
} from '../../components/ui'
import { useOnboardingStep } from '../../hooks/useOnboardingStep'
import { nameOf } from '../../lib/codeLists/codeList'
import { ISIC_ACTIVITIES } from '../../lib/codeLists/isic'
import { isicForSubType } from '../../lib/codeLists/isicBySubType'
import { focusFirstInvalid } from '../../lib/forms'
import {
  BUSINESS_IDENTITY_FIELD_ORDER,
  BUSINESS_IDENTITY_SERVER_FIELDS,
  buildBusinessIdentityRequest,
  recordBusinessIdentity,
  registrableCategory,
  validateBusinessIdentity,
  type BusinessIdentityField,
} from '../../lib/identity/onboarding'
import {
  CATEGORY_LABEL_KEYS,
  INVOICE_ACCENTS,
  accentColor,
  initialsOf,
  onboardingStateFrom,
  type InvoiceAccent,
  type InvoicePreviewData,
  type OnboardingState,
} from '../../lib/onboarding'
import { isClean, type FieldError } from '../../lib/validation'
import { candidateParticipantId } from '../../lib/peppolParticipant'

const LOGO_TYPES = ['image/png', 'image/svg+xml']
const IDENTIFIER_TAKEN = 'businessIdentity.identifierTaken'
const LOGO_MAX_BYTES = 2 * 1024 * 1024

type BusinessIdentityFormProps = {
  onPreviewChange: (preview: InvoicePreviewData) => void
}

export function BusinessIdentityForm({ onPreviewChange }: BusinessIdentityFormProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const state = onboardingStateFrom(useLocation().state)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isicRef = useRef<HTMLDivElement>(null)

  // Empty unless restored on Back. The prototype pre-filled a real-looking business, so pressing
  // Continue unedited would have registered someone else's CR number and VATIN.
  const [companyName, setCompanyName] = useState(state.identity?.companyName ?? '')
  const [crNumber, setCrNumber] = useState(state.identity?.crNumber ?? '')
  const [vatin, setVatin] = useState(state.identity?.vatin ?? '')
  // The specialty chosen two steps back suggests the activity; the registrant confirms or changes it.
  const [industrialClassification, setIndustrialClassification] = useState(
    state.identity?.industrialClassification ?? isicForSubType(state.subBusinessType)?.code ?? '',
  )
  const [accent, setAccent] = useState<InvoiceAccent>(
    state.identity?.accent ?? INVOICE_ACCENTS[0].id,
  )
  const [logoPreview, setLogoPreview] = useState<string | null>(state.identity?.logoUrl ?? null)
  const [errors, setErrors] = useState<Partial<Record<BusinessIdentityField | 'logo', FieldError>>>(
    {},
  )
  const { save, submitting, formError, setFormError } = useOnboardingStep<BusinessIdentityField>({
    serverFields: BUSINESS_IDENTITY_SERVER_FIELDS,
    conflictKey: IDENTIFIER_TAKEN,
  })

  const clearError = (field: BusinessIdentityField | 'logo') =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  // The server's "already registered" answers the CR number and VATIN that were sent; once either
  // is edited it no longer describes what is on screen and stayed beside the new field error (G6).
  const clearIdentifierTaken = () => {
    if (formError?.key === IDENTIFIER_TAKEN) setFormError(null)
  }

  // Shown as `0248:` + the VAT number once that number is valid, never typed: it is a candidate
  // Fawtir reviews with the registration, where an OM12 group VATIN (Fawtara SP#6) or an ID
  // registered elsewhere is corrected by the reviewer, not here.
  const peppolPending = candidateParticipantId(vatin) ?? t('businessIdentity.peppolPending')
  const category = registrableCategory(state.businessType)

  // Searched by activity name; the code is the hint so a known code finds it too.
  // TODO(backend): `GET /v1/code-lists/isic?q=` replaces the placeholder list.
  const isicOptions = useMemo<SelectOption[]>(
    () =>
      ISIC_ACTIVITIES.map((activity) => ({
        value: activity.code,
        label: nameOf(activity, i18n.language),
        hint: `ISIC ${activity.code}`,
      })),
    [i18n.language],
  )

  const preview = useMemo<InvoicePreviewData>(
    () => ({
      companyName,
      crNumber,
      vatin,
      peppolId: peppolPending,
      initials: initialsOf(companyName),
      accentColor: accentColor(accent),
      logoUrl: logoPreview,
    }),
    [accent, companyName, crNumber, logoPreview, peppolPending, vatin],
  )

  useEffect(() => {
    onPreviewChange(preview)
  }, [onPreviewChange, preview])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = event.currentTarget
    const values = { companyName, crNumber, vatin, industrialClassification, accent }
    const next = validateBusinessIdentity(values)
    setErrors(next)
    if (!isClean(next)) {
      // The activity picker is a button, not a named input, so it is focused by hand when it is
      // the first thing wrong; the named inputs go through the shared helper.
      if (!next.companyName && !next.crNumber && next.industrialClassification) {
        isicRef.current?.querySelector('button')?.focus()
      } else {
        focusFirstInvalid(form, BUSINESS_IDENTITY_FIELD_ORDER, next)
      }
      return
    }

    const request = buildBusinessIdentityRequest(values)
    const result = await save((token, signal) => recordBusinessIdentity(token, request, signal))
    if (!result.saved) {
      setErrors(result.fieldErrors)
      focusFirstInvalid(form, BUSINESS_IDENTITY_FIELD_ORDER, result.fieldErrors)
      return
    }
    const nextState: OnboardingState = {
      ...state,
      identity: {
        companyName: request.legalCompanyName,
        crNumber: request.commercialRegistrationNumber,
        vatin: request.taxNumber,
        industrialClassification,
        accent,
        logoUrl: logoPreview,
      },
    }
    navigate('/address-contact', { state: nextState })
  }

  const handleLogoChange = (file: File | null) => {
    clearError('logo')
    if (!file) {
      setLogoPreview(null)
      return
    }
    if (!LOGO_TYPES.includes(file.type)) {
      setErrors((current) => ({ ...current, logo: 'validation.logoType' }))
      return
    }
    if (file.size > LOGO_MAX_BYTES) {
      setErrors((current) => ({ ...current, logo: 'validation.logoSize' }))
      return
    }
    // A data URL rather than an object URL: a blob URL dies with this screen, and the address
    // step renders the same preview. It is never uploaded — see buildBusinessIdentityRequest.
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => setErrors((current) => ({ ...current, logo: 'validation.logoType' }))
    reader.readAsDataURL(file)
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex w-full max-w-[700px] flex-col items-center gap-11"
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-3">
          {/* The trade chip only for a POS registrant: the others never chose one. */}
          {state.usesPos === false ? null : (
            <span className="inline-flex h-[29px] w-fit items-center justify-center rounded-sm border border-primary-150 px-2.5 text-base font-medium text-primary-700">
              {t(CATEGORY_LABEL_KEYS[category])}
            </span>
          )}
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('businessIdentity.title')}
          </h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">
            {t('businessIdentity.description')}
          </p>
        </div>

        <div className="flex w-full flex-col gap-[26px]">
          <div className="flex max-w-[502px] flex-col gap-1.5">
            <p className="text-sm font-medium leading-[1.2] text-text-primary">
              {t('businessIdentity.logoLabel')}
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-3 text-start"
            >
              <span className="flex size-[72px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border-strong">
                {logoPreview ? (
                  <img src={logoPreview} alt="" className="size-full object-cover" />
                ) : (
                  <CameraIcon size={30} className="text-text-tertiary" />
                )}
              </span>
              <span className="flex flex-col gap-1">
                <span className="text-base font-medium leading-[1.2] text-text-primary">
                  {logoPreview
                    ? t('businessIdentity.logoReplace')
                    : t('businessIdentity.logoTitle')}
                </span>
                <span className="text-xs font-medium leading-[1.2] text-text-tertiary">
                  {t('businessIdentity.logoHint')}
                </span>
              </span>
            </button>
            {logoPreview ? (
              <button
                type="button"
                onClick={() => handleLogoChange(null)}
                className="w-fit text-xs font-semibold text-primary-700 hover:text-primary-800"
              >
                {t('businessIdentity.logoRemove')}
              </button>
            ) : null}
            {errors.logo ? (
              <p className="text-xs font-medium text-text-danger" role="alert">
                {t(errors.logo)}
              </p>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/svg+xml"
              className="hidden"
              onChange={(e) => handleLogoChange(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label={t('businessIdentity.companyNameLabel')}
              requiredMark
              name="companyName"
              autoComplete="organization"
              value={companyName}
              onChange={(e) => {
                setCompanyName(e.target.value)
                clearError('companyName')
              }}
              error={errors.companyName ? t(errors.companyName) : undefined}
              leadingIcon={<UserIcon size={20} />}
              trailingIcon={
                companyName ? (
                  <button
                    type="button"
                    onClick={() => setCompanyName('')}
                    className="inline-flex text-text-quaternary hover:text-text-secondary"
                    aria-label={t('common.clear')}
                  >
                    <CloseIcon />
                  </button>
                ) : null
              }
            />

            <Input
              label={t('businessIdentity.crLabel')}
              requiredMark
              name="crNumber"
              value={crNumber}
              onChange={(e) => {
                setCrNumber(e.target.value)
                clearError('crNumber')
                clearIdentifierTaken()
              }}
              error={errors.crNumber ? t(errors.crNumber) : undefined}
              leadingIcon={<HashIcon size={14} />}
              hint={t('businessIdentity.crHint')}
            />

            <div ref={isicRef} className="flex flex-col gap-1.5">
              <span
                id="business-activity-label"
                className="flex items-center gap-1 text-sm font-medium leading-[1.2] text-text-primary"
              >
                {t('businessIdentity.isicLabel')}
              </span>
              <Combobox
                value={industrialClassification}
                onChange={(code) => {
                  setIndustrialClassification(code)
                  clearError('industrialClassification')
                }}
                options={isicOptions}
                placeholder={t('businessIdentity.isicPlaceholder')}
                searchPlaceholder={t('businessIdentity.isicSearch')}
                emptyText={t('businessIdentity.isicNone')}
                ariaLabel={t('businessIdentity.isicLabel')}
              />
              {errors.industrialClassification ? (
                <p className="text-xs font-medium text-text-danger" role="alert">
                  {t(errors.industrialClassification)}
                </p>
              ) : (
                <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
                  {t(
                    state.usesPos === false
                      ? 'businessIdentity.isicHintNoPos'
                      : 'businessIdentity.isicHint',
                  )}
                </p>
              )}
            </div>

            <Input
              label={t('businessIdentity.vatinLabel')}
              requiredMark
              name="vatin"
              value={vatin}
              onChange={(e) => {
                setVatin(e.target.value.toUpperCase())
                clearError('vatin')
                clearIdentifierTaken()
              }}
              error={errors.vatin ? t(errors.vatin) : undefined}
              leadingIcon={<HashIcon size={14} />}
              hint={t('businessIdentity.vatinHint')}
            />

            <Input
              label={t('businessIdentity.peppolLabel')}
              value={peppolPending}
              dir="auto"
              readOnly
              readOnlyAppearance
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <p className="text-base font-medium leading-[1.2] text-text-primary">
              {t('businessIdentity.accentLabel')}
            </p>
            <div className="flex items-center gap-2">
              {INVOICE_ACCENTS.map((option) => {
                const selected = accent === option.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setAccent(option.id)}
                    aria-label={t(`businessIdentity.accents.${option.id}`)}
                    aria-pressed={selected}
                    className={[
                      'flex items-center justify-center rounded-full',
                      selected ? 'size-10 border border-primary-700 p-[3px]' : 'size-[34px]',
                    ].join(' ')}
                  >
                    <span
                      className="flex size-[34px] items-center justify-center rounded-full"
                      style={{ backgroundColor: option.color }}
                    >
                      {selected ? (
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden="true"
                        >
                          <path
                            d="M3.26 8.85 6.11 11.7 12.47 5.33"
                            stroke="white"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <OnboardingFormError error={formError} />

      <Button type="submit" disabled={submitting} className="w-full max-w-[400px] gap-1.5">
        {t('businessIdentity.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
