import { useMemo, useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { paymentTermOptions, useReferenceData } from '../../lib/reference/referenceData'
import { SettingsShell, SettingsHeader } from './SettingsShell'
import { Combobox, Input, Select, withRial, type SelectOption } from '../../components/ui'
import { COMPANY } from '../../lib/settings'
import { INDUSTRIAL_CLASSIFICATION } from '../../lib/settingsCompany'
import { ISIC_ACTIVITIES } from '../../lib/codeLists/isic'
import { nameOf } from '../../lib/codeLists/codeList'
import companyLogo from '../../assets/dashboard/bahja-logo.svg'
import infoIcon from '../../assets/settings/info.svg'
import tickIcon from '../../assets/settings/check-white.svg'
import lockIcon from '../../assets/settings/menu-key.svg'

/** The shape the form edits. Kept flat so a dirty-field diff is a plain key comparison. */
type Profile = {
  registeredName: string
  arabicName: string
  tradingAs: string
  commercialRegistration: string
  /** ISIC Rev. 4, Oman's 6-digit code (IBR-081-OM); the backend copies it onto every invoice line. */
  industrialClassification: string
  vatRegisteredSince: string
  street: string
  town: string
  postalCode: string
  country: string
  phone: string
  email: string
  website: string
  receiptLogo: string
  brandColour: string
  language: string
  currency: string
  paymentTerms: string
  footerNote: string
}

const INITIAL: Profile = {
  registeredName: COMPANY.legalName,
  arabicName: COMPANY.arabicName,
  tradingAs: COMPANY.tradingAs,
  commercialRegistration: COMPANY.commercialRegistration,
  industrialClassification: INDUSTRIAL_CLASSIFICATION.code,
  vatRegisteredSince: COMPANY.vatRegisteredSince,
  street: COMPANY.street,
  town: COMPANY.town,
  postalCode: COMPANY.postalCode,
  country: COMPANY.country,
  phone: COMPANY.phone,
  email: COMPANY.email,
  website: COMPANY.website,
  receiptLogo: COMPANY.receiptLogo,
  brandColour: COMPANY.brandColour,
  language: COMPANY.defaultLanguage,
  currency: COMPANY.defaultCurrency,
  paymentTerms: COMPANY.defaultPaymentTerms,
  footerNote: COMPANY.invoiceFooterNote,
}

/** What the sample invoice on the right is built from, so the preview totals are real. */
const SAMPLE_LINES = [
  { name: 'House Blend — 1 kg', quantity: 4, unit: 9.5 },
  { name: 'Roasting — per batch', quantity: 2, unit: 4.2 },
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
  const reference = useReferenceData()
  const [form, setForm] = useState(INITIAL)
  const [saved, setSaved] = useState(false)

  // Searched by activity name; the code is the hint so a known code finds it too.
  // TODO(backend): `GET /v1/code-lists/isic?q=` for the search, and the choice stored as
  // `industrialClassification { code, name }` on `GET/PUT /v1/settings/company`.
  const isicOptions = useMemo<SelectOption[]>(
    () =>
      ISIC_ACTIVITIES.map((activity) => ({
        value: activity.code,
        label: nameOf(activity, i18n.language),
        hint: `ISIC ${activity.code}`,
      })),
    [i18n.language],
  )

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  /** Which fields differ from what was stored — the footer names them rather than counting alone. */
  const dirty = useMemo(
    () => (Object.keys(INITIAL) as (keyof Profile)[]).filter((key) => form[key] !== INITIAL[key]),
    [form],
  )

  const totals = useMemo(() => {
    const net = SAMPLE_LINES.reduce((sum, line) => sum + line.quantity * line.unit, 0)
    const vat = Math.round(net * VAT_RATE * 1000) / 1000
    return { net, vat, total: Math.round((net + vat) * 1000) / 1000 }
  }, [])

  const fieldNames = dirty
    .map((key) => t(`companyProfile.${key}`).toLowerCase())
    .join(t('companyProfile.andJoin'))

  return (
    <SettingsShell group="company">
      <SettingsHeader
        title={t('companyProfile.title')}
        subtitle={t('companyProfile.subtitle')}
        actions={
          <button
            type="button"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('companyProfile.sampleInvoice')}
          </button>
        }
      />

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* Who you are */}
          <Panel title={t('companyProfile.whoYouAre')} note={t('companyProfile.whoYouAreNote')}>
            <div className="grid gap-4">
              <Input
                bordered
                label={t('companyProfile.registeredName')}
                requiredMark
                value={form.registeredName}
                onChange={(event) => set('registeredName', event.target.value)}
              />
              <Input
                bordered
                label={t('companyProfile.arabicName')}
                requiredMark
                dir="rtl"
                value={form.arabicName}
                onChange={(event) => set('arabicName', event.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  bordered
                  label={t('companyProfile.tradingAs')}
                  hint={t('companyProfile.optional')}
                  value={form.tradingAs}
                  onChange={(event) => set('tradingAs', event.target.value)}
                />
                <Input
                  bordered
                  label={t('companyProfile.commercialRegistration')}
                  value={form.commercialRegistration}
                  onChange={(event) => set('commercialRegistration', event.target.value)}
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
                  value={COMPANY.vatNumber}
                  readOnly
                  readOnlyAppearance
                />
                <Field label={t('companyProfile.vatRegisteredSince')}>
                  <Select
                    ariaLabel={t('companyProfile.vatRegisteredSince')}
                    value={form.vatRegisteredSince}
                    onChange={(value) => set('vatRegisteredSince', value)}
                    options={[
                      { value: '1 April 2021', label: '1 April 2021' },
                      { value: '1 April 2022', label: '1 April 2022' },
                      { value: '1 January 2021', label: '1 January 2021' },
                    ]}
                  />
                </Field>
              </div>
            </div>
          </Panel>

          {/* Where you are */}
          <Panel title={t('companyProfile.whereYouAre')} note={t('companyProfile.whereYouAreNote')}>
            <div className="grid gap-4">
              <Field label={t('companyProfile.streetAddress')} required>
                <textarea
                  value={form.street}
                  onChange={(event) => set('street', event.target.value)}
                  rows={2}
                  className="w-full resize-none rounded-sm border border-border-default bg-white px-3 py-2.5 text-sm font-medium text-text-primary outline-none transition-colors focus:border-border-brand"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-3">
                <Input
                  bordered
                  label={t('companyProfile.townOrCity')}
                  requiredMark
                  value={form.town}
                  onChange={(event) => set('town', event.target.value)}
                />
                <Input
                  bordered
                  label={t('companyProfile.postalCode')}
                  value={form.postalCode}
                  onChange={(event) => set('postalCode', event.target.value)}
                />
                <Field label={t('companyProfile.country')} required>
                  <Select
                    ariaLabel={t('companyProfile.country')}
                    value={form.country}
                    onChange={(value) => set('country', value)}
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
                  label={t('companyProfile.phone')}
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                />
                <Input
                  bordered
                  label={t('companyProfile.emailOnInvoices')}
                  value={form.email}
                  onChange={(event) => set('email', event.target.value)}
                />
                <Input
                  bordered
                  label={t('companyProfile.website')}
                  value={form.website}
                  onChange={(event) => set('website', event.target.value)}
                />
              </div>
            </div>
          </Panel>

          {/* Logo */}
          <Panel
            title={t('companyProfile.yourLogo')}
            note={t('companyProfile.yourLogoNote')}
            action={
              <button
                type="button"
                className="text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
              >
                {t('companyProfile.removeIt')}
              </button>
            }
          >
            <div className="flex flex-wrap gap-5">
              <div className="flex w-[180px] shrink-0 flex-col items-center gap-2 rounded-sm border border-dashed border-border-default p-4 text-center">
                <img src={companyLogo} alt="" className="size-14" />
                <p className="text-sm font-semibold text-primary-700">
                  {t('companyProfile.replaceTheLogo')}
                </p>
                <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t('companyProfile.logoFormats')}
                  <br />
                  {t('companyProfile.logoSize')}
                </p>
              </div>

              <div className="min-w-[280px] flex-1">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t('companyProfile.onAReceipt')}
                    hint={t('companyProfile.onAReceiptNote')}
                  >
                    <Select
                      ariaLabel={t('companyProfile.onAReceipt')}
                      value={form.receiptLogo}
                      onChange={(value) => set('receiptLogo', value)}
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
                    <img src={companyLogo} alt="" className="size-8 shrink-0" />
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
                    <span className="mt-0.5 block font-mono text-[10px] text-text-quaternary">
                      INV-2047
                    </span>
                  </span>
                </div>

                <p className="mt-2 text-[10px] font-medium leading-[1.6] text-text-quaternary">
                  {form.street}
                  <br />
                  {form.town} {form.postalCode}, {form.country}
                  <br />
                  VAT {COMPANY.vatNumber}
                </p>

                <ul className="mt-3 border-t border-border-subtle pt-2">
                  {SAMPLE_LINES.map((line) => (
                    <li
                      key={line.name}
                      className="flex items-baseline justify-between gap-2 py-1 text-[10px]"
                    >
                      <span className="font-medium text-text-tertiary">
                        {line.name} × {line.quantity}
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

          <section className="rounded-md bg-surface-card p-5">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t('companyProfile.lastChanged')}
            </h3>
            <dl className="mt-2">
              {(
                [
                  ['bankNote', '12 Jun · Hafidh'],
                  ['logo', '3 Feb · Hafidh'],
                  ['address', '14 Mar 2025'],
                ] as const
              ).map(([row, when], index) => (
                <div
                  key={row}
                  className={[
                    'flex items-center justify-between gap-3 py-2.5',
                    index < 2 ? 'border-b border-surface-background' : '',
                  ].join(' ')}
                >
                  <dt className="text-sm font-medium text-text-tertiary">
                    {t(`companyProfile.changed.${row}`)}
                  </dt>
                  <dd className="shrink-0 text-sm font-semibold text-text-primary">{when}</dd>
                </div>
              ))}
            </dl>
            <button
              type="button"
              className="mt-3 inline-flex h-[40px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('companyProfile.seeFullHistory')}
            </button>
          </section>
        </aside>
      </div>

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
            onClick={() => setForm(INITIAL)}
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25 disabled:opacity-40"
          >
            {t('companyProfile.undoTheChanges')}
          </button>
          <button
            type="button"
            disabled={dirty.length === 0}
            onClick={() => setSaved(true)}
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
      <span className="mb-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-text-secondary">
        {label}
        {required ? <span className="text-danger-700">*</span> : null}
        {hint ? <span className="font-normal text-text-quaternary">{hint}</span> : null}
        {badge}
      </span>
      {children}
    </label>
  )
}
