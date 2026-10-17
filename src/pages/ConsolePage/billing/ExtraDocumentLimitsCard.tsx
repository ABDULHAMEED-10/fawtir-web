import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../../api'
import { Input } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { formatCount, formatInstant } from '../../../lib/format'
import {
  EXTRA_DOCUMENT_SETTINGS_HISTORY_PATH,
  EXTRA_DOCUMENT_SETTINGS_PATH,
  MAX_PER_PURCHASE_CEILING,
  saveExtraDocumentSettings,
  type ExtraDocumentSettingsDto,
} from '../../../lib/console/billingSettings'
import { FieldGrid, NumberField, SectionFooter, SettingsSectionCard } from '../settings/shared'
import { SettingsHistory } from './SettingsHistory'

const K = 'console.billingSettings.extraDocuments.'
const REASON_MAX = 500

type Form = { min: string; max: string; reason: string }
type Errors = Partial<Record<keyof Form, string>>

/**
 * The fewest and most extra documents one purchase may buy (plan v4 §7.2, rules EX-1 and §13):
 * its own versioned record beside the billing settings, so it saves on its own with its own
 * reason and `If-Match`. The customer's buy screen and the mobile app read the same limits from
 * the server's quote.
 */
export function ExtraDocumentLimitsCard({ canManage }: { canManage: boolean }) {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<ExtraDocumentSettingsDto>(EXTRA_DOCUMENT_SETTINGS_PATH)
  const history = useConsoleRead<ExtraDocumentSettingsDto[]>(EXTRA_DOCUMENT_SETTINGS_HISTORY_PATH)
  const [failure, setFailure] = useState<string | null>(null)

  const reload = () => {
    retry()
    history.retry()
  }

  if (read.status === 'loading') {
    return (
      <SettingsSectionCard title={t(`${K}card`)}>
        <div className="p-5 pt-0">
          <ConsoleNotice busy body={t(`${K}loading`)} />
        </div>
      </SettingsSectionCard>
    )
  }
  if (read.status === 'failed') {
    return (
      <SettingsSectionCard title={t(`${K}card`)}>
        <div className="p-5 pt-0">
          <ConsoleReadFailure error={read.error} retry={retry} />
        </div>
      </SettingsSectionCard>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <LimitsForm
        // A new version read starts a fresh form, so nothing typed against the old one lingers.
        key={read.data.version}
        settings={read.data}
        canManage={canManage}
        failure={failure}
        onSaved={() => {
          setFailure(null)
          reload()
        }}
        onRefused={(error) => {
          setFailure(refusal(t, error))
          if (isConflict(error)) reload()
        }}
      />
      {history.read.status === 'ready' ? (
        <SettingsHistory
          id="extra-documents-history"
          title={t(`${K}history`)}
          // Newest first, as the server sends it; the first is the version in force, shown above.
          entries={history.read.data.slice(1).map((entry) => ({
            id: entry.id,
            title: t(`${K}historyEntry`, {
              version: entry.version,
              min: formatCount(entry.minPerPurchase, i18n.language),
              max: formatCount(entry.maxPerPurchase, i18n.language),
            }),
            reason: entry.reason,
            createdBy: entry.createdBy,
            createdAt: entry.createdAt,
          }))}
        />
      ) : history.read.status === 'failed' ? (
        <p className="text-xs font-medium text-text-tertiary">{t(`${K}historyFailed`)}</p>
      ) : null}
    </div>
  )
}

function LimitsForm({
  settings,
  canManage,
  failure,
  onSaved,
  onRefused,
}: {
  settings: ExtraDocumentSettingsDto
  canManage: boolean
  failure: string | null
  onSaved: () => void
  onRefused: (error: unknown) => void
}) {
  const { t, i18n } = useTranslation()
  const stored: Form = {
    min: String(settings.minPerPurchase),
    max: String(settings.maxPerPurchase),
    reason: '',
  }
  const [form, setForm] = useState<Form>(stored)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  // One confirmation, one request: a double click must not publish two versions.
  const inFlight = useRef(false)
  const errors = attempted ? validate(form) : {}
  const err = (field: keyof Form) => {
    const key = errors[field]
    return key ? t(key, { max: formatCount(MAX_PER_PURCHASE_CEILING, i18n.language) }) : undefined
  }
  const dirty = form.min !== stored.min || form.max !== stored.max
  const set = (field: keyof Form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    if (Object.keys(validate(form)).length > 0) {
      setAttempted(true)
      return
    }
    inFlight.current = true
    setBusy(true)
    try {
      await saveExtraDocumentSettings(settings.version, {
        minPerPurchase: Number(form.min.trim()),
        maxPerPurchase: Number(form.max.trim()),
        reason: form.reason.trim(),
      })
      onSaved()
    } catch (error) {
      onRefused(error)
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <SettingsSectionCard
      title={t(`${K}card`)}
      note={canManage ? t(`${K}cardNote`) : t('console.billingSettings.readOnly')}
      onSubmit={canManage ? submit : undefined}
      footer={
        canManage ? (
          <SectionFooter
            dirty={dirty && !busy}
            isDefault
            savedBy={t('console.billingSettings.lastChange', {
              reason: settings.reason,
              when: formatInstant(settings.createdAt, i18n.language),
            })}
            onReset={() => {}}
          />
        ) : null
      }
    >
      {failure ? (
        <p
          role="alert"
          className="mx-5 mb-4 rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
        >
          {failure}
        </p>
      ) : null}
      <fieldset disabled={!canManage || busy} className="min-w-0">
        <FieldGrid>
          <NumberField
            name="minPerPurchase"
            label={t(`${K}min`)}
            hint={t(`${K}minHint`)}
            value={form.min}
            onChange={(value) => set('min', value)}
            error={err('min')}
          />
          <NumberField
            name="maxPerPurchase"
            label={t(`${K}max`)}
            hint={t(`${K}maxHint`, { max: formatCount(MAX_PER_PURCHASE_CEILING, i18n.language) })}
            value={form.max}
            onChange={(value) => set('max', value)}
            error={err('max')}
          />
        </FieldGrid>
        {canManage ? (
          <FieldGrid>
            <Input
              bordered
              name="reason"
              label={t('console.billingSettings.reason')}
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

/** The server's own bounds: minimum 1 or more, maximum between it and 1,000,000. */
function validate(form: Form): Errors {
  const errors: Errors = {}
  const whole = (value: string) => /^\d{1,7}$/.test(value.trim()) && Number(value) >= 1
  if (!whole(form.min)) errors.min = `${K}error.min`
  if (!whole(form.max) || Number(form.max) > MAX_PER_PURCHASE_CEILING) errors.max = `${K}error.max`
  else if (whole(form.min) && Number(form.max) < Number(form.min))
    errors.max = `${K}error.maxBelowMin`
  if (!form.reason.trim()) errors.reason = 'console.settings.error.required'
  return errors
}

function isConflict(error: unknown): boolean {
  return error instanceof ApiError && error.problemType === 'billing-settings-version-conflict'
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
