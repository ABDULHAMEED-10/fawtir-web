import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu } from '../../components/ui'
import { customerRowActions } from '../../lib/rowActions'
import {
  CUSTOMER_KPI,
  CUSTOMER_PAGE_NUMBERS,
  CUSTOMER_ROWS,
  CUSTOMER_TABS,
  type CustomerKind,
  type CustomerRow,
  type CustomerTabId,
  type PeppolState,
  type ReceivableState,
} from '../../lib/customers'
import receivablesIcon from '../../assets/customers/kpi-receivables.svg'
import overdueIcon from '../../assets/customers/kpi-overdue.svg'
import customersIcon from '../../assets/customers/kpi-customers.svg'
import peppolIcon from '../../assets/customers/kpi-peppol.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import bulkUploadIcon from '../../assets/invoices/bulk-upload.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/invoices/sort.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'

const KPI_ICONS = {
  receivables: receivablesIcon,
  overdue: overdueIcon,
  customers: customersIcon,
  peppol: peppolIcon,
} as const

/** 34px rounded square, tinted by customer kind. */
const AVATAR_STYLES: Record<CustomerKind, string> = {
  business: 'bg-primary-50 text-primary-700',
  government: 'bg-pending-100 text-pending-700',
  consumer: 'bg-neutral-25 text-text-secondary',
}

/** Peppol state renders as a dot pill, not bare text. */
const PEPPOL_STYLES: Record<PeppolState, { bg: string; fg: string; dot: string; labelKey: string }> = {
  onPeppol: {
    bg: 'bg-success-100',
    fg: 'text-success-700',
    dot: 'bg-success-700',
    labelKey: 'customersPage.peppol.onPeppol',
  },
  notConnected: {
    bg: 'bg-neutral-25',
    fg: 'text-[#595d75]',
    dot: 'bg-[#595d75]',
    labelKey: 'customersPage.peppol.notConnected',
  },
  qrReceipt: {
    bg: 'bg-primary-25',
    fg: 'text-primary-700',
    dot: 'bg-primary-700',
    labelKey: 'customersPage.peppol.qrReceipt',
  },
}

/** Figma tints the OMR glyph to match the amount, so overdue rows get a red mark. */
const OVERDUE_ICON_FILTER =
  'brightness(0) saturate(100%) invert(11%) sepia(64%) saturate(5000%) hue-rotate(358deg) brightness(85%)'

const AMOUNT_STYLES: Record<ReceivableState, { amount: string; note: string }> = {
  overdue: { amount: 'text-danger-700', note: 'text-danger-700' },
  attention: { amount: 'text-text-secondary', note: 'text-pending-500' },
  settled: { amount: 'text-text-muted', note: 'text-text-muted' },
}

function CustomersHeader() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('customersPage.title')}
        </h1>
        <p className="text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('customersPage.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={bulkUploadIcon} alt="" className="size-6" />
          {t('customersPage.bulkUpload')}
        </button>
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={exportIcon} alt="" className="size-6 rotate-180" />
          {t('customersPage.export')}
        </button>
        <Link
          to="/customers/new"
          className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={plusIcon} alt="" className="size-6" />
          {t('customersPage.newCustomer')}
        </Link>
      </div>
    </div>
  )
}

function CustomerKpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {CUSTOMER_KPI.map((kpi) => (
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

function CustomerRowCells({ row }: { row: CustomerRow }) {
  const { t } = useTranslation()
  const peppol = PEPPOL_STYLES[row.peppol]
  const amount = AMOUNT_STYLES[row.state]

  return (
    <>
      <td className="px-2 py-2.5">
        <div className="flex items-center gap-2.5">
          <span
            className={[
              'inline-flex size-[34px] shrink-0 items-center justify-center rounded-sm text-sm font-semibold',
              AVATAR_STYLES[row.kind],
            ].join(' ')}
          >
            {row.initials}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold leading-[1.2] text-text-secondary">
                {row.name}
              </p>
              <span className="inline-flex items-center rounded-sm bg-neutral-25 px-2.5 py-0.5 text-xs font-semibold text-text-secondary">
                {t(`customersPage.kind.${row.kind}`)}
              </span>
            </div>
            <p className="truncate text-xs font-medium leading-[1.2] text-text-quaternary">
              {row.subtitle}
            </p>
          </div>
        </div>
      </td>
      <td className="px-2 py-2.5">
        <p className="text-sm font-semibold leading-[1.2] text-text-secondary">{row.contactName}</p>
        <p className="text-xs font-medium leading-[1.2] text-text-quaternary">{row.contactEmail}</p>
      </td>
      <td className="px-2 py-2.5 text-sm font-medium text-text-primary">{row.location}</td>
      <td className="px-2 py-2.5">
        <span
          className={[
            'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-semibold',
            peppol.bg,
            peppol.fg,
          ].join(' ')}
        >
          <span className={['size-1.5 shrink-0 rounded-full', peppol.dot].join(' ')} />
          {t(peppol.labelKey)}
        </span>
      </td>
      <td className="px-2 py-2.5 text-sm font-semibold text-text-primary">
        {t('customersPage.invoiceCount', { count: row.invoiceCount })}
      </td>
      <td className="px-2 py-2.5">
        {row.amount ? (
          <>
            <span className="inline-flex items-center gap-1">
              <img
                src={omrRowIcon}
                alt=""
                className="h-auto w-6 shrink-0"
                style={row.state === 'overdue' ? { filter: OVERDUE_ICON_FILTER } : undefined}
              />
              <span className={['text-base font-semibold leading-[1.2]', amount.amount].join(' ')}>
                {row.amount}
              </span>
            </span>
            {row.amountNote ? (
              <p className={['text-xs font-semibold leading-[1.2]', amount.note].join(' ')}>
                {t(row.amountNote, { days: row.amountNoteDays })}
              </p>
            ) : null}
          </>
        ) : (
          <span className="text-base font-medium leading-[1.2] text-text-muted">
            {t('customersPage.note.settled')}
          </span>
        )}
      </td>
    </>
  )
}

function CustomerTable() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<CustomerTabId>('all')
  const [page, setPage] = useState(1)

  const rows =
    activeTab === 'all' ? CUSTOMER_ROWS : CUSTOMER_ROWS.filter((row) => row.kind === activeTab)

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
        {CUSTOMER_TABS.map((tab) => {
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
                {tab.count}
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
            placeholder={t('customersPage.searchPlaceholder')}
            className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
          />
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 text-sm font-semibold text-text-tertiary"
          >
            {t('customersPage.filters')}
            <img src={chevronIcon} alt="" className="size-5 rotate-90 opacity-70" />
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
          >
            <img src={sortIcon} alt="" className="size-6" />
            {t('customersPage.sort')}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-start">
          <thead>
            <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
              <th className="w-10 px-5 py-2.5">
                <span className="block size-[15px] rounded-sm border border-border-default bg-transparent" />
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('customersPage.col.customer')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('customersPage.col.contact')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('customersPage.col.location')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('customersPage.col.peppol')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('customersPage.col.invoices')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('customersPage.col.receivable')}</th>
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
                <CustomerRowCells row={row} />
                <td className="px-2 py-2.5">
                  <ActionMenu
                    items={customerRowActions(row.id)}
                    label={t('customersPage.rowMenu')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-text-muted">{t('customersPage.showResult')}</span>
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
            aria-label={t('customersPage.prevPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
          {CUSTOMER_PAGE_NUMBERS.map((n) => {
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
            aria-label={t('customersPage.nextPage')}
          >
            <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
          </button>
        </div>
      </div>
    </section>
  )
}

export function CustomersPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <CustomersHeader />
        <CustomerKpiCards />
        <CustomerTable />
      </div>
    </AppShell>
  )
}
