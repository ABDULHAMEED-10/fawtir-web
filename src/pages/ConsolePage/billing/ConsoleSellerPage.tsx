import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Input } from '../../../components/ui'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleSettingsFrame } from '../../../layouts/ConsoleShell/ConsoleSettingsFrame'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead, type ConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_CARD,
  CONSOLE_PAGE,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { formatInstant } from '../../../lib/format'
import { BILLING_MANAGE_PERMISSION } from '../../../lib/console/billingPayments'
import {
  BILLING_SELLER_HISTORY_PATH,
  BILLING_SELLER_PATH,
  BILLING_SETTINGS_PATH,
  chargesVat,
  saveBillingSeller,
  type BillingSettingsDto,
  type BillingSellerDto,
  type BillingSellerRequest,
} from '../../../lib/console/billingSettings'
import { FieldGrid, SectionFooter, SettingsSectionCard } from '../settings/shared'

const K = 'console.seller.'

type Field = keyof BillingSellerRequest
type Form = Record<Field, string>
type Errors = Partial<Record<Field, string>>

/** The server's limits, so a long value is stopped at the keyboard rather than refused. */
const MAX: Record<Field, number> = {
  legalNameEn: 200,
  legalNameAr: 200,
  legalType: 100,
  crNumber: 20,
  taxIdentificationNumber: 20,
  vatNumber: 12,
  addressEn: 300,
  addressAr: 300,
  reason: 500,
}

const OPTIONAL: readonly Field[] = [
  'legalNameAr',
  'legalType',
  'taxIdentificationNumber',
  'vatNumber',
  'addressAr',
]

/**
 * The legal seller named on every subscription bill. Its own versioned record: a bill keeps the
 * version in force when it was issued, so changing it here never rewrites a bill already sent.
 * The server answers 204 while no seller exists; the first save then sends `If-Match: "0"`.
 * Reading needs the same permission as changing (contract), so the shell asks for it up front and
 * there is no read-only view.
 */
export function ConsoleSellerPage() {
  return (
    <ConsoleShell requires={BILLING_MANAGE_PERMISSION}>
      <Seller />
    </ConsoleShell>
  )
}

/**
 * The screen's body. `embedded`: one section of Console › Settings › Fawtir company details,
 * under that page's frame, so it draws no frame or page column of its own.
 */
