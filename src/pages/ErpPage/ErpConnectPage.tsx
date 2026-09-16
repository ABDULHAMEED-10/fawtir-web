import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import { Checkbox, Input, Select, StepTracker, Switch, type TrackerStep } from '../../components/ui'
import { Pill } from './ErpShell'
import { Mono, PRIMARY_BUTTON, SECONDARY_BUTTON, TEXT_BUTTON } from './overview/idiom'
import { connectionPath } from './connections/ConnectionShell'
import {
  AUTH_KINDS,
  AVAILABLE_PRODUCTS,
  CREDENTIAL_FIELDS,
  PRODUCTS,
  PRODUCT_FIELDS,
  SCHEDULES,
  connectorStore,
  productName,
  templateLabel,
  testDraft,
  type AuthKind,
  type DiscoverResult,
  type NewConnection,
  type Product,
  type ScheduleMinutes,
  type Scope,
  type TestResult,
} from '../../lib/erpConnector'
import tickIcon from '../../assets/settings/check-green.svg'
import infoIcon from '../../assets/settings/info.svg'

/**
 * Settings › Integration › Connect a system (docs/erp-and-console-plan.md §3, Appendix B).
 *
 * Four steps, one card: pick the ERP and name the connection; say how Fawtir signs in, what it
 * may touch and how often; test that the ERP answers; let Fawtir read a few invoices to learn the
 * fields and apply the platform template. Finish creates the connection and hands over to its
 * mapping. The draft lives in this component and nowhere else — a secret typed here is sent once
 * and forgotten, exactly as the backend will treat it.
 */

const STEPS = ['system', 'credentials', 'test', 'discover'] as const
type Step = (typeof STEPS)[number]

const SECRET_FIELDS = new Set(['apiKey', 'apiSecret', 'password', 'clientSecret'])
const isSecret = (field: string) => SECRET_FIELDS.has(field)

/** The mock's latencies: a test answers in 600 ms, discovery in 900 ms, the ERP's sign-in in 800 ms. */
const TEST_DELAY = 600
const DISCOVER_DELAY = 900
const OAUTH_DELAY = 800

type Draft = {
  product: Product | null
  label: string
  baseUrl: string
  authKind: AuthKind
  fields: Record<string, string>
  /** OAUTH2_AUTHCODE: the ERP's sign-in came back with a grant. */
  authorised: boolean
  write: boolean
  scheduleMinutes: ScheduleMinutes
  writeBackEnabled: boolean
}

const EMPTY_DRAFT: Draft = {
  product: null,
  label: '',
  baseUrl: '',
  authKind: 'API_KEY',
  fields: {},
  authorised: false,
  write: false,
  scheduleMinutes: 30,
  writeBackEnabled: false,
}

/** The fields the credentials step asks for: the product's own first, then the secrets. */
function fieldsFor(product: Product, authKind: AuthKind) {
  const union = [...new Set([...CREDENTIAL_FIELDS[authKind], ...(PRODUCT_FIELDS[product] ?? [])])]
  return [...union.filter((f) => !isSecret(f)), ...union.filter(isSecret)]
}

const isHttps = (url: string) => /^https?:\/\/\S+\.\S+/i.test(url.trim())

/** What the screens may keep of the credential — the login or the key's tail, never the secret. */
function credentialHint(draft: Draft) {
  const f = draft.fields
  if (draft.authKind === 'OAUTH2_AUTHCODE') return `OAuth · ${productName(draft.product!)}`
  const parts = [
    f.username?.trim(),
    f.clientId?.trim(),
    f.apiKey?.trim() ? `key ····${f.apiKey.trim().slice(-4)}` : undefined,
  ].filter(Boolean)
  return parts.join(' · ') || '—'
}

