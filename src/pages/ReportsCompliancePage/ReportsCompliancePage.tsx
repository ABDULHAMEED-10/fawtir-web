import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  HorizontalBars,
  KpiCard,
  KpiRow,
  LineChart,
  PlainBars,
  ReportShell,
  SERIES,
  StackedPercentRows,
  useReportPeriod,
} from '../../components/reports'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead, type ApiRead } from '../../hooks'
import {
  activityListPath,
  activitySummaryPath,
  ledgerExportPath,
  loadActivityList,
  loadActivitySummary,
  type ActivityListDto,
  type ActivitySummaryDto,
} from '../../api/compliance/activity'
import { deliveredCount } from '../../lib/activityLedger'
import {
  MONTH_IDS,
  currentMonth,
  isoDate,
  lastQuarters,
  monthEnd,
  monthIndexOf,
  monthStart,
  periodWindows,
  roundShares,
  shareOfTotal,
  topWithRest,
  trailingMonths,
  type Quarter,
  type ReportPeriod,
} from '../../lib/reportPeriod'
import { countPill, shortPercent } from '../../lib/reportFigures'
import { formatCount } from '../../lib/format'

/** How many rejected documents are read to rank their reasons. */
const REASON_SAMPLE = 100

type Summaries = {
  span: ActivitySummaryDto
  before: ActivitySummaryDto
  /** One per trailing month, oldest first. */
  months: ActivitySummaryDto[]
}

/**
 * Reports › Compliance (Figma 154:107354).
 *
 * Read from the compliance ledger's summary (`/compliance/activity/summary`), the same one the
 * Activity screen reads. It counts what each leg's acknowledgement said: the tax authority
 * endpoint's for the TDD, and the receiving Access Point's for the invoice. An acknowledgement is
 * transport, not a tax verdict, and "no acknowledgement yet" is silence, not a failure, so the
 * page counts silence apart from rejection wherever it appears.
 *
 * The summary answers one window at a time, so the monthly charts read one summary per month and
 * the figures read the pill's window and the one before it. TODO(backend): a bucketed summary
 * (asks 1.15) would make that one call. The reasons card ranks the reasons on the first
 * rejected documents of the window (asks 1.16).
 */
export function ReportsCompliancePage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [period] = useReportPeriod()
  const today = useMemo(() => new Date(), [])
  const { current, previous } = periodWindows(period, today)
  const months = trailingMonths(today)

  // Every call carries a window: the summary answers 400 without one.
  const monthPaths = months.map((key) =>
    activitySummaryPath(
      monthStart(key),
      key === currentMonth(today) ? isoDate(today) : monthEnd(key),
    ),
  )
  const windowPath = activitySummaryPath(current.from, current.to)
  const beforePath = activitySummaryPath(previous.from, previous.to)
  const summaries = useApiRead<Summaries>(
    `compliance-report|${windowPath}|${beforePath}|${monthPaths.join('|')}`,
    async () => {
      const [span, before, ...monthly] = await Promise.all(
        [windowPath, beforePath, ...monthPaths].map((path) => loadActivitySummary(path)),
      )
      return { span, before, months: monthly }
    },
  )

  const rejectedPath = activityListPath(
    { tddAck: 'RE', from: current.from, to: current.to },
    0,
    REASON_SAMPLE,
  )
  const rejected = useApiRead<ActivityListDto>(rejectedPath, () => loadActivityList(rejectedPath))

  return (
    <ReportShell
      titleKey="reports.compliance.title"
      subtitleKey="reports.compliance.subtitle"
      // The export is of the LEDGER, one row per document, for the same window: a file of the
      // counts above would prove nothing about any single document.
      downloads={[
        {
          format: 'xlsx',
          path: ledgerExportPath({ from: current.from, to: current.to }, 'xlsx'),
          name: 'fawtir-compliance-ledger',
        },
        {
          format: 'csv',
          path: ledgerExportPath({ from: current.from, to: current.to }, 'csv'),
          name: 'fawtir-compliance-ledger',
        },
      ]}
    >
      {summaries.read.status === 'loading' ? <LoadingNotice /> : null}
      {summaries.read.status === 'failed' ? (
        <ApiReadFailure error={summaries.read.error} retry={summaries.retry} />
      ) : null}

      {summaries.read.status === 'ready' ? (
        <ComplianceBody
          summaries={summaries.read.data}
          rejected={rejected.read}
          months={months}
          quarters={lastQuarters(today, 4)}
          period={period}
          today={today}
          language={language}
          t={t}
        />
      ) : null}
    </ReportShell>
  )
}

