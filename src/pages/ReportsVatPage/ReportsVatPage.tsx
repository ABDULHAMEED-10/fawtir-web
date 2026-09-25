import { useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  GroupedBars,
  HorizontalBars,
  KpiCard,
  KpiRow,
  OmrNote,
  OmrSign,
  PlainBars,
  ReportShell,
  SERIES,
  StackedPercentRows,
  useReportPeriod,
} from '../../components/reports'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead, type ApiRead } from '../../hooks'
import {
  expenditurePath,
  loadExpenditureReport,
  loadVatReport,
  reportExportPath,
  vatPath,
  type ExpenditureReportDto,
  type VatReportDto,
  type VatRowDto,
} from '../../api/reports/reports'
import { currenciesIn } from '../../lib/vatReport'
import {
  MONTH_IDS,
  currentMonth,
  historyWindow,
  indexOfMax,
  lastQuarters,
  monthIndexOf,
  monthStart,
  nextVatReturn,
  periodWindows,
  roundShares,
  rowMonth,
  seriesOver,
  shareOfTotal,
  sumByMonth,
  sumOver,
  topWithRest,
  trailingMonths,
  type Quarter,
  type ReportPeriod,
} from '../../lib/reportPeriod'
import { percentPill, wholeFigure } from '../../lib/reportFigures'
import { formatAmount, formatCount } from '../../lib/format'

/**
 * Reports › VAT & Tax (Figma 154:106933).
 *
 * The tenant's VAT position as the server computes it: **output** is VAT charged on issued
 * documents by EN 16931 category and rate, **input** is VAT the tenant was charged on received
 * bills, and **net** is what the two come to. Three reads feed the frame: the monthly VAT report
 * (the figures and Monthly net payable), the quarterly one (Quarterly position) and the
 * expenditure report by supplier, whose VAT per supplier is what can be reclaimed from each.
 *
 * The net figure is the server's NET rows, never a subtraction done here: a period with input
 * and no output has to read one way, and two answers would drift apart.
 */
export function ReportsVatPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [period] = useReportPeriod()
  const today = useMemo(() => new Date(), [])
  const windows = periodWindows(period, today)
  const history = historyWindow(today)
  const quarters = lastQuarters(today, 4)

  const monthlyPath = vatPath({ ...history, granularity: 'MONTH' })
  const monthly = useApiRead<VatReportDto>(monthlyPath, () => loadVatReport(monthlyPath))
  const quarterlyPath = vatPath({
    from: monthStart(quarters[0].months[0]),
    to: windows.current.to,
    granularity: 'QUARTER',
  })
  const quarterly = useApiRead<VatReportDto>(quarterlyPath, () => loadVatReport(quarterlyPath))
  const supplierPath = expenditurePath(
    { from: windows.current.from, to: windows.current.to, granularity: 'YEAR' },
    'SUPPLIER',
  )
  const suppliers = useApiRead<ExpenditureReportDto>(supplierPath, () =>
    loadExpenditureReport(supplierPath),
  )

  const range = {
    from: windows.current.from,
    to: windows.current.to,
    granularity: 'MONTH' as const,
  }

  return (
    <ReportShell
      titleKey="reports.vat.title"
      subtitleKey="reports.vat.subtitle"
      downloads={[
        { format: 'xlsx', path: reportExportPath('vat', 'xlsx', range), name: 'vat-report' },
        { format: 'csv', path: reportExportPath('vat', 'csv', range), name: 'vat-report' },
      ]}
    >
      {monthly.read.status === 'loading' ? <LoadingNotice /> : null}
      {monthly.read.status === 'failed' ? (
        <ApiReadFailure error={monthly.read.error} retry={monthly.retry} />
      ) : null}

      {monthly.read.status === 'ready' ? (
        <VatBody
          report={monthly.read.data}
          quarterly={quarterly.read}
          suppliers={suppliers.read}
          quarters={quarters}
          period={period}
          today={today}
          language={language}
          t={t}
        />
      ) : null}
    </ReportShell>
  )
}

