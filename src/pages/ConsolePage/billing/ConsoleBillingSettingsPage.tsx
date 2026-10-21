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
  ANNUAL_MONTHS_DEFAULTS,
  ANNUAL_MONTHS_FIELDS,
  ANNUAL_MONTHS_MAX,
  ANNUAL_MONTHS_MIN,
  BILLING_SETTINGS_PATH,
  chargesVat,
  fractionToPercent,
  isPercent,
  MAX_CORRECTION_WINDOW_DAYS,
  MAX_GRACE_REMINDER_DAY,
  MAX_PER_ORDER,
  MAX_RENEWAL_REMINDER_DAY,
  MAX_TRIAL_REMINDER_LEAD_DAYS,
  PAYMENT_LINK_VALIDITY_DAYS,
  percentToFraction,
  saveBillingSettings,
  TRIAL_DAYS,
  type BillingSettingsDto,
  type BillingSettingsRequest,
  type AnnualMonthsField,
} from '../../../lib/console/billingSettings'
import {
  DayListField,
  FieldGrid,
  GroupLabel,
  NumberField,
  SectionFooter,
  SettingsSectionCard,
  SwitchRow,
} from '../settings/shared'
import { ExtraDocumentLimitsCard } from './ExtraDocumentLimitsCard'

const K = 'console.billingSettings.'
const MAX_DAYS = 60
const REASON_MAX = 500

type Form = {
  graceDays: string
  leadDays: string
  threshold: string
  vatOn: boolean
  vatPercent: string
  /** V406; empty and not shown while the server does not report the setting. */
  erpAddonAnnualMonths: string
  extraUserAnnualMonths: string
  extraBranchAnnualMonths: string
  maxUsers: string
  maxBranches: string
  trialLead: string
  graceReminders: number[]
  renewalReminders: number[]
  correctionDays: string
  cardOn: boolean
  reason: string
}

type Errors = Partial<Record<keyof Form, string>>

/** The server reports the setting at all: an older one sends no such field, and gets none back. */
const reports = (settings: BillingSettingsDto, field: AnnualMonthsField) =>
  settings[field] !== undefined

/** The value in force: a null (a version before V406) reads as the server's default. */
const annualMonths = (settings: BillingSettingsDto, field: AnnualMonthsField) =>
  reports(settings, field) ? String(settings[field] ?? ANNUAL_MONTHS_DEFAULTS[field]) : ''

/** The whole-number fields and the range the server accepts for each. */
const RANGES: Partial<Record<keyof Form, { min: number; max: number }>> = {
  graceDays: { min: 0, max: MAX_DAYS },
  leadDays: { min: 0, max: MAX_DAYS },
  maxUsers: { min: 1, max: MAX_PER_ORDER },
  maxBranches: { min: 1, max: MAX_PER_ORDER },
  trialLead: { min: 1, max: MAX_TRIAL_REMINDER_LEAD_DAYS },
  correctionDays: { min: 1, max: MAX_CORRECTION_WINDOW_DAYS },
  erpAddonAnnualMonths: { min: ANNUAL_MONTHS_MIN, max: ANNUAL_MONTHS_MAX },
  extraUserAnnualMonths: { min: ANNUAL_MONTHS_MIN, max: ANNUAL_MONTHS_MAX },
  extraBranchAnnualMonths: { min: ANNUAL_MONTHS_MIN, max: ANNUAL_MONTHS_MAX },
}

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
      {read.status === 'loading' ? (
        <ConsoleNotice busy body={t(`${K}loading`)} />
      ) : read.status === 'failed' ? (
        <ConsoleReadFailure error={read.error} retry={retry} />
      ) : (
        <SettingsForm
          // A new version read starts a fresh form, so nothing typed against the old one lingers.
          key={read.data.version}
          settings={read.data}
          canManage={canManage}
          onSaved={() => {
            setFailure(null)
            retry()
          }}
          onRefused={(error) => {
            setFailure(refusal(t, error))
            if (isConflict(error)) retry()
          }}
        />
      )}
      <ExtraDocumentLimitsCard canManage={canManage} />
    </div>
  )
}

const text = (value: number | null | undefined) => (value == null ? '' : String(value))
const ascending = (days: number[] | null | undefined) => [...(days ?? [])].sort((a, b) => a - b)

/** An older server sends none of the V415 numbers; their fields are then not shown or sent. */
function hasConsoleNumbers(settings: BillingSettingsDto): boolean {
  return settings.maxExtraUsersPerOrder != null
}

