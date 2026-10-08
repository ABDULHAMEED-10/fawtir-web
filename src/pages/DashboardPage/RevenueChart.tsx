import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../components/ui'
import { formatAmount } from '../../lib/format'
import type { VolumeTrendDto } from '../../api/reports/dashboard'
import { DashboardCard } from './DashboardCard'
import { toNumber, type TileView } from './dashboardData'

/**
 * Invoiced value per month, the last twelve through this one, from the dashboard's volume tile
 * (the same figures as `/reports/volume`). The frame's day / week / month switch and its sample
 * bars are gone: the server answers months only.
 */
export function RevenueChart({ trend }: { trend: TileView<VolumeTrendDto> }) {
  const { t, i18n } = useTranslation()

  const months = useMemo(() => {
    if (trend.kind !== 'ok') return []
    const byMonth = new Map<string, number>()
    for (const row of trend.data.months) {
      if (row.currency !== 'OMR') continue
      byMonth.set(row.periodStart, (byMonth.get(row.periodStart) ?? 0) + toNumber(row.totalAmount))
    }
    return [...byMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([start, total]) => ({ start, total }))
  }, [trend])

  const monthLabel = (start: string) =>
    new Intl.DateTimeFormat(i18n.language.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB', {
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${start}T00:00:00Z`))

  const peak = Math.max(0, ...months.map((month) => month.total))
  const current = months.at(-1)

  return (
    <DashboardCard title={t('dashboard.revenue.title')} bodyClassName="pt-3">
      {trend.kind !== 'ok' ? (
        <p className="text-sm font-medium text-text-quaternary">
          {trend.kind === 'loading' ? t('dashboard.loading') : t('dashboard.notAvailableYet')}
        </p>
      ) : months.length === 0 ? (
        <p className="text-sm font-medium text-text-quaternary">{t('dashboard.revenue.none')}</p>
      ) : (
        <>
          <p className="mb-4 flex flex-wrap items-baseline gap-2 font-semibold leading-[1.2] text-text-primary">
            <OmAmount
              size="md"
              amount={formatAmount(current?.total ?? 0, 'OMR', i18n.language)}
              amountClassName="text-2xl font-semibold text-text-primary"
            />
            <span className="text-sm font-medium text-text-quaternary">
              {t('dashboard.revenue.thisMonth')}
            </span>
          </p>
          <div className="flex h-[180px] items-end justify-between gap-2 px-1">
            {months.map((month, index) => (
              <div
                key={month.start}
                className="flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <div
                  title={formatAmount(month.total, 'OMR', i18n.language)}
                  className={[
                    'w-full max-w-[49px] rounded-sm',
                    index === months.length - 1
                      ? 'bg-[repeating-linear-gradient(-45deg,#1a2f6e_0_6px,#233e92_6px_12px)]'
                      : 'bg-primary-100',
                  ].join(' ')}
                  style={{ height: `${peak > 0 ? Math.max(2, (month.total / peak) * 85) : 2}%` }}
                />
                <span className="text-xs font-medium text-text-quaternary">
                  {monthLabel(month.start)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </DashboardCard>
  )
}
