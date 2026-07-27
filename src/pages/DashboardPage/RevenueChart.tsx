import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { OmAmount, SegmentedControl } from '../../components/ui'
import { REVENUE, REVENUE_BARS, type PeriodOption } from '../../lib/dashboard'
import { DashboardCard } from './DashboardCard'

export function RevenueChart() {
  const { t } = useTranslation()
  const [period, setPeriod] = useState<PeriodOption>('week')

  return (
    <DashboardCard
      title={t('dashboard.revenue.title')}
      action={
        <SegmentedControl
          ariaLabel={t('dashboard.revenue.periodLabel')}
          value={period}
          onChange={setPeriod}
          className="w-[190px] border-primary-50"
          options={[
            { value: 'day', label: t('dashboard.revenue.day') },
            { value: 'week', label: t('dashboard.revenue.week') },
            { value: 'month', label: t('dashboard.revenue.month') },
          ]}
        />
      }
      bodyClassName="pt-3"
    >
      <p className="mb-4 flex flex-wrap items-baseline gap-2 font-semibold leading-[1.2] text-text-primary">
        <OmAmount
          size="md"
          amount={REVENUE.total}
          amountClassName="text-2xl font-semibold text-text-primary"
        />
        <span className="text-sm font-medium text-text-quaternary">
          {t('dashboard.revenue.thisMonth')}
        </span>
      </p>

      <div className="relative flex gap-3">
        <div className="flex h-[200px] w-[70px] flex-col justify-between pb-6 text-[11px] font-medium text-text-quaternary">
          {REVENUE.yTicks.map((tick) => (
            <span key={tick}>{tick}</span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex h-[156px] flex-col justify-between">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="border-t border-dashed border-border-subtle" />
            ))}
          </div>

          <div className="relative flex h-[180px] items-end justify-between gap-2 px-1">
            {REVENUE_BARS.map((bar) => (
              <div key={bar.day} className="relative flex flex-1 flex-col items-center gap-2">
                {bar.active && bar.tooltip ? (
                  <div className="absolute -top-2 z-10 -translate-y-full rounded-sm border border-border-subtle bg-surface-card px-3 py-2 shadow-card">
                    <p className="flex items-center gap-2 text-xs font-semibold text-text-primary">
                      <span className="size-2.5 rounded-full bg-primary-700" />
                      <OmAmount
                        size="xs"
                        amount={bar.tooltip.amount}
                        amountClassName="text-xs font-semibold text-text-primary"
                      />
                    </p>
                    <p className="mt-1 text-center text-xs font-medium text-text-quaternary">
                      {bar.tooltip.date}
                    </p>
                  </div>
                ) : null}
                <div
                  className={[
                    'w-full max-w-[49px] rounded-sm',
                    bar.active
                      ? 'bg-[repeating-linear-gradient(-45deg,#1a2f6e_0_6px,#233e92_6px_12px)]'
                      : 'bg-primary-100',
                  ].join(' ')}
                  style={{ height: `${bar.value}%` }}
                />
                <span className="text-xs font-medium text-text-quaternary">{bar.day}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DashboardCard>
  )
}
