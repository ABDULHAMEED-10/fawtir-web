import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu } from '../../components/ui'
import { scheduleRowActions } from '../../lib/rowActions'
import {
  SCHEDULE_KPI,
  SCHEDULE_PAGE_NUMBERS,
  SCHEDULE_ROWS,
  SCHEDULE_TABS,
  countScheduleTab,
  matchesScheduleQuery,
  matchesScheduleTab,
  type ScheduleRow,
  type ScheduleStatus,
  type ScheduleTabId,
} from '../../lib/periodicInvoice'
import revenueIcon from '../../assets/periodic/kpi-revenue.svg'
import dueIcon from '../../assets/periodic/kpi-due.svg'
import generatedIcon from '../../assets/periodic/kpi-generated.svg'
import attentionIcon from '../../assets/periodic/kpi-attention.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/invoices/sort.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const KPI_ICONS = {
  revenue: revenueIcon,
  due: dueIcon,
  generated: generatedIcon,
  attention: attentionIcon,
} as const

/** Status pill colours read straight off the Figma labels. */
const STATUS_STYLES: Record<
  ScheduleStatus,
  { bg: string; fg: string; dot: string; labelKey: string }
> = {
  active: {
    bg: 'bg-success-100',
    fg: 'text-success-700',
    dot: 'bg-success-700',
    labelKey: 'periodicList.status.active',
  },
  onRequest: {
    bg: 'bg-primary-25',
    fg: 'text-primary-800',
    dot: 'bg-primary-800',
    labelKey: 'periodicList.status.onRequest',
  },
  paused: {
    bg: 'bg-pending-100',
    fg: 'text-pending-700',
    dot: 'bg-pending-700',
    labelKey: 'periodicList.status.paused',
  },
  draft: {
    bg: 'bg-neutral-25',
    fg: 'text-[#474a5e]',
    dot: 'bg-[#474a5e]',
    labelKey: 'periodicList.status.draft',
  },
}

function PeriodicHeader() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('periodicList.title')}
        </h1>
        <p className="mt-1 text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('periodicList.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={exportIcon} alt="" className="size-6 rotate-180" />
          {t('periodicList.export')}
        </button>
        <Link
          to="/income/periodic/new"
          className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={plusIcon} alt="" className="size-6" />
          {t('periodicList.newRecurring')}
        </Link>
      </div>
    </div>
  )
}

function ScheduleKpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {SCHEDULE_KPI.map((kpi) => (
        <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-3.5">
            <img src={KPI_ICONS[kpi.icon]} alt="" className="size-11 shrink-0" />
            <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t(kpi.titleKey)}
            </h3>
          </div>
          <div className="flex items-baseline gap-1">
            {kpi.withCurrency ? (
              <img src={omrIcon} alt="" className="h-auto w-8 shrink-0 self-center" />
            ) : null}
            <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
              {kpi.amount}
            </p>
            {'suffixKey' in kpi && kpi.suffixKey ? (
              <span className="text-base font-semibold leading-[1.2] text-text-quaternary">
                {t(kpi.suffixKey)}
              </span>
            ) : null}
          </div>
          <p className="text-sm font-medium leading-[1.2] text-text-tertiary">{t(kpi.metaKey)}</p>
        </article>
      ))}
    </div>
  )
}