export function Seller({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  // 204 parses as no body: undefined means no seller has been entered yet.
  const { read, retry } = useConsoleRead<BillingSellerDto | undefined>(BILLING_SELLER_PATH)
  const history = useConsoleRead<BillingSellerDto[]>(BILLING_SELLER_HISTORY_PATH)
  // The server refuses a seller without a VAT number while VAT is on (one rule across the two
  // records), so the form checks the same pair before sending. Unread or unreadable settings check
  // nothing here: the server still decides.
  const settings = useConsoleRead<BillingSettingsDto>(BILLING_SETTINGS_PATH)
  const vatOn = settings.read.status === 'ready' && chargesVat(settings.read.data?.vatRate)
  const [failure, setFailure] = useState<string | null>(null)
  const failureRef = useRef<HTMLParagraphElement>(null)

  // The message sits above the form; Save is at its foot. Bring a refusal into view so it is seen.
  useEffect(() => {
    if (failure) failureRef.current?.scrollIntoView?.({ block: 'nearest' })
  }, [failure])

  const reload = () => {
    retry()
    history.retry()
  }

  let body: ReactNode
  if (read.status === 'loading') body = <ConsoleNotice busy body={t(`${K}loading`)} />
  else if (read.status === 'failed') body = <ConsoleReadFailure error={read.error} retry={retry} />
  else {
    body = (
      <SellerForm
        // A new version read starts a fresh form, so nothing typed against the old one lingers.
        key={read.data?.version ?? 0}
        seller={read.data ?? null}
        vatOn={vatOn}
        onSaved={() => {
          setFailure(null)
          reload()
        }}
        onRefused={(error) => {
          setFailure(refusal(t, error))
          if (isConflict(error)) reload()
          // VAT may have been switched on since the settings were read: read them again.
          else settings.retry()
        }}
      />
    )
  }

  return (
    <div className={embedded ? 'flex flex-col gap-5' : CONSOLE_PAGE}>
      {embedded ? null : <ConsoleSettingsFrame tab="company" />}
      <ConsolePageHeader level={embedded ? 'subsection' : 'section'} title={t(`${K}title`)} subtitle={t(`${K}subtitle`)} />
      {failure ? (
        <p
          ref={failureRef}
          role="alert"
          className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
        >
          {failure}
        </p>
      ) : null}
      {body}
      <History read={history.read} />
    </div>
  )
}

function toForm(seller: BillingSellerDto | null): Form {
  return {
    legalNameEn: seller?.legalNameEn ?? '',
    legalNameAr: seller?.legalNameAr ?? '',
    legalType: seller?.legalType ?? '',
    crNumber: seller?.crNumber ?? '',
    taxIdentificationNumber: seller?.taxIdentificationNumber ?? '',
    vatNumber: seller?.vatNumber ?? '',
    addressEn: seller?.addressEn ?? '',
    addressAr: seller?.addressAr ?? '',
    reason: '',
  }
}

function SellerForm({
  seller,
  vatOn,
  onSaved,
  onRefused,
}: {
  seller: BillingSellerDto | null
  vatOn: boolean
  onSaved: () => void
  onRefused: (error: unknown) => void
}) {
  const { t, i18n } = useTranslation()
  const stored = toForm(seller)
  const [form, setForm] = useState<Form>(stored)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const errors = attempted ? validate(form, vatOn) : {}
  const dirty = JSON.stringify({ ...form, reason: '' }) !== JSON.stringify(stored)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (Object.keys(validate(form, vatOn)).length > 0) {
      setAttempted(true)
      return
    }
    const value = (field: Field) => form[field].trim()
    // An emptied optional field is sent as null: the server reads null as "none", not as "".
    const optional = (field: Field) => value(field) || null
    const request: BillingSellerRequest = {
      legalNameEn: value('legalNameEn'),
      legalNameAr: optional('legalNameAr'),
      legalType: optional('legalType'),
      crNumber: value('crNumber'),
      taxIdentificationNumber: optional('taxIdentificationNumber'),
      vatNumber: optional('vatNumber')?.toUpperCase() ?? null,
      addressEn: value('addressEn'),
      addressAr: optional('addressAr'),
      reason: value('reason'),
    }
    setBusy(true)
    try {
      await saveBillingSeller(seller?.version ?? 0, request)
      onSaved()
    } catch (error) {
      onRefused(error)
    } finally {
      setBusy(false)
    }
  }

  const field = (name: Field, options: { ltr?: boolean; rtl?: boolean; hint?: string } = {}) => {
    const key = errors[name]
    return (
      <Input
        bordered
        name={name}
        label={t(`${K}${name === 'taxIdentificationNumber' ? 'tin' : name}`)}
        hint={options.hint ?? (OPTIONAL.includes(name) ? t(`${K}optional`) : undefined)}
        autoComplete="off"
        spellCheck={false}
        dir={options.ltr ? 'ltr' : options.rtl ? 'rtl' : undefined}
        maxLength={MAX[name]}
        value={form[name]}
        onChange={(event) => setForm((current) => ({ ...current, [name]: event.target.value }))}
        error={key ? t(key) : undefined}
      />
    )
  }

  return (
    <SettingsSectionCard
      title={t(`${K}card`)}
      note={seller ? t(`${K}cardNote`) : t(`${K}none`)}
      onSubmit={submit}
      footer={
        <SectionFooter
          dirty={dirty && !busy}
          isDefault
          savedBy={
            seller
              ? t('console.billingSettings.lastChange', {
                  reason: seller.reason,
                  when: formatInstant(seller.createdAt, i18n.language),
                })
              : undefined
          }
          onReset={() => {}}
        />
      }
    >
      <fieldset disabled={busy} className="min-w-0">
        <FieldGrid>
          {field('legalNameEn')}
          {field('legalNameAr', { rtl: true })}
          {field('legalType', { hint: t(`${K}legalTypeHint`) })}
          {field('crNumber', { ltr: true })}
          {field('taxIdentificationNumber', { ltr: true })}
          {field('vatNumber', { ltr: true, hint: t(`${K}vatNumberHint`) })}
          {field('addressEn')}
          {field('addressAr', { rtl: true })}
        </FieldGrid>
        <FieldGrid>{field('reason')}</FieldGrid>
      </fieldset>
    </SettingsSectionCard>
  )
}

