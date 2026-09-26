import { useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  GroupedBars,
  HorizontalBars,
  KpiCard,
  KpiRow,
  LineChart,
  OmrNote,
  OmrSign,
  ReportShell,
  SERIES,
  StackedBars,
  useReportPeriod,
} from '../../components/reports'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  loadVolumeReport,
  reportExportPath,
  volumePath,
  type VolumeReportDto,
} from '../../api/reports/reports'
import {
  MONTH_IDS,
  historyWindow,
  indexOfMax,
  monthIndexOf,
  periodWindows,
  quartersOfYear,
  seriesOver,
  shareOfTotal,
  sumByMonth,
  sumOver,
  trailingMonths,
  yearProgress,
  type ReportPeriod,
} from '../../lib/reportPeriod'
import { countPill, percentPill, shortPercent, wholeFigure } from '../../lib/reportFigures'
import { formatAmount, formatCount } from '../../lib/format'

/**
 * Reports › Income (Figma 154:105575).
 *
 * Issued documents only: `/reports/volume` reads `invoice.invoices`, the sell side. Two reads
 * feed the frame. The history (monthly buckets from 1 January two years back) draws the four
 * figures, the trailing twelve months, this year's quarters against last year's and the annual
 * line; the customer grouping over the pill's window draws Top customers.
 *
 * **Amounts are signed.** A credit note subtracts, so every figure is net of corrections, and
 * "net of VAT" is the report's taxable amount. "Invoices sent" is the report's document count;
 * cancelled documents carry no amount.
 */
export function ReportsIncomePage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [period] = useReportPeriod()
  const today = useMemo(() => new Date(), [])
  const windows = periodWindows(period, today)
  const history = historyWindow(today)

  const historyPath = volumePath({ ...history, granularity: 'MONTH' }, 'NONE')
  const report = useApiRead<VolumeReportDto>(historyPath, () => loadVolumeReport(historyPath))

  // YEAR buckets: the card ranks customers over the whole window, so finer buckets would only
  // be added back together here.
  const customersPath = volumePath(
    { from: windows.current.from, to: windows.current.to, granularity: 'YEAR' },
    'CUSTOMER',
  )
  const customers = useApiRead<VolumeReportDto>(customersPath, () =>
    loadVolumeReport(customersPath),
  )

  const range = {
    from: windows.current.from,
    to: windows.current.to,
    granularity: 'MONTH' as const,
  }

  return (
    <ReportShell
      titleKey="reports.income.title"
      subtitleKey="reports.income.subtitle"
      downloads={[
        {
          format: 'xlsx',
          path: reportExportPath('volume', 'xlsx', range, 'NONE'),
          name: 'income-report',
        },
        {
          format: 'csv',
          path: reportExportPath('volume', 'csv', range, 'NONE'),
          name: 'income-report',
        },
      ]}
    >
      {report.read.status === 'loading' ? <LoadingNotice /> : null}
      {report.read.status === 'failed' ? (
        <ApiReadFailure error={report.read.error} retry={report.retry} />
      ) : null}

      {report.read.status === 'ready' ? (
        <IncomeBody
          report={report.read.data}
          customers={customers.read.status === 'ready' ? customers.read.data : null}
          period={period}
          today={today}
          language={language}
          t={t}
        />
      ) : null}
    </ReportShell>
  )
}

