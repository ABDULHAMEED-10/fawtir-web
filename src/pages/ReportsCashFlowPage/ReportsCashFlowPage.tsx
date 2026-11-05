import { useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  ChartPending,
  DivergingBars,
  HorizontalBars,
  KpiCard,
  KpiRow,
  OmrNote,
  OmrSign,
  PlainBars,
  ReportShell,
  SERIES,
  useReportPeriod,
} from '../../components/reports'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead, type ApiRead } from '../../hooks'
import {
  cashFlowPath,
  expenditurePath,
  loadCashFlowReport,
  loadExpenditureReport,
  reportExportPath,
  type CashFlowReportDto,
  type ExpenditureReportDto,
} from '../../api/reports/reports'
import {
  periodsWithNegativeDirection,
  recordedCurrencies,
  tillPaidOuts,
} from '../../lib/cashFlowReport'
import {
  MONTH_IDS,
  historyWindow,
  indexOfMax,
  monthIndexOf,
  periodWindows,
  seriesOver,
  shareOfTotal,
  sumByMonth,
  sumOver,
  topWithRest,
  trailingMonths,
  type ReportPeriod,
} from '../../lib/reportPeriod'
import { percentPill, wholeFigure } from '../../lib/reportFigures'
import { formatAmount, formatCount } from '../../lib/format'

/**
 * Reports › Cash flow (Figma 154:106465), money in against money out.
 *
 * **Cash movement recorded in Fawtir, not a bank position.** It counts payments somebody recorded
 * against an invoice or a bill, bucketed on the payment date rather than the issue date the other
 * reports use.
 *
 * The frame also looks forward ("Due out in 30 days", "The next eight weeks"). Nothing reports
 * money due by date yet, so both keep their place and say so, rather than being dropped or filled
 * with a guess (TODO(backend) in the asks doc, section 1). "Where it went" wants payments by what
 * they paid for; payments carry no category, so the card ranks what was billed by category over
 * the same window, VAT included like the payments it sits beside, and says "billed", not "paid".
 */
export function ReportsCashFlowPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [period] = useReportPeriod()
  const today = useMemo(() => new Date(), [])
  const windows = periodWindows(period, today)
  const history = historyWindow(today)

  const path = cashFlowPath({ ...history, granularity: 'MONTH' })
  const report = useApiRead<CashFlowReportDto>(path, () => loadCashFlowReport(path))
  // TODO(backend): payments by category (REPORTS.md rows 1.11 and 1.29). Billed by category,
  // VAT included, stands in for "Where it went".
  const categoryPath = expenditurePath(
    { from: windows.current.from, to: windows.current.to, granularity: 'YEAR' },
    'CATEGORY',
  )
  const categories = useApiRead<ExpenditureReportDto>(categoryPath, () =>
    loadExpenditureReport(categoryPath),
  )

  const range = {
    from: windows.current.from,
    to: windows.current.to,
    granularity: 'MONTH' as const,
  }

  return (
    <ReportShell
      titleKey="reports.cashFlow.title"
      subtitleKey="reports.cashFlow.subtitle"
      downloads={[
        {
          format: 'xlsx',
          path: reportExportPath('cash-flow', 'xlsx', range),
          name: 'cash-flow-report',
        },
        {
          format: 'csv',
          path: reportExportPath('cash-flow', 'csv', range),
          name: 'cash-flow-report',
        },
      ]}
    >
      {report.read.status === 'loading' ? <LoadingNotice /> : null}
      {report.read.status === 'failed' ? (
        <ApiReadFailure error={report.read.error} retry={report.retry} />
      ) : null}

      {report.read.status === 'ready' ? (
        <CashFlowBody
          report={report.read.data}
          categories={categories.read}
          period={period}
          today={today}
          language={language}
          t={t}
        />
      ) : null}
    </ReportShell>
  )
}

