import { useState } from 'react'
import { useWorkingBranch } from '../../components/branch/BranchPicker'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu } from '../../components/ui'
import { posSaleRowActions } from '../../lib/rowActions'
import { TILL, omr } from '../../lib/pos'
import {
  BEST_SELLER,
  BEST_SELLER_EACH,
  BUSIEST_HOUR,
  GROUPS,
  TODAY_KPI,
  TODAY_TABS,
  groupTotal,
  salesForTab,
  type TodayTabId,
} from '../../lib/posToday'

const STATE_TONE = {
  filed: 'bg-success-100 text-success-700',
  peppol: 'bg-primary-50 text-primary-800',
  credited: 'bg-pending-100 text-pending-700',
} as const

export function PosTodayPage() {
  const { t, i18n } = useTranslation()
  // The till's branch is the one picked on the sale screen; the sample's until branches load.
  const branchName = useWorkingBranch().branch?.name ?? TILL.branch
  const [tab, setTab] = useState<TodayTabId>('all')
  const [query, setQuery] = useState('')

  const locale = i18n.language.startsWith('ar') ? 'ar' : 'en-GB'
  const day = TILL.now.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <Link
          to="/pos"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-tertiary hover:text-primary-700"
        >
          ‹ {t('pos.backToTill')}
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('pos.today.title')}
            </h1>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
              {t('pos.today.subtitle', {
                branch: branchName,
                till: TILL.number,
                day,
                upTo: '14:32',
              })}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <button
              type="button"
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('pos.today.yesterday')}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('pos.today.pickDate')}
            </button>
            <Link
              to="/pos/close"
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('pos.today.closingTill')}
            </Link>
          </div>
        </div>

        <label className="flex h-[58px] w-full items-center gap-3 rounded-md border-2 border-primary-700 bg-surface-card px-4">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            className="shrink-0 text-primary-700"
          >
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="m20 20-3.5-3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('pos.today.searchPlaceholder')}
            className="h-full w-full border-0 bg-transparent text-base font-medium text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>

        <div className="flex flex-wrap gap-4">
          <Kpi
            title={t('pos.today.soldSoFar')}
            value={omr(TODAY_KPI.sold)}
            note={t('pos.today.soldNote', {
              sales: TODAY_KPI.sales,
              average: omr(TODAY_KPI.average),
            })}
          />
          <Kpi
            title={t('pos.today.busiestHour')}
            value={t('pos.today.salesCount', { count: BUSIEST_HOUR.sales })}
            note={`${BUSIEST_HOUR.from} ${t('pos.today.to')} ${BUSIEST_HOUR.to}`}
          />
          <Kpi
            title={t('pos.today.refunded')}
            value={omr(TODAY_KPI.refunded)}
            note={t('pos.today.refundNote', { count: TODAY_KPI.refundCount })}
          />
          <Kpi
            title={t('pos.today.bestSeller')}
            value={BEST_SELLER.name}
            note={t('pos.today.bestNote', {
              sold: BEST_SELLER.sold,
              takings: omr(BEST_SELLER.takings),
              each: omr(BEST_SELLER_EACH),
            })}
            small
          />
        </div>

        <section className="flex flex-col rounded-md bg-surface-card">
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border-subtle px-6 pt-4">
            {TODAY_TABS.map((entry) => {
              const active = entry.id === tab
              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => setTab(entry.id)}
                  aria-pressed={active}
                  className={[
                    'relative flex items-center gap-1.5 pb-3 text-base transition-colors',
                    active
                      ? 'font-semibold text-primary-800'
                      : 'font-medium text-text-tertiary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(entry.labelKey)}
                  <span className="text-xs font-semibold text-text-quaternary">{entry.count}</span>
                  {active ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-primary-700" />
                  ) : null}
                </button>
              )
            })}
          </div>

          {GROUPS.map((group) => {
            const sales = salesForTab(tab, group.sales).filter((sale) =>
              `${sale.id} ${sale.what} ${sale.cashier}`
                .toLowerCase()
                .includes(query.trim().toLowerCase()),
            )
            if (!sales.length) return null
            return (
              <div key={group.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-background px-6 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
                    {t(group.titleKey, group.titleValues)}
                  </p>
                  <p className="text-xs font-medium text-text-quaternary">
                    {t('pos.today.groupTotal', {
                      count: sales.length,
                      amount: omr(groupTotal(sales)),
                    })}
                  </p>
                </div>
                <ul>
                  {sales.map((sale) => (
                    <li
                      key={sale.id}
                      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border-subtle px-6 py-3.5 last:border-b-0"
                    >
                      <span className="w-12 shrink-0 text-sm font-medium text-text-quaternary">
                        {sale.time}
                      </span>
                      <span className="w-24 shrink-0">
                        <Link
                          to="/invoices"
                          className="text-sm font-semibold text-primary-700 hover:text-primary-800"
                        >
                          {sale.id}
                        </Link>
                        <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                          {sale.cashier}
                        </span>
                      </span>
                      <span className="min-w-[180px] flex-1">
                        <span className="block text-sm font-medium text-text-primary">
                          {sale.what}
                        </span>
                        <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                          {t('pos.today.itemCount', { count: sale.items })}
                        </span>
                      </span>
                      <span className="w-[132px] shrink-0">
                        <span className="block text-sm font-medium text-text-primary">
                          {t(sale.payMethodKey)}
                        </span>
                        {sale.payDetailKey ? (
                          <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                            {t(sale.payDetailKey, sale.payDetailValues)}
                          </span>
                        ) : null}
                      </span>
                      <span className="w-[112px] shrink-0 text-end">
                        <span className="block text-base font-semibold text-text-primary">
                          {omr(sale.total)}
                        </span>
                        {sale.amountNoteKey ? (
                          <span className="mt-0.5 block text-xs font-medium text-text-quaternary">
                            {t(sale.amountNoteKey, sale.amountNoteValues)}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={`inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-[0.04em] ${STATE_TONE[sale.state]}`}
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                        {t(`pos.today.state.${sale.state}`)}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <Link
                          to={sale.refundable ? '/pos/refund' : '/pos/today'}
                          className="inline-flex h-9 items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
                        >
                          {sale.refundable ? t('pos.today.refund') : t('pos.today.seeNote')}
                        </Link>
                        <ActionMenu items={posSaleRowActions(sale.id)} label={t('pos.today.rowMenu')} />
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </section>
      </div>
    </AppShell>
  )
}

function Kpi({
  title,
  value,
  note,
  small,
}: {
  title: string
  value: string
  note: string
  small?: boolean
}) {
  return (
    <article className="flex min-w-[240px] flex-1 flex-col gap-2 rounded-md bg-surface-card p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-quaternary">
        {title}
      </p>
      <p
        className={[
          'font-semibold leading-[1.2] text-text-primary',
          small ? 'text-2xl' : 'text-[30px]',
        ].join(' ')}
      >
        {value}
      </p>
      <p className="text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
    </article>
  )
}
