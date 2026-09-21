import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  GroupedBars,
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
  loadVatReport,
  reportExportPath,
  vatPath,
  type ReportGranularity,
  type VatReportDto,
} from '../../api/reports/reports'
import { byPeriod, currenciesIn, outputByCategory, periodsOf, vatPosition } from '../../lib/vatReport'
import { formatAmount, formatCount } from '../../lib/format'

/**
 * Reports › VAT (position 7).
 *
 * The tenant's VAT position as the server computes it: **output** is VAT charged on issued
 * documents by EN 16931 category and rate, **input** is VAT the tenant was charged on received
 * bills, and **net** is what the two come to per period.
 *
 * Two things the prototype drew are gone because nothing backs them. There is no next-return due
 * date — the platform holds no filing calendar — and no reclaim-by-supplier chart, because an
 * input row carries one VAT total for the bill and names no supplier dimension to group by.
 */
export function ReportsVatPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [params, setParams] = useSearchParams()

  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const granularity = (params.get('granularity') as ReportGranularity | null) ?? 'QUARTER'

  const change = (next: { from?: string; to?: string; granularity?: ReportGranularity }) =>
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
  const path = vatPath(range)
  const report = useApiRead<VatReportDto>(path, () => loadVatReport(path))
  const data = report.read.status === 'ready' ? report.read.data : null

  return (
    <ReportShell titleKey="reports.vat.title" subtitleKey="reports.vat.subtitle">
      <ReportControls
        from={from}
        to={to}
        granularity={granularity}
        onChange={change}
        exports={{
          csv: reportExportPath('vat', 'csv', range),
          xlsx: reportExportPath('vat', 'xlsx', range),
          name: 'vat-report',
        }}
      />

      {report.read.status === 'loading' ? <LoadingNotice /> : null}
      {report.read.status === 'failed' ? <ApiReadFailure error={report.read.error} retry={report.retry} /> : null}

      {data ? <VatBody report={data} language={language} t={t} /> : null}
    </ReportShell>
  )
}

function VatBody({
  report,
  language,
  t,
}: {
  report: VatReportDto
  language: string
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  const currencies = currenciesIn(report)
  const currency = currencies[0] ?? 'OMR'
  const money = (value: number) => formatAmount(value, currency, language)
  const position = vatPosition(report)
  const periods = periodsOf(report)
  // Each series is walked once, not once per bar.
  const outputSeries = byPeriod(report.output, periods)
  const inputSeries = byPeriod(report.input, periods)
  const netSeries = byPeriod(report.net, periods)
  const categories = outputByCategory(report.output)

  if (periods.length === 0) {
    return (
      <p className="rounded-md bg-surface-card p-10 text-center text-sm font-medium text-text-quaternary">
        {t('reports.vat.empty')}
      </p>
    )
  }

  return (
    <>
      {currencies.length > 1 ? (
        // Every figure here is a plain sum. Adding OMR to USD would produce a number nobody can
        // use, so the page says which currencies are in the range rather than totalling across.
        <p className="rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
          {t('reports.vat.mixedCurrency', { currencies: currencies.join(', ') })}
        </p>
      ) : null}

      <KpiRow>
        <KpiCard label={t('reports.vat.kpi.collected')} value={money(position.output)} currency note={t('reports.vat.kpi.collectedNote')} />
        <KpiCard label={t('reports.vat.kpi.paid')} value={money(position.input)} currency note={t('reports.vat.kpi.paidNote')} />
        <KpiCard
          label={t(position.net >= 0 ? 'reports.vat.kpi.owed' : 'reports.vat.kpi.reclaim')}
          value={money(Math.abs(position.net))}
          currency
          // Which way it points is the server's NET rows, not a subtraction done here: a period
          // with input and no output has to read one way, and two answers would drift apart.
          note={t(position.net >= 0 ? 'reports.vat.kpi.owedNote' : 'reports.vat.kpi.reclaimNote')}
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.vat.byPeriod')}
          legend={[
            { label: t('reports.vat.collectedOnSales'), color: SERIES.strong },
            { label: t('reports.vat.paidOnPurchases'), color: SERIES.grey },
          ]}
          note={t('reports.vat.byPeriodNote')}
        >
          <GroupedBars
            data={inputSeries.map((paid, index) => ({ a: paid, b: outputSeries[index] }))}
            labels={periods}
            colors={[SERIES.grey, SERIES.strong]}
            labelWidth={56}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.vat.netByPeriod')}
          legend={[{ label: t('reports.vat.netPayable'), color: SERIES.strong }]}
          note={t('reports.vat.netByPeriodNote')}
        >
          <PlainBars values={netSeries} labels={periods} labelWidth={56} />
        </ChartCard>

        <ChartCard
          title={t('reports.vat.byTreatment')}
          legend={[{ label: t('reports.vat.taxableAmount'), color: SERIES.strong }]}
          note={t('reports.vat.byTreatmentNote')}
        >
          <HorizontalBars
            rows={categories.map((entry) => ({
              label: t(`reports.vat.category.${entry.category}`, { defaultValue: entry.category }),
              value: entry.taxable,
              display: `${formatCount(Math.round(entry.share), language)}% · ${money(entry.taxable)}`,
            }))}
          />
        </ChartCard>
      </ChartGrid>
    </>
  )
}
