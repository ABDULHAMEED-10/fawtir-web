import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  DivergingBars,
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
  cashFlowPath,
  defaultReportRange,
  loadCashFlowReport,
  reportExportPath,
  type CashFlowReportDto,
  type ReportGranularity,
} from '../../api/reports/reports'
import {
  inAndOut,
  netByPeriod,
  periodsOfCashFlow,
  periodsWithNegativeDirection,
} from '../../lib/cashFlowReport'
import { formatAmount } from '../../lib/format'

/**
 * Reports › Cash flow — money in against money out.
 *
 * **Cash movement recorded in Fawtir. Not a bank position and not a forecast.** It counts payments
 * somebody recorded against an invoice or a bill; it knows nothing about bank accounts, payments
 * nobody recorded, or money that moved without a document. The page says so in a line, because a
 * chart headed "Cash flow" that a reader takes for their balance is the same class of error as the
 * OTA verdict the Activity screen had to drop — a screen implying knowledge the platform does not
 * have.
 *
 * Buckets are on the payment date, not the issue date the other reports use, so an invoice issued
 * in January and settled in March appears in January on Income and in March here.
 *
 * Three things the prototype promised are gone rather than faked: "Due out in 30 days", "The next
 * eight weeks" and "Where it went". The first two are forecasts over commitments this endpoint
 * does not report, and the third needs a spend category the payment tables do not carry.
 */
export function ReportsCashFlowPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [params, setParams] = useSearchParams()

  const fallback = defaultReportRange()
  const from = params.get('from') ?? fallback.from
  const to = params.get('to') ?? fallback.to
  const granularity = (params.get('granularity') as ReportGranularity | null) ?? 'MONTH'

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
  const path = cashFlowPath(range)
  const report = useApiRead<CashFlowReportDto>(path, () => loadCashFlowReport(path))
  const data = report.read.status === 'ready' ? report.read.data : null

  return (
    <ReportShell titleKey="reports.cashFlow.title" subtitleKey="reports.cashFlow.subtitle">
      <ReportControls
        from={from}
        to={to}
        granularity={granularity}
        onChange={change}
        exports={{
          csv: reportExportPath('cash-flow', 'csv', range),
          xlsx: reportExportPath('cash-flow', 'xlsx', range),
          name: 'cash-flow-report',
        }}
      />

      <p className="rounded-md bg-surface-card p-3 text-sm font-medium text-text-quaternary">
        {t('reports.cashFlow.whatThisIs')}
      </p>

      {report.read.status === 'loading' ? <LoadingNotice /> : null}
      {report.read.status === 'failed' ? <ApiReadFailure error={report.read.error} retry={report.retry} /> : null}

      {data ? <CashFlowBody report={data} language={language} t={t} /> : null}
    </ReportShell>
  )
}

function CashFlowBody({
  report,
  language,
  t,
}: {
  report: CashFlowReportDto
  language: string
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  const totals = report.totals
  const primary = totals[0]
  const money = (value: number, currency = primary?.currency ?? 'OMR') => formatAmount(value, currency, language)
  const periods = periodsOfCashFlow(report.rows)
  const movement = inAndOut(report.rows, periods)
  const net = netByPeriod(report.rows, periods)
  const negative = periodsWithNegativeDirection(report.rows)

  if (report.rows.length === 0) {
    return (
      <p className="rounded-md bg-surface-card p-10 text-center text-sm font-medium text-text-quaternary">
        {t('reports.cashFlow.empty')}
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
          label={t('reports.cashFlow.kpi.in')}
          value={money(primary?.received ?? 0)}
          currency
          note={t('reports.cashFlow.kpi.inNote')}
        />
        <KpiCard
          label={t('reports.cashFlow.kpi.out')}
          value={money(primary?.paidOut ?? 0)}
          currency
          note={t('reports.cashFlow.kpi.outNote')}
        />
        <KpiCard
          label={t('reports.cashFlow.kpi.kept')}
          value={money(primary?.net ?? 0)}
          currency
          note={t('reports.cashFlow.kpi.keptNote')}
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.cashFlow.monthlyInOut')}
          legend={[
            { label: t('reports.cashFlow.moneyIn'), color: SERIES.green },
            { label: t('reports.cashFlow.moneyOut'), color: SERIES.brown },
          ]}
          note={
            // Named rather than drawn: neither chart can render a negative length, so a period
            // where reversals outweighed payments would otherwise read as a small positive.
            negative.length > 0
              ? t('reports.cashFlow.reversalHeavy', { periods: negative.join(', ') })
              : t('reports.cashFlow.monthlyInOutNote')
          }
        >
          <DivergingBars data={movement} labels={periods} labelWidth={56} />
        </ChartCard>

        <ChartCard
          // "Surplus" was the prototype's word for this and it was wrong the moment the figures
          // were real: locally all three periods are deficits, and a legend promising a surplus
          // over three negative numbers is the same overclaim as a 99.89% share printed as 100%.
          title={t('reports.cashFlow.whatYouKept')}
          legend={[{ label: t('reports.cashFlow.surplus'), color: SERIES.strong }]}
          note={t('reports.cashFlow.whatYouKeptNote')}
        >
          <HorizontalBars
            rows={periods.map((period, index) => ({
              label: period,
              value: net[index],
              display: money(net[index]),
            }))}
          />
        </ChartCard>
      </ChartGrid>
    </>
  )
}
