import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../components/ui'
import { COMPLIANCE, QUOTA, VAT } from '../../lib/dashboard'
import { DashboardCard } from './DashboardCard'

export function ComplianceHealth() {
  const { t } = useTranslation()

  return (
    <section className="overflow-hidden rounded-md border border-black/[0.06] bg-surface-card">
      <div className="flex items-center justify-between px-4 pt-3">
        <h2 className="text-base font-semibold text-text-primary">
          {t('dashboard.compliance.title')}
        </h2>
        <span className="text-xs font-medium text-text-quaternary">
          {t('dashboard.thisMonth')}
        </span>
      </div>

      <div className="flex items-center gap-6 px-4 py-4">
        <div className="relative size-[112px] shrink-0">
          <svg viewBox="0 0 112 112" className="size-full -rotate-90">
            <circle cx="56" cy="56" r="46" fill="none" stroke="#EAEDF8" strokeWidth="12" />
            <circle
              cx="56"
              cy="56"
              r="46"
              fill="none"
              stroke="#2C4EB7"
              strokeWidth="12"
              strokeDasharray={`${2 * Math.PI * 46 * 0.987} ${2 * Math.PI * 46}`}
              strokeLinecap="round"
            />
            <circle
              cx="56"
              cy="56"
              r="46"
              fill="none"
              stroke="#8095D4"
              strokeWidth="12"
              strokeDasharray={`${2 * Math.PI * 46 * 0.008} ${2 * Math.PI * 46}`}
              strokeDashoffset={`-${2 * Math.PI * 46 * 0.987}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-sm font-semibold text-text-primary">{COMPLIANCE.accepted}</p>
            <p className="text-[10px] font-medium text-text-quaternary">
              {t('dashboard.compliance.accepted')}
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2.5 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium text-text-tertiary">
              <span className="size-2.5 rounded-sm bg-primary-700" />
              {t('dashboard.compliance.reported')}
            </span>
            <span className="font-semibold text-text-primary">{COMPLIANCE.reported}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium text-text-tertiary">
              <span className="size-2.5 rounded-sm bg-primary-300" />
              {t('dashboard.compliance.mls')}
            </span>
            <span className="font-semibold text-text-primary">{COMPLIANCE.mls}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium text-text-tertiary">
              <span className="size-2.5 rounded-sm bg-danger-700" />
              {t('dashboard.compliance.rejected')}
            </span>
            <span className="font-semibold text-text-primary">{COMPLIANCE.rejected}</span>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="mx-1 mb-1 flex w-[calc(100%-8px)] items-center justify-between rounded-md bg-warning-100 px-4 py-2.5 text-start text-base font-semibold tracking-[0.16px] text-warning-700"
      >
        {t('dashboard.compliance.alert', { count: COMPLIANCE.alertCount })}
        <span aria-hidden="true" className="font-medium">
          →
        </span>
      </button>
    </section>
  )
}

export function InvoiceQuota() {
  const { t } = useTranslation()

  return (
    <DashboardCard
      title={t('dashboard.quota.title')}
      action={
        <span className="text-xs font-medium text-text-quaternary">
          {t('dashboard.quota.billingPeriod')}
        </span>
      }
    >
      <p className="font-semibold leading-[1.2] text-text-primary">
        <span className="text-[22px]">{QUOTA.used}</span>
        <span className="text-sm font-medium text-text-quaternary">
          {' '}
          / {QUOTA.total.toLocaleString()} {t('dashboard.quota.used')}
        </span>
      </p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-primary-50">
        <div
          className="h-full rounded-full bg-primary-700"
          style={{ width: `${QUOTA.percent}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="font-medium text-text-quaternary">{t(QUOTA.resetLabelKey)}</span>
        <span className="font-semibold text-text-primary">{QUOTA.percent}%</span>
      </div>
    </DashboardCard>
  )
}

export function VatPosition() {
  const { t } = useTranslation()

  return (
    <DashboardCard
      title={t('dashboard.vat.title')}
      action={
        <button type="button" className="text-sm font-medium text-primary-700">
          {t('dashboard.vat.report')}
        </button>
      }
    >
      <p className="flex flex-wrap items-center gap-2 font-semibold text-text-primary">
        <OmAmount
          size="md"
          amount={VAT.net}
          amountClassName="text-[22px] font-semibold text-text-primary"
        />
        <span className="rounded-full bg-warning-100 px-2 py-1 text-sm font-medium text-warning-700">
          {t('dashboard.vat.netPayable')}
        </span>
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-sm bg-primary-25 px-3.5 py-2.5">
          <p className="text-sm font-medium text-text-quaternary">
            {t('dashboard.vat.output')}
          </p>
          <OmAmount
            size="sm"
            amount={VAT.output}
            className="mt-1"
            amountClassName="text-base font-semibold text-text-primary"
          />
        </div>
        <div className="rounded-sm bg-primary-25 px-3.5 py-2.5">
          <p className="text-sm font-medium text-text-quaternary">{t('dashboard.vat.input')}</p>
          <OmAmount
            size="sm"
            amount={VAT.input}
            className="mt-1"
            amountClassName="text-base font-semibold text-text-primary"
          />
        </div>
      </div>
    </DashboardCard>
  )
}
