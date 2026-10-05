import { useState, useSyncExternalStore } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ErpShell, Pill, RouteStatePill } from './ErpShell'
import { GUIDED_MAPPING_FORMAT, useErpMapping, useErpMappingReload } from './ErpMappingGate'
import { SamplePicker } from './shared/SamplePicker'
import { Mono, THEAD_ROW } from './overview/idiom'
import { Button, Checkbox, Input, Modal, RowsView, Select } from '../../components/ui'
import {
  MAPPING_CERTIFICATION_ROUTES,
  runMappingCertification,
  type MappingCertificationHistoryDto,
  type MappingCertificationRoute,
  type MappingTestInvoiceReportDto,
} from '../../api/erp/mapping'
import { ApiError } from '../../api'
import {
  DEFAULT_TRANSACTION_TYPE,
  TRANSACTION_BITS,
  composeTransactionType,
  decomposeTransactionType,
  shortHash,
} from '../../lib/erp/mappingState'
import { sessionSamples } from '../../lib/erp/sample'
import { formatInstant, formatInstantDay } from '../../lib/format'
import { documentKindName } from './shared/documentKind'
import { RuleFindingsTable } from './shared/RuleFindingsTable'
import { findingLayerName } from './shared/documentKind'
import infoIcon from '../../assets/settings/info.svg'

const isRoute = (value: string | null): value is MappingCertificationRoute =>
  MAPPING_CERTIFICATION_ROUTES.includes(value as MappingCertificationRoute)


/** Routes whose document corrects an earlier one, and therefore need the predecessor's identity. */
const CORRECTION_ROUTES: MappingCertificationRoute[] = ['CREDIT_NOTE']

/**
 * Settings › Integration › ERP mapping › Certification (docs/erp-and-console-plan.md §2.4, A.4).
 *
 * Four routes, each proved against a real sample before invoices of that kind can be sent — the
 * FR-005 gate. A pass is tied to the hash of the expression that earned it, so the moment the
 * mapping changes the pass stops being found and the route goes stale. That is the server's
 * behaviour and this screen only reports it: nothing here decides that a mapping is certified, and
 * there is deliberately no override.
 *
 * A failed run is a 200 carrying the report, not an error. It is the expected outcome while a
 * tenant iterates, and the findings are what they came for.
 */
