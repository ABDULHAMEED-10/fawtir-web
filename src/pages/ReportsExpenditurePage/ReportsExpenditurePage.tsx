import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  HorizontalBars,
  KpiCard,
  KpiRow,
  ReportControls,
  ReportShell,
  SERIES,
} from '../../components/reports'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  defaultReportRange,
  expenditurePath,
  loadExpenditureReport,
  reportExportPath,
  type ExpenditureGroupBy,
  type ExpenditureReportDto,
  type ReportGranularity,
} from '../../api/reports/reports'
import {
  EXPENDITURE_GROUPINGS,
  byExpenditureGroup,
  byPeriodSpend,
  periodsOfExpenditure,
  topGroupShare,
} from '../../lib/expenditureReport'
import { formatAmount, formatCount } from '../../lib/format'

/**
 * Reports › Expenditure — what the tenant SPENT.
 *
 * Received documents only. `/reports/expenditure` reads `peppol.bills`, which is a different
 * ledger from the Income report's `invoice.invoices` with no overlap between them — the two
 * cannot be the same endpoint with a filter.
 *
 * **Amounts are signed.** A supplier credit note (381/261) subtracts and a debit note (383) adds,
 * the same signing the VAT report already applies to this table, so a period reads net of
 * corrections. Bars are drawn from those signed figures and the number beside each bar is the
 * truth of the row: a period that nets negative loses its bar but keeps its figure, rather than
 * being drawn as if it were a positive one.
 *
 * Grouping by category is only as good as what was typed — the column is free text with no
 * catalogue (a decision taken separately on 2026-09-22). Bills with none recorded come back under
 * the empty key and are shown as "Uncategorised"; they are never dropped, because dropping them
 * would leave most of the spend out of a spend report.
 */
export function ReportsExpenditurePage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [params, setParams] = useSearchParams()

  const fallback = defaultReportRange()
  const from = params.get('from') ?? fallback.from
  const to = params.get('to') ?? fallback.to
  const granularity = (params.get('granularity') as ReportGranularity | null) ?? 'MONTH'
  const groupBy = (params.get('group_by') as ExpenditureGroupBy | null) ?? 'NONE'

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

  const range = { from, to, granularity }
  const path = expenditurePath(range, groupBy)
  const report = useApiRead<ExpenditureReportDto>(path, () => loadExpenditureReport(path))
  const data = report.read.status === 'ready' ? report.read.data : null

  return (
    <ReportShell titleKey="reports.expenditure.title" subtitleKey="reports.expenditure.subtitle">
      <ReportControls
        from={from}
        to={to}
        granularity={granularity}
        onChange={change}
        exports={{
          csv: reportExportPath('expenditure', 'csv', range, groupBy),
          xlsx: reportExportPath('expenditure', 'xlsx', range, groupBy),
          name: 'expenditure-report',
        }}
        extra={
          <label className="flex flex-col gap-1 text-xs font-semibold text-text-quaternary">
            {t('reports.expenditure.groupBy')}
            <select
              value={groupBy}
              onChange={(event) => change({ group_by: event.target.value })}
              className="h-[40px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500"
            >
              {EXPENDITURE_GROUPINGS.map((option) => (
                <option key={option} value={option}>
                  {t(`reports.expenditure.grouping.${option}`)}
                </option>
              ))}
            </select>
          </label>
        }
      />

      {report.read.status === 'loading' ? <LoadingNotice /> : null}
      {report.read.status === 'failed' ? <ApiReadFailure error={report.read.error} retry={report.retry} /> : null}

      {data ? <ExpenditureBody report={data} groupBy={groupBy} language={language} t={t} /> : null}
    </ReportShell>
  )
}

function ExpenditureBody({
  report,
  groupBy,
  language,
  t,
}: {
  report: ExpenditureReportDto
  groupBy: ExpenditureGroupBy
  language: string
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  const totals = report.totals
  const primary = totals[0]
  const money = (value: number, currency = primary?.currency ?? 'OMR') => formatAmount(value, currency, language)
  const periods = periodsOfExpenditure(report.rows)
  const series = byPeriodSpend(report.rows, periods)
  const groups = byExpenditureGroup(report.rows)
  const share = topGroupShare(groups)

  if (report.rows.length === 0) {
    return (
      <p className="rounded-md bg-surface-card p-10 text-center text-sm font-medium text-text-quaternary">
        {t('reports.expenditure.empty')}
      </p>
    )
  }

  /** The server's key, translated where the platform owns the vocabulary (sources), shown as
   *  typed where it does not (categories), and named as unset where there is nothing at all. */
  const groupName = (key: string | null, label: string | null) => {
    if (groupBy === 'SOURCE' && key) return t(`reports.expenditure.source.${key}`, { defaultValue: key })
    if (groupBy === 'CATEGORY' && !key) return t('reports.expenditure.uncategorised')
    return label || key || t('reports.expenditure.ungrouped')
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
          label={t('reports.expenditure.kpi.spend')}
          value={money(primary?.totalAmount ?? 0)}
          currency
          note={t('reports.expenditure.kpi.spendNote')}
        />
        <KpiCard
          label={t('reports.expenditure.kpi.net')}
          value={money(primary?.netAmount ?? 0)}
          currency
          note={t('reports.expenditure.kpi.netNote')}
        />
        <KpiCard
          label={t('reports.expenditure.kpi.vat')}
          value={money(primary?.vatAmount ?? 0)}
          currency
          note={t('reports.expenditure.kpi.vatNote')}
        />
        <KpiCard
          label={t('reports.expenditure.kpi.documents')}
          value={formatCount(primary?.documents ?? 0, language)}
          note={t('reports.expenditure.kpi.documentsNote')}
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.expenditure.byPeriod')}
          legend={[{ label: t('reports.expenditure.spend'), color: SERIES.strong }]}
          note={t('reports.expenditure.byPeriodNote')}
        >
          <HorizontalBars
            rows={periods.map((period, index) => ({
              label: period,
              value: series[index],
              display: money(series[index]),
            }))}
          />
        </ChartCard>

        {groupBy !== 'NONE' ? (
          <ChartCard
            title={t(`reports.expenditure.by.${groupBy}`)}
            legend={[{ label: t('reports.expenditure.spend'), color: SERIES.strong }]}
            note={
              share === null
                ? t('reports.expenditure.byGroupNote')
                : t('reports.expenditure.topShare', {
                    name: groupName(groups[0].key, groups[0].label),
                    percent: share,
                  })
            }
          >
            <HorizontalBars
              rows={groups.map((group) => ({
                label: groupName(group.key, group.label),
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
