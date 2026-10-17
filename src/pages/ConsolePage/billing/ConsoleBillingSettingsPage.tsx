import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Input, Rial } from '../../../components/ui'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { CONSOLE_PAGE, ConsolePageHeader } from '../../../layouts/ConsoleShell/consoleStyle'
import { hasPermission, peekEntitlements } from '../../../lib/identity/entitlements'
import { formatInstant } from '../../../lib/format'
import {
  BILLING_MANAGE_PERMISSION,
  BILLING_READ_PERMISSION,
} from '../../../lib/console/billingPayments'
import {
  BILLING_SETTINGS_PATH,
  chargesVat,
  fractionToPercent,
  isPercent,
  percentToFraction,
  saveBillingSettings,
  type BillingSettingsDto,
  type BillingSettingsRequest,
} from '../../../lib/console/billingSettings'
import {
  FieldGrid,
  NumberField,
  SectionFooter,
  SettingsSectionCard,
  SwitchRow,
} from '../settings/shared'
import { ExtraDocumentLimitsCard } from './ExtraDocumentLimitsCard'
import {
  PAY_LINK_MAX_DAYS,
  PAY_LINK_SETTINGS_PATH,
  savePayLinkValidity,
  type PayLinkSettingsDto,
} from '../../../lib/console/payLinks'
import { selectAllOnFocus } from '../../../components/invoice/numericInput'

const K = 'console.billingSettings.'
const MAX_DAYS = 60
const REASON_MAX = 500

type Form = {
  graceDays: string
  leadDays: string
  linkDays: string
  threshold: string
  vatOn: boolean
  vatPercent: string
  reason: string
}

type Errors = Partial<Record<keyof Form, string>>

/**
 * The platform billing settings (backend V270, V271), the real record bills are issued from; the
 * demo Console settings store does not reach the server. VAT on or off is the rate itself: off
 * sends 0, so there is no second flag that could disagree with it.
 */
export function ConsoleBillingSettingsPage() {
  return (
    <ConsoleShell requires={BILLING_READ_PERMISSION}>
      <BillingSettings />
    </ConsoleShell>
  )
}

function BillingSettings() {
  const { t } = useTranslation()
  const { read, retry } = useConsoleRead<BillingSettingsDto>(BILLING_SETTINGS_PATH)
  // Answers only on a server that has payment links (404 elsewhere): the validity field is drawn
  // only from this read, so an older server shows the page exactly as before.
  const payLinks = useConsoleRead<PayLinkSettingsDto>(PAY_LINK_SETTINGS_PATH)
  const linkSettings = payLinks.read.status === 'ready' ? payLinks.read.data : null
  // Kept here, outside the form, so the conflict message survives the reload that remounts it.
  const [failure, setFailure] = useState<string | null>(null)
  const entitlements = peekEntitlements()
  const canManage = entitlements ? hasPermission(entitlements, BILLING_MANAGE_PERMISSION) : false

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.billingSettings' }]} />
      <ConsolePageHeader title={t(`${K}title`)} subtitle={t(`${K}subtitle`)} />
      {failure ? (
        <p
          role="alert"
          className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
        >
          {failure}
        </p>
      ) : null}
      {read.status === 'loading' || payLinks.read.status === 'loading' ? (
        <ConsoleNotice busy body={t(`${K}loading`)} />
      ) : read.status === 'failed' ? (
        <ConsoleReadFailure error={read.error} retry={retry} />
      ) : (
        <SettingsForm
          // A new version read starts a fresh form, so nothing typed against the old one lingers.
          key={`${read.data.version}:${linkSettings?.settingsVersion ?? ''}`}
          settings={read.data}
          payLinks={linkSettings}
          canManage={canManage}
          onSaved={() => {
            setFailure(null)
            retry()
            payLinks.retry()
          }}
          onRefused={(error) => {
            setFailure(refusal(t, error))
            if (isConflict(error)) {
              retry()
              payLinks.retry()
            }
          }}
        />
      )}
      <ExtraDocumentLimitsCard canManage={canManage} />
    </div>
  )
}