export function ErpCertificationPage() {
  const { t, i18n } = useTranslation()
  const view = useErpMapping()
  const [params, setParams] = useSearchParams()

  const anyStale = MAPPING_CERTIFICATION_ROUTES.some(
    (route) => view.certification[route].state === 'STALE',
  )

  const requested = params.get('route')
  const [open, setOpen] = useState<MappingCertificationRoute | null>(
    isRoute(requested) ? requested : null,
  )
  const openRun = (route: MappingCertificationRoute) => {
    setOpen(route)
    setParams({ route }, { replace: true })
  }
  const closeRun = () => {
    setOpen(null)
    setParams({}, { replace: true })
  }

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

      {!view.activeProfile ? (
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
        {MAPPING_CERTIFICATION_ROUTES.map((route) => {
          const { state, last, pass, status } = view.certification[route]
          const attemptedAt = status.certified
            ? (pass?.certified_at ?? status.certified_at ?? last?.certified_at ?? null)
            : (last?.certified_at ?? null)
          const testedHash = status.certified_content_hash ?? last?.content_hash ?? null
          return (
            <article key={route} className="flex flex-col gap-3 rounded-md bg-surface-card p-5">
              {/* The pill wraps under a long route name rather than the name breaking at its hyphen. */}
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="whitespace-nowrap text-lg font-semibold leading-[1.2] text-text-primary">
                  {t(`erp.certRoute.${route}`)}
                </h3>
                <RouteStatePill state={state} />
              </div>

              {/*
                Both hashes, because the interesting failure is the mismatch: a tenant who
                certified and then edited sees a certified hash that no longer equals the active
                one, which is exactly why submission started being refused. The date sits on its
                own line; the hash beside "Certified on" used to read as if it were the date.
              */}
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-medium">
                <dt className="text-text-quaternary">{t('erp.certification.activeHash')}</dt>
                <dd className="text-start">
                  <Mono className="font-medium text-text-secondary">
                    {shortHash(status.active_content_hash)}
                  </Mono>
                </dd>
                <dt className="text-text-quaternary">
                  {status.certified
                    ? t('erp.certification.passHash')
                    : t('erp.certification.lastHash')}
                </dt>
                <dd className="text-text-secondary">
                  {attemptedAt
                    ? formatInstantDay(attemptedAt, i18n.language)
                    : t('erp.certification.neverTried')}
                </dd>
                {testedHash ? (
                  <>
                    <dt className="text-text-quaternary">{t('erp.certification.contentHash')}</dt>
                    <dd className="text-start">
                      <Mono
                        className={[
                          'font-medium',
                          !status.certified && last ? 'text-pending-700' : 'text-text-secondary',
                        ].join(' ')}
                      >
                        {shortHash(testedHash)}
                      </Mono>
                    </dd>
                  </>
                ) : null}
              </dl>

              {!status.certified && last ? (
                <p className="text-xs font-medium leading-[1.5] text-text-tertiary">
                  {t('erp.shared.findingsCount', { count: last.error_count })}
                </p>
              ) : null}

              {/*
                Our own sentence for why the route is not certified. The server's `reason` is
                English prose for developers, so the reader gets this instead (as on the Bridge).
              */}
              {!status.certified && view.activeProfile ? (
                <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
                  {t(`erp.certification.why.${state}`)}
                </p>
              ) : null}

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
        {view.history.length === 0 ? (
          <p className="px-5 pb-5 text-sm font-medium text-text-quaternary">
            {t('erp.certification.noHistory')}
          </p>
        ) : (
          <div className="px-5 pb-5">
            <History attempts={view.history} />
          </div>
        )}
      </section>

      {open ? <RunModal route={open} onClose={closeRun} /> : null}
    </ErpShell>
  )
}

/**
 * Every recorded attempt, newest first.
 *
 * Failures are retained deliberately — the gate refusing before it admitted is what an
 * accreditation dossier asks for — so this is the dossier, not a debug log.
 */
function History({ attempts }: { attempts: MappingCertificationHistoryDto[] }) {
  const { t, i18n } = useTranslation()

  const columns = ['route', 'result', 'hash', 'kind', 'type', 'when', 'findings'] as const

  return (
    <RowsView>
      <table className="w-full min-w-[860px] border-collapse">
        <thead>
          <tr className={THEAD_ROW}>
            {columns.map((column) => (
              <th key={column} className="h-[40px] px-4 text-start font-semibold">
                {t(`erp.certification.col.${column}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {attempts.map((attempt) => {
            return (
              <tr key={attempt.id} className="border-b border-surface-background last:border-0">
                <td className="whitespace-nowrap px-4 py-3 align-top text-sm font-semibold text-text-primary">
                  {t(`erp.certRoute.${attempt.route}`)}
                </td>
                <td className="px-4 py-3 align-top">
                  <Pill
                    tone={attempt.verdict === 'PASSED' ? 'success' : 'danger'}
                    label={
                      attempt.verdict === 'PASSED'
                        ? t('erp.certification.passedPill')
                        : t('erp.certification.failedPill')
                    }
                  />
                </td>
                <td className="px-4 py-3 text-start align-top">
                  <Mono className="font-normal text-text-secondary">
                    {shortHash(attempt.content_hash)}
                  </Mono>
                </td>
                <td className="px-4 py-3 align-top text-sm font-medium text-text-secondary">
                  {documentKindName(t, attempt.document_kind)}
                </td>
                <td className="px-4 py-3 text-start align-top">
                  <Mono className="font-normal text-text-secondary">{attempt.transaction_type}</Mono>
                </td>
                <td className="whitespace-nowrap px-4 py-3 align-top text-sm font-medium text-text-secondary tabular-nums">
                  {formatInstant(attempt.certified_at, i18n.language)}
                </td>
                <td className="px-4 py-3 align-top text-sm font-medium text-text-secondary">
                  {attempt.summary ? (
                    <span dir="auto" className="block max-w-[320px] leading-[1.5]">
                      {attempt.summary}
                    </span>
                  ) : (
                    t('erp.shared.findingsCount', { count: attempt.error_count })
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </RowsView>
  )
}

/**
 * One test invoice.
 *
 * The body is the same envelope `POST /v1/invoices` takes, because the run rehearses that exact
 * request — the sample as `document`, plus the PINT-OM supplement no mapping can produce. For a
 * credit note the supplement additionally carries the predecessor's identity and the reason code,
 * which IBR-032-OM and IBR-023-OM require; the reader supplies them because only they know which
 * invoice is being corrected.
 */
function RunModal({
  route,
  onClose,
}: {
  route: MappingCertificationRoute
  onClose: () => void
}) {
  const { t } = useTranslation()
  const view = useErpMapping()
  const reload = useErpMappingReload()
  const samples = useSyncExternalStore(sessionSamples.subscribe, sessionSamples.snapshot)

  const [sampleId, setSampleId] = useState(samples[0]?.id ?? '')
  const [bits, setBits] = useState<boolean[]>(() =>
    decomposeTransactionType(DEFAULT_TRANSACTION_TYPE[route]),
  )
  const [advanced, setAdvanced] = useState(false)
  const [issueTime, setIssueTime] = useState('12:00')
  const [precedingNumber, setPrecedingNumber] = useState('')
  const [precedingDate, setPrecedingDate] = useState('')
  const [precedingUuid, setPrecedingUuid] = useState('')
  const [reasonCode, setReasonCode] = useState('CAN')
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<MappingTestInvoiceReportDto | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const sample = samples.find((s) => s.id === sampleId)
  const transactionType = composeTransactionType(bits)
  const needsCorrection = CORRECTION_ROUTES.includes(route)
  const correctionReady =
    !needsCorrection || (precedingNumber && precedingDate && precedingUuid && reasonCode)
  const canRun = Boolean(sample) && Boolean(correctionReady) && !running

  const presetRoute = MAPPING_CERTIFICATION_ROUTES.find(
    (r) => DEFAULT_TRANSACTION_TYPE[r] === transactionType,
  )
  const typeOptions = [
    ...MAPPING_CERTIFICATION_ROUTES.map((r) => ({
      value: r,
      label: t(`erp.certRoute.${r}`),
      hint: DEFAULT_TRANSACTION_TYPE[r],
    })),
    ...(presetRoute
      ? []
      : [{ value: 'CUSTOM', label: t('erp.certification.custom'), hint: transactionType }]),
  ]

  const run = async () => {
    if (!sample) return
    setRunning(true)
    setReport(null)
    setFailure(null)
    try {
      const answer = await runMappingCertification(GUIDED_MAPPING_FORMAT, route, {
        document: sample.payload,
        supplement: {
          issue_time: `${issueTime}:00`,
          transaction_type: transactionType,
          preceding_invoice_number: needsCorrection ? precedingNumber : null,
          preceding_invoice_date: needsCorrection ? precedingDate : null,
          preceding_invoice_uuid: needsCorrection ? precedingUuid : null,
          credit_note_reason_code: needsCorrection ? reasonCode : null,
        },
      })
      setReport(answer)
      // A pass changes what the gate will admit, so the roll-up above is now behind.
      reload()
    } catch (error: unknown) {
      // Only a malformed *request* is an error here; a failing test invoice is a 200 report.
      setFailure(
        error instanceof ApiError && typeof error.problem.detail === 'string'
          ? error.problem.detail
          : t('erp.certification.requestFailed'),
      )
    } finally {
      setRunning(false)
    }
  }

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
            {view.activeProfile ? (
              <>
                {t('erp.certification.activeHash')}{' '}
                <span dir="ltr" className="inline-block font-mono text-[11px]">
                  {shortHash(view.activeProfile.contentHash)}
                </span>
              </>
            ) : null}
          </span>
          <span className="flex flex-wrap gap-2.5">
            <Button type="button" size="md" variant="secondary" onClick={onClose}>
              {report ? t('common.close') : t('common.cancel')}
            </Button>
            <Button type="button" size="md" onClick={run} disabled={!canRun}>
              {running
                ? t('erp.shared.working')
                : report
                  ? t('erp.certification.runAgain')
                  : t('erp.certification.runNow')}
            </Button>
          </span>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <SamplePicker samples={samples} value={sampleId} onChange={setSampleId} />

        <Input
          bordered
          type="time"
          label={t('erp.certification.issueTime')}
          hint={t('erp.certification.issueTimeNote')}
          value={issueTime}
          onChange={(event) => setIssueTime(event.target.value)}
        />

        {needsCorrection ? (
          <fieldset className="flex flex-col gap-3 rounded-sm bg-surface-background/60 p-4">
            <legend className="px-1 text-sm font-medium text-text-primary">
              {t('erp.certification.correction')}
            </legend>
            <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('erp.certification.correctionNote')}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                bordered
                label={t('erp.certification.precedingNumber')}
                value={precedingNumber}
                onChange={(event) => setPrecedingNumber(event.target.value)}
              />
              <Input
                bordered
                type="date"
                label={t('erp.certification.precedingDate')}
                value={precedingDate}
                onChange={(event) => setPrecedingDate(event.target.value)}
              />
              <Input
                bordered
                label={t('erp.certification.precedingUuid')}
                value={precedingUuid}
                onChange={(event) => setPrecedingUuid(event.target.value)}
              />
              <Input
                bordered
                label={t('erp.certification.reasonCode')}
                value={reasonCode}
                onChange={(event) => setReasonCode(event.target.value.toUpperCase())}
              />
            </div>
          </fieldset>
        ) : null}

        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-text-primary">
            {t('erp.certification.transactionType')}
          </span>
          <Select
            value={presetRoute ?? 'CUSTOM'}
            onChange={(value) => {
              if (isRoute(value)) setBits(decomposeTransactionType(DEFAULT_TRANSACTION_TYPE[value]))
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

        {failure ? (
          <p role="alert" className="text-sm font-medium leading-[1.5] text-danger-700">
            {failure}
          </p>
        ) : null}

        {report?.passed ? (
          <div role="status" className="rounded-sm border-s-4 border-s-[#4c6c5a] bg-[#f4f8f5] p-4">
            <p className="text-base font-semibold text-[#3d5648]">
              {t('erp.certification.passed')}
            </p>
            <p className="mt-1 text-sm font-medium leading-[1.5] text-text-secondary">
              {t('erp.certification.passedBody', {
                route: t(`erp.certRoute.${route}`),
                hash: shortHash(report.content_hash),
              })}
            </p>
            {report.warnings.length > 0 ? (
              <div className="mt-3">
                <p className="text-xs font-semibold text-pending-700">
                  {t('erp.certification.warningsOnPass', { count: report.warning_count })}
                </p>
                <div className="mt-2">
                  <RuleFindingsTable findings={report.warnings} />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {report && !report.passed ? (
          <div role="status" className="flex flex-col gap-3">
            <div className="rounded-sm border-s-4 border-s-danger-700 bg-[#fdf4f2] p-4">
              <p className="text-base font-semibold text-danger-700">
                {t('erp.certification.failed')}
              </p>
              <p className="mt-1 text-sm font-medium leading-[1.5] text-text-secondary">
                {t('erp.certification.failedStage', {
                  stage: t(`erp.certification.stage.${report.stage}`, {
                    defaultValue: report.stage,
                  }),
                  layer: report.failed_at ? findingLayerName(t, report.failed_at) : '—',
                  count: report.error_count,
                })}
              </p>
              {report.message ? (
                <p className="mt-1 text-sm font-medium leading-[1.5] text-text-secondary">
                  {report.message}
                </p>
              ) : null}
            </div>
            <RuleFindingsTable findings={report.errors} />
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
