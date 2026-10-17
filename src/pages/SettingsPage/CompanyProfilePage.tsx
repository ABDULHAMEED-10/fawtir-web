import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { paymentTermOptions, useReferenceData } from '../../lib/reference/referenceData'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { DisconnectFromFawtirSection } from './DisconnectFromFawtirSection'
import { Combobox, Input, Select, withRial, type SelectOption } from '../../components/ui'
import { useApiRead } from '../../hooks/useApiRead'
import { useSession } from '../../lib/session/session'
import { formatInstantDay, initialsOf } from '../../lib/format'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import {
  INDUSTRIAL_CLASSIFICATION_PATH,
  readIndustrialClassification,
  saveIndustrialClassification,
} from '../../api/company/industrialClassification'
import {
  BRANDING_PATH,
  COMPANY_LOGO_URL,
  loadBranding,
  saveBranding,
  uploadLogo,
  removeLogo,
} from '../../api/company/branding'
import {
  INVOICE_DEFAULTS_PATH,
  loadInvoiceDefaults,
  saveInvoiceDefaults,
  type InvoiceDefaultsDto,
} from '../../api/company/invoiceDefaults'
import {
  COMPANY_PROFILE_CHANGES_PATH,
  COMPANY_PROFILE_PATH,
  amendCompanyProfile,
  loadCompanyProfileChanges,
  type CompanyProfileChangeDto,
  loadCompanyProfile,
  saveCompanyProfile,
  type CompanyProfileDto,
} from '../../api/company/companyProfile'
import { ApiError } from '../../api/errors'
import { isicOptions as isicOptionsFor } from '../../lib/codeLists/isic'
import { CODE_LISTS } from '../../lib/erpCodeLists'
import infoIcon from '../../assets/settings/info.svg'
import tickIcon from '../../assets/settings/check-white.svg'
import lockIcon from '../../assets/settings/menu-key.svg'

/** The screen's language values map onto `InvoiceDefaults.language` (V158's `AR`/`EN`/`AR_EN`). */
const LANGUAGE_TO_API: Record<string, InvoiceDefaultsDto['language']> = {
  both: 'AR_EN',
  ar: 'AR',
  en: 'EN',
}
const LANGUAGE_FROM_API: Record<string, string> = { AR_EN: 'both', AR: 'ar', EN: 'en' }

/** The screen's country options are names; `/company-profile` stores an ISO-3166 alpha-2 code. */
const COUNTRY_TO_API: Record<string, string> = { Oman: 'OM', 'United Arab Emirates': 'AE' }
const COUNTRY_FROM_API: Record<string, string> = { OM: 'Oman', AE: 'United Arab Emirates' }

/** The amendment's field names, as the server refuses them, to the label this screen shows. */
const FIELD_LABEL: Record<string, string> = {
  registeredAddress: 'streetAddress',
  registeredAddressLine2: 'addressLine2',
  registeredAddressLine3: 'addressLine3',
  registeredCity: 'townOrCity',
  registeredPostalCode: 'postalCode',
  registeredPoBox: 'poBox',
  registeredCountrySubdivision: 'governorate',
  registeredCountrySubdivisionCode: 'subdivisionCode',
  contactPersonName: 'contactPerson',
  contactPhone: 'phone',
  contactEmail: 'emailOnInvoices',
}

/**
 * The change log's field names (`CompanyProfileChange.field`: the amendment's names above, plus
 * those InvoiceDefaultsService and IndustrialClassificationService record) to this screen's labels.
 * A name not listed reads as "Company details" rather than as a raw identifier.
 */
const CHANGE_LABEL: Record<string, string> = {
  ...FIELD_LABEL,
  legalName: 'registeredName',
  legalNameAr: 'arabicName',
  tradingName: 'tradingAs',
  commercialRegistrationNumber: 'commercialRegistration',
  country: 'country',
  industrialClassification: 'industrialClassification',
  invoiceLanguage: 'language',
  defaultCurrency: 'currency',
  defaultPaymentTerms: 'paymentTerms',
  invoiceFooterNote: 'bottomNote',
  logo: 'yourLogo',
  brandColour: 'brandColour',
  receiptLogoMonochrome: 'onAReceipt',
}

/** The shape the form edits. Kept flat so a dirty-field diff is a plain key comparison. */
type Profile = {
  registeredName: string
  arabicName: string
  tradingAs: string
  commercialRegistration: string
  /** ISIC Rev. 4, Oman's 6-digit code (IBR-081-OM); the backend copies it onto every invoice line. */
  industrialClassification: string
  street: string
  addressLine2: string
  addressLine3: string
  town: string
  postalCode: string
  poBox: string
  governorate: string
  subdivisionCode: string
  country: string
  contactPerson: string
  phone: string
  email: string
  brandColour: string
  language: string
  currency: string
  paymentTerms: string
  footerNote: string
}

/** What a VERIFIED company may still change: the registered address and the invoice contact. */
const OPERATIONAL_FIELDS = [
  'street',
  'addressLine2',
  'addressLine3',
  'town',
  'postalCode',
  'poBox',
  'governorate',
  'subdivisionCode',
  'contactPerson',
  'phone',
  'email',
] as const satisfies readonly (keyof Profile)[]

type OperationalFields = Pick<Profile, (typeof OPERATIONAL_FIELDS)[number]>