function toForm(settings: BillingSettingsDto, payLinks: PayLinkSettingsDto | null): Form {
  return {
    graceDays: String(settings.graceDays),
    leadDays: settings.renewalBillLeadDays === null ? '' : String(settings.renewalBillLeadDays),
    linkDays: payLinks ? String(payLinks.validityDays) : '',
    threshold: settings.dualApprovalThreshold,
    vatOn: chargesVat(settings.vatRate),
    vatPercent:
      chargesVat(settings.vatRate) && settings.vatRate ? fractionToPercent(settings.vatRate) : '',
    reason: '',
  }
}

function SettingsForm({
  settings,
  payLinks,
  canManage,
  onSaved,
  onRefused,
}: {
  settings: BillingSettingsDto
  /** Null on a server without payment links: no validity field, nothing sent for it. */
  payLinks: PayLinkSettingsDto | null
  canManage: boolean
  onSaved: () => void
  onRefused: (error: unknown) => void
}) {
  const { t, i18n } = useTranslation()
  const stored = toForm(settings, payLinks)
  const maxLinkDays = payLinks?.maxValidityDays ?? PAY_LINK_MAX_DAYS
  const [form, setForm] = useState<Form>(stored)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const errors = attempted ? validate(form, payLinks ? maxLinkDays : null) : {}
  const err = (field: keyof Form) => {
    const key = errors[field]
    if (!key) return undefined
    return field === 'linkDays'
      ? t(key, { min: 1, max: maxLinkDays })
      : t(key, { min: 0, max: MAX_DAYS })
  }
  const dirty = JSON.stringify({ ...form, reason: '' }) !== JSON.stringify(stored)
  const set = <F extends keyof Form>(field: F, value: Form[F]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (Object.keys(validate(form, payLinks ? maxLinkDays : null)).length > 0) {
      setAttempted(true)
      return
    }
    const request: BillingSettingsRequest = {
      graceDays: Number(form.graceDays),
      dualApprovalThreshold: form.threshold.trim(),
      reason: form.reason.trim(),
    }
    // Version 1 has no rate and no lead days. Left untouched they are omitted, so saving the
    // grace alone does not decide VAT as a side effect.
    if (settings.vatRate !== null || form.vatOn) {
      request.vatRate = form.vatOn ? percentToFraction(form.vatPercent) : '0'
    }
    if (form.leadDays.trim() !== '') request.renewalBillLeadDays = Number(form.leadDays)
    // The validity has its own route (it publishes a new billing settings version too), so only
    // what changed is sent: the settings first, then the validity against the version they made.
    const linkChanged = payLinks !== null && form.linkDays !== stored.linkDays
    const settingsChanged =
      JSON.stringify({ ...form, linkDays: '', reason: '' }) !==
      JSON.stringify({ ...stored, linkDays: '' })
    setBusy(true)
    try {
      let version = settings.version
      if (settingsChanged || !linkChanged) {
        version = (await saveBillingSettings(settings.version, request)).version
      }
      if (linkChanged) {
        await savePayLinkValidity(version, Number(form.linkDays), form.reason.trim())
      }
      onSaved()
    } catch (error) {
      onRefused(error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsSectionCard
      title={t(`${K}card`)}
      note={canManage ? t(`${K}cardNote`) : t(`${K}readOnly`)}
      onSubmit={submit}
      footer={
        canManage ? (
          <SectionFooter
            dirty={dirty && !busy}
            isDefault
            savedBy={t(`${K}lastChange`, {
              reason: settings.reason,
              when: formatInstant(settings.createdAt, i18n.language),
            })}
            onReset={() => {}}
          />
        ) : null
      }
    >
      <fieldset disabled={!canManage || busy} className="min-w-0">
        <FieldGrid>
          <NumberField
            name="graceDays"
            label={t(`${K}graceDays`)}
            hint={t(`${K}graceDaysHint`)}
            value={form.graceDays}
            onChange={(value) => set('graceDays', value)}
            error={err('graceDays')}
          />
          <NumberField
            name="leadDays"
            label={t(`${K}leadDays`)}
            hint={t(`${K}leadDaysHint`)}
            value={form.leadDays}
            onChange={(value) => set('leadDays', value)}
            error={err('leadDays')}
          />
          {/* Only from a server that has payment links. */}
          {payLinks ? (
            <NumberField
              name="linkDays"
              label={t(`${K}linkDays`)}
              hint={t(`${K}linkDaysHint`, { max: maxLinkDays })}
              onFocus={selectAllOnFocus}
              value={form.linkDays}
              onChange={(value) => set('linkDays', value)}
              error={err('linkDays')}
            />
          ) : null}
          <NumberField
            name="threshold"
            label={t(`${K}threshold`)}
            hint={t(`${K}thresholdHint`)}
            decimal
            leadingIcon={<Rial className="text-text-secondary" />}
            value={form.threshold}
            onChange={(value) => set('threshold', value)}
            error={err('threshold')}
          />
        </FieldGrid>
        <SwitchRow
          title={t(`${K}vat`)}
          note={t(`${K}vatNote`)}
          checked={form.vatOn}
          disabled={!canManage || busy}
          onChange={(checked) => set('vatOn', checked)}
        />
        {form.vatOn ? (
          <FieldGrid>
            <NumberField
              name="vatPercent"
              label={t(`${K}vatRate`)}
              hint={t(`${K}vatRateHint`)}
              decimal
              trailingIcon={<span className="text-sm font-medium">%</span>}
              value={form.vatPercent}
              onChange={(value) => set('vatPercent', value)}
              error={err('vatPercent')}
            />
          </FieldGrid>
        ) : null}
        {canManage ? (
          <FieldGrid>
            <Input
              bordered
              name="reason"
              label={t(`${K}reason`)}
              autoComplete="off"
              maxLength={REASON_MAX}
              value={form.reason}
              onChange={(event) => set('reason', event.target.value)}
              error={err('reason')}
            />
          </FieldGrid>
        ) : null}
      </fieldset>
    </SettingsSectionCard>
  )
}

/** Error keys by field, checked before sending so the server's 400 is the exception. */
function validate(form: Form, maxLinkDays: number | null): Errors {
  const errors: Errors = {}
  const whole = (value: string) => /^\d{1,2}$/.test(value.trim()) && Number(value) <= MAX_DAYS
  if (!whole(form.graceDays)) errors.graceDays = 'console.settings.error.wholeBetween'
  if (form.leadDays.trim() !== '' && !whole(form.leadDays))
    errors.leadDays = 'console.settings.error.wholeBetween'
  if (
    maxLinkDays !== null &&
    !(
      /^\d{1,2}$/.test(form.linkDays.trim()) &&
      Number(form.linkDays) >= 1 &&
      Number(form.linkDays) <= maxLinkDays
    )
  )
    errors.linkDays = 'console.settings.error.wholeBetween'
  if (!/^\d{1,9}(\.\d{1,3})?$/.test(form.threshold.trim())) errors.threshold = `${K}error.amount`
  if (form.vatOn && (!isPercent(form.vatPercent) || Number(form.vatPercent) <= 0)) {
    errors.vatPercent = `${K}error.percent`
  }
  if (!form.reason.trim()) errors.reason = 'console.settings.error.required'
  return errors
}

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.problemType === 'billing-settings-version-conflict'
}

function refusal(t: (key: string) => string, error: unknown): string {
  if (error instanceof ApiError) {
    if (isConflict(error)) return t(`${K}refusal.conflict`)
    if (error.problemType === 'production-platform-realm-required') return t(`${K}refusal.realm`)
    if (error.problemType === 'impersonation-not-allowed') return t(`${K}refusal.impersonation`)
    if (error.status === 403) return t('console.billing.refusal.forbidden')
    if (error.status === 400) return t(`${K}refusal.invalid`)
  }
  return t('console.billing.refusal.other')
}
