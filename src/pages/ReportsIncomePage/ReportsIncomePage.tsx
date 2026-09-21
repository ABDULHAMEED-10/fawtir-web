import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  HorizontalBars,
  KpiCard,
  KpiRow,
  PlainBars,
  ReportControls,
  ReportShell,
  SERIES,
} from '../../components/reports'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  loadVolumeReport,
  reportExportPath,
  volumePath,
  type ReportGranularity,
  type VolumeGroupBy,
  type VolumeReportDto,
} from '../../api/reports/reports'
import { GROUPINGS, byGroup, byPeriodTotal, periodsOfVolume } from '../../lib/volumeReport'
import { formatAmount, formatCount } from '../../lib/format'

/**
 * Reports › Income (position 7).
 *
 * Issued documents only. The adapter reads `FROM invoice.invoices`, so this is the sell side —
 * there is no received-document equivalent, which is why the Expenditure report has no endpoint
 * behind it.
 *
 * **Amounts are signed.** A credit note subtracts, so a period's total is net of corrections
 * while `documents` counts every issued document whatever its sign. Cancelled documents are
 * counted separately and contribute to no amount, so they are shown as a count rather than
 * folded into a total that would then not reconcile.
 */
export function ReportsIncomePage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [params, setParams] = useSearchParams()

  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const granularity = (params.get('granularity') as ReportGranularity | null) ?? 'MONTH'
  const groupBy = (params.get('group_by') as VolumeGroupBy | null) ?? 'NONE'

  const change = (next: Record<string, string | undefined>) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current)
        for (const [key, value] of Object.entries(next)) {
          if (!value) updated.delete(key)
          else updated.set(key, value)
        }
        return updated
      },
      { replace: true },
    )

  const range = { from: from || null, to: to || null, granularity }
  const path = volumePath(range, groupBy)
  const report = useApiRead<VolumeReportDto>(path, () => loadVolumeReport(path))
  const data = report.read.status === 'ready' ? report.read.data : null

  return (
    <ReportShell titleKey="reports.income.title" subtitleKey="reports.income.subtitle">
      <ReportControls
        from={from}
        to={to}
        granularity={granularity}
        onChange={change}
        exports={{
          csv: reportExportPath('volume', 'csv', range, groupBy),
          xlsx: reportExportPath('volume', 'xlsx', range, groupBy),
          name: 'income-report',
        }}
        extra={
          <label className="flex flex-col gap-1 text-xs font-semibold text-text-quaternary">
            {t('reports.income.groupBy')}
            <select
              value={groupBy}
              onChange={(event) => change({ group_by: event.target.value })}
              className="h-[40px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500"
            >
              {GROUPINGS.map((option) => (
                <option key={option} value={option}>
                  {t(`reports.income.grouping.${option}`)}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {report.read.status === 'loading' ? <LoadingNotice /> : null}
      {report.read.status === 'failed' ? <ApiReadFailure error={report.read.error} retry={report.retry} /> : null}

      {data ? <VolumeBody report={data} groupBy={groupBy} language={language} t={t} /> : null}
    </ReportShell>
  )
}

function VolumeBody({
  report,
  groupBy,
  language,
  t,
}: {
  report: VolumeReportDto
  groupBy: VolumeGroupBy
  language: string
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  const totals = report.totals
  const primary = totals[0]
  const money = (value: number, currency = primary?.currency ?? 'OMR') => formatAmount(value, currency, language)
  const periods = periodsOfVolume(report.rows)
  const series = byPeriodTotal(report.rows, periods)
  const cancelled = report.rows.reduce((sum, row) => sum + row.cancelled, 0)
  const groups = byGroup(report.rows)

  if (report.rows.length === 0) {
    return (
      <p className="rounded-md bg-surface-card p-10 text-center text-sm font-medium text-text-quaternary">
        {t('reports.income.empty')}
      </p>
    )
  }

  return (
    <>
      {totals.length > 1 ? (
        <p className="rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
          {t('reports.vat.mixedCurrency', { currencies: totals.map((entry) => entry.currency).join(', ') })}
        </p>
      ) : null}

      <KpiRow>
        <KpiCard
          label={t('reports.income.kpi.invoiced')}
          value={money(primary?.totalAmount ?? 0)}
          currency
          note={t('reports.income.kpi.invoicedNote')}
        />
        <KpiCard
          label={t('reports.income.kpi.taxable')}
          value={money(primary?.taxableAmount ?? 0)}
          currency
          note={t('reports.income.kpi.taxableNote')}
        />
        <KpiCard
          label={t('reports.income.kpi.documents')}
          value={formatCount(primary?.documents ?? 0, language)}
          note={t(cancelled > 0 ? 'reports.income.kpi.documentsWithCancelled' : 'reports.income.kpi.documentsNote', {
            count: cancelled,
          })}
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.income.byPeriod')}
          legend={[{ label: t('reports.income.invoiced'), color: SERIES.strong }]}
          note={t('reports.income.byPeriodNote')}
        >
          <PlainBars values={series} labels={periods} labelWidth={56} />
        </ChartCard>

        {groupBy !== 'NONE' ? (
          <ChartCard
            title={t(`reports.income.by.${groupBy}`)}
            legend={[{ label: t('reports.income.invoiced'), color: SERIES.strong }]}
            note={t('reports.income.byGroupNote')}
          >
            <HorizontalBars
              rows={groups.map((group) => ({
                // The server's own label, falling back to the key: a grouping it can produce but
                // this page has never heard of still reads as something rather than as blank.
                label: group.label ?? group.key ?? t('reports.income.ungrouped'),
                value: group.total,
                display: money(group.total),
              }))}
            />
          </ChartCard>
        ) : null}
      </ChartGrid>
    </>
  )
}
