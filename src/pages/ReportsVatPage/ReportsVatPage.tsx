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
  loadVolumeReport,
  reportExportPath,
  vatPath,
  volumePath,
  type ExpenditureReportDto,
  type VatReportDto,
  type VolumeReportDto,
} from '../../api/reports/reports'
import { categoryAmounts, currenciesIn, vatMonths } from '../../lib/vatReport'
import { selfBilledVat } from '../../lib/volumeReport'
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
  quarterOf,
  roundShares,
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
 * and no output has to read one way, and two answers would drift apart. Two corrections move it
 * (`lib/vatReport` `vatMonths`): the tenant's own self-billed documents (389, 261) are purchases,
 * so their VAT is taken out of output, read from a fourth call (the volume report by type).
 * Reverse charge is not computed: it is a transaction type (BTOM-001), not one of Oman's four
 * categories, and the report does not carry it yet (TODO(backend): REPORTS.md row 1.27).
 *
 * **Input VAT is not called reclaimable** until the server says which bills were approved and
 * had their receipt reported (REPORTS.md row 1.25): until then the cards say "reclaim not
 * confirmed". The "Quarterly" pill is the company's tax period (row 1.24), and so is the export.
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
  // Issued documents by type: the VAT on the tenant's own self-billed documents is input VAT, so
  // it is taken out of output (REPORTS.md row 1.26).
  const typesPath = volumePath({ ...history, granularity: 'MONTH' }, 'TYPE')
  const types = useApiRead<VolumeReportDto>(typesPath, () => loadVolumeReport(typesPath))

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
      {monthly.read.status === 'loading' || types.read.status === 'loading' ? (
        <LoadingNotice />
      ) : null}
      {monthly.read.status === 'failed' ? (
        <ApiReadFailure error={monthly.read.error} retry={monthly.retry} />
      ) : null}

      {monthly.read.status === 'ready' && types.read.status !== 'loading' ? (
        <VatBody
          report={monthly.read.data}
          // A failed read leaves output as the server states it rather than hiding the page.
          types={types.read.status === 'ready' ? types.read.data : null}
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
  types,
  quarterly,
  suppliers,
  quarters,
  period,
  today,
  language,
  t,
}: {
  report: VatReportDto
  types: VolumeReportDto | null
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
  const selfBilled = sumByMonth(
    (types?.rows ?? []).filter((row) => row.currency === currency),
    selfBilledVat,
  )
  const { output, input, net, reclaimable } = vatMonths(report, currency, selfBilled)

  const outputNow = sumOver(output, current.months)
  const inputNow = sumOver(input, current.months)
  // Owed is output less the input VAT that can actually be reclaimed. Until the server says which
  // bills that is (REPORTS.md row 1.25) it is the server's net, and the card says reclaim is not
  // confirmed rather than implying every bill counts.
  const owedOf = (months: string[]) =>
    reclaimable ? sumOver(output, months) - sumOver(reclaimable, months) : sumOver(net, months)
  const netNow = owedOf(current.months)
  const owed = netNow >= 0
  const reclaimNow = reclaimable ? sumOver(reclaimable, current.months) : null

  const next = nextVatReturn(today)
  const due = new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(next.due)

  // Quarterly position: the last four calendar quarters, the current one so far.
  const quarterData = quarterly.status === 'ready' ? quarterly.data : null
  const selfBilledByQuarter = new Map<string, number>()
  for (const [key, value] of selfBilled) {
    const first = quarterOf(key).months[0]
    selfBilledByQuarter.set(first, (selfBilledByQuarter.get(first) ?? 0) + value)
  }
  const quarterMonths = quarterData ? vatMonths(quarterData, currency, selfBilledByQuarter) : null
  const byQuarter = (totals: Map<string, number> | undefined) =>
    quarters.map((quarter) => totals?.get(quarter.months[0]) ?? 0)
  const quarterOut = byQuarter(quarterMonths?.output)
  const quarterIn = byQuarter(quarterMonths?.input)
  const gaps = quarterOut.map((value, index) => value - quarterIn[index])
  const quarterLabel = (quarter: Quarter) =>
    quarter.months.includes(currentMonth(today))
      ? t('reports.quarterSoFar', { quarter: quarter.quarter })
      : t('reports.quarterLabel', { quarter: quarter.quarter, year: quarter.year })

  const months = trailingMonths(today)
  const monthlyNet = months.map((key) => owedOf([key]))
  const peak = indexOfMax(monthlyNet)

  // By treatment over the pill's window: a share of taxable amount, since zero-rated, exempt and
  // outside-scope supplies carry no VAT at all. Standard, zero-rated, exempt and outside scope
  // are four parts: exempt and outside scope are different treatments and are not lumped.
  const own = <T extends { currency: string }>(rows: T[]) =>
    rows.filter((row) => row.currency === currency)
  const salesAmounts = categoryAmounts(own(report.output), current.months)
  const sales = salesAmounts ? roundShares(salesAmounts) : null
  // TODO(backend): REPORTS.md row 1.23. INPUT rows say `ALL` today (one VAT total per bill), so
  // the purchases row says it is not split; it splits as soon as the rows carry a category.
  const purchaseAmounts = categoryAmounts(own(report.input), current.months)
  const purchases = purchaseAmounts ? roundShares(purchaseAmounts) : null

  const supplierRows =
    suppliers.status === 'ready'
      ? suppliers.data.rows.filter((row) => row.currency === currency)
      : []
  const reclaimConfirmed =
    supplierRows.length > 0 &&
    supplierRows.every((row) => typeof row.reclaimableVatAmount === 'number')
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
                // Only what the server confirms reclaimable, when it says (REPORTS.md row 1.25);
                // otherwise the VAT charged, and the card says reclaim is not confirmed.
                found.value += reclaimConfirmed ? (row.reclaimableVatAmount ?? 0) : row.vatAmount
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
          note={
            reclaimNow === null
              ? t('reports.vat.kpi.paidNoteUnconfirmed')
              : t('reports.vat.kpi.paidNoteConfirmed', {
                  percent: formatCount(shareOfTotal(reclaimNow, inputNow), language),
                })
          }
        />
        <KpiCard
          label={t(owed ? 'reports.vat.kpi.owed' : 'reports.vat.kpi.reclaim')}
          value={money(Math.abs(netNow))}
          currency
          change={percentPill(netNow, owedOf(previous.months), language)}
          note={t(
            owed
              ? reclaimable
                ? `reports.vat.kpi.over.${period}`
                : `reports.vat.kpi.overUnconfirmed.${period}`
              : reclaimable
                ? 'reports.vat.kpi.reclaimNote'
                : 'reports.vat.kpi.reclaimNoteUnconfirmed',
          )}
        />
        {/* TODO(backend): the company's own tax periods (REPORTS.md rows 1.13 and 1.24); calendar
            quarters stand in. */}
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
            { label: t('reports.vat.category.O'), color: SERIES.brownSoft },
          ]}
          note={
            sales && sales.some((part) => part > 0)
              ? sales[0] >= 90
                ? t('reports.vat.almostAllStandard')
                : t('reports.vat.standardShare', { percent: formatCount(sales[0], language) })
              : null
          }
        >
          <StackedPercentRows
            rows={[
              sales
                ? { label: t('reports.vat.sales'), parts: sales }
                : {
                    label: t('reports.vat.sales'),
                    parts: [],
                    pending: t('reports.vat.notSplitCategory'),
                  },
              // TODO(backend): input VAT by category (REPORTS.md rows 1.14 and 1.23).
              purchases
                ? { label: t('reports.vat.purchases'), parts: purchases }
                : {
                    label: t('reports.vat.purchases'),
                    parts: [],
                    pending: t('reports.vat.notSplitCategory'),
                  },
            ]}
            colors={[SERIES.strong, SERIES.grey, SERIES.soft, SERIES.brownSoft]}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.vat.reclaimBySupplier')}
          legend={[
            {
              label: (
                <>
                  {t(
                    reclaimConfirmed ? 'reports.vat.reclaimableComma' : 'reports.vat.inputVatComma',
                  )}
                  <OmrSign />
                </>
              ),
              color: SERIES.strong,
            },
          ]}
          note={
            reclaim.length > 0 && reclaimTotal > 0
              ? t(reclaimConfirmed ? 'reports.vat.reclaimShare' : 'reports.vat.inputShare', {
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