function toForm(settings: BillingSettingsDto): Form {
  return {
    graceDays: String(settings.graceDays),
    leadDays: settings.renewalBillLeadDays === null ? '' : String(settings.renewalBillLeadDays),
    threshold: settings.dualApprovalThreshold,
    vatOn: chargesVat(settings.vatRate),
    vatPercent:
      chargesVat(settings.vatRate) && settings.vatRate ? fractionToPercent(settings.vatRate) : '',
    erpAddonAnnualMonths: annualMonths(settings, 'erpAddonAnnualMonths'),
    extraUserAnnualMonths: annualMonths(settings, 'extraUserAnnualMonths'),
    extraBranchAnnualMonths: annualMonths(settings, 'extraBranchAnnualMonths'),
    maxUsers: text(settings.maxExtraUsersPerOrder),
    maxBranches: text(settings.maxExtraBranchesPerOrder),
    trialLead: text(settings.trialReminderLeadDays),
    graceReminders: ascending(settings.graceReminderDays),
    renewalReminders: ascending(settings.renewalReminderDays),
    correctionDays: text(settings.correctionWindowDays),
    cardOn: settings.cardPaymentsEnabled !== false,
    reason: '',
  }
}

/**
 * The console numbers the operator changed. One left as read is not sent, so a number nobody
 * set keeps following the deployment's value on the server.
 */
function changedNumbers(form: Form, stored: Form): Partial<BillingSettingsRequest> {
  const changed: Partial<BillingSettingsRequest> = {}
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  if (form.maxUsers !== stored.maxUsers) changed.maxExtraUsersPerOrder = Number(form.maxUsers)
  if (form.maxBranches !== stored.maxBranches) {
    changed.maxExtraBranchesPerOrder = Number(form.maxBranches)
  }
  if (form.trialLead !== stored.trialLead) changed.trialReminderLeadDays = Number(form.trialLead)
  if (!same(form.graceReminders, stored.graceReminders)) {
    changed.graceReminderDays = form.graceReminders
  }
  if (!same(form.renewalReminders, stored.renewalReminders)) {
    changed.renewalReminderDays = [...form.renewalReminders].reverse()
  }
  if (form.correctionDays !== stored.correctionDays) {
    changed.correctionWindowDays = Number(form.correctionDays)
  }
  if (form.cardOn !== stored.cardOn) changed.cardPaymentsEnabled = form.cardOn
  return changed
}

