import { useSearchParams } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ChartCard, ChartGrid, HorizontalBars, KpiCard, KpiRow, LedgerExport, ReportShell, SERIES } from '../../components/reports'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { activitySummaryPath, loadActivitySummary, type ActivitySummaryDto } from '../../api/compliance/activity'
import { defaultReportRange } from '../../api/reports/reports'
import { deliveredCount, shareOf } from '../../lib/activityLedger'
import { formatCount } from '../../lib/format'

const FIELD =
  'h-[40px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Reports › Compliance.
 *
 * The same ledger summary the Activity screen reads, presented as a period report. It answers
 * **was it reported, and was it reported in time** — the PASR Annex A obligation — and nothing
 * about tax.
 *
 * The prototype drew acceptance rates, rejection causes and a time-to-clear curve. Two of those
 * have no source: the summary carries counts and one median, not a reason breakdown, and there
 * is no acceptance verdict to rate. What replaces them is what the window actually holds.
 */
export function ReportsCompliancePage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [params, setParams] = useSearchParams()

  // The summary answers 400 without both, so the window is never empty.
  const fallback = defaultReportRange()
  const from = params.get('from') ?? fallback.from
  const to = params.get('to') ?? fallback.to

  const set = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (!value) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )

  const path = activitySummaryPath(from, to)
  const summary = useApiRead<ActivitySummaryDto>(path, () => loadActivitySummary(path))
  const data = summary.read.status === 'ready' ? summary.read.data : null

  return (
    <ReportShell titleKey="reports.compliance.title" subtitleKey="reports.compliance.ledgerSubtitle">
      <div className="flex flex-wrap items-end gap-3 rounded-md bg-surface-card p-4">
        <label className="flex flex-col gap-1 text-xs font-semibold text-text-quaternary">
          {t('reports.controls.from')}
          <input type="date" value={from} onChange={(event) => set('from', event.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-text-quaternary">
          {t('reports.controls.to')}
          <input type="date" value={to} onChange={(event) => set('to', event.target.value)} className={FIELD} />
        </label>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          {/*
            The export is of the LEDGER, not of the figures above it. This page is four counts and
            a median; a file of that proves nothing about individual documents, and what a tenant
            is asked to produce is every document they reported and when. Same window, so the file
            and the cards cannot disagree.
          */}
          <LedgerExport filters={{ from, to }} name="fawtir-compliance-ledger" />
          <Link
            to="/compliance/activity"
            className="inline-flex h-[40px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
          >
            {t('reports.compliance.openLedger')}
          </Link>
        </div>
      </div>

      {summary.read.status === 'loading' ? <LoadingNotice /> : null}
      {summary.read.status === 'failed' ? <ApiReadFailure error={summary.read.error} retry={summary.retry} /> : null}

      {data ? (
        data.documents === 0 ? (
          <p className="rounded-md bg-surface-card p-10 text-center text-sm font-medium text-text-quaternary">
            {t('reports.compliance.empty')}
          </p>
        ) : (
          <>
            <KpiRow>
              <KpiCard
                label={t('reports.compliance.kpi.documents')}
                value={formatCount(data.documents, language)}
                note={t('reports.compliance.kpi.documentsNote')}
              />
              <KpiCard
                label={t('reports.compliance.kpi.reported')}
                value={`${shareOf(deliveredCount(data.tdd_ack), data.documents)}%`}
                note={t('reports.compliance.kpi.reportedNote', { count: deliveredCount(data.tdd_ack) })}
              />
              <KpiCard
                label={t('reports.compliance.kpi.onTime')}
                value={`${shareOf(data.sla.met, data.sla.met + data.sla.missed)}%`}
                note={t('reports.compliance.kpi.onTimeNote', { missed: data.sla.missed, pending: data.sla.pending })}
              />
              <KpiCard
                label={t('reports.compliance.kpi.median')}
                value={
                  data.median_minutes_to_tdd_ack === null
                    ? '—'
                    : t('reports.compliance.minutes', { count: Math.round(data.median_minutes_to_tdd_ack) })
                }
                note={t('reports.compliance.kpi.medianNote')}
              />
            </KpiRow>

            <ChartGrid>
              <ChartCard
                title={t('reports.compliance.tddAcks')}
                legend={[{ label: t('reports.compliance.documents'), color: SERIES.strong }]}
                note={t('reports.compliance.acksNote')}
              >
                <HorizontalBars rows={ackRows(data.tdd_ack, t, language)} />
              </ChartCard>

              <ChartCard
                title={t('reports.compliance.invoiceAcks')}
                legend={[{ label: t('reports.compliance.documents'), color: SERIES.strong }]}
                note={t('reports.compliance.invoiceAcksNote')}
              >
                <HorizontalBars rows={ackRows(data.invoice_ack, t, language)} />
              </ChartCard>
            </ChartGrid>

            {data.dead_lettered > 0 ? (
              <p className="rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
                {t('reports.compliance.deadLettered', { count: data.dead_lettered })}
              </p>
            ) : null}

            <p className="text-xs font-medium leading-[1.5] text-text-quaternary">{t('activity.notATaxVerdict')}</p>
          </>
        )
      ) : null}
    </ReportShell>
  )
}

function ackRows(
  counts: ActivitySummaryDto['tdd_ack'],
  t: (key: string, values?: Record<string, unknown>) => string,
  language: string,
) {
  // Silence is listed with the rest rather than hidden or folded into a failure bucket: it is
  // most of a healthy window and a reader needs to see it as its own thing.
  return (
    [
      ['AP', counts.ap],
      ['AB', counts.ab],
      ['RE', counts.re],
      ['NONE', counts.none],
    ] as const
  ).map(([ack, value]) => ({
    label: t(`activity.ack.${ack}`),
    value,
    display: formatCount(value, language),
  }))
}