export function ErpConnectPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [stepIndex, setStepIndex] = useState(0)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  /** Errors are shown only after the reader tried to continue past the step. */
  const [attempted, setAttempted] = useState(false)
  const [test, setTest] = useState<TestResult | null>(null)
  const [testing, setTesting] = useState(false)
  const [discovery, setDiscovery] = useState<DiscoverResult | null>(null)
  const [discovering, setDiscovering] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const timers = useRef<number[]>([])

  useEffect(() => {
    const pending = timers.current
    return () => pending.forEach((id) => window.clearTimeout(id))
  }, [])
  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }

  const step: Step = STEPS[stepIndex]
  const patch = (next: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...next }))
    // Anything typed after a test or a discovery invalidates them.
    setTest(null)
    setDiscovery(null)
  }

  const pickProduct = (product: Product) => {
    if (!AVAILABLE_PRODUCTS.includes(product) || product === draft.product) return
    patch({ product, authKind: AUTH_KINDS[product][0], fields: {}, authorised: false })
  }

  const visibleFields = useMemo(
    () => (draft.product ? fieldsFor(draft.product, draft.authKind) : []),
    [draft.product, draft.authKind],
  )

  /* ---- validation */
  const systemErrors = {
    product: draft.product ? undefined : t('erp.connector.connect.errors.product'),
    label: draft.label.trim() ? undefined : t('erp.connector.connect.errors.label'),
    baseUrl: isHttps(draft.baseUrl) ? undefined : t('erp.connector.connect.errors.url'),
  }
  const systemValid = !systemErrors.product && !systemErrors.label && !systemErrors.baseUrl
  const credentialsValid =
    draft.authKind === 'OAUTH2_AUTHCODE'
      ? draft.authorised
      : visibleFields.every((f) => draft.fields[f]?.trim())
  const canContinue =
    step === 'system'
      ? systemValid
      : step === 'credentials'
        ? credentialsValid
        : step === 'test'
          ? Boolean(test?.ok)
          : Boolean(discovery)

  const scopes: Scope[] = draft.write ? ['READ', 'WRITE'] : ['READ']

  const goNext = () => {
    if (!canContinue) {
      setAttempted(true)
      return
    }
    setAttempted(false)
    if (step === 'discover') {
      finish()
      return
    }
    setStepIndex((i) => Math.min(i + 1, STEPS.length - 1))
  }
  const goBack = () => {
    setAttempted(false)
    setStepIndex((i) => Math.max(i - 1, 0))
  }
  const goTo = (target: Step) => {
    setAttempted(false)
    setStepIndex(STEPS.indexOf(target))
  }

  /* ---- the three fake round trips */
  const signIn = () => {
    if (signingIn) return
    setSigningIn(true)
    later(OAUTH_DELAY, () => {
      setSigningIn(false)
      setDraft((d) => ({ ...d, authorised: true }))
    })
  }
  const runTest = () => {
    if (testing || !draft.product) return
    setTesting(true)
    setTest(null)
    const { baseUrl, product } = draft
    later(TEST_DELAY, () => {
      setTesting(false)
      setTest(testDraft({ baseUrl, product, scopes }))
    })
  }
  const runDiscover = () => {
    if (discovering || !draft.product) return
    setDiscovering(true)
    const { product } = draft
    const erpVersion = test?.erpVersion
    later(DISCOVER_DELAY, () => {
      setDiscovering(false)
      setDiscovery(connectorStore.discover({ product }, erpVersion))
    })
  }
  const finish = () => {
    if (!draft.product || !test?.ok || !discovery) return
    const connection: NewConnection = {
      label: draft.label.trim(),
      product: draft.product,
      baseUrl: draft.baseUrl.trim(),
      authKind: draft.authKind,
      credentialHint: credentialHint(draft),
      database: draft.fields.database?.trim() || undefined,
      scopes,
      scheduleMinutes: draft.scheduleMinutes,
      writeBackEnabled: draft.write && draft.writeBackEnabled,
    }
    const created = connectorStore.create(connection, test, discovery)
    navigate(connectionPath(created.id, 'mapping'))
  }

  const trackerSteps: TrackerStep[] = STEPS.map((id, i) => ({
    labelKey: `erp.connector.connect.steps.${id}`,
    state: i < stepIndex ? 'done' : i === stepIndex ? 'current' : 'future',
  }))

  return (
    <SettingsShell group="integration">
      <div className="flex flex-col gap-3">
        <Link
          to="/settings/erp/connections"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
        >
          <span aria-hidden="true" className="rtl:rotate-180">
            ‹
          </span>
          {t('erp.connector.backToList')}
        </Link>
        <SettingsHeader
          title={t('erp.connector.connect.title')}
          subtitle={t('erp.connector.connect.subtitle')}
        />
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="flex justify-center border-b border-surface-background px-5 py-5 max-md:overflow-x-auto">
          <StepTracker steps={trackerSteps} size="md" />
        </div>

        <div className="p-5">
          {step === 'system' ? (
            <SystemStep
              draft={draft}
              errors={attempted ? systemErrors : {}}
              onPick={pickProduct}
              onPatch={patch}
            />
          ) : step === 'credentials' ? (
            <CredentialsStep
              draft={draft}
              fields={visibleFields}
              attempted={attempted}
              signingIn={signingIn}
              onPatch={patch}
              onSignIn={signIn}
            />
          ) : step === 'test' ? (
            <TestStep
              draft={draft}
              test={test}
              testing={testing}
              onTest={runTest}
              onBackToCredentials={() => goTo('credentials')}
            />
          ) : (
            <DiscoverStep
              draft={draft}
              discovery={discovery}
              discovering={discovering}
              onDiscover={runDiscover}
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-5 py-4">
          <Link to="/settings/erp/connections" className={TEXT_BUTTON}>
            {t('erp.connector.connect.cancel')}
          </Link>
          <div className="flex flex-wrap items-center gap-2.5 max-md:w-full max-md:justify-end">
            <button
              type="button"
              onClick={goBack}
              disabled={stepIndex === 0}
              className={SECONDARY_BUTTON}
            >
              {t('erp.connector.connect.back')}
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={(step === 'test' && !test?.ok) || (step === 'discover' && !discovery)}
              className={PRIMARY_BUTTON}
            >
              {step === 'discover'
                ? t('erp.connector.connect.finish')
                : t('erp.connector.connect.continue')}
            </button>
          </div>
        </div>
      </section>
    </SettingsShell>
  )
}

/* ------------------------------------------------------------- pieces */

function StepHeading({ children, note }: { children: string; note?: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">{children}</h3>
      {note ? (
        <p className="mt-1 max-w-[680px] text-sm font-medium leading-[1.6] text-text-tertiary">
          {note}
        </p>
      ) : null}
    </div>
  )
}

/** A label over a control that draws no label of its own (the listbox, the switch). */
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex w-full flex-col gap-1">
      <span className="text-sm font-medium text-text-primary">{label}</span>
      {children}
      {error ? (
        <p className="text-xs font-medium text-text-danger">{error}</p>
      ) : hint ? (
        <p className="text-[10px] font-medium leading-[1.2] text-text-tertiary">{hint}</p>
      ) : null}
    </div>
  )
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 animate-spin rounded-full border-2 border-current/30 border-t-current"
    />
  )
}