function SettingsForm({
  settings,
  canManage,
  onSaved,
  onRefused,
}: {
  settings: BillingSettingsDto
  canManage: boolean
  onSaved: () => void
  onRefused: (error: unknown) => void
}) {
  const { t, i18n } = useTranslation()
  const stored = toForm(settings)
  const [form, setForm] = useState<Form>(stored)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const shown = ANNUAL_MONTHS_FIELDS.filter((field) => reports(settings, field))
  const numbers = hasConsoleNumbers(settings)
  const errors = attempted ? validate(form, shown, numbers) : {}
  const err = (field: keyof Form) => {
    const key = errors[field]
    return key ? t(key, RANGES[field] ?? { min: 0, max: MAX_DAYS }) : undefined
  }
  const dirty = JSON.stringify({ ...form, reason: '' }) !== JSON.stringify(stored)
  const set = <F extends keyof Form>(field: F, value: Form[F]) =>
    setForm((current) => ({ ...current, [field]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (Object.keys(validate(form, shown, numbers)).length > 0) {
      setAttempted(true)
      return
    }
    const request: BillingSettingsRequest = {
      graceDays: Number(form.graceDays),
      dualApprovalThreshold: form.threshold.trim(),
      ...(numbers ? changedNumbers(form, stored) : {}),
      reason: form.reason.trim(),
    }
    // Version 1 has no rate and no lead days. Left untouched they are omitted, so saving the
    // grace alone does not decide VAT as a side effect.
    if (settings.vatRate !== null || form.vatOn) {
      request.vatRate = form.vatOn ? percentToFraction(form.vatPercent) : '0'
    }
    if (form.leadDays.trim() !== '') request.renewalBillLeadDays = Number(form.leadDays)
    // Sent only when changed, so a save of anything else never decides these as a side effect.
    for (const field of shown) {
      if (form[field].trim() !== stored[field]) request[field] = Number(form[field])
    }
    setBusy(true)
    try {
      await saveBillingSettings(settings.version, request)
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
        {shown.length > 0 ? (
          <FieldGrid>
            {shown.map((field) => (
              <NumberField
                key={field}
                name={field}
                label={t(`${K}annualMonths.${field}`)}
                hint={t(`${K}annualMonths.hint`, { months: ANNUAL_MONTHS_DEFAULTS[field] })}
                value={form[field]}
                onChange={(value) => set(field, value)}
                error={err(field)}
              />
            ))}
          </FieldGrid>
        ) : null}
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
        {numbers ? (
          <>
            <SwitchRow
              title={t(`${K}cardPayments`)}
              note={t(`${K}cardPaymentsNote`)}
              checked={form.cardOn}
              disabled={!canManage || busy}
              onChange={(checked) => set('cardOn', checked)}
            />
            <PaymentLinks cardOn={form.cardOn} />
            <GroupLabel>{t(`${K}limitsGroup`)}</GroupLabel>
            <FieldGrid>
              <NumberField
                name="maxUsers"
                label={t(`${K}maxUsers`)}
                hint={t(`${K}maxUsersHint`)}
                value={form.maxUsers}
                onChange={(value) => set('maxUsers', value)}
                error={err('maxUsers')}
              />
              <NumberField
                name="maxBranches"
                label={t(`${K}maxBranches`)}
                hint={t(`${K}maxBranchesHint`)}
                value={form.maxBranches}
                onChange={(value) => set('maxBranches', value)}
                error={err('maxBranches')}
              />
            </FieldGrid>
            <GroupLabel>{t(`${K}remindersGroup`)}</GroupLabel>
            <FieldGrid>
              <NumberField
                name="trialLead"
                label={t(`${K}trialLead`)}
                hint={t(`${K}trialLeadHint`, {
                  days: TRIAL_DAYS,
                  max: MAX_TRIAL_REMINDER_LEAD_DAYS,
                })}
                value={form.trialLead}
                onChange={(value) => set('trialLead', value)}
                error={err('trialLead')}
              />
              <DayListField
                label={t(`${K}graceReminders`)}
                hint={t(`${K}graceRemindersHint`)}
                values={form.graceReminders}
                onChange={(values) => set('graceReminders', values)}
                format={(day) => t('console.settings.dayList.day', { day })}
                max={MAX_GRACE_REMINDER_DAY}
                error={err('graceReminders')}
              />
              <DayListField
                label={t(`${K}renewalReminders`)}
                hint={t(`${K}renewalRemindersHint`)}
                values={form.renewalReminders}
                onChange={(values) => set('renewalReminders', values)}
                format={(day) => t(`${K}renewalChip`, { count: day })}
                max={MAX_RENEWAL_REMINDER_DAY}
                error={err('renewalReminders')}
              />
            </FieldGrid>
            <GroupLabel>{t(`${K}applicationsGroup`)}</GroupLabel>
            <FieldGrid>
              <NumberField
                name="correctionDays"
                label={t(`${K}correctionDays`)}
                hint={t(`${K}correctionDaysHint`)}
                value={form.correctionDays}
                onChange={(value) => set('correctionDays', value)}
                error={err('correctionDays')}
              />
            </FieldGrid>
          </>
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

/**
 * The payment-link group beside the card switch. A link is a card payment, so the group greys out
 * while card is off. The validity is shown, not edited: the settings do not carry it yet.
 */
function PaymentLinks({ cardOn }: { cardOn: boolean }) {
  const { t } = useTranslation()
  return (
    <div data-testid="payment-links" aria-disabled={!cardOn} className={cardOn ? '' : 'opacity-50'}>
      <GroupLabel>{t(`${K}paymentLinksGroup`)}</GroupLabel>
      <FieldGrid>
        <Input
          bordered
          readOnlyAppearance
          readOnly
          disabled={!cardOn}
          name="paymentLinkDays"
          label={t(`${K}paymentLinkDays`)}
          hint={
            cardOn
              ? t(`${K}paymentLinkDaysHint`, { days: PAYMENT_LINK_VALIDITY_DAYS })
              : t(`${K}paymentLinkDaysOff`)
          }
          dir="ltr"
          value={String(PAYMENT_LINK_VALIDITY_DAYS)}
        />
      </FieldGrid>
    </div>
  )
}

/** Error keys by field, checked before sending so the server's 400 is the exception. */
function validate(form: Form, annual: readonly AnnualMonthsField[], numbers: boolean): Errors {
  const errors: Errors = {}
  const whole = (field: keyof Form) => {
    const value = String(form[field]).trim()
    const range = RANGES[field] ?? { min: 0, max: MAX_DAYS }
    return /^\d{1,4}$/.test(value) && Number(value) >= range.min && Number(value) <= range.max
  }
  for (const field of annual) {
    if (!whole(field)) errors[field] = 'console.settings.error.wholeBetween'
  }
  if (!whole('graceDays')) errors.graceDays = 'console.settings.error.wholeBetween'
  if (form.leadDays.trim() !== '' && !whole('leadDays'))
    errors.leadDays = 'console.settings.error.wholeBetween'
  if (numbers) {
    for (const field of ['maxUsers', 'maxBranches', 'trialLead', 'correctionDays'] as const) {
      if (!whole(field)) errors[field] = 'console.settings.error.wholeBetween'
    }
    if (form.graceReminders.length === 0) errors.graceReminders = `${K}error.dayList`
    if (form.renewalReminders.length === 0) errors.renewalReminders = `${K}error.dayList`
  }
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