/** Error keys by field, checked before sending so the server's 400 is the exception. */
function validate(form: Form, vatOn: boolean): Errors {
  const errors: Errors = {}
  const value = (field: Field) => form[field].trim()
  for (const required of ['legalNameEn', 'crNumber', 'addressEn', 'reason'] as const) {
    if (!value(required)) errors[required] = 'console.settings.error.required'
  }
  if (value('crNumber') && !/^\d{1,20}$/.test(value('crNumber')))
    errors.crNumber = `${K}error.digits`
  if (value('taxIdentificationNumber') && !/^\d{1,20}$/.test(value('taxIdentificationNumber'))) {
    errors.taxIdentificationNumber = `${K}error.digits`
  }
  if (value('vatNumber') && !/^OM\d{10}$/i.test(value('vatNumber')))
    errors.vatNumber = `${K}error.vatNumber`
  // The server's rule (PlatformSubscriptionService.requireVatRegisteredSeller), in its words.
  if (vatOn && !value('vatNumber')) errors.vatNumber = `${K}error.vatNumberWhileVatOn`
  return errors
}

/** Newest first, as the server sends it. The first row is the seller in force, shown above, so the list starts after it. */
function History({ read }: { read: ConsoleRead<BillingSellerDto[]> }) {
  const { t, i18n } = useTranslation()
  if (read.status === 'loading') return null
  if (read.status === 'failed') {
    return <p className="text-xs font-medium text-text-tertiary">{t(`${K}historyFailed`)}</p>
  }
  const earlier = read.data.slice(1)
  if (earlier.length === 0) return null
  return (
    <section aria-labelledby="seller-history" className="flex flex-col gap-3">
      <h2 id="seller-history" className="text-base font-semibold text-text-primary">
        {t(`${K}history`)}
      </h2>
      <ul className="flex flex-col gap-3">
        {earlier.map((entry) => (
          <li key={entry.version} className={`${CONSOLE_CARD} flex flex-col gap-1 p-4`}>
            <span className="text-sm font-semibold text-text-primary">
              {t(`${K}version`, { version: entry.version })} · {entry.legalNameEn}
              {entry.legalNameAr ? ` · ${entry.legalNameAr}` : ''}
            </span>
            <span className="text-sm font-medium text-text-secondary">
              {[
                t(`${K}crShort`, { number: entry.crNumber }),
                entry.taxIdentificationNumber
                  ? t(`${K}tinShort`, { number: entry.taxIdentificationNumber })
                  : null,
                entry.vatNumber ? t(`${K}vatShort`, { number: entry.vatNumber }) : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <span className="text-xs font-medium text-text-tertiary">
              {entry.reason} · {formatInstant(entry.createdAt, i18n.language)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.problemType === 'billing-seller-version-conflict'
}

function refusal(t: (key: string) => string, error: unknown): string {
  if (error instanceof ApiError) {
    if (isConflict(error)) return t(`${K}refusal.conflict`)
    if (error.problemType === 'production-platform-realm-required')
      return t('console.billingSettings.refusal.realm')
    if (error.problemType === 'impersonation-not-allowed')
      return t('console.billingSettings.refusal.impersonation')
    if (error.status === 403) return t('console.billing.refusal.forbidden')
    if (error.status === 400) return t(`${K}refusal.invalid`)
  }
  return t('console.billing.refusal.other')
}