/* ---------------------------------------------------------- 1 · system */

function SystemStep({
  draft,
  errors,
  onPick,
  onPatch,
}: {
  draft: Draft
  errors: Partial<Record<'product' | 'label' | 'baseUrl', string>>
  onPick: (product: Product) => void
  onPatch: (next: Partial<Draft>) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-6">
      <div>
        <StepHeading>{t('erp.connector.connect.system.heading')}</StepHeading>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRODUCTS.map((product) => {
            const available = AVAILABLE_PRODUCTS.includes(product)
            const selected = draft.product === product
            return (
              <li key={product}>
                <button
                  type="button"
                  disabled={!available}
                  aria-pressed={selected}
                  onClick={() => onPick(product)}
                  className={[
                    'flex h-full w-full items-start justify-between gap-3 rounded-sm border-2 p-4 text-start transition-colors',
                    selected
                      ? 'border-primary-500 bg-primary-50'
                      : available
                        ? 'border-border-default bg-surface-card hover:border-border-brand-subtle'
                        : 'cursor-not-allowed border-border-subtle bg-surface-background/60',
                  ].join(' ')}
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                      className={[
                        'text-sm font-semibold',
                        available ? 'text-text-primary' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {t(`erp.connector.product.${product}`)}
                    </span>
                    <span className="text-xs font-medium leading-[1.5] text-text-quaternary">
                      {t(`erp.connector.connect.productHint.${product}`)}
                    </span>
                  </span>
                  {selected ? (
                    <img
                      src={tickIcon}
                      alt=""
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0"
                    />
                  ) : !available ? (
                    <Pill tone="neutral" label={t('erp.connector.connect.system.coming')} />
                  ) : null}
                </button>
              </li>
            )
          })}
        </ul>
        {errors.product ? (
          <p className="mt-2 text-xs font-medium text-text-danger">{errors.product}</p>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Input
          bordered
          label={t('erp.connector.connect.system.label')}
          requiredMark
          value={draft.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder={t('erp.connector.connect.system.labelPlaceholder')}
          hint={t('erp.connector.connect.system.labelHint')}
          error={errors.label}
          maxLength={80}
        />
        <Input
          bordered
          label={t('erp.connector.connect.system.baseUrl')}
          requiredMark
          value={draft.baseUrl}
          onChange={(e) => onPatch({ baseUrl: e.target.value })}
          placeholder="https://erp.example.om"
          hint={t('erp.connector.connect.system.baseUrlHint')}
          error={errors.baseUrl}
          dir="ltr"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  )
}

/* ----------------------------------------------------- 2 · credentials */

function CredentialsStep({
  draft,
  fields,
  attempted,
  signingIn,
  onPatch,
  onSignIn,
}: {
  draft: Draft
  fields: string[]
  attempted: boolean
  signingIn: boolean
  onPatch: (next: Partial<Draft>) => void
  onSignIn: () => void
}) {
  const { t } = useTranslation()
  const product = draft.product!
  const name = productName(product)
  const oauth = draft.authKind === 'OAUTH2_AUTHCODE'
  const setField = (field: string, value: string) =>
    onPatch({ fields: { ...draft.fields, [field]: value } })

  return (
    <div className="flex flex-col gap-6">
      <StepHeading>{t('erp.connector.connect.credentials.heading')}</StepHeading>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('erp.connector.connect.credentials.authKind')}>
          <Select
            value={draft.authKind}
            ariaLabel={t('erp.connector.connect.credentials.authKind')}
            onChange={(value) =>
              onPatch({ authKind: value as AuthKind, fields: {}, authorised: false })
            }
            options={AUTH_KINDS[product].map((kind) => ({
              value: kind,
              label: t(`erp.connector.authKind.${kind}`),
            }))}
          />
        </Field>

        {oauth ? (
          <div className="flex flex-col gap-2 md:col-span-2">
            {draft.authorised ? (
              <p className="flex items-start gap-2 rounded-sm bg-success-100 px-3 py-2.5 text-sm font-medium leading-[1.6] text-[#3d5648]">
                <img src={tickIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                <span>{t('erp.connector.connect.credentials.oauth.done', { product: name })}</span>
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onSignIn}
                  disabled={signingIn}
                  className={SECONDARY_BUTTON}
                >
                  {signingIn ? <Spinner /> : null}
                  {signingIn
                    ? t('erp.connector.connect.credentials.oauth.signingIn', { product: name })
                    : t('erp.connector.connect.credentials.oauth.button', { product: name })}
                </button>
                <span className="text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t('erp.connector.connect.credentials.oauth.note', { product: name })}
                </span>
              </div>
            )}
            {attempted && !draft.authorised ? (
              <p className="text-xs font-medium text-text-danger">
                {t('erp.connector.connect.errors.oauth')}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {fields.map((field) => (
              <Input
                key={field}
                bordered
                label={t(`erp.connector.connect.credentials.field.${field}`)}
                requiredMark
                type={isSecret(field) ? 'password' : 'text'}
                value={draft.fields[field] ?? ''}
                onChange={(e) => setField(field, e.target.value)}
                error={
                  attempted && !draft.fields[field]?.trim()
                    ? t('erp.connector.connect.errors.required')
                    : undefined
                }
                dir="ltr"
                autoComplete={isSecret(field) ? 'new-password' : 'off'}
                spellCheck={false}
              />
            ))}
            <p className="flex items-start gap-2 text-xs font-medium leading-[1.5] text-text-quaternary md:col-span-2">
              <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
              <span>{t('erp.connector.connect.credentials.secretsNote')}</span>
            </p>
          </>
        )}
      </div>

      <div className="grid gap-4 border-t border-surface-background pt-5 md:grid-cols-2">
        <Field label={t('erp.connector.connect.credentials.scopes')}>
          <div className="flex flex-col gap-2.5 pt-1">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Checkbox
                label={t('erp.connector.scope.READ')}
                checked
                disabled
                readOnly
                className="text-sm"
              />
              <span className="text-xs font-medium text-text-quaternary">
                {t('erp.connector.connect.credentials.readHelper')}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <Checkbox
                label={t('erp.connector.scope.WRITE')}
                checked={draft.write}
                onChange={(e) =>
                  onPatch({
                    write: e.target.checked,
                    writeBackEnabled: e.target.checked && draft.writeBackEnabled,
                  })
                }
                className="text-sm"
              />
              <span className="text-xs font-medium text-text-quaternary">
                {t('erp.connector.connect.credentials.writeHelper')}
              </span>
            </span>
          </div>
        </Field>

        <Field label={t('erp.connector.connect.credentials.schedule')}>
          <Select
            value={String(draft.scheduleMinutes)}
            ariaLabel={t('erp.connector.connect.credentials.schedule')}
            onChange={(value) => onPatch({ scheduleMinutes: Number(value) as ScheduleMinutes })}
            options={SCHEDULES.map((minutes) => ({
              value: String(minutes),
              label: t(`erp.connector.schedule.${minutes}`),
            }))}
          />
        </Field>

        <div className="flex items-start justify-between gap-4 rounded-sm bg-surface-background/60 p-4 md:col-span-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              {t('erp.connector.connect.credentials.writeBack')}
            </p>
            <p className="mt-0.5 text-xs font-medium leading-[1.5] text-text-quaternary">
              {draft.write
                ? t('erp.connector.connect.credentials.writeBackHelper')
                : t('erp.connector.connect.credentials.writeBackNeedsWrite')}
            </p>
          </div>
          <Switch
            checked={draft.write && draft.writeBackEnabled}
            disabled={!draft.write}
            onChange={(checked) => onPatch({ writeBackEnabled: checked })}
            label={t('erp.connector.connect.credentials.writeBack')}
          />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------ 3 · test */

function TestStep({
  draft,
  test,
  testing,
  onTest,
  onBackToCredentials,
}: {
  draft: Draft
  test: TestResult | null
  testing: boolean
  onTest: () => void
  onBackToCredentials: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-5">
      <StepHeading note={t('erp.connector.connect.test.body', { url: draft.baseUrl.trim() })}>
        {t('erp.connector.connect.test.heading')}
      </StepHeading>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onTest}
          disabled={testing}
          className={test ? SECONDARY_BUTTON : PRIMARY_BUTTON}
        >
          {testing ? <Spinner /> : null}
          {testing
            ? t('erp.connector.connect.test.testing')
            : test
              ? t('erp.connector.connect.test.retry')
              : t('erp.connector.connect.test.button')}
        </button>
        {!test && !testing ? (
          <span className="text-xs font-medium text-text-quaternary">
            {t('erp.connector.connect.test.hint')}
          </span>
        ) : null}
      </div>

      {test?.ok ? (
        <div className="overflow-hidden rounded-md border border-success-100">
          <p className="flex items-center gap-2 bg-success-100 px-4 py-2.5 text-sm font-semibold text-[#3d5648]">
            <img src={tickIcon} alt="" className="size-4 shrink-0" />
            {t('erp.connector.connect.test.passed')}
          </p>
          <dl className="grid gap-x-6 gap-y-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label={t('erp.connector.connect.test.erpVersion')}>
              <Mono className="text-sm">{test.erpVersion ?? '—'}</Mono>
            </Fact>
            <Fact label={t('erp.connector.connect.test.company')}>{test.company ?? '—'}</Fact>
            <Fact label={t('erp.connector.connect.test.scopes')}>
              <span className="flex flex-wrap gap-1.5">
                {(test.grantedScopes ?? []).map((scope) => (
                  <Pill key={scope} tone="success" label={t(`erp.connector.scope.${scope}`)} />
                ))}
              </span>
            </Fact>
            <Fact label={t('erp.connector.connect.test.latency')}>
              <span className="tabular-nums">
                {t('erp.connector.connect.test.latencyValue', { ms: test.latencyMs ?? 0 })}
              </span>
            </Fact>
          </dl>
        </div>
      ) : test ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-danger-700/20 bg-danger-100/70 px-4 py-3"
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-danger-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-danger-700">
              {t('erp.connector.connect.test.failed')}
            </p>
            <p className="mt-0.5 text-sm font-medium leading-[1.5] text-danger-700">
              {t(`erp.connector.testError.${test.errorCode ?? 'UNREACHABLE'}`)}
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToCredentials}
            className="text-sm font-semibold text-danger-700 underline-offset-2 hover:underline"
          >
            {t('erp.connector.connect.test.backToCredentials')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-semibold uppercase tracking-[0.5px] text-text-quaternary">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-text-primary">{children}</dd>
    </div>
  )
}

/* -------------------------------------------------------- 4 · discover */

function DiscoverStep({
  draft,
  discovery,
  discovering,
  onDiscover,
}: {
  draft: Draft
  discovery: DiscoverResult | null
  discovering: boolean
  onDiscover: () => void
}) {
  const { t } = useTranslation()
  const name = productName(draft.product!)
  return (
    <div className="flex flex-col gap-5">
      <StepHeading note={t('erp.connector.connect.discover.body', { product: name })}>
        {t('erp.connector.connect.discover.heading')}
      </StepHeading>

      {!discovery ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onDiscover}
            disabled={discovering}
            className={PRIMARY_BUTTON}
          >
            {discovering ? <Spinner /> : null}
            {discovering
              ? t('erp.connector.connect.discover.discovering')
              : t('erp.connector.connect.discover.button')}
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-surface-background">
          <p className="flex items-center gap-2 bg-success-100 px-4 py-2.5 text-sm font-semibold text-[#3d5648]">
            <img src={tickIcon} alt="" className="size-4 shrink-0" />
            {t('erp.connector.connect.discover.found', {
              fields: discovery.fields.length,
              samples: discovery.samples,
            })}
          </p>
          <ul className="flex flex-wrap gap-1.5 p-4">
            {discovery.fields.map((field) => (
              <li
                key={field}
                className="inline-flex h-[24px] items-center rounded-[3px] bg-surface-background px-2 text-text-secondary"
              >
                <Mono>{field}</Mono>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3 border-t border-surface-background px-4 py-3">
            <img src={infoIcon} alt="" className="size-4 shrink-0" />
            {discovery.templateApplied ? (
              <p className="min-w-0 flex-1 text-sm font-medium leading-[1.5] text-text-secondary">
                {t('erp.connector.connect.discover.template', {
                  template: templateLabel(discovery.templateApplied),
                })}
                <span className="text-text-quaternary">
                  {' · '}
                  {t('erp.connector.connect.discover.premapped', {
                    count: discovery.templateApplied.entryCount,
                  })}
                </span>
              </p>
            ) : (
              <p className="min-w-0 flex-1 text-sm font-medium leading-[1.5] text-text-secondary">
                {t('erp.connector.connect.discover.noTemplate')}
              </p>
            )}
          </div>
        </div>
      )}

      <p className="text-xs font-medium text-text-quaternary">
        {t('erp.connector.connect.discover.hint')}
      </p>
    </div>
  )
}
