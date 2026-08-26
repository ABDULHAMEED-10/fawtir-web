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
  ReportShell,
  SERIES,
  StackedBars,
} from '../../components/reports'
import { FISCAL_MONTHS, INCOME, formatCount, formatOmr, formatPercent } from '../../lib/reports'

export function ReportsIncomePage() {
  const { t } = useTranslation()
  const months = FISCAL_MONTHS.map((month) => t(`reports.months.${month}`))
  const best = INCOME.monthly[INCOME.bestMonthIndex]

  const topTotal = INCOME.topCustomers.reduce((total, customer) => total + customer.value, 0)

  return (
    <ReportShell titleKey="reports.income.title" subtitleKey="reports.income.subtitle">
      <KpiRow>
        <KpiCard
          label={t('reports.income.kpi.invoiced')}
          value={formatOmr(INCOME.net)}
          currency
          change={{ text: `${INCOME.growth}%`, direction: 'up' }}
          note={t('reports.income.kpi.invoicedNote')}
        />
        <KpiCard
          label={t('reports.income.kpi.vat')}
          value={formatOmr(INCOME.vat)}
          currency
          change={{ text: `${INCOME.growth}%`, direction: 'up' }}
          note={t('reports.income.kpi.vatNote')}
        />
        <KpiCard
          label={t('reports.income.kpi.sent')}
          value={formatCount(INCOME.invoicesSent)}
          change={{ text: formatCount(INCOME.invoicesMore), direction: 'up' }}
          note={t('reports.income.kpi.sentNote')}
        />
        <KpiCard
          label={t('reports.income.kpi.average')}
          value={formatOmr(INCOME.averageInvoice)}
          currency
          change={{ text: t('reports.income.kpi.steady'), direction: 'flat' }}
          note={t('reports.income.kpi.averageNote')}
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.income.monthly')}
          legend={[
            { label: t('reports.income.netInvoiced'), color: SERIES.strong },
            { label: t('reports.income.vatCharged'), color: SERIES.grey },
          ]}
          note={
            <Trans
              i18nKey="reports.income.bestMonth"
              values={{
                month: t(`reports.monthsLong.${best.month}`),
                value: formatCount(best.net),
              }}
              components={{ amount: <OmrNote /> }}
            />
          }
        >
          <StackedBars
            data={INCOME.monthly.map((entry) => ({ base: entry.net, top: entry.vat }))}
            labels={months}
            highlight={INCOME.bestMonthIndex}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.income.quarterly')}
          legend={[
            { label: t('reports.income.thisYear'), color: SERIES.strong },
            { label: t('reports.income.lastYear'), color: SERIES.soft },
          ]}
          note={t('reports.income.quarterlyNote')}
        >
          <GroupedBars
            data={INCOME.quarterly.map((value, index) => ({
              a: INCOME.quarterlyLastYear[index],
              b: value,
            }))}
            labels={['Q1', 'Q2', 'Q3', 'Q4']}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.income.annually')}
          legend={[{ label: t('reports.income.kpi.invoiced'), color: SERIES.strong }]}
          note={
            <Trans
              i18nKey="reports.income.onTrack"
              values={{ value: formatCount(INCOME.onTrackFor) }}
              components={{ amount: <OmrNote /> }}
            />
          }
        >
          <LineChart
            values={INCOME.annual.map((entry) => entry.value)}
            labels={INCOME.annual.map((entry) => entry.year)}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.income.topCustomers')}
          legend={[{ label: t('reports.income.invoicedThisYear'), color: SERIES.strong }]}
          note={t('reports.income.topShare', {
            percent: formatPercent(topTotal, INCOME.net),
          })}
        >
          <HorizontalBars
            rows={INCOME.topCustomers.map((customer) => ({
              label: customer.name,
              value: customer.value,
              display: formatCount(customer.value),
            }))}
          />
        </ChartCard>
      </ChartGrid>
    </ReportShell>
  )
}