function VatBody({
  report,
  quarterly,
  suppliers,
  quarters,
  period,
  today,
  language,
  t,
}: {
  report: VatReportDto
  quarterly: ApiRead<VatReportDto>
  suppliers: ApiRead<ExpenditureReportDto>
  quarters: Quarter[]
  period: ReportPeriod
  today: Date
  language: string
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  const currencies = currenciesIn(report)
  const currency = currencies[0] ?? 'OMR'
  const own = (rows: VatRowDto[]) => rows.filter((row) => row.currency === currency)

  if (currencies.length === 0) {
    return (
      <p className="rounded-md bg-surface-card p-10 text-center text-sm font-medium text-text-quaternary">
        {t('reports.vat.empty')}
      </p>
    )
  }

  const money = (value: number) => formatAmount(value, currency, language)
  const whole = (value: number) => wholeFigure(value, language)
  const { current, previous } = periodWindows(period, today)
  const output = sumByMonth(own(report.output), (row) => row.vatAmount)
  const input = sumByMonth(own(report.input), (row) => row.vatAmount)
  const net = sumByMonth(own(report.net), (row) => row.vatAmount)

  const outputNow = sumOver(output, current.months)
  const inputNow = sumOver(input, current.months)
  const netNow = sumOver(net, current.months)
  const owed = netNow >= 0

  const next = nextVatReturn(today)
  const due = new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(next.due)

  // Quarterly position: the last four calendar quarters, the current one so far.
  const quarterData = quarterly.status === 'ready' ? quarterly.data : null
  const byQuarter = (rows: VatRowDto[]) => {
    const totals = sumByMonth(own(rows), (row) => row.vatAmount)
    return quarters.map((quarter) => totals.get(quarter.months[0]) ?? 0)
  }
  const quarterOut = quarterData ? byQuarter(quarterData.output) : quarters.map(() => 0)
  const quarterIn = quarterData ? byQuarter(quarterData.input) : quarters.map(() => 0)
  const gaps = quarterOut.map((value, index) => value - quarterIn[index])
  const quarterLabel = (quarter: Quarter) =>
    quarter.months.includes(currentMonth(today))
      ? t('reports.quarterSoFar', { quarter: quarter.quarter })
      : t('reports.quarterLabel', { quarter: quarter.quarter, year: quarter.year })

  const months = trailingMonths(today)
  const monthlyNet = seriesOver(net, months)
  const peak = indexOfMax(monthlyNet)

  // What was charged by treatment, over the pill's window: a share of taxable amount, since
  // zero-rated and exempt supplies carry no VAT at all.
  const treatment = { S: 0, Z: 0, other: 0 }
  for (const row of own(report.output)) {
    if (!current.months.includes(rowMonth(row))) continue
    if (row.category === 'S') treatment.S += row.taxableAmount
    else if (row.category === 'Z') treatment.Z += row.taxableAmount
    else treatment.other += row.taxableAmount
  }
  const sales = roundShares([treatment.S, treatment.Z, treatment.other])

  const reclaim =
    suppliers.status === 'ready'
      ? topWithRest(
          [
            ...suppliers.data.rows
              .filter((row) => row.currency === currency)
              .reduce((totals, row) => {
                const key = row.groupKey ?? ''
                const found = totals.get(key) ?? {
                  key,
                  label: row.groupLabel || key || t('reports.expenditure.ungrouped'),
                  value: 0,
                }
                found.value += row.vatAmount
                return totals.set(key, found)
              }, new Map<string, { key: string; label: string; value: number }>())
              .values(),
          ],
          4,
          t('reports.vat.others'),
        )
      : []
  const reclaimTotal = reclaim.reduce((sum, row) => sum + row.value, 0)

  return (
    <>
      {currencies.length > 1 ? (
        // Adding OMR to USD would produce a number nobody can use, so the page says which
        // currencies are in the range rather than totalling across them.
        <p className="rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
          {t('reports.vat.mixedCurrency', { currencies: currencies.join(', ') })}
        </p>
      ) : null}

      <KpiRow>
        <KpiCard
          label={t('reports.vat.kpi.collected')}
          value={money(outputNow)}
          currency
          change={percentPill(outputNow, sumOver(output, previous.months), language)}
          note={t('reports.vat.kpi.collectedNote')}
        />
        <KpiCard
          label={t('reports.vat.kpi.paid')}
          value={money(inputNow)}
          currency
          change={percentPill(inputNow, sumOver(input, previous.months), language)}
          note={t('reports.vat.kpi.paidNote')}
        />
        <KpiCard
          label={t(owed ? 'reports.vat.kpi.owed' : 'reports.vat.kpi.reclaim')}
          value={money(Math.abs(netNow))}
          currency
          change={percentPill(netNow, sumOver(net, previous.months), language)}
          note={t(owed ? `reports.vat.kpi.over.${period}` : 'reports.vat.kpi.reclaimNote')}
        />
        {/* TODO(backend): the tenant's own filing calendar (asks 1.13); calendar quarters stand in. */}
        <KpiCard
          label={t('reports.vat.kpi.nextReturn')}
          value={due}
          note={t(next.closed ? 'reports.vat.kpi.returnClosed' : 'reports.vat.kpi.returnOpen', {
            quarter: next.quarter,
            months: next.monthsIn,
          })}
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.vat.quarterlyPosition')}
          legend={[
            { label: t('reports.vat.collectedOnSales'), color: SERIES.strong },
            { label: t('reports.vat.paidOnPurchases'), color: SERIES.grey },
          ]}
          note={
            quarterData
              ? t(
                  gaps[gaps.length - 1] >= gaps[0]
                    ? 'reports.vat.gapWidening'
                    : 'reports.vat.gapNarrowing',
                )
              : null
          }
        >
          <GroupedBars
            data={quarterIn.map((paid, index) => ({ a: paid, b: quarterOut[index] }))}
            labels={quarters.map(quarterLabel)}
            colors={[SERIES.grey, SERIES.strong]}
            labelWidth={56}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.vat.monthlyNetPayable')}
          legend={[
            {
              label: (
                <>
                  {t('reports.vat.netPayableComma')}
                  <OmrSign />
                </>
              ),
              color: SERIES.strong,
            },
          ]}
          note={
            monthlyNet[peak] > 0 ? (
              <Trans
                i18nKey="reports.vat.peakMonth"
                values={{
                  month: t(`reports.monthsLong.${MONTH_IDS[monthIndexOf(months[peak])]}`),
                  value: whole(monthlyNet[peak]),
                }}
                components={{ amount: <OmrNote /> }}
              />
            ) : null
          }
        >
          <PlainBars
            values={monthlyNet}
            labels={months.map((key) => t(`reports.months.${MONTH_IDS[monthIndexOf(key)]}`))}
            highlight={peak}
            labelWidth={38}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.vat.byTreatment')}
          legend={[
            { label: t('reports.vat.standard'), color: SERIES.strong },
            { label: t('reports.vat.zeroRated'), color: SERIES.grey },
            { label: t('reports.vat.exempt'), color: SERIES.soft },
          ]}
          note={
            sales.some((part) => part > 0)
              ? sales[0] >= 90
                ? t('reports.vat.almostAllStandard')
                : t('reports.vat.standardShare', { percent: formatCount(sales[0], language) })
              : null
          }
        >
          <StackedPercentRows
            rows={[
              { label: t('reports.vat.sales'), parts: sales },
              // TODO(backend): input VAT by rate (asks 1.14). A received bill states one VAT
              // total, so the purchases row keeps its place and says it is not split.
              { label: t('reports.vat.purchases'), parts: [], pending: t('reports.vat.notSplit') },
            ]}
            colors={[SERIES.strong, SERIES.grey, SERIES.soft]}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.vat.reclaimBySupplier')}
          legend={[
            {
              label: (
                <>
                  {t('reports.vat.reclaimableComma')}
                  <OmrSign />
                </>
              ),
              color: SERIES.strong,
            },
          ]}
          note={
            reclaim.length > 0 && reclaimTotal > 0
              ? t('reports.vat.reclaimShare', {
                  name: reclaim[0].label,
                  percent: formatCount(shareOfTotal(reclaim[0].value, reclaimTotal), language),
                })
              : null
          }
        >
          {reclaim.length > 0 ? (
            <HorizontalBars
              rows={reclaim.map((row) => ({
                label: row.label,
                value: row.value,
                display: whole(row.value),
              }))}
            />
          ) : (
            <p className="w-full text-center text-sm font-medium text-text-quaternary">
              {t(
                suppliers.status === 'loading'
                  ? 'reports.loadingChart'
                  : 'reports.expenditure.nothingBilled',
              )}
            </p>
          )}
        </ChartCard>
      </ChartGrid>
    </>
  )
}
