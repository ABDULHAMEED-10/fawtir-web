import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  CameraIcon,
  ChevronRightIcon,
  CloseIcon,
  HashIcon,
  Input,
  UserIcon,
} from '../../components/ui'
import type { AboutBusinessAnswers } from '../../lib/onboarding'
import { isBusinessTypeId, type BusinessTypeId } from '../../lib/subBusinessTypes'
import type { InvoicePreviewData } from './BusinessIdentityHero'
import {
  crNumber as validateCr,
  isClean,
  peppolIdFor,
  required,
  vatin as validateVatin,
  type FieldError,
} from '../../lib/validation'

const ACCENT_COLORS = ['#2C4EB7', '#007D58', '#D43400', '#8635F6', '#CA0005', '#0A1032'] as const

const BUSINESS_TYPE_LABEL_KEYS: Record<BusinessTypeId, string> = {
  'food-beverage': 'businessType.options.foodBeverage',
  retail: 'businessType.options.retail',
  'beauty-wellness': 'businessType.options.beautyWellness',
  professional: 'businessType.options.professional',
  healthcare: 'businessType.options.healthcare',
  hospitality: 'businessType.options.hospitality',
  education: 'businessType.options.education',
  automotive: 'businessType.options.automotive',
}

type LocationState = AboutBusinessAnswers & {
  businessType?: string
  subBusinessType?: string
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

type BusinessIdentityFormProps = {
  onPreviewChange: (preview: InvoicePreviewData) => void
}

export function BusinessIdentityForm({ onPreviewChange }: BusinessIdentityFormProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const answers = (location.state as LocationState | null) ?? null
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [companyName, setCompanyName] = useState('Al Bahja Coffee Roasters LLC')
  const [crNumber, setCrNumber] = useState('1234567')
  const [vatin, setVatin] = useState('OM1100112233')
  const [accentColor, setAccentColor] = useState<string>(ACCENT_COLORS[0])
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, FieldError>>({})

  const clearError = (field: string) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const peppolId = peppolIdFor(vatin)
  const initials = getInitials(companyName)

  const businessTypeLabel = useMemo(() => {
    if (isBusinessTypeId(answers?.businessType)) {
      return t(BUSINESS_TYPE_LABEL_KEYS[answers.businessType])
    }
    return t('businessType.options.foodBeverage')
  }, [answers?.businessType, t])

  const preview = useMemo<InvoicePreviewData>(
    () => ({
      companyName,
      crNumber,
      vatin,
      peppolId,
      initials,
      accentColor,
      logoUrl: logoPreview,
    }),
    [accentColor, companyName, crNumber, initials, logoPreview, peppolId, vatin],
  )

  useEffect(() => {
    onPreviewChange(preview)
  }, [onPreviewChange, preview])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Record<string, FieldError> = {
      companyName: required(companyName),
      crNumber: validateCr(crNumber),
      vatin: validateVatin(vatin),
    }
    setErrors(next)
    if (!isClean(next)) return
    navigate('/address-contact', {
      state: {
        ...answers,
        companyName,
        crNumber,
        vatin,
        peppolId,
        accentColor,
        logoUrl: logoPreview,
      },
    })
  }

  const handleLogoChange = (file: File | null) => {
    clearError('logo')
    if (!file) {
      setLogoPreview(null)
      return
    }
    const ACCEPTED = ['image/png', 'image/svg+xml']
    if (!ACCEPTED.includes(file.type)) {
      setErrors((current) => ({ ...current, logo: 'validation.logoType' }))
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setErrors((current) => ({ ...current, logo: 'validation.logoSize' }))
      return
    }
    // A data URL rather than an object URL: a blob URL dies with this screen, and the logo has
    // to survive the step that follows, which renders the same preview. It is also already in
    // the shape the upload will take.
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => setErrors((current) => ({ ...current, logo: 'validation.logoType' }))
    reader.readAsDataURL(file)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex w-full max-w-[700px] flex-col items-center gap-11"
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex flex-col gap-3">
          <span className="inline-flex h-[29px] w-fit items-center justify-center rounded-sm border border-primary-150 px-2.5 text-base font-medium text-primary-700">
            {businessTypeLabel}
          </span>
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
              value={crNumber}
              onChange={(e) => {
                setCrNumber(e.target.value)
                clearError('crNumber')
              }}
              error={errors.crNumber ? t(errors.crNumber) : undefined}
              leadingIcon={<HashIcon size={14} />}
              hint={t('businessIdentity.crHint')}
            />

            <Input
              label={t('businessIdentity.vatinLabel')}
              requiredMark
              value={vatin}
              onChange={(e) => {
                setVatin(e.target.value.toUpperCase())
                clearError('vatin')
              }}
              error={errors.vatin ? t(errors.vatin) : undefined}
              leadingIcon={<HashIcon size={14} />}
              hint={t('businessIdentity.vatinHint')}
            />

            <Input
              label={t('businessIdentity.peppolLabel')}
              value={peppolId}
              readOnly
              readOnlyAppearance
              hint={t('businessIdentity.peppolHint')}
            />
          </div>

          <div className="flex flex-col gap-2.5">
            <p className="text-base font-medium leading-[1.2] text-text-primary">
              {t('businessIdentity.accentLabel')}
            </p>
            <div className="flex items-center gap-2">
              {ACCENT_COLORS.map((color) => {
                const selected = accentColor === color
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setAccentColor(color)}
                    aria-label={color}
                    aria-pressed={selected}
                    className={[
                      'flex items-center justify-center rounded-full',
                      selected ? 'size-10 border border-primary-700 p-[3px]' : 'size-[34px]',
                    ].join(' ')}
                  >
                    <span
                      className="flex size-[34px] items-center justify-center rounded-full"
                      style={{ backgroundColor: color }}
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

      <Button type="submit" className="w-full max-w-[400px] gap-1.5">
        {t('businessIdentity.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
