import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ErpShell, Pill, RouteStatePill } from './ErpShell'
import { SamplePicker } from './shared/SamplePicker'
import { RuleFindingsTable } from './shared/RuleFindingsTable'
import { Button, Checkbox, Modal, RowsView, Select } from '../../components/ui'
import {
  activeProfile,
  mappingStore,
  routeStates,
  sampleById,
  shortHash,
  useErpMapping,
  CERT_ROUTES,
  DEFAULT_TRANSACTION_TYPE,
  TRANSACTION_BITS,
  type Attempt,
  type CertRoute,
} from '../../lib/erpMapping'
import { shortDate } from '../../lib/settings'
import infoIcon from '../../assets/settings/info.svg'

/** How long the mock lets the pipeline "run" — long enough to read as work, short enough to wait for. */
const PIPELINE_MS = 1200

const isRoute = (value: string | null): value is CertRoute =>
  CERT_ROUTES.includes(value as CertRoute)

/** The 20-bit BTOM-001 string from the fifteen named bits; 16–20 are reserved and stay 0. */
const compose = (bits: boolean[]) => `${bits.map((on) => (on ? '1' : '0')).join('')}00000`
const decompose = (type: string) => TRANSACTION_BITS.map((_, index) => type.charAt(index) === '1')

const clock = (date: Date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

/**
 * Settings › Integration › ERP mapping › Certification (docs/erp-and-console-plan.md §2.4, A.4).
 *
 * Four routes, each proved against a real sample before invoices of that kind can be sent. A
 * pass is tied to the hash of the profile that earned it, so the moment the mapping changes every
 * route is stale and the page says so in a banner, not a toast. A failed run is a result — the
 * findings table — not an error.
 */
export function ErpCertificationPage() {
  const { t } = useTranslation()
  const state = useErpMapping()
  const [params, setParams] = useSearchParams()

  const active = activeProfile(state)
  const routes = routeStates(state)
  const anyStale = CERT_ROUTES.some((route) => routes[route].state === 'STALE')

  const requested = params.get('route')
  const [open, setOpen] = useState<CertRoute | null>(isRoute(requested) ? requested : null)
  const openRun = (route: CertRoute) => {
    setOpen(route)
    setParams({ route }, { replace: true })
  }
  const closeRun = () => {
    setOpen(null)
    setParams({}, { replace: true })
  }

  const history = useMemo(
    () => [...state.attempts].sort((a, b) => b.at.getTime() - a.at.getTime()),
    [state.attempts],
  )

  return (
    <ErpShell title={t('erp.certification.title')} subtitle={t('erp.certification.subtitle')}>
      {anyStale ? (
        <div
          role="status"
          className="flex gap-3 rounded-md border border-pending-200 bg-pending-100/60 p-4"
        >
          <img src={infoIcon} alt="" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <p className="text-sm font-medium leading-[1.5] text-text-secondary">
            {t('erp.certification.staleBanner')}
          </p>
        </div>
      ) : null}

      {!active ? (
        <div className="flex gap-3 rounded-md border border-pending-200 bg-pending-100/60 p-4">
          <img src={infoIcon} alt="" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium leading-[1.5] text-text-secondary">
              {t('erp.certification.noProfile')}
            </p>
            <Link
              to="/settings/erp-mapping/fields"
              className="mt-1.5 inline-block text-xs font-semibold text-primary-700 hover:text-primary-800"
            >
              {t('erp.certification.goToFields')}
            </Link>
          </div>
        </div>
      ) : null}

      {/* Route cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {CERT_ROUTES.map((route) => {
          const { state: routeState, last, pass } = routes[route]
          const lastPass = [...state.attempts]
            .reverse()
            .find((attempt) => attempt.route === route && attempt.passed)
          const shown = pass ?? lastPass ?? last
          return (
            <article key={route} className="flex flex-col gap-3 rounded-md bg-surface-card p-5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                  {t(`erp.certRoute.${route}`)}
                </h3>
                <RouteStatePill state={routeState} />
              </div>

              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-medium">
                <dt className="text-text-quaternary">{t('erp.certification.activeHash')}</dt>
                <dd dir="ltr" className="text-start font-mono text-[11px] text-text-secondary">
                  {active ? shortHash(active.contentHash) : '—'}
                </dd>
                <dt className="text-text-quaternary">
                  {pass
                    ? t('erp.certification.passHash')
                    : lastPass
                      ? t('erp.certification.stalePassHash')
                      : t('erp.certification.lastHash')}
                </dt>
                <dd
                  dir="ltr"
                  className={[
                    'text-start font-mono text-[11px]',
                    shown && active && shown.contentHash !== active.contentHash
                      ? 'text-pending-700'
                      : 'text-text-secondary',
                  ].join(' ')}
                >
                  {shown ? shortHash(shown.contentHash) : '—'}
                </dd>
              </dl>

              <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
                {pass
                  ? t('erp.certification.certifiedOn', { date: shortDate(pass.at), who: pass.by })
                  : last
                    ? t('erp.certification.lastAttempt', {
                        date: shortDate(last.at),
                        findings: t('erp.shared.findingsCount', { count: last.findings.length }),
                      })
                    : t('erp.certification.neverTried')}
              </p>

              <button
                type="button"
                onClick={() => openRun(route)}
                className="mt-auto inline-flex h-[40px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
              >
                {t('erp.certification.run')}
              </button>
            </article>
          )
        })}
      </div>

      {/* History */}
      <section className="overflow-hidden rounded-md bg-surface-card">
        <div className="p-5">
          <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
            {t('erp.certification.history')}
          </h3>
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">
            {t('erp.certification.historyNote')}
          </p>
        </div>
        {history.length === 0 ? (
          <p className="px-5 pb-5 text-sm font-medium text-text-quaternary">
            {t('erp.certification.noHistory')}
          </p>
        ) : (
          <div className="px-5 pb-5">
            <History attempts={history} />
          </div>
        )}
      </section>

      {open ? <RunModal route={open} onClose={closeRun} /> : null}
    </ErpShell>
  )
}

function History({ attempts }: { attempts: Attempt[] }) {
  const { t } = useTranslation()
  const state = useErpMapping()
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const columns = ['route', 'result', 'hash', 'sample', 'type', 'when', 'by', 'findings'] as const

  return (
    <RowsView>
      <table className="w-full min-w-[960px] border-collapse">
        <thead>
          <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
            {columns.map((column) => (
              <th key={column} className="h-[46px] px-4 text-start font-semibold">
                {t(`erp.certification.col.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {attempts.map((attempt) => {
            const isOpen = expanded.has(attempt.id)
            const sample = sampleById(state, attempt.sampleId)
            return [
              <tr
                key={attempt.id}
                className={[
                  'border-b border-surface-background',
                  isOpen ? '' : 'last:border-0',
                ].join(' ')}
              >
                <td className="px-4 py-3 align-top text-sm font-semibold text-text-primary">
                  {t(`erp.certRoute.${attempt.route}`)}
                </td>
                <td className="px-4 py-3 align-top">
                  <Pill
                    tone={attempt.passed ? 'success' : 'danger'}
                    label={
                      attempt.passed
                        ? t('erp.certification.passedPill')
                        : t('erp.certification.failedPill')
                    }
                  />
                </td>
                <td
                  dir="ltr"
                  className="px-4 py-3 text-start align-top font-mono text-[11px] text-text-secondary"
                >
                  {shortHash(attempt.contentHash)}
                </td>
                <td className="px-4 py-3 align-top text-sm font-medium text-text-secondary">
                  {sample?.label ?? attempt.sampleId}
                </td>
                <td
                  dir="ltr"
                  className="px-4 py-3 text-start align-top font-mono text-[11px] text-text-secondary"
                >
                  {attempt.transactionType}
                </td>
                <td className="px-4 py-3 align-top text-sm font-medium text-text-secondary tabular-nums">
                  {shortDate(attempt.at)} · {clock(attempt.at)}
                </td>
                <td className="px-4 py-3 align-top text-sm font-medium text-text-secondary">
                  {attempt.by}
                </td>
                <td className="px-4 py-3 align-top">
                  {attempt.findings.length ? (
                    <button
                      type="button"
                      onClick={() => toggle(attempt.id)}
                      aria-expanded={isOpen}
                      className="whitespace-nowrap text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
                    >
                      {t('erp.shared.findingsCount', { count: attempt.findings.length })}
                      {' · '}
                      {isOpen ? t('erp.certification.hide') : t('erp.certification.show')}
                    </button>
                  ) : (
                    <span className="text-sm font-medium text-text-quaternary">
                      {t('erp.shared.findingsCount', { count: 0 })}
                    </span>
                  )}
                </td>
              </tr>,
              isOpen ? (
                <tr
                  key={`${attempt.id}-findings`}
                  className="border-b border-surface-background last:border-0"
                >
                  <td colSpan={columns.length} className="bg-surface-background/40 px-4 py-4">
                    <RuleFindingsTable findings={attempt.findings} />
                  </td>
                </tr>
              ) : null,
            ]
          })}
        </tbody>
      </table>
    </RowsView>
  )
}

type Phase = 'idle' | 'running' | 'done'

/** One test invoice: the sample, the transaction type, then the pipeline and its verdict. */
function RunModal({ route, onClose }: { route: CertRoute; onClose: () => void }) {
  const { t } = useTranslation()
  const state = useErpMapping()
  const active = activeProfile(state)

  const [sampleId, setSampleId] = useState(state.samples[0]?.id ?? '')
  const [bits, setBits] = useState<boolean[]>(() => decompose(DEFAULT_TRANSACTION_TYPE[route]))
  const [advanced, setAdvanced] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [result, setResult] = useState<Attempt | 'noProfile' | 'noSample' | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const transactionType = compose(bits)
  const preset = CERT_ROUTES.find((r) => DEFAULT_TRANSACTION_TYPE[r] === transactionType)
  const typeOptions = [
    ...CERT_ROUTES.map((r) => ({
      value: r,
      label: t(`erp.certRoute.${r}`),
      hint: DEFAULT_TRANSACTION_TYPE[r],
    })),
    ...(preset
      ? []
      : [{ value: 'CUSTOM', label: t('erp.certification.custom'), hint: transactionType }]),
  ]

  const run = () => {
    setPhase('running')
    setResult(null)
    timer.current = window.setTimeout(() => {
      setResult(mappingStore.runCertification(route, sampleId, transactionType))
      setPhase('done')
    }, PIPELINE_MS)
  }

  const running = phase === 'running'
  const attempt = result && typeof result === 'object' ? result : null

  return (
    <Modal
      open
      onClose={onClose}
      title={t('erp.certification.modalTitle', { route: t(`erp.certRoute.${route}`) })}
      subtitle={t('erp.certification.modalSubtitle')}
      width={680}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <span className="text-xs font-medium text-text-quaternary">
            {active ? (
              <>
                {t('erp.certification.activeHash')}{' '}
                <span dir="ltr" className="inline-block font-mono text-[11px]">
                  {shortHash(active.contentHash)}
                </span>
              </>
            ) : null}
          </span>
          <span className="flex flex-wrap gap-2.5">
            <Button type="button" size="md" variant="secondary" onClick={onClose}>
              {phase === 'done' ? t('common.close') : t('common.cancel')}
            </Button>
            <Button type="button" size="md" onClick={run} disabled={running || !sampleId}>
              {phase === 'done' ? t('erp.certification.runAgain') : t('erp.certification.runNow')}
            </Button>
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <SamplePicker samples={state.samples} value={sampleId} onChange={setSampleId} />

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-primary">
            {t('erp.certification.transactionType')}
          </span>
          <Select
            value={preset ?? 'CUSTOM'}
            onChange={(value) => {
              if (isRoute(value)) setBits(decompose(DEFAULT_TRANSACTION_TYPE[value]))
            }}
            options={typeOptions}
            ariaLabel={t('erp.certification.transactionType')}
            disabled={running}
          />
          <p className="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-text-quaternary">
            <span>
              {t('erp.certification.composed')}{' '}
              <span
                dir="ltr"
                className="inline-block font-mono text-[11px] font-semibold text-text-secondary"
              >
                {transactionType}
              </span>
            </span>
            <button
              type="button"
              onClick={() => setAdvanced((current) => !current)}
              aria-expanded={advanced}
              className="font-semibold text-primary-700 transition-colors hover:text-primary-800"
            >
              {advanced ? t('erp.certification.hideAdvanced') : t('erp.certification.advanced')}
            </button>
          </p>
          {advanced ? (
            <div className="mt-2 rounded-sm bg-surface-background/60 p-4">
              <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
                {TRANSACTION_BITS.map((bit, index) => (
                  <Checkbox
                    key={bit}
                    label={`${index + 1} · ${t(`erp.certification.bits.${bit}`)}`}
                    checked={bits[index]}
                    disabled={running}
                    onChange={(event) =>
                      setBits((current) =>
                        current.map((on, i) => (i === index ? event.target.checked : on)),
                      )
                    }
                  />
                ))}
              </div>
              <p className="mt-3 text-[10px] font-medium leading-[1.4] text-text-tertiary">
                {t('erp.certification.bitsNote')}
              </p>
            </div>
          ) : null}
        </div>

        {running ? (
          <div
            role="status"
            className="flex items-center gap-3 rounded-sm bg-surface-background/60 p-4"
          >
            <span
              aria-hidden="true"
              className="size-8 shrink-0 animate-spin rounded-full border-2 border-primary-25 border-t-primary-700"
            />
            <div>
              <p className="text-sm font-semibold text-text-primary">
                {t('erp.certification.running')}
              </p>
              <p className="mt-0.5 text-xs font-medium leading-[1.5] text-text-tertiary">
                {t('erp.certification.runningNote')}
              </p>
            </div>
          </div>
        ) : null}

        {result === 'noProfile' ? (
          <div
            role="alert"
            className="flex gap-3 rounded-sm border border-pending-200 bg-pending-100/60 p-4"
          >
            <img src={infoIcon} alt="" aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="text-sm font-medium leading-[1.5] text-text-secondary">
                {t('erp.certification.noProfile')}
              </p>
              <Link
                to="/settings/erp-mapping/fields"
                className="mt-1.5 inline-block text-xs font-semibold text-primary-700 hover:text-primary-800"
              >
                {t('erp.certification.goToFields')}
              </Link>
            </div>
          </div>
        ) : null}

        {result === 'noSample' ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t('erp.certification.noSampleResult')}
          </p>
        ) : null}

        {attempt?.passed ? (
          <div role="status" className="rounded-sm border-s-4 border-s-[#4c6c5a] bg-[#f4f8f5] p-4">
            <p className="text-base font-semibold text-[#3d5648]">
              {t('erp.certification.passed')}
            </p>
            <p className="mt-1 text-sm font-medium leading-[1.5] text-text-secondary">
              {t('erp.certification.passedBody', {
                route: t(`erp.certRoute.${route}`),
                hash: shortHash(attempt.contentHash),
              })}
            </p>
          </div>
        ) : null}

        {attempt && !attempt.passed ? (
          <div role="status" className="flex flex-col gap-3">
            <div className="rounded-sm border-s-4 border-s-danger-700 bg-[#fdf4f2] p-4">
              <p className="text-base font-semibold text-danger-700">
                {t('erp.certification.failed')}
              </p>
              <p className="mt-1 text-sm font-medium leading-[1.5] text-text-secondary">
                {t('erp.certification.failedBody', { count: attempt.findings.length })}
              </p>
            </div>
            <RuleFindingsTable findings={attempt.findings} />
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
