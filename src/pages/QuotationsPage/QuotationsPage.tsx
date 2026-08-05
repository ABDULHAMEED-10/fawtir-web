import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, StepTracker } from '../../components/ui'
import { quotationRowActions } from '../../lib/rowActions'
import {
  QUOTATION_KPI,
  QUOTATION_PAGE_NUMBERS,
  QUOTATION_ROWS,
  QUOTATION_TABS,
  type QuotationRow,
  type QuotationStatus,
  type QuotationTabId,
} from '../../lib/quotations'
import kpiOpenIcon from '../../assets/quotations/kpi-open.svg'
import kpiAcceptedIcon from '../../assets/quotations/kpi-accepted.svg'
import kpiWinRateIcon from '../../assets/quotations/kpi-winrate.svg'
import kpiExpiringIcon from '../../assets/quotations/kpi-expiring.svg'
import backIcon from '../../assets/quotations/back.svg'
import exportIcon from '../../assets/quotations/export.svg'
import plusIcon from '../../assets/quotations/plus.svg'
import searchIcon from '../../assets/quotations/search.svg'
import filterIcon from '../../assets/quotations/filter.svg'
import sortIcon from '../../assets/quotations/sort.svg'
import chevronDownIcon from '../../assets/quotations/chevron-down.svg'
import chevronLeftIcon from '../../assets/quotations/chevron-left.svg'
import omrLargeIcon from '../../assets/quotations/omr-lg.svg'
import omrRowIcon from '../../assets/quotations/omr-row.svg'

/** KPI tile = a 45px disc in the card's own tint with the glyph centred on it. */
const KPI_TILES = {
  open: { icon: kpiOpenIcon, disc: 'bg-[#f4f6fb]' },
  accepted: { icon: kpiAcceptedIcon, disc: 'bg-[#e6efea]' },
  winrate: { icon: kpiWinRateIcon, disc: 'bg-[#e3e4ea]' },
  expiring: { icon: kpiExpiringIcon, disc: 'bg-[#f7f1e6]' },
} as const

/** Status pill fills, all r=120. */
const STATUS_STYLES: Record<QuotationStatus, { bg: string; fg: string; labelKey: string }> = {
  draft: { bg: 'bg-[#f4f6fb]', fg: 'text-[#595d75]', labelKey: 'quotations.status.draft' },
  sent: { bg: 'bg-[#f4f6fb]', fg: 'text-[#233e92]', labelKey: 'quotations.status.sent' },
  accepted: { bg: 'bg-[#e6efea]', fg: 'text-[#3d5648]', labelKey: 'quotations.status.accepted' },
  delivering: { bg: 'bg-[#f7f1e6]', fg: 'text-[#6d5a39]', labelKey: 'quotations.status.delivering' },
  expiring: { bg: 'bg-[#f7f1e6]', fg: 'text-[#6d5a39]', labelKey: 'quotations.status.expiring' },
  declined: { bg: 'bg-[#fff0f0]', fg: 'text-[#7a1009]', labelKey: 'quotations.status.declined' },
}

const VALID_NOTE_TONE = {
  normal: 'text-[#444957] font-medium',
  warning: 'text-[#6d5a39] font-semibold',
  danger: 'text-[#98140b] font-semibold',
} as const

function QuotationsHeader() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {/* Trade documents › Quotations */}
        <div className="flex flex-wrap items-center gap-1">
          <Link
            to="/trade-documents/quotations"
            className="text-2xl font-medium leading-[1.2] text-[#5b606c]"
          >
            {t('quotations.breadcrumbParent')}
          </Link>
          <img src={backIcon} alt="" aria-hidden="true" className="size-6 rtl:rotate-180" />
          <h1 className="text-[32px] font-medium leading-[1.2] text-[#151c2d]">
            {t('quotations.title')}
          </h1>
        </div>
        <p className="mt-1 text-sm font-medium leading-[1.2] text-[#8f8f8f]">
          {t('quotations.subtitle')}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={exportIcon} alt="" className="size-6" />
          {t('quotations.export')}
        </button>
        <Link
          to="/trade-documents/quotations/new"
          className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={plusIcon} alt="" className="size-6" />
          {t('quotations.newQuotation')}
        </Link>
      </div>
    </div>
  )
}

