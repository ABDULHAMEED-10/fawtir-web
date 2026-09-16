import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button, Checkbox, Input, Modal, Select, Switch } from '../../../components/ui'
import { Pill } from '../ErpShell'
import { Mono, PRIMARY_BUTTON, SMALL_BUTTON, SectionCard } from '../overview/idiom'
import { ConnectionShell, useConnection } from './ConnectionShell'
import { DangerZone, PauseResumeButton, Strip, dateTime } from './detailShared'
import {
  AUTH_KINDS,
  CREDENTIAL_FIELDS,
  PRODUCT_FIELDS,
  SCHEDULES,
  connectorStore,
  type AuthKind,
  type Connection,
  type ScheduleMinutes,
  type Scope,
  type TestResult,
} from '../../../lib/erpConnector'

/**
 * Settings › Integration › Connected systems › connection › Settings (docs/erp-and-console-plan.md
 * §3, Appendix B "Detail · Settings").
 *
 * Three cards: the connection's own fields with one Save; the credentials — never shown, only
 * described — with Test now and Replace; and the danger zone. Replacing credentials is the way a
 * connection in ERROR comes back: the new secret is tested at once and a pass clears the error.
 */
export function ConnectionSettingsPage() {
  const connection = useConnection()
  return (
    <ConnectionShell connection={connection}>
      {connection ? (
        <>
          <ConnectionForm connection={connection} />
          <CredentialsCard connection={connection} />
          <DangerZone connection={connection}>
            <PauseResumeButton connection={connection} className={SMALL_BUTTON} />
          </DangerZone>
        </>
      ) : null}
    </ConnectionShell>
  )
}

const isHttps = (url: string) => /^https:\/\/[^\s/]+\.[^\s/]+/i.test(url.trim())

function ConnectionForm({ connection: c }: { connection: Connection }) {
  const { t } = useTranslation()
  const [label, setLabel] = useState(c.label)
  const [baseUrl, setBaseUrl] = useState(c.baseUrl)
  const [schedule, setSchedule] = useState<ScheduleMinutes>(c.scheduleMinutes)
  const [write, setWrite] = useState(c.scopes.includes('WRITE'))
  const [writeBack, setWriteBack] = useState(c.writeBackEnabled)
  const [saved, setSaved] = useState(false)
  const [touched, setTouched] = useState(false)

  // Another screen (or the store) may change the connection; the form follows unless it is mid-edit.
  useEffect(() => {
    if (touched) return
    setLabel(c.label)
    setBaseUrl(c.baseUrl)
    setSchedule(c.scheduleMinutes)
    setWrite(c.scopes.includes('WRITE'))
    setWriteBack(c.writeBackEnabled)
  }, [c, touched])

  const labelError =
    touched && !label.trim() ? t('erp.connector.settingsTab.form.labelRequired') : undefined
  const urlError =
    touched && !isHttps(baseUrl) ? t('erp.connector.settingsTab.form.urlHttps') : undefined
  const scopes: Scope[] = write ? ['READ', 'WRITE'] : ['READ']
  const dirty =
    label !== c.label ||
    baseUrl !== c.baseUrl ||
    schedule !== c.scheduleMinutes ||
    scopes.join() !== c.scopes.join() ||
    (write && writeBack) !== c.writeBackEnabled
  const readOnly = c.state === 'DISCONNECTED'

  const save = () => {
    setTouched(true)
    if (!label.trim() || !isHttps(baseUrl)) return
    connectorStore.update(c.id, {
      label: label.trim(),
      baseUrl: baseUrl.trim(),
      scheduleMinutes: schedule,
      scopes,
      writeBackEnabled: write && writeBack,
    })
    setTouched(false)
    setSaved(true)
  }

  const edit =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setTouched(true)
      setSaved(false)
      setter(v)
    }

  return (
    <SectionCard
      title={t('erp.connector.settingsTab.form.title')}
      note={t('erp.connector.settingsTab.form.note')}
    >
      <form
        className="border-t border-surface-background p-5"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        {saved ? (
          <div className="mb-5">
            <Strip tone="success">{t('erp.connector.settingsTab.form.saved')}</Strip>
          </div>
        ) : null}
        <div className="grid gap-5 md:grid-cols-2">
          <Input
            bordered
            label={t('erp.connector.settingsTab.form.label')}
            value={label}
            disabled={readOnly}
            onChange={(e) => edit(setLabel)(e.target.value)}
            error={labelError}
          />
          <Input
            bordered
            dir="ltr"
            label={t('erp.connector.settingsTab.form.url')}
            value={baseUrl}
            disabled={readOnly}
            inputMode="url"
            placeholder="https://"
            onChange={(e) => edit(setBaseUrl)(e.target.value)}
            error={urlError}
            hint={urlError ? undefined : t('erp.connector.settingsTab.form.urlHint')}
            className="font-mono"
          />
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text-primary">
              {t('erp.connector.settingsTab.form.schedule')}
            </span>
            <Select
              ariaLabel={t('erp.connector.settingsTab.form.schedule')}
              value={String(schedule)}
              disabled={readOnly}
              onChange={(v) => edit(setSchedule)(Number(v) as ScheduleMinutes)}
              options={SCHEDULES.map((m) => ({
                value: String(m),
                label: t(`erp.connector.schedule.${m}`),
              }))}
            />
            <p className="text-[10px] font-medium leading-[1.2] text-text-tertiary">
              {t('erp.connector.settingsTab.form.scheduleHint')}
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-text-primary">
              {t('erp.connector.settingsTab.form.scopes')}
            </span>
            <div className="flex min-h-[50px] flex-wrap items-center gap-x-6 gap-y-2 rounded-sm border border-border-default px-4">
              <Checkbox
                label={t('erp.connector.settingsTab.form.scopeRead')}
                checked
                disabled
                readOnly
              />
              <Checkbox
                label={t('erp.connector.settingsTab.form.scopeWrite')}
                checked={write}
                disabled={readOnly}
                onChange={(e) => {
                  edit(setWrite)(e.target.checked)
                  if (!e.target.checked) setWriteBack(false)
                }}
              />
            </div>
            <p className="text-[10px] font-medium leading-[1.2] text-text-tertiary">
              {t('erp.connector.settingsTab.form.scopesHint')}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-sm bg-surface-background/60 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {t('erp.connector.settingsTab.form.writeBack')}
            </p>
            <p className="text-xs font-medium leading-[1.4] text-text-quaternary">
              {write
                ? t('erp.connector.settingsTab.form.writeBackHint')
                : t('erp.connector.settingsTab.form.writeBackNeedsWrite')}
            </p>
          </div>
          <Switch
            checked={write && writeBack}
            disabled={!write || readOnly}
            label={t('erp.connector.settingsTab.form.writeBack')}
            onChange={edit(setWriteBack)}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={readOnly || !dirty} className={PRIMARY_BUTTON}>
            {t('erp.connector.settingsTab.form.save')}
          </button>
          <span className="text-xs font-medium leading-[1.5] text-text-quaternary">
            {t('erp.connector.settingsTab.form.saveNote')}
          </span>
        </div>
      </form>
    </SectionCard>
  )
}