function CashFlowBody({
  report,
  categories,
  period,
  today,
  language,
  t,
}: {
  report: CashFlowReportDto
  categories: ApiRead<ExpenditureReportDto>
  period: ReportPeriod
  today: Date
  language: string
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  const currencies = recordedCurrencies(report.totals)
  const currency =
    currencies[0] ?? report.rows.find((row) => row.currency !== null)?.currency ?? null
  // Till paid-outs from before RC5 carry no currency (backend cb9898ac3): named apart, as a plain
  // figure, and never formatted, charted or added as any currency.
  const unrecordedEntry = report.totals.find((entry) => entry.currency === null)
  const unrecordedFigures = unrecordedEntry ? tillPaidOuts(unrecordedEntry) : null
  const unrecordedSum = unrecordedFigures
    ? unrecordedFigures.expense +
      unrecordedFigures.advance +
      unrecordedFigures.transferred +
      unrecordedFigures.unclassified
    : 0
  const unrecorded =
    unrecordedSum !== 0 ? (
      <p className="rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
        {t('reports.cashFlow.unrecorded', {
          label: t('reports.cashFlow.currencyNotRecorded'),
          amount: formatCount(unrecordedSum, language),
        })}
      </p>
    ) : null

  if (report.rows.length === 0 || currency === null) {
    return (
      <>
        {unrecorded}
        <p className="rounded-md bg-surface-card p-10 text-center text-sm font-medium text-text-quaternary">
          {t('reports.cashFlow.empty')}
        </p>
      </>
    )
  }

  const rows = report.rows.filter((row) => row.currency === currency)
  const money = (value: number) => formatAmount(value, currency, language)
  const whole = (value: number) => wholeFigure(value, language)
  const { current, previous } = periodWindows(period, today)
  const received = sumByMonth(rows, (row) => row.received)
  const paidOut = sumByMonth(rows, (row) => row.paidOut)
  const net = sumByMonth(rows, (row) => row.net)

  const inNow = sumOver(received, current.months)
  const outNow = sumOver(paidOut, current.months)
  const netNow = sumOver(net, current.months)

  const months = trailingMonths(today)
  const monthLabels = months.map((key) => t(`reports.months.${MONTH_IDS[monthIndexOf(key)]}`))
  const monthlyIn = seriesOver(received, months)
  const monthlyOut = seriesOver(paidOut, months)
  const monthlyNet = seriesOver(net, months)
  const bestKept = indexOfMax(monthlyNet)
  const positive = monthlyNet.filter((value) => value > 0).length
  // A bar cannot be drawn below nothing, so a period where reversals outweighed payments is
  // named in the footer rather than drawn as if it were a small positive.
  const negative = periodsWithNegativeDirection(rows)
  const drawer = {
    expense: sumOver(sumByMonth(rows, (row) => tillPaidOuts(row).expense), current.months),
    advance: sumOver(sumByMonth(rows, (row) => tillPaidOuts(row).advance), current.months),
    transferred: sumOver(sumByMonth(rows, (row) => tillPaidOuts(row).transferred), current.months),
    unclassified: sumOver(sumByMonth(rows, (row) => tillPaidOuts(row).unclassified), current.months),
  }
  const drawerRows = (['expense', 'advance', 'transferred', 'unclassified'] as const).map((name) => ({
    label: t(`reports.cashFlow.till.${name}`),
    value: drawer[name],
    display: money(drawer[name]),
  }))

  const categoryRows =
    categories.status === 'ready'
      ? topWithRest(
          [
            ...categories.data.rows
              .filter((row) => row.currency === currency)
              .reduce((totals, row) => {
                const key = row.groupKey ?? ''
                const found = totals.get(key) ?? {
                  key,
                  label: key ? row.groupLabel || key : t('reports.expenditure.uncategorised'),
                  value: 0,
                }
                // VAT included, the basis "Money out" is paid on, so the card and the figure
                // above it are on one basis (REPORTS.md row 1.29).
                found.value += row.totalAmount
                return totals.set(key, found)
              }, new Map<string, { key: string; label: string; value: number }>())
              .values(),
          ],
          4,
          t('reports.cashFlow.everythingElse'),
        )
      : []
  const categoryTotal = categoryRows.reduce((sum, row) => sum + row.value, 0)

  return (
    <>
      {currencies.length > 1 ? (
        <p className="rounded-md bg-pending-100 p-3 text-sm font-medium text-pending-700">
          {t('reports.vat.mixedCurrency', { currencies: currencies.join(', ') })}
        </p>
      ) : null}
      {unrecorded}

      <KpiRow>
        <KpiCard
          label={t('reports.cashFlow.kpi.in')}
          value={money(inNow)}
          currency
          change={percentPill(inNow, sumOver(received, previous.months), language)}
          note={t('reports.cashFlow.kpi.inNote')}
        />
        <KpiCard
          label={t('reports.cashFlow.kpi.out')}
          value={money(outNow)}
          currency
          change={percentPill(outNow, sumOver(paidOut, previous.months), language)}
          note={t('reports.cashFlow.kpi.outNote')}
        />
        <KpiCard
          label={t('reports.cashFlow.kpi.leftOver')}
          value={money(netNow)}
          currency
          change={percentPill(netNow, sumOver(net, previous.months), language)}
          note={t(`reports.cashFlow.kpi.across.${period}`)}
        />
        {/* TODO(backend): money due out and expected in over the next 30 days (asks 1.9). */}
        <KpiCard
          label={t('reports.cashFlow.kpi.dueOut')}
          value={t('reports.cashFlow.kpi.notForecast')}
          pending
          note={t('reports.cashFlow.kpi.dueOutPending')}
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
            negative.length > 0
              ? t('reports.cashFlow.reversalHeavy', { periods: negative.join(', ') })
              : positive === months.length
                ? t('reports.cashFlow.positiveEveryMonth')
                : t('reports.cashFlow.positiveMonths', { count: positive, total: months.length })
          }
        >
          <DivergingBars
            data={monthlyIn.map((value, index) => ({ up: value, down: monthlyOut[index] }))}
            labels={monthLabels}
            highlight={months.length - 1}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.cashFlow.whatYouKept')}
          legend={[
            {
              label: (
                <>
                  {t('reports.cashFlow.surplus')}
                  <OmrSign />
                </>
              ),
              color: SERIES.green,
            },
          ]}
          note={
            monthlyNet[bestKept] > 0 ? (
              <Trans
                i18nKey="reports.cashFlow.bestMonth"
                values={{ value: whole(monthlyNet[bestKept]) }}
                components={{ amount: <OmrNote /> }}
              />
            ) : null
          }
        >
          <PlainBars
            values={monthlyNet}
            labels={monthLabels}
            highlight={bestKept}
            color={SERIES.greenSoft}
            highlightColor={SERIES.green}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.cashFlow.till.title')}
          legend={[
            {
              label: t('reports.cashFlow.till.legend', {
                when: t(`reports.thisPeriod.${period}`),
                currency,
              }),
              color: SERIES.strong,
            },
          ]}
          note={t('reports.cashFlow.till.note')}
        >
          {drawerRows.some((row) => row.value !== 0) ? (
            <HorizontalBars rows={drawerRows} />
          ) : (
            <p className="w-full text-center text-sm font-medium text-text-quaternary">
              {t('reports.cashFlow.till.none')}
            </p>
          )}
        </ChartCard>

        {/* TODO(backend): receivables and payables due, by week (asks 1.10). */}
        <ChartCard
          title={t('reports.cashFlow.nextEightWeeks')}
          legend={[
            { label: t('reports.cashFlow.expectedIn'), color: SERIES.green },
            { label: t('reports.cashFlow.committedOut'), color: SERIES.brown },
          ]}
          note={null}
        >
          <ChartPending message={t('reports.cashFlow.forecastPending')} />
        </ChartCard>

        <ChartCard
          title={t('reports.cashFlow.whereItWent')}
          legend={[
            {
              label: (
                <>
                  {t('reports.cashFlow.billedIn', { when: t(`reports.thisPeriod.${period}`) })}
                  <OmrSign />
                </>
              ),
              color: SERIES.strong,
            },
          ]}
          note={
            categoryRows.length > 0 && categoryTotal > 0 ? (
              <Trans
                i18nKey="reports.cashFlow.topShareInclVat"
                values={{
                  name: categoryRows[0].label,
                  percent: formatCount(
                    shareOfTotal(categoryRows[0].value, categoryTotal),
                    language,
                  ),
                }}
                components={{ b: <b className="font-semibold text-text-secondary" /> }}
              />
            ) : null
          }
        >
          {categoryRows.length > 0 ? (
            <HorizontalBars
              rows={categoryRows.map((row) => ({
                label: row.label,
                value: row.value,
                display: whole(row.value),
              }))}
            />
          ) : (
            <p className="w-full text-center text-sm font-medium text-text-quaternary">
              {t(
                categories.status === 'loading'
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