function QuotationKpiCards() {
  const { t } = useTranslation()

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {QUOTATION_KPI.map((kpi) => {
        const tile = KPI_TILES[kpi.icon]
        return (
          <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-2.5">
              <span
                className={[
                  'flex size-[45px] shrink-0 items-center justify-center rounded-full',
                  tile.disc,
                ].join(' ')}
              >
                <img src={tile.icon} alt="" className="size-6" />
              </span>
              <h3 className="text-xl font-medium leading-[1.2] text-[#2c3342]">{t(kpi.titleKey)}</h3>
            </div>
            <div className="flex items-center gap-1.5">
              {kpi.plus ? (
                <span className="text-2xl font-bold leading-[1.2] text-[#2c3342]">+</span>
              ) : null}
              {kpi.showCurrency ? (
                <img src={omrLargeIcon} alt="" className="h-auto w-8 shrink-0" />
              ) : null}
              <p className="text-[32px] font-semibold leading-[1.2] text-[#2c3342]">{kpi.amount}</p>
            </div>
            <p className="text-sm font-medium leading-[1.2] text-[#444957]">{t(kpi.metaKey)}</p>
          </article>
        )
      })}
    </div>
  )
}

function QuotationRowCells({ row }: { row: QuotationRow }) {
  const { t } = useTranslation()
  const status = STATUS_STYLES[row.status]

  return (
    <>
      <td className="px-2 py-2.5">
        <p className="text-sm font-semibold leading-[1.2] text-[#2c3342]">{row.id}</p>
        <p className="mt-1.5 text-xs font-medium leading-[1.2] text-[#5b606c]">{row.subject}</p>
      </td>
      <td className="px-2 py-2.5">
        <p className="text-sm font-semibold leading-[1.2] text-[#151c2d]">{row.customer}</p>
        <p className="mt-1 text-xs font-medium leading-[1.2] text-[#444957]">{row.branch}</p>
      </td>
      <td className="px-2 py-2.5">
        <p className="text-sm font-semibold leading-[1.2] text-[#151c2d]">{row.validUntil}</p>
        {row.validNote ? (
          <p className={['mt-1 text-xs leading-[1.2]', VALID_NOTE_TONE[row.validNoteTone]].join(' ')}>
            {row.validNote}
          </p>
        ) : null}
      </td>
      <td className="px-2 py-2.5">
        <span className="inline-flex items-center gap-1">
          <img src={omrRowIcon} alt="" className="h-auto w-6 shrink-0" />
          <span className="text-base font-bold leading-[1.2] text-[#2c3342]">{row.amount}</span>
        </span>
      </td>
      <td className="px-2 py-2.5">
        <StepTracker steps={row.steps} />
      </td>
      <td className="px-2 py-2.5">
        <span
          className={[
            'inline-flex items-center rounded-full px-3 py-[5px] text-sm font-semibold',
            status.bg,
            status.fg,
          ].join(' ')}
        >
          {row.statusLabel ?? t(status.labelKey)}
        </span>
      </td>
    </>
  )
}