function CredentialsCard({ connection: c }: { connection: Connection }) {
  const { t } = useTranslation()
  const [tested, setTested] = useState<TestResult | null>(null)
  const [replacing, setReplacing] = useState(false)
  const [rotated, setRotated] = useState<TestResult | null>(null)
  const last = c.lastTest
  const readOnly = c.state === 'DISCONNECTED'

  const testLine = (result: TestResult) =>
    result.ok
      ? t('erp.connector.settingsTab.credentials.testOk', {
          date: dateTime(result.at),
          latency: result.latencyMs ?? 0,
          version: result.erpVersion ?? '',
        })
      : `${t('erp.connector.settingsTab.credentials.testFailed', { date: dateTime(result.at) })} ${t(
          `erp.connector.testError.${result.errorCode ?? 'UNREACHABLE'}`,
        )}`

  return (
    <SectionCard
      title={t('erp.connector.settingsTab.credentials.title')}
      note={t('erp.connector.settingsTab.credentials.note')}
      actions={
        <>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => {
              setRotated(null)
              setTested(connectorStore.test(c.id))
            }}
            className={SMALL_BUTTON}
          >
            {t('erp.connector.settingsTab.credentials.testNow')}
          </button>
          <button
            type="button"
            disabled={readOnly}
            onClick={() => setReplacing(true)}
            className={SMALL_BUTTON}
          >
            {t('erp.connector.settingsTab.credentials.replace')}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4 border-t border-surface-background p-5">
        {rotated ? (
          <Strip tone={rotated.ok ? 'success' : 'danger'}>
            {rotated.ok
              ? t('erp.connector.settingsTab.credentials.rotated', {
                  latency: rotated.latencyMs ?? 0,
                })
              : t('erp.connector.settingsTab.credentials.rotationFailed', {
                  reason: t(`erp.connector.testError.${rotated.errorCode ?? 'UNREACHABLE'}`),
                })}
          </Strip>
        ) : tested ? (
          <Strip tone={tested.ok ? 'success' : 'danger'}>{testLine(tested)}</Strip>
        ) : null}

        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t('erp.connector.settingsTab.credentials.signsInWith')}
            </dt>
            <dd className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-text-primary">
              <span>{t(`erp.connector.authKind.${c.authKind}`)}</span>
              <Mono className="text-text-tertiary">{c.credentialHint}</Mono>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
              {t('erp.connector.settingsTab.credentials.lastTest')}
            </dt>
            <dd className="flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary">
              {last ? (
                <>
                  <Pill
                    tone={last.ok ? 'success' : 'danger'}
                    label={
                      last.ok
                        ? t('erp.connector.settingsTab.credentials.ok')
                        : t('erp.connector.settingsTab.credentials.error')
                    }
                  />
                  <span>{testLine(last)}</span>
                </>
              ) : (
                t('erp.connector.settingsTab.credentials.neverTested')
              )}
            </dd>
          </div>
          {last?.ok && last.grantedScopes ? (
            <div className="flex flex-col gap-1">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                {t('erp.connector.settingsTab.credentials.granted')}
              </dt>
              <dd className="flex flex-wrap gap-1.5">
                {last.grantedScopes.map((s) => (
                  <Pill key={s} tone="neutral" label={t(`erp.connector.scope.${s}`)} />
                ))}
              </dd>
            </div>
          ) : null}
          {last?.ok && last.company ? (
            <div className="flex flex-col gap-1">
              <dt className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
                {t('erp.connector.settingsTab.credentials.company')}
              </dt>
              <dd className="text-sm font-semibold text-text-primary">{last.company}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <ReplaceCredentialsModal
        open={replacing}
        connection={c}
        onClose={() => setReplacing(false)}
        onDone={(result) => {
          setTested(null)
          setRotated(result)
          if (result.ok) setReplacing(false)
        }}
      />
    </SectionCard>
  )
}

const SECRET_FIELDS = new Set(['apiKey', 'password', 'clientSecret', 'apiSecret'])

/** The non-secret hint the screens keep of a credential: the login and the key's tail. */
function buildHint(kind: AuthKind, values: Record<string, string>) {
  const tail = (v?: string) => (v && v.length >= 4 ? `····${v.slice(-4)}` : '····')
  const parts: string[] = []
  if (values.username?.trim()) parts.push(values.username.trim())
  if (kind === 'API_KEY') parts.push(`key ${tail(values.apiKey)}`)
  if (kind === 'OAUTH2_CLIENT' || kind === 'OAUTH2_AUTHCODE')
    parts.push(`client ${tail(values.clientId)}`)
  return parts.join(' · ') || '—'
}

function ReplaceCredentialsModal({
  open,
  connection: c,
  onClose,
  onDone,
}: {
  open: boolean
  connection: Connection
  onClose: () => void
  onDone: (result: TestResult) => void
}) {
  const { t } = useTranslation()
  const kinds = AUTH_KINDS[c.product]
  const [kind, setKind] = useState<AuthKind>(c.authKind)
  const [values, setValues] = useState<Record<string, string>>({})
  const [result, setResult] = useState<TestResult | null>(null)
  const [tried, setTried] = useState(false)

  useEffect(() => {
    if (!open) return
    setKind(c.authKind)
    setValues({ database: c.database ?? '' })
    setResult(null)
    setTried(false)
  }, [open, c.authKind, c.database])

  const fields = [...CREDENTIAL_FIELDS[kind], ...(PRODUCT_FIELDS[c.product] ?? [])].filter(
    (f, i, all) => all.indexOf(f) === i,
  )
  const missing = fields.filter((f) => !values[f]?.trim())

  const submit = () => {
    setTried(true)
    if (missing.length) return
    const outcome = connectorStore.rotateCredentials(c.id, kind, buildHint(kind, values))
    setResult(outcome)
    onDone(outcome)
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('erp.connector.settingsTab.replace.title')}
      subtitle={t('erp.connector.settingsTab.replace.subtitle')}
      width={520}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <Button type="button" size="md" variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="button" size="md" onClick={submit}>
            {t('erp.connector.settingsTab.replace.confirm')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-primary">
            {t('erp.connector.settingsTab.replace.kind')}
          </span>
          <Select
            ariaLabel={t('erp.connector.settingsTab.replace.kind')}
            value={kind}
            onChange={(v) => {
              setKind(v as AuthKind)
              setResult(null)
            }}
            options={kinds.map((k) => ({ value: k, label: t(`erp.connector.authKind.${k}`) }))}
          />
        </div>
        {fields.map((field) => (
          <Input
            key={field}
            bordered
            dir="ltr"
            label={t(`erp.connector.settingsTab.replace.field.${field}`)}
            type={SECRET_FIELDS.has(field) ? 'password' : 'text'}
            autoComplete="off"
            value={values[field] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
            error={
              tried && !values[field]?.trim()
                ? t('erp.connector.settingsTab.replace.required')
                : undefined
            }
          />
        ))}
        {result && !result.ok ? (
          <Strip tone="danger">
            {t('erp.connector.settingsTab.credentials.rotationFailed', {
              reason: t(`erp.connector.testError.${result.errorCode ?? 'UNREACHABLE'}`),
            })}
          </Strip>
        ) : (
          <Strip tone="neutral">{t('erp.connector.settingsTab.replace.note')}</Strip>
        )}
      </div>
    </Modal>
  )
}
