import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../components/ui'
import { KPI } from '../../lib/dashboard'
import trendIcon from '../../assets/dashboard/kpi-trend.svg'
import { PeriodSelect } from './DashboardCard'
import { USER } from '../../lib/dashboard'

export function DashboardHeader() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-semibold leading-[1.2] text-text-primary">
          {t('dashboard.greeting', { name: USER.firstName })}
        </h1>
        <p className="text-sm font-medium leading-[1.2] text-text-quaternary">
          {t('dashboard.date')}
        </p>
      </div>
      <PeriodSelect label={t('dashboard.thisMonth')} />
    </div>
  )
}

export function KpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <article className="rounded-md bg-surface-card p-5">
        <div className="mb-3.5 flex items-center gap-3.5">
          <img src={KPI.sales.icon} alt="" className="size-11" />
          <h3 className="text-xl font-medium leading-[1.2] text-[#201f23]">
            {t(KPI.sales.titleKey)}
          </h3>
        </div>
        <OmAmount
          size="xl"
          amount={KPI.sales.amount}
          amountClassName="text-[40px] font-semibold leading-[1.2] text-[#201f23]"
        />
        <div className="mt-1 flex items-center gap-2.5">
          <span className="inline-flex items-center gap-0.5 rounded-md bg-[rgba(64,95,31,0.1)] px-1 py-0.5">
            <img src={trendIcon} alt="" className="size-[11px]" />
            <span className="text-sm font-semibold text-[#395917]">{KPI.sales.trend}</span>
          </span>
          <span className="text-sm font-medium text-[#596269] opacity-80">
            {t(KPI.sales.trendLabelKey)}
          </span>
        </div>
      </article>

      <article className="rounded-md bg-surface-card p-5">
        <div className="mb-3.5 flex items-center gap-3.5">
          <img src={KPI.receivables.icon} alt="" className="size-11" />
          <h3 className="text-xl font-medium leading-[1.2] text-[#201f23]">
            {t(KPI.receivables.titleKey)}
          </h3>
        </div>
        <OmAmount
          size="xl"
          amount={KPI.receivables.amount}
          amountClassName="text-[40px] font-semibold leading-[1.2] text-[#201f23]"
        />
        <div className="mt-1 flex items-center gap-2.5">
          <span className="inline-flex h-7 items-center rounded-md bg-[rgba(64,95,31,0.1)] px-2 text-sm font-semibold text-[#395917]">
            {t(KPI.receivables.badgeKey, { count: KPI.receivables.badgeValue })}
          </span>
          <span className="text-sm font-medium text-[#596269] opacity-80">
            {t(KPI.receivables.metaKey, { count: KPI.receivables.metaValue })}
          </span>
        </div>
      </article>

      <article className="rounded-md bg-surface-card p-5">
        <div className="mb-3.5 flex items-center gap-3.5">
          <img src={KPI.payables.icon} alt="" className="size-11" />
          <h3 className="text-xl font-medium leading-[1.2] text-[#201f23]">
            {t(KPI.payables.titleKey)}
          </h3>
        </div>
        <OmAmount
          size="xl"
          amount={KPI.payables.amount}
          amountClassName="text-[40px] font-semibold leading-[1.2] text-[#201f23]"
        />
        <div className="mt-1 flex items-center gap-2.5">
          <span className="inline-flex h-7 items-center rounded-md bg-warning-100 px-2 text-sm font-semibold text-warning-700">
            {t(KPI.payables.badgeKey, { count: KPI.payables.badgeValue })}
          </span>
          <span className="text-sm font-medium text-[#596269] opacity-80">
            {t(KPI.payables.metaKey, { count: KPI.payables.metaValue })}
          </span>
        </div>
      </article>
    </div>
  )
}