function QuotationsTable() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<QuotationTabId>('all')
  const [page, setPage] = useState(2)

  return (
    <section className="overflow-hidden rounded-md bg-surface-card">
      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-x-[52px] gap-y-3 px-6 pt-[17px]">
        {QUOTATION_TABS.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1"
            >
              <span
                className={[
                  'text-base leading-[1.2]',
                  active ? 'font-semibold text-[#233e92]' : 'font-medium text-[#5b606c]',
                ].join(' ')}
              >
                {t(tab.labelKey)}
              </span>
              <span
                className={[
                  'inline-flex h-[18px] items-center rounded-full px-1.5 text-xs font-semibold leading-[1.2]',
                  tab.tone === 'danger'
                    ? 'bg-[#fff0f0] text-[#98140b]'
                    : active
                      ? 'bg-[#f4f6fb] text-[#233e92]'
                      : 'bg-[#f4f6fb] text-[#5b606c]',
                ].join(' ')}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search + Filters/Sort */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-[27px]">
        <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-4">
          <img src={searchIcon} alt="" className="size-5 shrink-0" />
          <input
            type="search"
            placeholder={t('quotations.searchPlaceholder')}
            className="w-full bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-[#8a8e96]"
          />
        </label>
        <div className="flex items-center gap-4">
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-3 text-sm font-semibold text-[#444957]"
          >
            <img src={filterIcon} alt="" className="size-6" />
            {t('quotations.filters')}
          </button>
          <button
            type="button"
            className="inline-flex h-11 items-center gap-2 rounded-sm border border-[#e8e8ea] bg-surface-tab-bar px-3 text-sm font-semibold text-[#444957]"
          >
            <img src={sortIcon} alt="" className="size-6" />
            {t('quotations.sort')}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-start">
          <thead>
            <tr className="bg-[#2c3342] text-start text-xs leading-[1.2] text-white">
              <th className="w-10 px-5 py-2.5">
                <input
                  type="checkbox"
                  aria-label={t('quotations.selectAll')}
                  className="size-[15px] rounded-[4px] border border-[#d0d2d5] bg-transparent"
                />
              </th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('quotations.col.quotation')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('quotations.col.customer')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('quotations.col.validUntil')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('quotations.col.amount')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('quotations.col.progress')}</th>
              <th className="px-2 py-2.5 text-start font-semibold">{t('quotations.col.status')}</th>
              <th className="w-14 px-2 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {QUOTATION_ROWS.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                onClick={() => navigate(`/trade-documents/quotations/${row.id}`)}
              >
                <td className="px-5 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={t('quotations.selectRow', { id: row.id })}
                    className="size-[15px] rounded-[4px] border border-[#d0d2d5]"
                  />
                </td>
                <QuotationRowCells row={row} />
                <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <ActionMenu items={quotationRowActions(row.id)} label={t('quotations.rowMenu')} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-3.5">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-[#737781]">{t('quotations.showResult')}</span>
          <span className="inline-flex items-center gap-2.5 rounded-sm border border-[#e8e8ea] px-3 py-2 text-sm font-semibold text-[#2c3342]">
            6
            <img src={chevronDownIcon} alt="" className="size-4" />
          </span>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            aria-label={t('quotations.prevPage')}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="flex size-10 items-center justify-center rounded-lg"
          >
            <img src={chevronLeftIcon} alt="" className="size-5 rtl:rotate-180" />
          </button>
          {QUOTATION_PAGE_NUMBERS.map((n, i) =>
            n === '...' ? (
              <span
                key={`gap-${i}`}
                className="flex size-10 items-center justify-center text-sm font-medium text-[#737781]"
              >
                …
              </span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => setPage(Number(n))}
                className={[
                  'flex size-10 items-center justify-center rounded-xl',
                  page === Number(n)
                    ? 'bg-[#f4f6fb] text-base font-extrabold text-[#2c4eb7]'
                    : 'text-sm font-medium text-[#737781]',
                ].join(' ')}
              >
                {n}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label={t('quotations.nextPage')}
            onClick={() => setPage((p) => p + 1)}
            className="flex size-10 items-center justify-center rounded-lg"
          >
            <img src={chevronLeftIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
          </button>
        </div>
      </div>
    </section>
  )
}

export function QuotationsPage() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <QuotationsHeader />
        <QuotationKpiCards />
        <QuotationsTable />
      </div>
    </AppShell>
  )
}
