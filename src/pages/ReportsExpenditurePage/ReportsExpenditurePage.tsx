import { Trans, useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  HorizontalBars,
  KpiCard,
  KpiRow,
  OmrNote,
  ReportShell,
  SERIES,
  StackedBars,
  StackedPercentRows,
} from '../../components/reports'
import {
  EXPENDITURE,
  FISCAL_MONTHS,
  formatCount,
  formatOmr,
  formatPercent,
} from '../../lib/reports'

export function ReportsExpenditurePage() {
  const { t } = useTranslation()
  const months = FISCAL_MONTHS.map((month) => t(`reports.months.${month}`))
  const heaviest = EXPENDITURE.monthly[EXPENDITURE.heaviestMonthIndex]
  const topSupplier = EXPENDITURE.topSuppliers[0]
  const topCategory = EXPENDITURE.byCategory[0]

  return (
    <ReportShell titleKey="reports.expenditure.title" subtitleKey="reports.expenditure.subtitle">
      <KpiRow>
        <KpiCard
          label={t('reports.expenditure.kpi.billed')}
          value={formatOmr(EXPENDITURE.net)}
          currency
          change={{ text: `${EXPENDITURE.growth}%`, direction: 'up' }}
          note={t('reports.expenditure.kpi.billedNote')}
        />
        <KpiCard
          label={t('reports.expenditure.kpi.vat')}
          value={formatOmr(EXPENDITURE.vat)}
          currency
          change={{ text: `${EXPENDITURE.growth}%`, direction: 'up' }}
          note={t('reports.expenditure.kpi.vatNote')}
        />
        <KpiCard
          label={t('reports.expenditure.kpi.received')}
          value={formatCount(EXPENDITURE.billsReceived)}
          change={{ text: formatCount(EXPENDITURE.billsMore), direction: 'up' }}
          note={t('reports.expenditure.kpi.receivedNote')}
        />
        <KpiCard
          label={t('reports.expenditure.kpi.average')}
          value={formatOmr(EXPENDITURE.averageBill)}
          currency
          change={{ text: `${EXPENDITURE.averageChange}%`, direction: 'down' }}
          note={t('reports.expenditure.kpi.averageNote')}
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.expenditure.monthly')}
          legend={[
            { label: t('reports.expenditure.netBilled'), color: SERIES.strong },
            { label: t('reports.expenditure.vatCharged'), color: SERIES.grey },
          ]}
          note={
            <Trans
              i18nKey="reports.expenditure.heaviestMonth"
              values={{
                month: t(`reports.monthsLong.${heaviest.month}`),
                value: formatCount(heaviest.net),
              }}
              components={{ amount: <OmrNote /> }}
            />
          }
        >
          <StackedBars
            data={EXPENDITURE.monthly.map((entry) => ({ base: entry.net, top: entry.vat }))}
            labels={months}
            highlight={EXPENDITURE.heaviestMonthIndex}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.expenditure.topSuppliers')}
          legend={[{ label: t('reports.expenditure.billedThisYear'), color: SERIES.strong }]}
          note={t('reports.expenditure.topSupplierShare', {
            name: topSupplier.name,
            percent: formatPercent(topSupplier.value, EXPENDITURE.net),
          })}
        >
          <HorizontalBars
            rows={EXPENDITURE.topSuppliers.map((supplier) => ({
              label: supplier.name,
              value: supplier.value,
              display: formatCount(supplier.value),
            }))}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.expenditure.byCategory')}
          legend={[{ label: t('reports.expenditure.billedThisYear'), color: SERIES.strong }]}
          note={t('reports.expenditure.topCategoryShare', {
            name: t(topCategory.labelKey),
            percent: formatPercent(topCategory.value, EXPENDITURE.net),
          })}
        >
          <HorizontalBars
            rows={EXPENDITURE.byCategory.map((category) => ({
              label: t(category.labelKey),
              value: category.value,
              display: formatCount(category.value),
            }))}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.expenditure.howBillsReach')}
          legend={[
            { label: t('reports.expenditure.peppol'), color: SERIES.strong },
            { label: t('reports.expenditure.uploaded'), color: SERIES.softer },
            { label: t('reports.expenditure.scanned'), color: SERIES.brown },
          ]}
          note={t('reports.expenditure.peppolUp', {
            points:
              EXPENDITURE.channels[EXPENDITURE.channels.length - 1].peppol -
              EXPENDITURE.channels[0].peppol,
          })}
        >
          <StackedPercentRows
            rows={EXPENDITURE.channels.map((row) => ({
              label: t(row.labelKey),
              parts: [row.peppol, row.uploaded, row.scanned],
            }))}
            colors={[SERIES.strong, SERIES.softer, SERIES.brown]}
          />
        </ChartCard>
      </ChartGrid>
    </ReportShell>
  )
}
