import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { OmAmount } from '../../components/ui/OmAmount'
import { ActionMenu, RowsView } from '../../components/ui'
import { creditNoteRowActions } from '../../lib/rowActions'
import {
  CREDIT_NOTE_KPI,
  CREDIT_NOTE_ROWS,
  CREDIT_NOTE_TABS,
  countCreditNoteTab,
  matchesCreditNoteQuery,
  matchesCreditNoteTab,
  type CreditNoteListStatus,
  type CreditNoteTabId,
} from '../../lib/creditNotes'
import creditedIcon from '../../assets/credit-notes/kpi-credited.svg'
import refundDueIcon from '../../assets/credit-notes/kpi-refund-due.svg'
import appliedIcon from '../../assets/credit-notes/kpi-applied.svg'
import refundedIcon from '../../assets/credit-notes/kpi-refunded.svg'
import filterIcon from '../../assets/credit-notes/filter.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/invoices/sort.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

const KPI_ICONS = {
  credited: creditedIcon,
  refundDue: refundDueIcon,
  applied: appliedIcon,
  refunded: refundedIcon,
} as const

const STATUS_STYLES: Record<
  CreditNoteListStatus,
  { bg: string; dot: string; text: string; labelKey: string }
> = {
  toSend: {
    bg: 'bg-[#f4f6fb]',
    dot: 'bg-[#233e92]',
    text: 'text-[#233e92]',
    labelKey: 'creditNotesPage.status.toSend',
  },
  refundDue: {
    bg: 'bg-[#f7f1e6]',
    dot: 'bg-[#6d5a39]',
    text: 'text-[#6d5a39]',
    labelKey: 'creditNotesPage.status.refundDue',
  },
  applied: {
    bg: 'bg-[#e6efea]',
    dot: 'bg-[#3d5648]',
    text: 'text-[#3d5648]',
    labelKey: 'creditNotesPage.status.applied',
  },
  refunded: {
    bg: 'bg-[#e6efea]',
    dot: 'bg-[#3d5648]',
    text: 'text-[#3d5648]',
    labelKey: 'creditNotesPage.status.refunded',
  },
  draft: {
    bg: 'bg-[#f4f6fb]',
    dot: 'bg-[#595d75]',
    text: 'text-[#595d75]',
    labelKey: 'creditNotesPage.status.draft',
  },
}

const PAGE_NUMBERS = [1, 2, 3, 4, '...', 20] as const

function CreditNotesHeader() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('creditNotesPage.title')}
        </h1>
        <p className="text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('creditNotesPage.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={exportIcon} alt="" className="size-6 rotate-180" />
          {t('creditNotesPage.export')}
        </button>
        <Link
          to="/income/credit-notes/new"
          className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={plusIcon} alt="" className="size-6" />
          {t('creditNotesPage.newCreditNote')}
        </Link>
      </div>
    </div>
  )
}

function CreditNoteKpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {CREDIT_NOTE_KPI.map((kpi) => (
        <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-2.5">
            <img src={KPI_ICONS[kpi.icon]} alt="" className="size-[45px] shrink-0" />
            <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t(kpi.titleKey)}
            </h3>
          </div>
          <OmAmount
            amount={kpi.amount}
            size="lg"
            amountClassName="text-[32px] font-semibold leading-[1.2] text-text-secondary"
          />
          <p className="text-sm font-medium leading-[1.2] text-text-tertiary">{t(kpi.metaKey)}</p>
        </article>
      ))}
    </div>
  )
}

function RefundCell({ refund }: { refund: (typeof CREDIT_NOTE_ROWS)[number]['refund'] }) {
  const { t } = useTranslation()

  if (refund.kind === 'none') {
    return <span className="text-base font-medium text-text-secondary">—</span>
  }

  if (refund.kind === 'applied') {
    return (
      <div className="flex flex-col items-start justify-center">
        <span className="text-base font-bold leading-[1.5] text-text-secondary">
          {t('creditNotesPage.refund.applied')}
        </span>
        <span className="text-xs font-semibold leading-[1.2] text-text-tertiary">
          {t(refund.hintKey)}
        </span>
      </div>
    )
  }

  const isRefunded = refund.hintKey === 'creditNotesPage.refund.refundedOn'
  return (
    <div className="flex flex-col items-start justify-center">
      <span className="inline-flex items-center gap-1">
        <img
          src={omrRowIcon}
          alt=""
          className="size-6 shrink-0"
          style={
            isRefunded
              ? {
                  filter:
                    'brightness(0) saturate(100%) invert(38%) sepia(12%) saturate(900%) hue-rotate(95deg) brightness(0.95)',
                }
              : undefined
          }
        />
        <span
          className={[
            'text-base font-bold leading-[1.5]',
            isRefunded ? 'text-[#4c6c5a]' : 'text-text-secondary',
          ].join(' ')}
        >
          {refund.amount}
        </span>
      </span>
      <span
        className={[
          'text-xs font-semibold leading-[1.2]',
          refund.hintKey === 'creditNotesPage.refund.due' ? 'text-[#887147]' : 'text-text-tertiary',
        ].join(' ')}
      >
        {t(refund.hintKey)}
      </span>
    </div>
  )
}