function operationalFrom(stored: CompanyProfileDto): OperationalFields {
  return {
    street: stored.registeredAddress,
    addressLine2: stored.registeredAddressLine2 ?? '',
    addressLine3: stored.registeredAddressLine3 ?? '',
    town: stored.registeredCity ?? '',
    postalCode: stored.registeredPostalCode ?? '',
    poBox: stored.registeredPoBox ?? '',
    governorate: stored.registeredCountrySubdivision ?? '',
    subdivisionCode: stored.registeredCountrySubdivisionCode ?? '',
    contactPerson: stored.contactPersonName ?? '',
    phone: stored.contactPhone ?? '',
    email: stored.contactEmail ?? '',
  }
}

/**
 * Empty until the server answers, and the form is not shown before then: these used to be a sample
 * company's name, address and contact, which a save built on a half-loaded screen would have sent.
 * The colour is a neutral swatch for a company that has not chosen one; it is only sent if changed.
 */
const INITIAL: Profile = {
  registeredName: '',
  arabicName: '',
  tradingAs: '',
  commercialRegistration: '',
  industrialClassification: '',
  street: '',
  addressLine2: '',
  addressLine3: '',
  town: '',
  postalCode: '',
  poBox: '',
  governorate: '',
  subdivisionCode: '',
  country: 'Oman',
  contactPerson: '',
  phone: '',
  email: '',
  brandColour: '#2C4EB7',
  language: 'both',
  currency: 'OMR',
  paymentTerms: '',
  footerNote: '',
}

/** What the sample invoice on the right is built from, so the preview totals are real. */
const SAMPLE_LINES = [
  { key: 'sampleLineOne', quantity: 2, unit: 10 },
  { key: 'sampleLineTwo', quantity: 1, unit: 5 },
]

const VAT_RATE = 0.05

const omr = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/**
 * Settings › Company profile (Figma 135:37013).
 *
 * Everything here lands on a document somebody else reads, so the invoice beside the form is
 * built from the same state the fields hold — change the name and it changes in the preview
 * before anything is saved. The footer counts what is actually different from what was stored.
 */
