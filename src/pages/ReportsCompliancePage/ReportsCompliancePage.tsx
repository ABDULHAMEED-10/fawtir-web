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
} from '../../components/reports'
import {
  COMPLIANCE,
  FISCAL_MONTHS,
  formatCount,
  formatDuration,
  formatPercent,
} from '../../lib/reports'

export function ReportsCompliancePage() {
  const { t } = useTranslation()
  const months = FISCAL_MONTHS.map((month) => t(`reports.months.${month}`))
  const best = Math.max(...COMPLIANCE.monthlyAcceptance)

  return (
    <ReportShell titleKey="reports.compliance.title" subtitleKey="reports.compliance.subtitle">
      <KpiRow>
        <KpiCard
          label={t('reports.compliance.kpi.accepted')}
          value={`${COMPLIANCE.acceptedPercent.toFixed(1)}%`}
          change={{ text: `${COMPLIANCE.acceptedChange}pt`, direction: 'up' }}
          note={t('reports.compliance.kpi.acceptedNote', {
            accepted: formatCount(COMPLIANCE.acceptedFirstTime),
            sent: formatCount(COMPLIANCE.sent),
          })}
        />
        <KpiCard
          label={t('reports.compliance.kpi.timeToClear')}
          value={formatDuration(COMPLIANCE.averageSeconds)}
          change={{ text: `${COMPLIANCE.fasterBy}s`, direction: 'down' }}
          note={t('reports.compliance.kpi.timeToClearNote')}
        />
        <KpiCard
          label={t('reports.compliance.kpi.rejections')}
          value={formatCount(COMPLIANCE.rejected)}
          change={{ text: formatCount(COMPLIANCE.rejectionsFewer), direction: 'down' }}
          note={t('reports.compliance.kpi.rejectionsNote')}
        />
        <KpiCard
          label={t('reports.compliance.kpi.delivered')}
          value={`${COMPLIANCE.onTimePercent.toFixed(1)}%`}
          note={t('reports.compliance.kpi.deliveredNote', {
            late: COMPLIANCE.lateDeliveries,
            sent: formatCount(COMPLIANCE.sent),
          })}
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.compliance.acceptedFirstTime')}
          legend={[{ label: t('reports.compliance.acceptanceSeries'), color: SERIES.strong }]}
          note={t('reports.compliance.bestMonthYet', { percent: best.toFixed(1) })}
        >
          <LineChart values={COMPLIANCE.monthlyAcceptance} labels={months} labelWidth={38} />
        </ChartCard>

        <ChartCard
          title={t('reports.compliance.whyRejected')}
          legend={[{ label: t('reports.compliance.rejections'), color: SERIES.strong }]}
          note={t('reports.compliance.oneCause', {
            percent: formatPercent(COMPLIANCE.reasons[0].value, COMPLIANCE.rejected),
          })}
        >
          <HorizontalBars
            rows={COMPLIANCE.reasons.map((reason) => ({
              label: t(reason.labelKey),
              value: reason.value,
              display: formatCount(reason.value),
            }))}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.compliance.timeToClear')}
          legend={[{ label: t('reports.compliance.secondsToAcceptance'), color: SERIES.green }]}
          note={t('reports.compliance.insideTheRule')}
        >
          <PlainBars
            values={COMPLIANCE.secondsToClear}
            labels={months}
            highlight={COMPLIANCE.secondsToClear.length - 1}
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
          ]}
          note={t('reports.compliance.retriesFalling')}
        >
          <StackedPercentRows
            rows={COMPLIANCE.outcomes.map((row) => ({
              label: t(row.labelKey),
              parts: [row.firstTime, row.onRetry, row.failed],
            }))}
            colors={[SERIES.green, SERIES.brown, SERIES.rose]}
            minLabelWidth={10}
          />
        </ChartCard>
      </ChartGrid>
    </ReportShell>
  )
}
