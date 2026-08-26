import { Trans, useTranslation } from 'react-i18next'
import {
  ChartCard,
  ChartGrid,
  GroupedBars,
  HorizontalBars,
  KpiCard,
  KpiRow,
  OmrNote,
  PlainBars,
  ReportShell,
  SERIES,
  StackedPercentRows,
} from '../../components/reports'
import { FISCAL_MONTHS, VAT, formatCount, formatOmr } from '../../lib/reports'

export function ReportsVatPage() {
  const { t } = useTranslation()
  const months = FISCAL_MONTHS.map((month) => t(`reports.months.${month}`))
  const peakMonth = FISCAL_MONTHS[VAT.peakMonthIndex]

  return (
    <ReportShell titleKey="reports.vat.title" subtitleKey="reports.vat.subtitle">
      <KpiRow>
        <KpiCard
          label={t('reports.vat.kpi.collected')}
          value={formatOmr(VAT.collected)}
          currency
          change={{ text: `${VAT.collectedGrowth}%`, direction: 'up' }}
          note={t('reports.vat.kpi.collectedNote')}
        />
        <KpiCard
          label={t('reports.vat.kpi.paid')}
          value={formatOmr(VAT.paid)}
          currency
          change={{ text: `${VAT.paidGrowth}%`, direction: 'up' }}
          note={t('reports.vat.kpi.paidNote')}
        />
        <KpiCard
          label={t('reports.vat.kpi.owed')}
          value={formatOmr(VAT.owed)}
          currency
          change={{ text: `${VAT.owedGrowth}%`, direction: 'up' }}
          note={t('reports.vat.kpi.owedNote')}
        />
        <KpiCard
          label={t('reports.vat.kpi.nextReturn')}
          value={VAT.nextReturnDue}
          note={t('reports.vat.kpi.nextReturnNote')}
        />
      </KpiRow>

      <ChartGrid>
        <ChartCard
          title={t('reports.vat.quarterlyPosition')}
          legend={[
            { label: t('reports.vat.collectedOnSales'), color: SERIES.strong },
            { label: t('reports.vat.paidOnPurchases'), color: SERIES.grey },
          ]}
          note={t('reports.vat.gapWidening')}
        >
          <GroupedBars
            data={VAT.quarterly.map((quarter) => ({ a: quarter.paid, b: quarter.collected }))}
            labels={VAT.quarterly.map((quarter) => t(quarter.labelKey))}
            colors={[SERIES.grey, SERIES.strong]}
            labelWidth={56}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.vat.monthlyNetPayable')}
          legend={[{ label: t('reports.vat.netPayable'), color: SERIES.strong }]}
          note={
            <Trans
              i18nKey="reports.vat.peakMonth"
              values={{
                month: t(`reports.monthsLong.${peakMonth}`),
                value: formatCount(VAT.monthlyNet[VAT.peakMonthIndex]),
              }}
              components={{ amount: <OmrNote /> }}
            />
          }
        >
          <PlainBars
            values={VAT.monthlyNet}
            labels={months}
            highlight={VAT.peakMonthIndex}
            labelWidth={38}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.vat.byTreatment')}
          legend={[
            { label: t('reports.vat.standard'), color: SERIES.strong },
            { label: t('reports.vat.zeroRated'), color: SERIES.softer },
            { label: t('reports.vat.exempt'), color: SERIES.soft },
          ]}
          note={t('reports.vat.almostAllStandard')}
        >
          <StackedPercentRows
            rows={VAT.treatment.map((row) => ({
              label: t(row.labelKey),
              parts: [row.standard, row.zeroRated, row.exempt],
            }))}
            colors={[SERIES.strong, SERIES.softer, SERIES.soft]}
          />
        </ChartCard>

        <ChartCard
          title={t('reports.vat.reclaimBySupplier')}
          legend={[{ label: t('reports.vat.reclaimable'), color: SERIES.strong }]}
          note={t('reports.vat.allBacked')}
        >
          <HorizontalBars
            rows={VAT.reclaimBySupplier.map((supplier) => ({
              label: 'isKey' in supplier && supplier.isKey ? t(supplier.name) : supplier.name,
              value: supplier.value,
              display: formatCount(supplier.value),
            }))}
          />
        </ChartCard>
      </ChartGrid>
    </ReportShell>
  )
}
