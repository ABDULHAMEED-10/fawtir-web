import { useMemo } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  HorizontalBars,
  KpiCard,
  KpiRow,
  OmrNote,
  OmrSign,
  ReportShell,
  SERIES,
  StackedBars,
  StackedPercentRows,
  useReportPeriod,
} from '../../components/reports'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead, type ApiRead } from '../../hooks'
import {
  expenditurePath,
  loadExpenditureReport,
  reportExportPath,
  type ExpenditureGroupBy,
  type ExpenditureReportDto,
  type ReportRange,
} from '../../api/reports/reports'
import {
  MONTH_IDS,
  currentMonth,
  historyWindow,
  indexOfMax,
  lastQuarters,
  monthIndexOf,
  monthStart,
  periodWindows,
  roundShares,
  rowMonth,
  seriesOver,
  shareOfTotal,
  sumByMonth,
  sumOver,
  trailingMonths,
  type Quarter,
  type ReportPeriod,
} from '../../lib/reportPeriod'
import { countPill, percentPill, shortPercent, wholeFigure } from '../../lib/reportFigures'
import { formatAmount, formatCount } from '../../lib/format'

/**
 * Reports › Expenditure (Figma 154:106022), what the tenant was billed.
 *
 * Received documents only: `/reports/expenditure` reads `peppol.bills`, a different ledger from
 * Income's with no overlap. Four reads feed the frame, one per shape: the monthly history (the
 * figures and Monthly), and the supplier, category and source groupings for the three ranked
 * cards. The groupings are the server's; nothing is grouped from a page here.
 *
 * **Amounts are signed.** A supplier credit note (381/261) subtracts and a debit note (383)
 * adds, so every figure is net of corrections. A bill with no category comes back under the empty
 * key and is shown as "Uncategorised", never dropped: dropping it would leave most of the spend
 * out of a spend report.
 *
 * Self-billed documents here (source SELF_BILLED, 389/261) are the tenant's own, issued as the
 * buyer, so they are purchases and belong here. TODO(backend): REPORTS.md row 1.22, a self-billed
 * document a customer issued to the tenant is a sale and must never be counted on this side.
 */