/** Acknowledged one way or the other, as a share of the documents in the window. */
function acceptedShare(summary: ActivitySummaryDto): number | null {
  return summary.documents === 0
    ? null
    : (deliveredCount(summary.tdd_ack) / summary.documents) * 100
}

function clock(seconds: number, t: (key: string, values?: Record<string, unknown>) => string) {
  const whole = Math.round(seconds)
  return t('reports.compliance.clock', { minutes: Math.floor(whole / 60), seconds: whole % 60 })
}

function ComplianceBody({
  summaries,
  rejected,
  months,
  quarters,
  period,
  today,
  language,
  t,
}: {
  summaries: Summaries
  rejected: ApiRead<ActivityListDto>
  months: string[]
  quarters: Quarter[]
  period: ReportPeriod
  today: Date
  language: string
  t: (key: string, values?: Record<string, unknown>) => string
}) {
  const { span, before } = summaries

  if (span.documents === 0) {
    return (
      <p className="rounded-md bg-surface-card p-10 text-center text-sm font-medium text-text-quaternary">
        {t('reports.compliance.empty')}
      </p>
    )
  }

  const accepted = acceptedShare(span) ?? 0
  const acceptedBefore = acceptedShare(before)
  const pointChange = acceptedBefore === null ? null : accepted - acceptedBefore
  const medianSeconds =
    span.median_minutes_to_tdd_ack === null ? null : span.median_minutes_to_tdd_ack * 60
  const medianBefore =
    before.median_minutes_to_tdd_ack === null ? null : before.median_minutes_to_tdd_ack * 60
  const decided = span.sla.met + span.sla.missed

  // A month with nothing sent has no rate; the line holds the last one rather than dropping to
  // zero, which would read as every document failing.
  let carried = 0
  const monthlyAccepted = summaries.months.map((summary) => {
    const share = acceptedShare(summary)
    carried = share === null ? carried : share
    return Math.round(carried * 10) / 10
  })
  const monthlySeconds = summaries.months.map((summary) =>
    summary.median_minutes_to_tdd_ack === null
      ? 0
      : Math.round(summary.median_minutes_to_tdd_ack * 60),
  )
  const monthLabels = months.map((key) => t(`reports.months.${MONTH_IDS[monthIndexOf(key)]}`))
  const bestMonth = Math.max(...monthlyAccepted)
  const slowest = Math.max(...monthlySeconds)

  // What happened, by quarter, from the monthly counts that fall in it. "On retry" waits on the
  // TDD lineage being counted (asks 1.17); silence is its own grey part, never folded into a
  // failure.
  const outcomes = quarters.map((quarter) => {
    const counts = summaries.months.filter((_, index) => quarter.months.includes(months[index]))
    const sum = (pick: (summary: ActivitySummaryDto) => number) =>
      counts.reduce((total, summary) => total + pick(summary), 0)
    return roundShares([
      sum((summary) => deliveredCount(summary.tdd_ack)),
      0,
      sum((summary) => summary.tdd_ack.re),
      sum((summary) => summary.tdd_ack.none),
    ])
  })
  const failures = outcomes
    .filter((parts) => parts.some((part) => part > 0))
    .map((parts) => parts[2])
  const failuresFalling =
    failures.length > 1 &&
    failures.every((value, index) => index === 0 || value < failures[index - 1])
  const quarterLabel = (quarter: Quarter) =>
    quarter.months.includes(currentMonth(today))
      ? t('reports.quarterSoFar', { quarter: quarter.quarter })
      : t('reports.quarterLabel', { quarter: quarter.quarter, year: quarter.year })

  const reasons =
    rejected.status === 'ready'
      ? topWithRest(
          [
            ...rejected.data.items
              .reduce((totals, item) => {
                const reason = item.tdd_leg?.reason?.trim() || t('reports.compliance.noReason')
                const found = totals.get(reason) ?? { key: reason, label: reason, value: 0 }
                found.value += 1
                return totals.set(reason, found)
              }, new Map<string, { key: string; label: string; value: number }>())
              .values(),
          ],
          4,
          t('reports.compliance.reasons.everythingElse'),
        )
      : []
  const reasonTotal = reasons.reduce((sum, row) => sum + row.value, 0)

  return (
    <>
      <KpiRow>
        <KpiCard
          label={t('reports.compliance.kpi.accepted')}
          value={`${shortPercent(accepted, language)}%`}
          change={
            pointChange === null
              ? null
              : {
                  text: t('reports.compliance.points', {
                    value: shortPercent(Math.abs(pointChange), language),
                  }),
                  direction: pointChange >= 0 ? 'up' : 'down',
                }
          }
          note={t('reports.compliance.kpi.acceptedNote', {
            accepted: formatCount(deliveredCount(span.tdd_ack), language),
            sent: formatCount(span.documents, language),
          })}
        />
        <KpiCard
          label={t('reports.compliance.kpi.timeToClear')}
          value={medianSeconds === null ? t('reports.compliance.noClock') : clock(medianSeconds, t)}
          change={
            medianSeconds === null || medianBefore === null || medianSeconds === medianBefore
              ? null
              : {
                  text: t('reports.compliance.seconds', {
                    count: Math.round(Math.abs(medianSeconds - medianBefore)),
                  }),
                  direction: medianSeconds < medianBefore ? 'down' : 'up',
                }
          }
          note={
            medianSeconds === null || medianBefore === null || medianSeconds === medianBefore
              ? t('reports.compliance.kpi.medianNote')
              : t(
                  `reports.compliance.kpi.${medianSeconds < medianBefore ? 'faster' : 'slower'}.${period}`,
                )
          }
        />
        <KpiCard
          label={t('reports.compliance.kpi.rejections')}
          value={formatCount(span.tdd_ack.re, language)}
          // Fewer rejections point down, as the frame draws them.
          change={countPill(span.tdd_ack.re, before.tdd_ack.re, language)}
          note={t(
            `reports.${span.tdd_ack.re > before.tdd_ack.re ? 'moreThan' : 'fewerThan'}.${period}`,
          )}
        />
        <KpiCard
          label={t('reports.compliance.kpi.delivered')}
          value={
            decided === 0
              ? t('reports.compliance.noneDecided')
              : `${shortPercent((span.sla.met / decided) * 100, language)}%`
          }
          note={t('reports.compliance.kpi.deliveredNote', {
            late: formatCount(span.sla.missed, language),
            sent: formatCount(span.documents, language),
          })}
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.compliance.acceptedFirstTime')}
          legend={[{ label: t('reports.compliance.acceptanceSeries'), color: SERIES.strong }]}
          note={t('reports.compliance.bestMonthYet', {
            percent: shortPercent(bestMonth, language),
          })}
        >
          <LineChart values={monthlyAccepted} labels={monthLabels} labelWidth={38} />
        </ChartCard>

        <ChartCard
          title={t('reports.compliance.whyRejected')}
          legend={[
            { label: t('reports.compliance.highRejections'), color: SERIES.strong },
            { label: t('reports.compliance.lowRejections'), color: SERIES.soft },
          ]}
          note={
            reasons.length > 0
              ? t('reports.compliance.oneCause', {
                  percent: formatCount(shareOfTotal(reasons[0].value, reasonTotal), language),
                })
              : null
          }
        >
          {reasons.length > 0 ? (
            <HorizontalBars
              rows={reasons.map((row) => ({
                label: row.label,
                value: row.value,
                display: formatCount(row.value, language),
              }))}
            />
          ) : (
            <p className="w-full text-center text-sm font-medium text-text-quaternary">
              {t(
                rejected.status === 'loading'
                  ? 'reports.loadingChart'
                  : 'reports.compliance.noRejections',
              )}
            </p>
          )}
        </ChartCard>

        <ChartCard
          title={t('reports.compliance.timeToClear')}
          legend={[{ label: t('reports.compliance.secondsToAcceptance'), color: SERIES.green }]}
          note={
            slowest < 24 * 60 * 60
              ? t('reports.compliance.insideTheRule')
              : t('reports.compliance.outsideTheRule')
          }
        >
          <PlainBars
            values={monthlySeconds}
            labels={monthLabels}
            highlight={monthlySeconds.length - 1}
            color={SERIES.greenSoft}
            highlightColor={SERIES.green}
            labelWidth={38}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.compliance.whatHappened')}
          legend={[
            { label: t('reports.compliance.firstTime'), color: SERIES.green },
            { label: t('reports.compliance.onRetry'), color: SERIES.brown },
            { label: t('reports.compliance.deliveryFailed'), color: SERIES.rose },
            { label: t('activity.ack.NONE'), color: SERIES.grey },
          ]}
          note={failuresFalling ? t('reports.compliance.failuresFalling') : null}
        >
          <StackedPercentRows
            rows={quarters.map((quarter, index) => ({
              label: quarterLabel(quarter),
              parts: outcomes[index],
            }))}
            colors={[SERIES.green, SERIES.brown, SERIES.rose, SERIES.grey]}
            minLabelWidth={10}
          />
        </ChartCard>
      </ChartGrid>
    </>
  )
}