function IncomeBody({
  report,
  customers,
  period,
  today,
  language,
  t,
}: {
  report: VolumeReportDto
  customers: VolumeReportDto | null
  period: ReportPeriod
  today: Date
  language: string
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  const currency = report.totals[0]?.currency ?? report.rows[0]?.currency ?? 'OMR'
  // Figures are plain sums, so only one currency is added up; the notice names the others.
  const rows = report.rows.filter((row) => row.currency === currency)
  const net = sumByMonth(rows, (row) => row.taxableAmount)
  const vat = sumByMonth(rows, (row) => row.vatAmount)
  const sent = sumByMonth(rows, (row) => row.documents)
  const { current, previous } = periodWindows(period, today)

  if (report.rows.length === 0) {
    return (
      <p className="rounded-md bg-surface-card p-10 text-center text-sm font-medium text-text-quaternary">
        {t('reports.income.empty')}
      </p>
    )
  }

  const money = (value: number) => formatAmount(value, currency, language)
  const whole = (value: number) => wholeFigure(value, language)

  const netNow = sumOver(net, current.months)
  const netBefore = sumOver(net, previous.months)
  const vatNow = sumOver(vat, current.months)
  const vatBefore = sumOver(vat, previous.months)
  const sentNow = sumOver(sent, current.months)
  const sentBefore = sumOver(sent, previous.months)
  const average = sentNow === 0 ? 0 : netNow / sentNow
  const averageBefore = sentBefore === 0 ? 0 : netBefore / sentBefore
  const averageChange = percentPill(average, averageBefore, language)
  const steady =
    averageChange !== null && Math.abs(average - averageBefore) / Math.abs(averageBefore) < 0.01

  // Trailing twelve months, the frame's Aug → Jul.
  const months = trailingMonths(today)
  const monthLabels = months.map((key) => t(`reports.months.${MONTH_IDS[monthIndexOf(key)]}`))
  const monthlyNet = seriesOver(net, months)
  const monthlyVat = seriesOver(vat, months)
  const best = indexOfMax(monthlyNet)

  // This year's calendar quarters against last year's.
  const year = today.getFullYear()
  const thisYear = quartersOfYear(year).map((quarter) => sumOver(net, quarter.months))
  const lastYear = quartersOfYear(year - 1).map((quarter) => sumOver(net, quarter.months))
  const started = quartersOfYear(year).filter((quarter) => quarter.months[0] <= months[11]).length
  const ahead = thisYear.slice(0, started).filter((value, index) => value > lastYear[index]).length

  // Three calendar years, the last one to date.
  const years = [year - 2, year - 1, year]
  const annual = years.map((entry) =>
    [...net.entries()]
      .filter(([key]) => key.startsWith(`${entry}-`))
      .reduce((sum, [, value]) => sum + value, 0),
  )
  const progress = yearProgress(today)
  const onTrack = progress > 0 ? Math.round(annual[2] / progress / 100) * 100 : annual[2]

  // Top customers over the pill's window, net of VAT.
  const byCustomer = new Map<string, { label: string; value: number }>()
  for (const row of customers?.rows.filter((entry) => entry.currency === currency) ?? []) {
    const key = row.groupKey ?? ''
    const found = byCustomer.get(key) ?? {
      label: row.groupLabel || row.groupKey || t('reports.income.ungrouped'),
      value: 0,
    }
    found.value += row.taxableAmount
    byCustomer.set(key, found)
  }
  const ranked = [...byCustomer.values()].sort((a, b) => b.value - a.value)
  const top = ranked.slice(0, 5)
  const customerTotal = ranked.reduce((sum, entry) => sum + entry.value, 0)
  const topTotal = top.reduce((sum, entry) => sum + entry.value, 0)

  return (
    <>
      {report.totals.length > 1 ? (
        <p className="rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
          {t('reports.vat.mixedCurrency', {
            currencies: report.totals.map((entry) => entry.currency).join(', '),
          })}
        </p>
      ) : null}

      <KpiRow>
        <KpiCard
          label={t('reports.income.kpi.invoicedNet')}
          value={money(netNow)}
          currency
          change={percentPill(netNow, netBefore, language)}
          note={t(`reports.vsBefore.${period}`)}
        />
        <KpiCard
          label={t('reports.income.kpi.vat')}
          value={money(vatNow)}
          currency
          change={percentPill(vatNow, vatBefore, language)}
          note={t('reports.income.kpi.vatRate', {
            rate: shortPercent(netNow === 0 ? 0 : (vatNow / netNow) * 100, language),
          })}
        />
        <KpiCard
          label={t('reports.income.kpi.sent')}
          value={formatCount(sentNow, language)}
          change={countPill(sentNow, sentBefore, language)}
          note={t(
            `reports.${sentNow === sentBefore ? 'sameAs' : sentNow > sentBefore ? 'moreThan' : 'fewerThan'}.${period}`,
          )}
        />
        <KpiCard
          label={t('reports.income.kpi.average')}
          value={money(average)}
          currency
          change={
            steady ? { text: t('reports.income.kpi.steady'), direction: 'flat' } : averageChange
          }
          note={t(
            steady
              ? sentNow > sentBefore
                ? 'reports.income.kpi.averageNote'
                : 'reports.income.kpi.averageSame'
              : average > averageBefore
                ? 'reports.income.kpi.averageLarger'
                : 'reports.income.kpi.averageSmaller',
          )}
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.income.monthly')}
          legend={[
            { label: t('reports.income.netInvoiced'), color: SERIES.strong },
            { label: t('reports.income.vatCharged'), color: '#8a8e96' },
          ]}
          note={
            <Trans
              i18nKey="reports.income.bestMonth"
              values={{
                month: t(`reports.monthsLong.${MONTH_IDS[monthIndexOf(months[best])]}`),
                value: whole(monthlyNet[best]),
              }}
              components={{ amount: <OmrNote /> }}
            />
          }
        >
          <StackedBars
            data={monthlyNet.map((value, index) => ({ base: value, top: monthlyVat[index] }))}
            labels={monthLabels}
            highlight={best}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.income.quarterly')}
          legend={[
            { label: t('reports.income.thisYear'), color: SERIES.strong },
            { label: t('reports.income.lastYear'), color: SERIES.soft },
          ]}
          note={
            ahead === started
              ? t('reports.income.quarterlyNote')
              : t('reports.income.quarterlyAhead', { ahead, count: started })
          }
        >
          <GroupedBars
            data={thisYear.map((value, index) => ({ a: lastYear[index], b: value }))}
            labels={['Q1', 'Q2', 'Q3', 'Q4']}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.income.annually')}
          legend={[{ label: t('reports.income.kpi.invoicedNet'), color: SERIES.strong }]}
          note={
            <Trans
              i18nKey="reports.income.onTrack"
              values={{ value: whole(onTrack) }}
              components={{ amount: <OmrNote /> }}
            />
          }
        >
          {/* This year is drawn at its projection, as the frame does ("with this year projected
              from 7 months"): a year to date beside two whole years would read as a fall. */}
          <LineChart values={[annual[0], annual[1], onTrack]} labels={years.map(String)} />
        </ChartCard>

        <ChartCard
          title={t('reports.income.topCustomers')}
          legend={[
            {
              label: (
                <>
                  {t('reports.income.invoicedIn', { when: t(`reports.thisPeriod.${period}`) })}
                  <OmrSign />
                </>
              ),
              color: SERIES.strong,
            },
          ]}
          note={
            top.length > 0 ? (
              <Trans
                i18nKey="reports.income.topShareCount"
                values={{
                  count: top.length,
                  percent: formatCount(shareOfTotal(topTotal, customerTotal), language),
                }}
                components={{ b: <b className="font-semibold text-text-secondary" /> }}
              />
            ) : null
          }
        >
          {top.length > 0 ? (
            <HorizontalBars
              rows={top.map((entry) => ({
                label: entry.label,
                value: entry.value,
                display: whole(entry.value),
              }))}
            />
          ) : (
            <p className="w-full text-center text-sm font-medium text-text-quaternary">
              {customers ? t('reports.income.noCustomers') : t('reports.loadingChart')}
            </p>
          )}
        </ChartCard>
      </ChartGrid>
    </>
  )
}