export function ReportsExpenditurePage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [period] = useReportPeriod()
  const today = useMemo(() => new Date(), [])
  const windows = periodWindows(period, today)
  const history = historyWindow(today)
  const span = { from: windows.current.from, to: windows.current.to, granularity: 'YEAR' as const }
  const quarters = lastQuarters(today, 3)

  const historyPath = expenditurePath({ ...history, granularity: 'MONTH' }, 'NONE')
  const report = useApiRead<ExpenditureReportDto>(historyPath, () =>
    loadExpenditureReport(historyPath),
  )
  const grouped = (groupBy: ExpenditureGroupBy, range: ReportRange = span) =>
    expenditurePath(range, groupBy)
  const supplierPath = grouped('SUPPLIER')
  const suppliers = useApiRead<ExpenditureReportDto>(supplierPath, () =>
    loadExpenditureReport(supplierPath),
  )
  const categoryPath = grouped('CATEGORY')
  const categories = useApiRead<ExpenditureReportDto>(categoryPath, () =>
    loadExpenditureReport(categoryPath),
  )
  const sourcePath = grouped('SOURCE', {
    from: monthStart(quarters[0].months[0]),
    to: windows.current.to,
    granularity: 'QUARTER',
  })
  const sources = useApiRead<ExpenditureReportDto>(sourcePath, () =>
    loadExpenditureReport(sourcePath),
  )

  const range = {
    from: windows.current.from,
    to: windows.current.to,
    granularity: 'MONTH' as const,
  }

  return (
    <ReportShell
      titleKey="reports.expenditure.title"
      subtitleKey="reports.expenditure.subtitle"
      downloads={[
        {
          format: 'xlsx',
          path: reportExportPath('expenditure', 'xlsx', range, 'NONE'),
          name: 'expenditure-report',
        },
        {
          format: 'csv',
          path: reportExportPath('expenditure', 'csv', range, 'NONE'),
          name: 'expenditure-report',
        },
      ]}
    >
      {report.read.status === 'loading' ? <LoadingNotice /> : null}
      {report.read.status === 'failed' ? (
        <ApiReadFailure error={report.read.error} retry={report.retry} />
      ) : null}

      {report.read.status === 'ready' ? (
        <ExpenditureBody
          report={report.read.data}
          suppliers={dataOf(suppliers.read)}
          categories={dataOf(categories.read)}
          sources={dataOf(sources.read)}
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

type Ranked = { label: string; value: number }

function ExpenditureBody({
  report,
  suppliers,
  categories,
  sources,
  quarters,
  period,
  today,
  language,
  t,
}: {
  report: ExpenditureReportDto
  suppliers: ExpenditureReportDto | null
  categories: ExpenditureReportDto | null
  sources: ExpenditureReportDto | null
  quarters: Quarter[]
  period: ReportPeriod
  today: Date
  language: string
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  const currency = report.totals[0]?.currency ?? report.rows[0]?.currency ?? 'OMR'
  const rows = report.rows.filter((row) => row.currency === currency)

  if (report.rows.length === 0) {
    return (
      <p className="rounded-md bg-surface-card p-10 text-center text-sm font-medium text-text-quaternary">
        {t('reports.expenditure.empty')}
      </p>
    )
  }

  const money = (value: number) => formatAmount(value, currency, language)
  const whole = (value: number) => wholeFigure(value, language)
  const { current, previous } = periodWindows(period, today)
  const net = sumByMonth(rows, (row) => row.netAmount)
  const vat = sumByMonth(rows, (row) => row.vatAmount)
  // "Bills received" and "Average bill" count and net bills only (ACC-5, backend #824, REPORTS.md
  // 1.30). A server before #824 has no bill-only figures: the cards keep reading every document,
  // notes included, as they always did, rather than guessing which documents were notes.
  const billOnly = rows.every(
    (row) => typeof row.billDocuments === 'number' && typeof row.billNetAmount === 'number',
  )
  const bills = sumByMonth(rows, (row) => (billOnly ? (row.billDocuments ?? 0) : row.documents))
  const billNet = billOnly ? sumByMonth(rows, (row) => row.billNetAmount ?? 0) : null
  const reclaimable = rows.every((row) => typeof row.reclaimableVatAmount === 'number')
    ? sumByMonth(rows, (row) => row.reclaimableVatAmount ?? 0)
    : null

  const netNow = sumOver(net, current.months)
  const netBefore = sumOver(net, previous.months)
  // Spend leaves out undecided supplier debit notes and rejected or refused documents (D-27); bills
  // awaiting approval stay in it pending an owner ruling. What it leaves out is named
  // beside it; an older server sends neither, and then nothing is said rather than a zero.
  const decisionsReported = rows.every(
    (row) => Object.hasOwn(row, 'pendingNetAmount') && Object.hasOwn(row, 'rejectedNetAmount'),
  )
  const outsideNow = (figure: (row: (typeof rows)[number]) => number | undefined) =>
    sumOver(
      sumByMonth(rows, (row) => figure(row) ?? 0),
      current.months,
    )
  const vatNow = sumOver(vat, current.months)
  const vatBefore = sumOver(vat, previous.months)
  const billsNow = sumOver(bills, current.months)
  const billsBefore = sumOver(bills, previous.months)
  const billNetNow = billNet ? sumOver(billNet, current.months) : netNow
  const billNetBefore = billNet ? sumOver(billNet, previous.months) : netBefore
  const average = billsNow === 0 ? 0 : billNetNow / billsNow
  const averageBefore = billsBefore === 0 ? 0 : billNetBefore / billsBefore
  const averageChange = percentPill(average, averageBefore, language)
  const steady =
    averageChange !== null && Math.abs(average - averageBefore) / Math.abs(averageBefore) < 0.01

  const months = trailingMonths(today)
  const monthlyNet = seriesOver(net, months)
  const monthlyVat = seriesOver(vat, months)
  const heaviest = indexOfMax(monthlyNet)

  /** Net per group, largest first, in the page's currency. */
  const rank = (
    source: ExpenditureReportDto | null,
    name: (key: string | null, label: string | null) => string,
  ) => {
    const totals = new Map<string, Ranked>()
    for (const row of source?.rows.filter((entry) => entry.currency === currency) ?? []) {
      const key = row.groupKey ?? ''
      const found = totals.get(key) ?? { label: name(row.groupKey, row.groupLabel), value: 0 }
      found.value += row.netAmount
      totals.set(key, found)
    }
    return [...totals.values()].sort((a, b) => b.value - a.value)
  }
  // A key prefixed `participant:` or `name:` is a group of bills linked to no supplier (NEW-1,
  // backend #824), not a supplier's id, so it is never printed as a name.
  const supplierRows = rank(
    suppliers,
    (key, label) =>
      label ||
      (key && !key.startsWith('participant:') && !key.startsWith('name:') ? key : null) ||
      t('reports.expenditure.ungrouped'),
  )
  const categoryRows = rank(categories, (key, label) =>
    key ? label || key : t('reports.expenditure.uncategorised'),
  )
  const shareNote = (ranked: Ranked[]) => {
    const total = ranked.reduce((sum, entry) => sum + entry.value, 0)
    return ranked.length > 0 && total > 0 ? (
      <Trans
        i18nKey="reports.expenditure.topShare"
        values={{
          name: ranked[0].label,
          percent: formatCount(shareOfTotal(ranked[0].value, total), language),
        }}
        components={{ b: <b className="font-semibold text-text-secondary" /> }}
      />
    ) : null
  }

  // How bills reach you: each quarter's documents by source, as shares of that quarter.
  // "Uploaded" is every bill typed or uploaded by hand, so the recurring and self-billed sources
  // sit with it rather than in a fourth colour the frame does not draw.
  const channels = quarters.map((quarter) => {
    const counts = { PEPPOL: 0, UPLOADED: 0, SCANNED: 0 }
    for (const row of sources?.rows ?? []) {
      if (!quarter.months.includes(rowMonth(row))) continue
      const bucket =
        row.groupKey === 'PEPPOL' ? 'PEPPOL' : row.groupKey === 'SCANNED' ? 'SCANNED' : 'UPLOADED'
      counts[bucket] += row.documents
    }
    return roundShares([counts.PEPPOL, counts.UPLOADED, counts.SCANNED])
  })
  const quarterLabel = (quarter: Quarter) =>
    quarter.months.includes(currentMonth(today))
      ? t('reports.quarterSoFar', { quarter: quarter.quarter })
      : t('reports.quarterLabel', { quarter: quarter.quarter, year: quarter.year })
  const counted = channels.filter((parts) => parts.some((part) => part > 0))
  const peppolShift = counted.length > 1 ? counted[counted.length - 1][0] - counted[0][0] : null
  const firstCounted = quarters[channels.findIndex((parts) => parts.some((part) => part > 0))]

  const legendWithSign = (key: string) => (
    <>
      {t(key, { when: t(`reports.thisPeriod.${period}`) })}
      <OmrSign />
    </>
  )

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
          label={t('reports.expenditure.kpi.billed')}
          value={money(netNow)}
          currency
          change={percentPill(netNow, netBefore, language)}
          note={t(`reports.vsBefore.${period}`)}
        />
        {/* Only VAT on approved bills whose receipt was reported can be reclaimed. Until the
            server says which (TODO(backend): REPORTS.md row 1.25) the card shows the VAT charged
            and says reclaim is not confirmed, rather than calling it all reclaimable. */}
        <KpiCard
          label={t(reclaimable ? 'reports.expenditure.kpi.reclaim' : 'reports.expenditure.kpi.vat')}
          value={money(reclaimable ? sumOver(reclaimable, current.months) : vatNow)}
          currency
          change={
            reclaimable
              ? percentPill(
                  sumOver(reclaimable, current.months),
                  sumOver(reclaimable, previous.months),
                  language,
                )
              : percentPill(vatNow, vatBefore, language)
          }
          note={t(
            reclaimable
              ? 'reports.expenditure.kpi.reclaimRate'
              : 'reports.expenditure.kpi.reclaimRateUnconfirmed',
            {
              rate: shortPercent(netNow === 0 ? 0 : (vatNow / netNow) * 100, language),
            },
          )}
        />
        <KpiCard
          label={t('reports.expenditure.kpi.received')}
          value={formatCount(billsNow, language)}
          change={countPill(billsNow, billsBefore, language)}
          note={t(
            `reports.${billsNow === billsBefore ? 'sameAs' : billsNow > billsBefore ? 'moreThan' : 'fewerThan'}.${period}`,
          )}
        />
        <KpiCard
          label={t('reports.expenditure.kpi.average')}
          value={money(average)}
          currency
          change={
            steady ? { text: t('reports.income.kpi.steady'), direction: 'flat' } : averageChange
          }
          note={t(
            steady
              ? 'reports.income.kpi.averageSame'
              : average < averageBefore
                ? billsNow > billsBefore
                  ? 'reports.expenditure.kpi.smallerMoreOften'
                  : 'reports.expenditure.kpi.smaller'
                : 'reports.expenditure.kpi.larger',
          )}
        />
      </KpiRow>
      {decisionsReported ? (
        <p className="text-sm font-medium text-text-tertiary">
          {t('reports.expenditure.notInBilled', {
            when: t(`reports.thisPeriod.${period}`),
            currency,
            pending: money(outsideNow((row) => row.pendingNetAmount)),
            pendingCount: formatCount(outsideNow((row) => row.pendingDocuments), language),
            rejected: money(outsideNow((row) => row.rejectedNetAmount)),
            rejectedCount: formatCount(outsideNow((row) => row.rejectedDocuments), language),
          })}
        </p>
      ) : null}

      <ChartGrid>
        <ChartCard
          title={t('reports.income.monthly')}
          legend={[
            { label: t('reports.expenditure.netBilled'), color: SERIES.strong },
            { label: t('reports.income.vatCharged'), color: '#8a8e96' },
          ]}
          note={
            <Trans
              i18nKey="reports.expenditure.heaviestMonth"
              values={{
                month: t(`reports.monthsLong.${MONTH_IDS[monthIndexOf(months[heaviest])]}`),
                value: whole(monthlyNet[heaviest]),
              }}
              components={{ amount: <OmrNote /> }}
            />
          }
        >
          <StackedBars
            data={monthlyNet.map((value, index) => ({ base: value, top: monthlyVat[index] }))}
            labels={months.map((key) => t(`reports.months.${MONTH_IDS[monthIndexOf(key)]}`))}
            highlight={heaviest}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.expenditure.topSuppliers')}
          legend={[{ label: legendWithSign('reports.expenditure.billedIn'), color: SERIES.strong }]}
          note={shareNote(supplierRows)}
        >
          <RankedBars
            rows={supplierRows.slice(0, 5)}
            loaded={suppliers !== null}
            whole={whole}
            t={t}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.expenditure.byCategory')}
          legend={[{ label: legendWithSign('reports.expenditure.billedIn'), color: SERIES.strong }]}
          note={shareNote(categoryRows)}
        >
          <RankedBars
            rows={categoryRows.slice(0, 5)}
            loaded={categories !== null}
            whole={whole}
            t={t}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.expenditure.howBillsReach')}
          legend={[
            { label: t('reports.expenditure.source.PEPPOL'), color: SERIES.strong },
            { label: t('reports.expenditure.source.UPLOADED'), color: SERIES.grey },
            { label: t('reports.expenditure.source.SCANNED'), color: SERIES.brown },
          ]}
          note={
            peppolShift === null || !firstCounted ? null : (
              <Trans
                i18nKey={
                  peppolShift > 0
                    ? 'reports.expenditure.peppolUp'
                    : peppolShift < 0
                      ? 'reports.expenditure.peppolDown'
                      : 'reports.expenditure.peppolSteady'
                }
                values={{ points: Math.abs(peppolShift), quarter: quarterLabel(firstCounted) }}
                components={{ b: <b className="font-semibold text-text-secondary" /> }}
              />
            )
          }
        >
          <StackedPercentRows
            rows={quarters.map((quarter, index) => ({
              label: quarterLabel(quarter),
              parts: channels[index],
            }))}
            colors={[SERIES.strong, SERIES.grey, SERIES.brown]}
          />
        </ChartCard>
      </ChartGrid>
    </>
  )
}

function RankedBars({
  rows,
  loaded,
  whole,
  t,
}: {
  rows: Ranked[]
  loaded: boolean
  whole: (value: number) => string
  t: (key: string) => string
}) {
  if (rows.length === 0) {
    return (
      <p className="w-full text-center text-sm font-medium text-text-quaternary">
        {t(loaded ? 'reports.expenditure.nothingBilled' : 'reports.loadingChart')}
      </p>
    )
  }
  return (
    <HorizontalBars
      rows={rows.map((entry) => ({
        label: entry.label,
        value: entry.value,
        display: whole(entry.value),
      }))}
    />
  )
}

function dataOf<T>(read: ApiRead<T>): T | null {
  return read.status === 'ready' ? read.data : null
}