export function CompanyProfilePage() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const reference = useReferenceData()
  const [form, setForm] = useState(INITIAL)
  const [saved, setSaved] = useState(false)
  // `null` = not set yet, `undefined` = not known (loading, or the read failed, in which case no
  // warning is shown).
  const activityRead = useApiRead(INDUSTRIAL_CLASSIFICATION_PATH, readIndustrialClassification).read
  const brandingRead = useApiRead(BRANDING_PATH, loadBranding).read
  const defaultsRead = useApiRead(INVOICE_DEFAULTS_PATH, loadInvoiceDefaults).read
  const { read: profileRead, retry: retryProfile } = useApiRead(
    COMPANY_PROFILE_PATH,
    loadCompanyProfile,
  )
  const [storedActivity, setStoredActivity] = useState<string | null | undefined>(undefined)
  const [storedProfile, setStoredProfile] = useState<CompanyProfileDto | undefined>(undefined)
  const [profileSaveFailed, setProfileSaveFailed] = useState(false)
  /** Someone else saved the profile first; the operational fields were reloaded from the server. */
  const [profileConflict, setProfileConflict] = useState(false)
  /** Fields the server refused by name (a 400 from the amendment), shown as one sentence. */
  const [profileFieldErrors, setProfileFieldErrors] = useState<string[]>([])
  // Once VERIFIED, the legal and tax identity is locked: PUT /company-profile refuses it and there
  // is no re-verification procedure yet. The registered address and contact stay editable through
  // POST /company-profile/amendments (approved 2026-10-06), which leaves the verification as it is.
  const verified = storedProfile?.verificationStatus === 'VERIFIED'
  const [storedBrandColour, setStoredBrandColour] = useState<string | undefined>(undefined)
  // receiptMonochrome round-trips unchanged on save: the "On a receipt" choice is drawn but not
  // saved yet (SETTINGS.md row 1.1), so a colour-only save must not reset a value a reviewer or a
  // prior save already set.
  const [storedReceiptMonochrome, setStoredReceiptMonochrome] = useState(false)
  const [storedDefaults, setStoredDefaults] = useState<InvoiceDefaultsDto | undefined>(undefined)
  const [saveFailed, setSaveFailed] = useState(false)
  const [brandingSaveFailed, setBrandingSaveFailed] = useState(false)
  const [defaultsSaveFailed, setDefaultsSaveFailed] = useState(false)
  const [logoVersion, setLogoVersion] = useState(0)
  const [logoBroken, setLogoBroken] = useState(false)
  const [logoBusy, setLogoBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (activityRead.status !== 'ready') return
    setStoredActivity(activityRead.data.code)
    setForm((current) => ({ ...current, industrialClassification: activityRead.data.code ?? '' }))
  }, [activityRead])

  useEffect(() => {
    if (brandingRead.status !== 'ready') return
    const colour = brandingRead.data.brandColour ?? INITIAL.brandColour
    setStoredBrandColour(colour)
    setStoredReceiptMonochrome(brandingRead.data.receiptMonochrome)
    setForm((current) => ({ ...current, brandColour: colour }))
  }, [brandingRead])

  useEffect(() => {
    if (defaultsRead.status !== 'ready') return
    setStoredDefaults(defaultsRead.data)
    setForm((current) => ({
      ...current,
      language: defaultsRead.data.language
        ? LANGUAGE_FROM_API[defaultsRead.data.language]
        : current.language,
      currency: defaultsRead.data.currency ?? current.currency,
      paymentTerms: defaultsRead.data.paymentTerms ?? current.paymentTerms,
      footerNote: defaultsRead.data.footerNote ?? '',
    }))
  }, [defaultsRead])

  useEffect(() => {
    if (profileRead.status !== 'ready') return
    setStoredProfile(profileRead.data)
    const data = profileRead.data
    setForm((current) => ({
      ...current,
      registeredName: data.legalName,
      arabicName: data.legalNameAr ?? '',
      tradingAs: data.tradingName ?? '',
      commercialRegistration: data.commercialRegistrationNumber,
      street: data.registeredAddress,
      addressLine2: data.registeredAddressLine2 ?? '',
      addressLine3: data.registeredAddressLine3 ?? '',
      town: data.registeredCity ?? '',
      postalCode: data.registeredPostalCode ?? '',
      poBox: data.registeredPoBox ?? '',
      governorate: data.registeredCountrySubdivision ?? '',
      subdivisionCode: data.registeredCountrySubdivisionCode ?? '',
      country: COUNTRY_FROM_API[data.country] ?? current.country,
      contactPerson: data.contactPersonName ?? '',
      phone: data.contactPhone ?? '',
      email: data.contactEmail ?? '',
    }))
  }, [profileRead])

  const baseline = useMemo<Profile>(
    () => ({
      ...INITIAL,
      industrialClassification: storedActivity ?? '',
      brandColour: storedBrandColour ?? INITIAL.brandColour,
      language: storedDefaults?.language
        ? LANGUAGE_FROM_API[storedDefaults.language]
        : INITIAL.language,
      currency: storedDefaults?.currency ?? INITIAL.currency,
      paymentTerms: storedDefaults?.paymentTerms ?? INITIAL.paymentTerms,
      footerNote: storedDefaults?.footerNote ?? '',
      ...(storedProfile
        ? {
            registeredName: storedProfile.legalName,
            arabicName: storedProfile.legalNameAr ?? '',
            tradingAs: storedProfile.tradingName ?? '',
            commercialRegistration: storedProfile.commercialRegistrationNumber,
            street: storedProfile.registeredAddress,
            addressLine2: storedProfile.registeredAddressLine2 ?? '',
            addressLine3: storedProfile.registeredAddressLine3 ?? '',
            town: storedProfile.registeredCity ?? '',
            postalCode: storedProfile.registeredPostalCode ?? '',
            poBox: storedProfile.registeredPoBox ?? '',
            governorate: storedProfile.registeredCountrySubdivision ?? '',
            subdivisionCode: storedProfile.registeredCountrySubdivisionCode ?? '',
            country: COUNTRY_FROM_API[storedProfile.country] ?? INITIAL.country,
            contactPerson: storedProfile.contactPersonName ?? '',
            phone: storedProfile.contactPhone ?? '',
            email: storedProfile.contactEmail ?? '',
          }
        : {}),
    }),
    [storedActivity, storedBrandColour, storedDefaults, storedProfile],
  )

  // Searched by activity name; the code is the hint so a known code finds it too.
  // TODO(backend): `GET /v1/code-lists/isic?q=` for the search, and the choice stored as
  // `industrialClassification { code, name }` on `GET/PUT /v1/settings/company`.
  const isicOptions = useMemo<SelectOption[]>(() => isicOptionsFor(i18n.language), [i18n.language])
  // CL-13-OM, the closed list the server accepts (BTOM-024); none is a valid choice.
  const subdivisionOptions = useMemo<SelectOption[]>(
    () => [
      { value: '', label: t('companyProfile.subdivisionCodeNone') },
      ...CODE_LISTS.COUNTRY_SUBDIVISION.values.map((entry) => ({
        value: entry.code,
        label: `${entry.code} · ${(i18n.language.startsWith('ar') ? entry.nameAr : entry.name) ?? entry.code}`,
      })),
    ],
    [i18n.language, t],
  )

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  /** Which fields differ from what was stored — the footer names them rather than counting alone. */
  const dirty = useMemo(
    () => (Object.keys(INITIAL) as (keyof Profile)[]).filter((key) => form[key] !== baseline[key]),
    [form, baseline],
  )

  const totals = useMemo(() => {
    const net = SAMPLE_LINES.reduce((sum, line) => sum + line.quantity * line.unit, 0)
    const vat = Math.round(net * VAT_RATE * 1000) / 1000
    return { net, vat, total: Math.round((net + vat) * 1000) / 1000 }
  }, [])

  // The form edits what the server holds; before that is known there is nothing honest to show.
  if (profileRead.status === 'loading') {
    return (
      <SettingsShell group="company">
        <SettingsHeader title={t('companyProfile.title')} subtitle={t('companyProfile.subtitle')} />
        <LoadingNotice />
      </SettingsShell>
    )
  }
  if (profileRead.status === 'failed') {
    return (
      <SettingsShell group="company">
        <SettingsHeader title={t('companyProfile.title')} subtitle={t('companyProfile.subtitle')} />
        <ApiReadFailure error={profileRead.error} retry={retryProfile} />
      </SettingsShell>
    )
  }

  const fieldNames = dirty
    .map((key) => t(`companyProfile.${key}`).toLowerCase())
    .join(t('companyProfile.andJoin'))

  return (
    <SettingsShell group="company">
      <SettingsHeader title={t('companyProfile.title')} subtitle={t('companyProfile.subtitle')} />

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Who you are */}
          <Panel
            title={t('companyProfile.whoYouAre')}
            note={
              verified ? t('companyProfile.identityLockedNote') : t('companyProfile.whoYouAreNote')
            }
          >
            <div className="grid gap-4">
              <Input
                bordered
                label={t('companyProfile.registeredName')}
                requiredMark
                value={form.registeredName}
                onChange={(event) => set('registeredName', event.target.value)}
                readOnly={verified}
                readOnlyAppearance={verified}
              />
              <Input
                bordered
                label={t('companyProfile.arabicName')}
                requiredMark
                dir="rtl"
                value={form.arabicName}
                onChange={(event) => set('arabicName', event.target.value)}
                readOnly={verified}
                readOnlyAppearance={verified}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  bordered
                  label={t('companyProfile.tradingAs')}
                  labelNote={t('companyProfile.optional')}
                  value={form.tradingAs}
                  onChange={(event) => set('tradingAs', event.target.value)}
                  readOnly={verified}
                  readOnlyAppearance={verified}
                />
                <Input
                  bordered
                  label={t('companyProfile.commercialRegistration')}
                  value={form.commercialRegistration}
                  onChange={(event) => set('commercialRegistration', event.target.value)}
                  readOnly={verified}
                  readOnlyAppearance={verified}
                />
              </div>
              <Field
                label={t('companyProfile.industrialClassification')}
                hint={t('companyProfile.industrialClassificationHint')}
                required
              >
                <Combobox
                  value={form.industrialClassification}
                  onChange={(value) => set('industrialClassification', value)}
                  options={isicOptions}
                  placeholder={t('companyProfile.industrialClassificationPlaceholder')}
                  searchPlaceholder={t('companyProfile.industrialClassificationSearch')}
                  emptyText={t('companyProfile.industrialClassificationNone')}
                  ariaLabel={t('companyProfile.industrialClassification')}
                />
                {storedActivity === null && form.industrialClassification === '' ? (
                  <p role="status" className="mt-1.5 text-xs font-medium text-warning-700">
                    {t('companyProfile.industrialClassificationUnset')}
                  </p>
                ) : null}
                {saveFailed ? (
                  <p role="alert" className="mt-1.5 text-xs font-medium text-danger-700">
                    {t('companyProfile.industrialClassificationFailed')}
                  </p>
                ) : null}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  bordered
                  label={t('companyProfile.vatNumber')}
                  requiredMark
                  labelEnd={
                    <span className="inline-flex h-[18px] items-center gap-1 rounded-[3px] bg-surface-background px-1.5 text-[10px] font-semibold text-text-quaternary">
                      <img src={lockIcon} alt="" className="size-3 opacity-60" />
                      {t('companyProfile.locked')}
                    </span>
                  }
                  hint={t('companyProfile.lockedNote')}
                  value={storedProfile?.taxNumber ?? ''}
                  readOnly
                  readOnlyAppearance
                />
                {/* TODO(backend): docs/backend-guides/SETTINGS.md row 1.3. No field holds the date
                    of VAT registration, so the designed field says so rather than offering dates. */}
                <Input
                  bordered
                  label={t('companyProfile.vatRegisteredSince')}
                  value={t('companyProfile.notAvailableYet')}
                  readOnly
                  readOnlyAppearance
                />
              </div>
            </div>
          </Panel>

          {/* Where you are */}
          <Panel
            title={t('companyProfile.whereYouAre')}
            note={
              verified ? t('companyProfile.addressAmendNote') : t('companyProfile.whereYouAreNote')
            }
          >
            {/* The registered address and contact stay editable once VERIFIED: they go through the
                amendment, which leaves the verification as it is. Country is identity and stays
                locked. The five address parts and the phone are what every invoice must state
                (IBR-010-OM, IBR-011-OM), hence the required marks. */}
            <div className="grid gap-4">
              <Field label={t('companyProfile.streetAddress')} required>
                <textarea
                  aria-label={t('companyProfile.streetAddress')}
                  value={form.street}
                  onChange={(event) => set('street', event.target.value)}
                  rows={2}
                  maxLength={500}
                  className="w-full resize-none rounded-sm border border-border-default bg-white px-3 py-2.5 text-sm font-medium text-text-primary outline-none transition-colors focus:border-border-brand"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  bordered
                  label={t('companyProfile.addressLine2')}
                  requiredMark
                  maxLength={500}
                  value={form.addressLine2}
                  onChange={(event) => set('addressLine2', event.target.value)}
                />
                <Input
                  bordered
                  label={t('companyProfile.addressLine3')}
                  requiredMark
                  maxLength={500}
                  value={form.addressLine3}
                  onChange={(event) => set('addressLine3', event.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  bordered
                  label={t('companyProfile.townOrCity')}
                  requiredMark
                  maxLength={100}
                  value={form.town}
                  onChange={(event) => set('town', event.target.value)}
                />
                <Input
                  bordered
                  label={t('companyProfile.postalCode')}
                  requiredMark
                  maxLength={20}
                  value={form.postalCode}
                  onChange={(event) => set('postalCode', event.target.value)}
                />
                <Field label={t('companyProfile.country')} required>
                  <Select
                    ariaLabel={t('companyProfile.country')}
                    value={form.country}
                    onChange={(value) => set('country', value)}
                    disabled={verified}
                    options={[
                      { value: 'Oman', label: 'Oman' },
                      { value: 'United Arab Emirates', label: 'United Arab Emirates' },
                    ]}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  bordered
                  label={t('companyProfile.poBox')}
                  labelNote={t('companyProfile.optional')}
                  maxLength={30}
                  value={form.poBox}
                  onChange={(event) => set('poBox', event.target.value)}
                />
                <Input
                  bordered
                  label={t('companyProfile.governorate')}
                  labelNote={t('companyProfile.optional')}
                  maxLength={100}
                  value={form.governorate}
                  onChange={(event) => set('governorate', event.target.value)}
                />
                <Field
                  label={t('companyProfile.subdivisionCode')}
                  hint={t('companyProfile.optional')}
                >
                  <Select
                    ariaLabel={t('companyProfile.subdivisionCode')}
                    value={form.subdivisionCode}
                    onChange={(value) => set('subdivisionCode', value)}
                    disabled={!verified}
                    options={subdivisionOptions}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  bordered
                  label={t('companyProfile.contactPerson')}
                  labelNote={t('companyProfile.optional')}
                  maxLength={200}
                  value={form.contactPerson}
                  onChange={(event) => set('contactPerson', event.target.value)}
                />
                <Input
                  bordered
                  label={t('companyProfile.phone')}
                  requiredMark
                  maxLength={30}
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  bordered
                  label={t('companyProfile.emailOnInvoices')}
                  maxLength={255}
                  value={form.email}
                  onChange={(event) => set('email', event.target.value)}
                />
                {/* TODO(backend): docs/backend-guides/SETTINGS.md row 1.2. /company-profile has no
                    website field, so the input is drawn but cannot be filled in until one exists. */}
                <Input
                  bordered
                  label={t('companyProfile.website')}
                  value=""
                  placeholder={t('companyProfile.notAvailableYet')}
                  disabled
                  onChange={() => {}}
                />
              </div>
              {profileConflict ? (
                <p role="alert" className="text-xs font-medium text-warning-700">
                  {t('companyProfile.amendConflict')}
                </p>
              ) : null}
              {profileFieldErrors.length > 0 ? (
                <p role="alert" className="text-xs font-medium text-danger-700">
                  {t('companyProfile.amendFieldsRefused', {
                    fields: profileFieldErrors
                      .map((field) => t(`companyProfile.${FIELD_LABEL[field] ?? 'streetAddress'}`))
                      .join(t('companyProfile.andJoin')),
                  })}
                </p>
              ) : null}
              {profileSaveFailed ? (
                <p role="alert" className="text-xs font-medium text-danger-700">
                  {t('companyProfile.saveFailed')}
                </p>
              ) : null}
            </div>
          </Panel>

          {/* Logo */}
          <Panel
            title={t('companyProfile.yourLogo')}
            note={t('companyProfile.yourLogoNote')}
            action={
              logoBroken ? null : (
                <button
                  type="button"
                  disabled={logoBusy}
                  onClick={async () => {
                    setLogoBusy(true)
                    setBrandingSaveFailed(false)
                    try {
                      await removeLogo()
                      setLogoBroken(true)
                      setLogoVersion((version) => version + 1)
                    } catch {
                      setBrandingSaveFailed(true)
                    } finally {
                      setLogoBusy(false)
                    }
                  }}
                  className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800 disabled:opacity-40"
                >
                  {t('companyProfile.removeIt')}
                </button>
              )
            }
          >
            <div className="flex flex-wrap gap-5">
              <button
                type="button"
                disabled={logoBusy}
                onClick={() => fileInputRef.current?.click()}
                className="flex w-[180px] shrink-0 flex-col items-center gap-2 rounded-sm border border-dashed border-border-default p-4 text-center transition-colors hover:bg-primary-25 disabled:opacity-40"
              >
                {logoBroken ? (
                  <span className="flex size-14 items-center justify-center rounded-sm bg-primary-100 text-lg font-semibold text-primary-800">
                    {initialsOf(form.registeredName || session?.tenantName || '')}
                  </span>
                ) : (
                  <img
                    src={`${COMPANY_LOGO_URL}?v=${logoVersion}`}
                    alt=""
                    className="size-14 object-contain"
                    onError={() => setLogoBroken(true)}
                  />
                )}
                <p className="text-sm font-semibold text-primary-700">
                  {t('companyProfile.replaceTheLogo')}
                </p>
                <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t('companyProfile.logoFormats')}
                  <br />
                  {t('companyProfile.logoSize')}
                </p>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/svg+xml"
                className="hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0] ?? null
                  event.target.value = ''
                  if (!file) return
                  setBrandingSaveFailed(false)
                  if (!['image/png', 'image/svg+xml'].includes(file.type)) {
                    setBrandingSaveFailed(true)
                    return
                  }
                  if (file.size > 2 * 1024 * 1024) {
                    setBrandingSaveFailed(true)
                    return
                  }
                  setLogoBusy(true)
                  try {
                    await uploadLogo(file)
                    setLogoBroken(false)
                    setLogoVersion((version) => version + 1)
                  } catch {
                    setBrandingSaveFailed(true)
                  } finally {
                    setLogoBusy(false)
                  }
                }}
              />

              <div className="min-w-[280px] flex-1">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t('companyProfile.onAReceipt')}
                    hint={t('companyProfile.onAReceiptNote')}
                  >
                    {/* TODO(backend): docs/backend-guides/SETTINGS.md row 1.1. The API's
                        receiptMonochrome cannot say "leave it off receipts", so the choice is drawn
                        but cannot be changed until it can be saved. */}
                    <Select
                      ariaLabel={t('companyProfile.onAReceipt')}
                      value="plainBlack"
                      onChange={() => {}}
                      disabled
                      options={[
                        {
                          value: 'plainBlack',
                          label: t('companyProfile.receiptOption.plainBlack'),
                        },
                        { value: 'none', label: t('companyProfile.receiptOption.none') },
                      ]}
                    />
                  </Field>
                  <Field
                    label={t('companyProfile.brandColour')}
                    hint={t('companyProfile.brandColourNote')}
                  >
                    <span className="flex h-[46px] items-center gap-2.5 rounded-sm border border-border-default bg-white px-3">
                      <span
                        className="size-5 shrink-0 rounded-[3px]"
                        style={{ backgroundColor: form.brandColour }}
                      />
                      <input
                        value={form.brandColour}
                        onChange={(event) => set('brandColour', event.target.value)}
                        className="w-full min-w-0 bg-transparent font-mono text-sm text-text-primary outline-none"
                      />
                      <input
                        type="color"
                        value={form.brandColour}
                        onChange={(event) => set('brandColour', event.target.value)}
                        aria-label={t('companyProfile.brandColour')}
                        className="size-6 shrink-0 cursor-pointer bg-transparent"
                      />
                    </span>
                  </Field>
                </div>

                {brandingSaveFailed ? (
                  <p role="alert" className="mt-3 text-xs font-medium text-danger-700">
                    {t('companyProfile.saveFailed')}
                  </p>
                ) : null}

                <p className="mt-3 flex items-start gap-2 text-xs font-medium leading-[1.6] text-text-quaternary">
                  <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                  <span>
                    <Trans
                      i18nKey="companyProfile.logoWarning"
                      components={{ b: <b className="font-semibold text-text-secondary" /> }}
                    />
                  </span>
                </p>
              </div>
            </div>
          </Panel>

          {/* Defaults */}
          <Panel title={t('companyProfile.defaults')} note={t('companyProfile.defaultsNote')}>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label={t('companyProfile.language')} required>
                  <Select
                    ariaLabel={t('companyProfile.language')}
                    value={form.language}
                    onChange={(value) => set('language', value)}
                    options={[
                      { value: 'both', label: t('companyProfile.languageOption.both') },
                      { value: 'ar', label: t('companyProfile.languageOption.ar') },
                      { value: 'en', label: t('companyProfile.languageOption.en') },
                    ]}
                  />
                </Field>
                <Field label={t('companyProfile.currency')} required>
                  <Select
                    ariaLabel={t('companyProfile.currency')}
                    value={form.currency}
                    onChange={(value) => set('currency', value)}
                    options={[{ value: 'OMR', label: t('companyProfile.currencyOption.OMR') }]}
                  />
                </Field>
                <Field label={t('companyProfile.paymentTerms')}>
                  <Select
                    ariaLabel={t('companyProfile.paymentTerms')}
                    value={form.paymentTerms}
                    onChange={(value) => set('paymentTerms', value)}
                    options={paymentTermOptions(reference, t)}
                  />
                </Field>
              </div>
              <Field
                label={t('companyProfile.bottomNote')}
                hint={t('companyProfile.bottomNoteHint')}
              >
                <textarea
                  value={form.footerNote}
                  onChange={(event) => set('footerNote', event.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-sm border border-border-default bg-white px-3 py-2.5 text-sm font-medium text-text-primary outline-none transition-colors focus:border-border-brand"
                />
              </Field>
              {defaultsSaveFailed ? (
                <p role="alert" className="text-xs font-medium text-danger-700">
                  {t('companyProfile.saveFailed')}
                </p>
              ) : null}
            </div>
          </Panel>
        </div>

        {/* Side */}
        <aside className="flex w-full flex-col gap-4 xl:w-[300px] xl:shrink-0">
          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('companyProfile.howItComesOut')}
            </h3>

            <div className="mt-3 overflow-hidden rounded-sm border border-border-subtle">
              <p className="flex items-center justify-between gap-2 bg-[#151c2d] px-3 py-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.5px] text-white">
                  {t('companyProfile.livePreview')}
                </span>
                <span className="text-[10px] font-medium text-white/60">
                  {t('companyProfile.updatesAsYouType')}
                </span>
              </p>

              <div className="bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="flex items-start gap-2">
                    {logoBroken ? (
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary-100 text-xs font-semibold text-primary-800">
                        {initialsOf(form.registeredName || session?.tenantName || '')}
                      </span>
                    ) : (
                      <img
                        src={`${COMPANY_LOGO_URL}?v=${logoVersion}`}
                        alt=""
                        className="size-8 shrink-0 object-contain"
                        onError={() => setLogoBroken(true)}
                      />
                    )}
                    <span
                      className="text-[13px] font-semibold leading-[1.25]"
                      style={{ color: form.brandColour }}
                    >
                      {form.registeredName}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.4px] text-text-primary">
                      {t('companyProfile.taxInvoice')}
                    </span>
                    {form.language !== 'en' ? (
                      <span className="block text-[10px] font-medium text-text-quaternary">
                        {t('companyProfile.taxInvoiceAr')}
                      </span>
                    ) : null}
                    <span className="mt-0.5 block text-[10px] text-text-quaternary">
                      {t('companyProfile.sampleNumber')}
                    </span>
                  </span>
                </div>

                <p className="mt-2 text-[10px] font-medium leading-[1.6] text-text-quaternary">
                  {form.street}
                  <br />
                  {form.town} {form.postalCode}, {form.country}
                  {storedProfile?.taxNumber ? (
                    <>
                      <br />
                      {t('companyProfile.previewVat', { number: storedProfile.taxNumber })}
                    </>
                  ) : null}
                </p>

                <ul className="mt-3 border-t border-border-subtle pt-2">
                  {SAMPLE_LINES.map((line) => (
                    <li
                      key={line.key}
                      className="flex items-baseline justify-between gap-2 py-1 text-[10px]"
                    >
                      <span className="font-medium text-text-tertiary">
                        {t(`companyProfile.${line.key}`)} × {line.quantity}
                      </span>
                      <span className="shrink-0 font-medium text-text-primary tabular-nums">
                        {omr(line.quantity * line.unit)}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-baseline justify-between gap-2 py-1 text-[10px]">
                    <span className="font-medium text-text-tertiary">VAT 5%</span>
                    <span className="shrink-0 font-medium text-text-primary tabular-nums">
                      {omr(totals.vat)}
                    </span>
                  </li>
                </ul>

                <p className="mt-1 flex items-baseline justify-between gap-2 border-t border-border-subtle pt-2 text-[11px] font-semibold text-text-primary">
                  <span>{withRial(t('companyProfile.totalOmr'))}</span>
                  <span className="tabular-nums">{omr(totals.total)}</span>
                </p>

                {form.footerNote ? (
                  <p className="mt-2 border-t border-border-subtle pt-2 text-[9px] font-medium leading-[1.5] text-text-quaternary">
                    {form.footerNote}
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('companyProfile.whatChangesReach')}
            </h3>
            <dl className="mt-2">
              {(
                [
                  ['newInvoices', 'immediately'],
                  ['openQuotations', 'immediately'],
                  ['alreadySent', 'unchanged'],
                  ['reported', 'unchanged'],
                ] as const
              ).map(([row, value], index) => (
                <div
                  key={row}
                  className={[
                    'flex items-center justify-between gap-3 py-2.5',
                    index < 3 ? 'border-b border-surface-background' : '',
                  ].join(' ')}
                >
                  <dt className="text-sm font-medium text-text-tertiary">
                    {t(`companyProfile.reach.${row}`)}
                  </dt>
                  <dd className="shrink-0 text-sm font-semibold text-text-primary">
                    {t(`companyProfile.${value}`)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <LastChangedCard />
        </aside>
      </div>

      <DisconnectFromFawtirSection />

      {/* Sticky footer — counts what actually differs */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle bg-white px-4 py-3">
        <p className="text-sm font-medium text-text-tertiary">
          {dirty.length === 0 ? (
            saved ? (
              t('companyProfile.saved')
            ) : (
              t('companyProfile.nothingChanged')
            )
          ) : (
            <Trans
              i18nKey={
                dirty.length === 1
                  ? 'companyProfile.oneThingChanged'
                  : 'companyProfile.thingsChanged'
              }
              values={{ count: dirty.length, fields: fieldNames }}
              components={{ b: <b className="font-semibold text-text-primary" /> }}
            />
          )}
        </p>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <button
            type="button"
            disabled={dirty.length === 0}
            onClick={() => setForm(baseline)}
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-40"
          >
            {t('companyProfile.undoTheChanges')}
          </button>
          <button
            type="button"
            disabled={dirty.length === 0}
            onClick={async () => {
              setSaveFailed(false)
              setBrandingSaveFailed(false)
              setDefaultsSaveFailed(false)
              setProfileSaveFailed(false)
              setProfileConflict(false)
              setProfileFieldErrors([])
              // "Saved" means a request this click sent was answered; a click that sent nothing
              // says nothing.
              let sent = false
              const operationalDirty = OPERATIONAL_FIELDS.some((key) => form[key] !== baseline[key])
              if (verified && operationalDirty && storedProfile) {
                try {
                  const stored = await amendCompanyProfile({
                    expectedRevision: storedProfile.profileRevision,
                    registeredAddress: form.street || null,
                    registeredAddressLine2: form.addressLine2 || null,
                    registeredAddressLine3: form.addressLine3 || null,
                    registeredCity: form.town || null,
                    registeredPostalCode: form.postalCode || null,
                    registeredPoBox: form.poBox || null,
                    registeredCountrySubdivision: form.governorate || null,
                    registeredCountrySubdivisionCode: form.subdivisionCode || null,
                    contactPersonName: form.contactPerson || null,
                    contactPhone: form.phone || null,
                    contactEmail: form.email || null,
                  })
                  setStoredProfile(stored)
                  sent = true
                } catch (error) {
                  if (error instanceof ApiError && error.status === 409) {
                    // Someone saved first. Their values replace these fields rather than being
                    // overwritten by a save built on what this screen read earlier.
                    try {
                      const latest = await loadCompanyProfile()
                      setStoredProfile(latest)
                      setForm((current) => ({ ...current, ...operationalFrom(latest) }))
                    } catch {
                      setProfileSaveFailed(true)
                      return
                    }
                    setProfileConflict(true)
                  } else if (
                    error instanceof ApiError &&
                    error.status === 400 &&
                    error.fieldErrors.length > 0
                  ) {
                    setProfileFieldErrors(error.fieldErrors.map((refused) => refused.field))
                  } else {
                    setProfileSaveFailed(true)
                  }
                  return
                }
              }
              const identityDirty =
                !verified &&
                storedProfile &&
                (form.registeredName !== baseline.registeredName ||
                  form.arabicName !== baseline.arabicName ||
                  form.tradingAs !== baseline.tradingAs ||
                  form.commercialRegistration !== baseline.commercialRegistration ||
                  form.country !== baseline.country ||
                  operationalDirty)
              if (identityDirty && storedProfile) {
                try {
                  const stored = await saveCompanyProfile({
                    expectedRevision: storedProfile.profileRevision,
                    tenantName: storedProfile.tenantName,
                    legalName: form.registeredName,
                    legalNameAr: form.arabicName || null,
                    tradingName: form.tradingAs || null,
                    taxNumber: storedProfile.taxNumber,
                    commercialRegistrationNumber: form.commercialRegistration,
                    country: COUNTRY_TO_API[form.country] ?? storedProfile.country,
                    registeredAddress: form.street,
                    registeredAddressLine2: form.addressLine2 || null,
                    registeredAddressLine3: form.addressLine3 || null,
                    registeredCity: form.town || null,
                    registeredPostalCode: form.postalCode || null,
                    registeredCountrySubdivision: form.governorate || null,
                    registeredPoBox: form.poBox || null,
                    contactPersonName: form.contactPerson || null,
                    contactPhone: form.phone || null,
                    contactEmail: form.email || null,
                  })
                  setStoredProfile(stored)
                  sent = true
                } catch {
                  setProfileSaveFailed(true)
                  return
                }
              }
              if (form.industrialClassification !== baseline.industrialClassification) {
                try {
                  const stored = await saveIndustrialClassification(form.industrialClassification)
                  setStoredActivity(stored.code)
                  sent = true
                } catch {
                  setSaveFailed(true)
                  return
                }
              }
              if (form.brandColour !== baseline.brandColour) {
                try {
                  const stored = await saveBranding(form.brandColour, storedReceiptMonochrome)
                  setStoredBrandColour(stored.brandColour ?? INITIAL.brandColour)
                  sent = true
                } catch {
                  setBrandingSaveFailed(true)
                  return
                }
              }
              const defaultsDirty =
                form.language !== baseline.language ||
                form.currency !== baseline.currency ||
                form.paymentTerms !== baseline.paymentTerms ||
                form.footerNote !== baseline.footerNote
              if (defaultsDirty) {
                try {
                  const stored = await saveInvoiceDefaults({
                    language: LANGUAGE_TO_API[form.language] ?? null,
                    currency: form.currency || null,
                    paymentTerms: form.paymentTerms || null,
                    footerNote: form.footerNote || null,
                  })
                  setStoredDefaults(stored)
                  sent = true
                } catch {
                  setDefaultsSaveFailed(true)
                  return
                }
              }
              setSaved(sent)
            }}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <img src={tickIcon} alt="" className="size-4" />
            {t('companyProfile.save')}
          </button>
        </div>
      </div>
    </SettingsShell>
  )
}

/**
 * The latest change per field, from `GET /v1/company-profile/changes`. The log names the person
 * only by id, and the screen has no readable directory of people, so it shows the field and the
 * day and no name. It used to print a sample owner's name against sample dates. Hidden when the
 * log cannot be read. There is no "full history" link: the activity log cannot be filtered to
 * these changes from a link.
 */
function LastChangedCard() {
  const { t, i18n } = useTranslation()
  const changes = useApiRead<CompanyProfileChangeDto[]>(
    COMPANY_PROFILE_CHANGES_PATH,
    loadCompanyProfileChanges,
  ).read
  if (changes.status !== 'ready') return null
  const latest = [...changes.data]
    .sort((a, b) => b.changedAt.localeCompare(a.changedAt))
    .slice(0, 3)

  return (
    <section className="rounded-md bg-surface-card p-5">
      <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
        {t('companyProfile.lastChanged')}
      </h3>
      {latest.length === 0 ? (
        <p className="mt-2 text-sm font-medium text-text-quaternary">
          {t('companyProfile.noChangesYet')}
        </p>
      ) : (
        <dl className="mt-2">
          {latest.map((change, index) => (
            <div
              key={`${change.field}-${change.changedAt}`}
              className={[
                'flex items-center justify-between gap-3 py-2.5',
                index < latest.length - 1 ? 'border-b border-surface-background' : '',
              ].join(' ')}
            >
              <dt className="text-sm font-medium text-text-tertiary">
                {CHANGE_LABEL[change.field]
                  ? t(`companyProfile.${CHANGE_LABEL[change.field]}`)
                  : t('companyProfile.changedOther')}
              </dt>
              <dd className="shrink-0 text-sm font-semibold text-text-primary">
                {formatInstantDay(change.changedAt, i18n.language)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

function Panel({
  title,
  note,
  action,
  children,
}: {
  title: string
  note: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="rounded-md bg-surface-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-background p-5">
        <div>
          <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{title}</h3>
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">{note}</p>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  )
}

function Field({
  label,
  hint,
  required,
  badge,
  children,
}: {
  label: string
  hint?: string
  required?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 flex flex-wrap items-center gap-0.5 text-sm font-medium text-text-primary">
        {label}
        {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
        {hint ? (
          <span className="ms-1.5 text-xs font-normal text-text-quaternary">{hint}</span>
        ) : null}
        {badge ? <span className="ms-1.5 inline-flex">{badge}</span> : null}
      </span>
      {children}
    </label>
  )
}