function ScheduleRowCells({ row }: { row: ScheduleRow }) {
  const { t } = useTranslation()
  const status = STATUS_STYLES[row.status]

  return (
    <>
      <td className="px-2 py-2.5">
        <Link to={`/income/periodic/${row.id}`} className="group block min-w-0">
          <p className="truncate text-sm font-semibold leading-[1.2] text-text-secondary group-hover:text-primary-700">
            {row.name}
          </p>
          <p className="truncate text-xs font-medium leading-[1.2] text-text-quaternary">
            {row.reference}
          </p>
        </Link>
      </td>
      <td className="px-2 py-2.5 text-sm font-medium text-text-secondary">{row.customer}</td>
      <td className="px-2 py-2.5">
        <p className="text-sm font-medium leading-[1.2] text-text-secondary">{row.frequency}</p>
        <p className="text-xs font-medium leading-[1.2] text-text-tertiary">{row.cadence}</p>
      </td>
      <td className="px-2 py-2.5">
        <p className="text-sm font-medium leading-[1.2] text-text-secondary">{row.nextInvoice}</p>
        {row.nextInvoiceNote ? (
          <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
            {row.nextInvoiceNote}
          </p>
        ) : null}
      </td>
      <td className="px-2 py-2.5">
        <span className="inline-flex items-center gap-1">
          <img src={omrRowIcon} alt="" className="h-auto w-6 shrink-0" />
          <span className="text-base font-semibold leading-[1.2] text-text-secondary">
            {row.perInvoice}
          </span>
        </span>
      </td>
      <td className="px-2 py-2.5">
        <p className="text-sm font-medium leading-[1.2] text-text-secondary">{row.generated}</p>
        {row.generatedNote ? (
          <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
            {row.generatedNote}
          </p>
        ) : null}
      </td>
      <td className="px-2 py-2.5">
        <span
          className={[
            'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-semibold',
            status.bg,
            status.fg,
          ].join(' ')}
        >
          <span className={['size-1.5 shrink-0 rounded-full', status.dot].join(' ')} />
          {t(status.labelKey)}
        </span>
      </td>
    </>
  )
}

function ScheduleTable() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<ScheduleTabId>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const rows = SCHEDULE_ROWS.filter(
    (row) => matchesScheduleTab(row, activeTab) && matchesScheduleQuery(row, query),
  )

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
        {SCHEDULE_TABS.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={[
                'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                active
                  ? 'font-semibold text-primary-800'
                  : 'font-medium text-text-quaternary hover:text-text-secondary',
              ].join(' ')}
            >
              {t(tab.labelKey)}
              <span
                className={[
                  'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                  active ? 'bg-primary-25 text-primary-800' : 'bg-primary-25 text-text-quaternary',
                ].join(' ')}
              >
                {countScheduleTab(tab.id)}
              </span>
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
        <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4">
          <img src={searchIcon} alt="" className="size-5 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('periodicList.searchPlaceholder')}
            className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 text-sm font-semibold text-text-tertiary"
          >
            {t('periodicList.filters')}
            <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-70" />
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
          >
            <img src={sortIcon} alt="" className="size-6" />
            {t('periodicList.sort')}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-start">
          <thead>
            <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
              <th className="w-10 px-5 py-2.5">
                <span className="block size-[15px] rounded-sm border border-border-default bg-transparent" />
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('periodicList.col.schedule')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('periodicList.col.customer')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('periodicList.col.frequency')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('periodicList.col.nextInvoice')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('periodicList.col.perInvoice')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('periodicList.col.generated')}
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">
                {t('periodicList.col.status')}
              </th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
              >
                <td className="px-5 py-2.5">
                  <span className="block size-[15px] rounded-sm border border-border-default" />
                </td>
                <ScheduleRowCells row={row} />
                <td className="px-2 py-2.5">
                  <ActionMenu items={scheduleRowActions()} label={t('periodicList.rowMenu')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-muted">
            {t('periodicList.showResult')}
          </span>
          <button
            type="button"
            className="inline-flex h-9 w-[55px] items-center justify-between rounded-sm border border-border-subtle px-3 text-sm font-semibold text-text-secondary"
          >
            6
            <img src={chevronIcon} alt="" className="size-4 rotate-90 opacity-70" />
          </button>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md text-text-muted"
            aria-label={t('periodicList.prevPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
          {SCHEDULE_PAGE_NUMBERS.map((n) => {
            if (n === '...') {
              return (
                <span
                  key="ellipsis"
                  className="inline-flex size-10 items-center justify-center text-sm font-medium text-text-muted"
                >
                  …
                </span>
              )
            }
            const active = n === page
            return (
              <button
                key={n}
                type="button"
                onClick={() => setPage(n)}
                className={[
                  'inline-flex size-10 items-center justify-center rounded-xl text-center transition-colors',
                  active
                    ? 'bg-primary-25 text-base font-extrabold text-primary-700'
                    : 'text-sm font-medium text-text-muted hover:bg-neutral-25',
                ].join(' ')}
              >
                {n}
              </button>
            )
          })}
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-md text-text-muted"
            aria-label={t('periodicList.nextPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </section>
  )
}

export function PeriodicInvoicesPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <PeriodicHeader />
        <ScheduleKpiCards />
        <ScheduleTable />
      </div>
    </AppShell>
  )
}
