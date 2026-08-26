import { Trans, useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  DivergingBars,
  HorizontalBars,
  KpiCard,
  KpiRow,
  OmrNote,
  PlainBars,
  ReportShell,
  SERIES,
} from '../../components/reports'
import { CASH_FLOW, FISCAL_MONTHS, formatCount, formatOmr, formatPercent } from '../../lib/reports'

export function ReportsCashFlowPage() {
  const { t } = useTranslation()
  const months = FISCAL_MONTHS.map((month) => t(`reports.months.${month}`))
  const suppliers = CASH_FLOW.whereItWent[0]

  return (
    <ReportShell titleKey="reports.cashFlow.title" subtitleKey="reports.cashFlow.subtitle">
      <KpiRow>
        <KpiCard
          label={t('reports.cashFlow.kpi.in')}
          value={formatOmr(CASH_FLOW.in)}
          currency
          change={{ text: `${CASH_FLOW.inGrowth}%`, direction: 'up' }}
          note={t('reports.cashFlow.kpi.inNote')}
        />
        <KpiCard
          label={t('reports.cashFlow.kpi.out')}
          value={formatOmr(CASH_FLOW.out)}
          currency
          change={{ text: `${CASH_FLOW.outGrowth}%`, direction: 'up' }}
          note={t('reports.cashFlow.kpi.outNote')}
        />
        <KpiCard
          label={t('reports.cashFlow.kpi.kept')}
          value={formatOmr(CASH_FLOW.kept)}
          currency
          change={{ text: `${CASH_FLOW.keptGrowth}%`, direction: 'up' }}
          note={t('reports.cashFlow.kpi.keptNote')}
        />
        <KpiCard
          label={t('reports.cashFlow.kpi.dueOut')}
          value={formatOmr(CASH_FLOW.dueOut)}
          currency
          note={
            <Trans
              i18nKey="reports.cashFlow.kpi.dueOutNote"
              values={{ value: formatCount(CASH_FLOW.expectedIn) }}
              components={{ amount: <OmrNote /> }}
            />
          }
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.cashFlow.monthlyInOut')}
          legend={[
            { label: t('reports.cashFlow.moneyIn'), color: SERIES.green },
            { label: t('reports.cashFlow.moneyOut'), color: SERIES.brown },
          ]}
          note={CASH_FLOW.positiveEveryMonth ? t('reports.cashFlow.positiveEveryMonth') : null}
        >
          <DivergingBars
            data={CASH_FLOW.monthly.map((entry) => ({ up: entry.in, down: entry.out }))}
            labels={months}
            highlight={FISCAL_MONTHS.length - 1}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.cashFlow.whatYouKept')}
          legend={[{ label: t('reports.cashFlow.surplus'), color: SERIES.green }]}
          note={
            <Trans
              i18nKey="reports.cashFlow.bestMonth"
              values={{ value: formatCount(CASH_FLOW.kept12[CASH_FLOW.bestKeptIndex]) }}
              components={{ amount: <OmrNote /> }}
            />
          }
        >
          <PlainBars
            values={CASH_FLOW.kept12}
            labels={months}
            highlight={CASH_FLOW.bestKeptIndex}
            color={SERIES.greenSoft}
            highlightColor={SERIES.green}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.cashFlow.nextEightWeeks')}
          legend={[
            { label: t('reports.cashFlow.expectedIn'), color: SERIES.green },
            { label: t('reports.cashFlow.committedOut'), color: SERIES.brown },
          ]}
          note={t('reports.cashFlow.tightestWeek', {
            week: CASH_FLOW.weeks[CASH_FLOW.tightestWeekIndex].label,
          })}
        >
          <DivergingBars
            data={CASH_FLOW.weeks.map((week) => ({ up: week.in, down: week.out }))}
            labels={CASH_FLOW.weeks.map((week) => week.label)}
            highlight={CASH_FLOW.tightestWeekIndex}
            labelWidth={54}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.cashFlow.whereItWent')}
          legend={[{ label: t('reports.cashFlow.paidThisYear'), color: SERIES.strong }]}
          note={t('reports.cashFlow.suppliersShare', {
            percent: formatPercent(suppliers.value, CASH_FLOW.out),
          })}
        >
          <HorizontalBars
            rows={CASH_FLOW.whereItWent.map((row) => ({
              label: t(row.labelKey),
              value: row.value,
              display: formatCount(row.value),
            }))}
          />
        </ChartCard>
      </ChartGrid>
    </ReportShell>
  )
}