function CreditNotesTable() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<CreditNoteTabId>('all')

  const [query, setQuery] = useState('')

  const rows = useMemo(
    () =>
      CREDIT_NOTE_ROWS.filter(
        (row) => matchesCreditNoteTab(row, activeTab) && matchesCreditNoteQuery(row, query),
      ),

    [activeTab, query],
  )
  const [page, setPage] = useState(2)

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center gap-x-[52px] gap-y-2 border-b border-border-subtle px-6 pt-4">
        {CREDIT_NOTE_TABS.map((tab) => {
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
                  tab.danger
                    ? 'bg-[#fff0f0] text-[#98140b]'
                    : active
                      ? 'bg-primary-25 text-primary-800'
                      : 'bg-primary-25 text-text-quaternary',
                ].join(' ')}
              >
                {countCreditNoteTab(tab.id)}
              </span>
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
        <label className="flex h-11 w-full max-w-[346px] items-center max-md:max-w-none max-md:basis-full gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4">
          <img src={searchIcon} alt="" className="size-5 shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('creditNotesPage.searchPlaceholder')}
            className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
          >
            <img src={filterIcon} alt="" className="size-6" />
            {t('creditNotesPage.filters')}
          </button>
          <button
            type="button"
            className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
          >
            <img src={sortIcon} alt="" className="size-6" />
            {t('creditNotesPage.sort')}
          </button>
        </div>
      </div>

      <RowsView>
        <table className="w-full min-w-[1100px] border-collapse text-start">
          <thead>
            <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
              <th className="w-10 px-5 py-2.5">
                <span className="block size-[15px] rounded-sm border border-border-default bg-transparent" />
              </th>
              <th className="px-2 py-2.5 font-semibold">{t('creditNotesPage.col.creditNote')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('creditNotesPage.col.reverses')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('creditNotesPage.col.customer')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('creditNotesPage.col.issued')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('creditNotesPage.col.creditAmount')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('creditNotesPage.col.refund')}</th>
              <th className="px-2 py-2.5 font-semibold">{t('creditNotesPage.col.status')}</th>
              <th className="w-12 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const status = STATUS_STYLES[row.status]
              return (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                  onClick={() => navigate(`/income/credit-notes/${row.id}`)}
                >
                  <td className="px-5 py-2.5">
                    <span className="block size-[15px] rounded-sm border border-border-default" />
                  </td>
                  <td className="px-2 py-2.5">
                    <Link
                      to={`/income/credit-notes/${row.id}`}
                      className="block text-sm font-semibold leading-[1.2] text-text-secondary hover:text-primary-700"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.id}
                    </Link>
                    <p className="text-xs font-medium leading-[1.2] text-text-quaternary">
                      {row.reason}
                    </p>
                  </td>
                  <td className="px-2 py-2.5">
                    <Link
                      to={`/invoices/${row.reverses}`}
                      className="text-sm font-semibold leading-[1.2] text-[#233e92] hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {row.reverses}
                    </Link>
                  </td>
                  <td className="px-2 py-2.5">
                    <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                      {row.customer}
                    </p>
                    <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
                      {row.subtitle}
                    </p>
                  </td>
                  <td className="px-2 py-2.5 text-sm font-medium text-text-tertiary">
                    {row.issued}
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="inline-flex items-center gap-1 text-[#98140b]">
                      <span className="text-base font-bold leading-[1.5]">-</span>
                      <img
                        src={omrRowIcon}
                        alt=""
                        className="size-6 shrink-0"
                        style={{
                          filter:
                            'brightness(0) saturate(100%) invert(12%) sepia(68%) saturate(4500%) hue-rotate(358deg) brightness(0.85)',
                        }}
                      />
                      <span className="text-base font-bold leading-[1.5]">{row.creditAmount}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2.5">
                    <RefundCell refund={row.refund} />
                  </td>
                  <td className="px-2 py-2.5">
                    <span
                      className={[
                        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold',
                        status.bg,
                        status.text,
                      ].join(' ')}
                    >
                      <span className={['size-1.5 rounded-full', status.dot].join(' ')} />
                      {t(status.labelKey)}
                    </span>
                  </td>
                  <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <ActionMenu
                      items={creditNoteRowActions(row.id)}
                      label={t('creditNotesPage.rowMenu')}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </RowsView>

      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-muted">
            {t('creditNotesPage.showResult')}
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
            aria-label={t('creditNotesPage.prevPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
          {PAGE_NUMBERS.map((n) => {
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
            aria-label={t('creditNotesPage.nextPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </section>
  )
}

export function CreditNotesPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <CreditNotesHeader />
        <CreditNoteKpiCards />
        <CreditNotesTable />
      </div>
    </AppShell>
  )
}
