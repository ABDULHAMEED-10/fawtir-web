import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../components/ui'
import { useSession } from '../../lib/session/session'
import { BUSINESS_TIME_ZONE, formatAmount } from '../../lib/format'
import type { CashDto, ReceivableRowDto } from '../../api/reports/dashboard'
import type { BillSummaryDto } from '../../api/expenditure/bills'
import { omrRow, toNumber, type TileView } from './dashboardData'
import salesIcon from '../../assets/dashboard/kpi-sales.svg'
import receivablesIcon from '../../assets/dashboard/kpi-receivables.svg'
import payablesIcon from '../../assets/dashboard/kpi-payables.svg'

export function DashboardHeader({ now = new Date() }: { now?: Date }) {
  const { t, i18n } = useTranslation()
  // The username is the only name the session carries (`/me/entitlements` has no display name).
  const name = useSession()?.username
  // Today in the business's time zone and the reader's language. It used to be a fixed sample
  // date in the translation file.
  const today = new Intl.DateTimeFormat(i18n.language.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: BUSINESS_TIME_ZONE,
  }).format(now)

  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-semibold leading-[1.2] text-text-primary">
          {name ? t('dashboard.greeting', { name }) : t('dashboard.greetingNoName')}
        </h1>
        <p className="text-sm font-medium leading-[1.2] text-text-quaternary">{today}</p>
      </div>
    </div>
  )
}

export function KpiCards({
  cash,
  receivables,
  payables,
}: {
  cash: TileView<CashDto>
  receivables: TileView<ReceivableRowDto[]>
  payables: TileView<BillSummaryDto>
}) {
  const { t, i18n } = useTranslation()
  const omr = (value: number) => formatAmount(value, 'OMR', i18n.language)

  const cashRow = cash.kind === 'ok' ? omrRow(cash.data.byCurrency) : undefined
  const owed = receivables.kind === 'ok' ? omrRow(receivables.data) : undefined

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* The frame's "Today's sales": no tile carries a day's sales or the change on yesterday
          (TODO(backend): REPORTS.md row 2.1), so the card says so and shows the cash received this
          month, which the server does answer, beneath it. */}
      <article className="rounded-md bg-surface-card p-5">
        <div className="mb-3.5 flex items-center gap-3.5">
          <img src={salesIcon} alt="" className="size-11" />
          <h3 className="text-xl font-medium leading-[1.2] text-[#201f23]">
            {t('dashboard.kpi.sales')}
          </h3>
        </div>
        <p className="text-sm font-medium text-text-quaternary">
          {cash.kind === 'loading' ? t('dashboard.loading') : t('dashboard.notAvailableYet')}
        </p>
        {cash.kind === 'ok' ? (
          <p className="mt-2 text-sm font-medium text-[#596269]">
            {t('dashboard.kpi.cashThisMonth')}:{' '}
            <OmAmount
              size="xs"
              amount={omr(toNumber(cashRow?.received))}
              amountClassName="font-semibold text-text-primary"
            />
          </p>
        ) : null}
      </article>

      <KpiCard icon={receivablesIcon} title={t('dashboard.kpi.receivables')} view={receivables}>
        <Figure amount={omr(toNumber(owed?.outstanding))} />
        <Meta badge={t('dashboard.kpi.open', { count: owed?.openCount ?? 0 })}>
          {t('dashboard.kpi.overdue', { count: owed?.overdueCount ?? 0 })}
        </Meta>
      </KpiCard>

      <KpiCard icon={payablesIcon} title={t('dashboard.kpi.payables')} view={payables}>
        {payables.kind === 'ok' ? (
          <>
            <Figure amount={omr(toNumber(payables.data.openTotal))} />
            <Meta badge={t('dashboard.kpi.dueThisWeek', { count: payables.data.dueThisWeekCount })} warning>
              {t('dashboard.kpi.overdue', { count: payables.data.overdueCount })}
            </Meta>
          </>
        ) : null}
      </KpiCard>
    </div>
  )
}

function KpiCard({
  icon,
  title,
  view,
  children,
}: {
  icon: string
  title: string
  view: TileView<unknown>
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <article className="rounded-md bg-surface-card p-5">
      <div className="mb-3.5 flex items-center gap-3.5">
        <img src={icon} alt="" className="size-11" />
        <h3 className="text-xl font-medium leading-[1.2] text-[#201f23]">{title}</h3>
      </div>
      {view.kind === 'ok' ? (
        children
      ) : (
        <p className="text-sm font-medium text-text-quaternary">
          {view.kind === 'loading' ? t('dashboard.loading') : t('dashboard.notAvailableYet')}
        </p>
      )}
    </article>
  )
}

function Figure({ amount }: { amount: string }) {
  return (
    <OmAmount
      size="xl"
      amount={amount}
      amountClassName="text-[40px] font-semibold leading-[1.2] text-[#201f23]"
    />
  )
}

function Meta({
  badge,
  warning = false,
  children,
}: {
  badge?: string
  warning?: boolean
  children: ReactNode
}) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2.5">
      {badge ? (
        <span
          className={[
            'inline-flex h-7 items-center rounded-md px-2 text-sm font-semibold',
            warning ? 'bg-warning-100 text-warning-700' : 'bg-[rgba(64,95,31,0.1)] text-[#395917]',
          ].join(' ')}
        >
          {badge}
        </span>
      ) : null}
      <span className="text-sm font-medium text-[#596269] opacity-80">{children}</span>
    </div>
  )
}
