import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Kpi, TabStrip } from './CatalogShell'
import { ItemTabs } from './ItemTabs'
import { ItemPills, ItemReadState, useItemRecord } from './itemRecord'
import { FilterMenu, Pager, Rial, RowsView, SortMenu } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { omr } from '../../lib/catalog'
import { prototypeHidden } from '../../lib/demoModules'
import { formatDisplayDate } from '../../lib/dates'
import {
  USAGE_KINDS,
  getProductUsage,
  productUsagePath,
  type ProductUsagePageDto,
  type ProductUsageRow,
  type UsageKind,
} from '../../api/catalog/insights'
import { daysAgo, rollUpTill, round3 } from '../../lib/catalogInsights'
import downloadIcon from '../../assets/catalog/download-ink.svg'
import searchIcon from '../../assets/invoices/search.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import kpiTillIcon from '../../assets/catalog/kpi-items.svg'
import kpiInvoiceIcon from '../../assets/catalog/kpi-percent.svg'
import kpiQuoteIcon from '../../assets/catalog/kpi-items.svg'
import kpiBundleIcon from '../../assets/catalog/kind-bundle.svg'

/** Rows to a page; the API pages, this screen asks. */
const USED_PAGE_SIZE = 20
/** Till sales read to roll into the All tab's one till line (the API's largest page). */
const TILL_ROLL_SIZE = 100

const USED_TABS = [
  { id: 'all', labelKey: 'itemUsed.tab.all' },
  { id: 'invoice', labelKey: 'itemUsed.tab.invoices' },
  { id: 'quotation', labelKey: 'itemUsed.tab.quotations' },
  { id: 'bundle', labelKey: 'itemUsed.tab.bundles' },
  { id: 'till', labelKey: 'itemUsed.tab.tillReceipts' },
] as const

type UsedTab = (typeof USED_TABS)[number]['id']

/** Every kind but the till: those are documents with numbers; till sales are rolled up. */
const DOCUMENT_KINDS = USAGE_KINDS.filter((kind) => kind !== 'TILL_SALE')

/** The kinds each tab asks for. TODO(backend): INCOME.md IP.5, bundles are not a usage source. */
const TAB_KINDS: Record<UsedTab, readonly UsageKind[]> = {
  all: DOCUMENT_KINDS,
  invoice: ['INVOICE'],
  quotation: ['QUOTATION'],
  bundle: [],
  till: ['TILL_SALE'],
}

const KIND_TONE: Record<string, string> = {
  QUOTATION: 'bg-pending-100 text-pending-700',
  ORDER_FORM: 'bg-pending-100 text-pending-700',
  DELIVERY_NOTE: 'bg-pending-100 text-pending-700',
  INVOICE: 'bg-primary-50 text-primary-800',
  CREDIT_NOTE: 'bg-primary-50 text-primary-800',
  DEBIT_NOTE: 'bg-primary-50 text-primary-800',
  PERIODIC: 'bg-primary-50 text-primary-800',
  TILL_SALE: 'bg-surface-background text-text-tertiary',
}

const TRADE = !prototypeHidden('tradeDocuments')

/** Where a row opens: the document's own page, when the web has one. */
function usageLink(row: Pick<ProductUsageRow, 'kind' | 'documentId'>): string | undefined {
  const id = encodeURIComponent(row.documentId)
  switch (row.kind) {
    case 'INVOICE':
      return `/invoices/${id}`
    case 'CREDIT_NOTE':
      return `/income/credit-notes/${id}`
    case 'DEBIT_NOTE':
      return `/income/debit-notes/${id}`
    case 'PERIODIC':
      return `/income/periodic/${id}`
    case 'QUOTATION':
      return TRADE ? `/trade-documents/quotations/${id}` : undefined
    case 'ORDER_FORM':
      return TRADE ? `/trade-documents/order-forms/${id}` : undefined
    case 'DELIVERY_NOTE':
      return TRADE ? `/trade-documents/delivery-notes/${id}` : undefined
    default:
      return undefined
  }
}

const SORTS = [
  { value: 'newest', labelKey: 'activityLog.sort.newest' },
  { value: 'oldest', labelKey: 'activityLog.sort.oldest' },
]

/**
 * Catalog › one item › Where it's been used (Figma 135:47097), from
 * `GET /v1/products/{id}/usage`: every document naming the item, newest first, drafts included and
 * discarded ones left out. The tabs ask the server for their kinds and count from its `counts`.
 * Till sales come one row each: the All tab rolls the ones it reads into one line, the frame's
 * "receipts rolled up", and the Till receipts tab lists them. The search and the order work
 * over the page in view.
 */
export function ItemUsedPage() {
  const { id = '' } = useParams()
  const record = useItemRecord(id)
  return (
    <ItemReadState read={record.read}>
      <ItemUsed id={id} record={record} />
    </ItemReadState>
  )
}

function ItemUsed({ id, record }: { id: string; record: ReturnType<typeof useItemRecord> }) {
  const { t, i18n } = useTranslation()
  const product = record.product!
  const [tab, setTabState] = useState<UsedTab>('all')
  const [page, setPage] = useState(0)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  const setTab = (next: UsedTab) => {
    setTabState(next)
    setPage(0)
  }
  const { branches } = useWorkingBranch()

  const kinds = TAB_KINDS[tab]
  const listPath = productUsagePath(id, { kinds, page, size: USED_PAGE_SIZE })
  // The bundles tab has no source yet, so it asks nothing.
  const list = useApiRead<ProductUsagePageDto>(kinds.length ? listPath : null, () =>
    getProductUsage(listPath),
  )
  // The counts for the tabs and cards: every kind's, whatever kind was asked for.
  const countPath = productUsagePath(id, { size: 1 })
  const countRead = useApiRead<ProductUsagePageDto>(countPath, () => getProductUsage(countPath))
  const tillPath = productUsagePath(id, { kinds: ['TILL_SALE'], size: TILL_ROLL_SIZE })
  const tillRead = useApiRead<ProductUsagePageDto>(
    tab === 'all' && page === 0 ? tillPath : null,
    () => getProductUsage(tillPath),
  )

  const counts = countRead.read.status === 'ready' ? countRead.read.data.counts : {}
  const count = (kind: UsageKind) => counts[kind] ?? 0
  const documents = DOCUMENT_KINDS.reduce((sum, kind) => sum + count(kind), 0)
  const countTab = (entry: UsedTab) =>
    entry === 'all'
      ? documents
      : entry === 'till'
        ? count('TILL_SALE')
        : TAB_KINDS[entry].reduce((sum, kind) => sum + count(kind), 0)

  const loaded = list.read.status === 'ready' ? list.read.data : null
  const till =
    tab === 'all' && tillRead.read.status === 'ready'
      ? rollUpTill(tillRead.read.data.content)
      : null
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = (loaded?.content ?? []).filter(
      (row) =>
        needle === '' ||
        (row.number ?? '').toLowerCase().includes(needle) ||
        (row.customerName ?? '').toLowerCase().includes(needle),
    )
    return sort === 'oldest' ? [...filtered].reverse() : filtered
  }, [loaded, query, sort])
  const pageCount = loaded ? Math.max(1, Math.ceil(loaded.totalElements / USED_PAGE_SIZE)) : 1
  const branchName = (branchId: string | null) =>
    branches.find((branch) => branch.id === branchId)?.name ?? null

  return (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { label: product.name }]}
      title={product.name}
      subtitle={t('itemUsed.meta', {
        group: record.group || '-',
        kind: record.kind || '-',
        code: product.code,
      })}
      pills={<ItemPills product={product} />}
      actions={
        <>
          <button
            type="button"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={downloadIcon} alt="" className="size-[18px]" />
            {t('itemSells.export')}
          </button>
          <Link
            to={`/catalog/${encodeURIComponent(id)}`}
            className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            {t('item.editTheItem')}
          </Link>
        </>
      }
      tabs={<ItemTabs id={id} active="used" counts={{ used: documents }} />}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiTillIcon}
          label={t('itemUsed.kpi.tillReceipts')}
          value={count('TILL_SALE').toLocaleString('en-US')}
          note={t('itemUsed.kpi.tillReceiptsNote')}
        />
        <Kpi
          icon={kpiInvoiceIcon}
          label={t('itemUsed.kpi.onInvoices')}
          value={String(count('INVOICE'))}
          note={t('itemUsed.kpi.draftsIncluded')}
        />
        {/* TODO(backend): INCOME.md IP.6. No "at an old price" flag, so the note does not
            count them. */}
        <Kpi
          icon={kpiQuoteIcon}
          tint="bg-pending-100"
          label={t('itemUsed.kpi.onQuotations')}
          value={String(count('QUOTATION'))}
          note={t('itemUsed.kpi.oldPriceNotYet')}
        />
        {/* TODO(backend): INCOME.md IP.5. Bundles are not a usage source yet. */}
        <Kpi
          icon={kpiBundleIcon}
          tint="bg-success-100"
          tone="muted"
          label={t('itemUsed.kpi.insideBundles')}
          value="-"
          note={t('itemSells.notYet')}
        />
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip tabs={USED_TABS} value={tab} onChange={setTab} count={countTab} />

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] w-full items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 sm:w-[345px]">
            <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('itemUsed.search')}
              aria-label={t('itemUsed.search')}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <FilterMenu
              funnel
              label={t('catalog.filters')}
              value={tab}
              defaultValue="all"
              options={USED_TABS.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: countTab(entry.id),
              }))}
              onChange={setTab}
            />
            <SortMenu value={sort} onChange={setSort} options={SORTS} />
          </div>
        </div>

        {kinds.length > 0 && list.read.status === 'failed' ? (
          <div className="px-5 pb-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : kinds.length > 0 && !loaded ? (
          <div className="px-5 pb-5">
            <LoadingNotice />
          </div>
        ) : (
          <RowsView>
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                  {(['document', 'what', 'who', 'when'] as const).map((key) => (
                    <th key={key} className="h-[46px] px-4 text-start font-semibold">
                      {t(`itemUsed.col.${key}`)}
                    </th>
                  ))}
                  <th className="h-[46px] px-4 text-end font-semibold">
                    {t('itemUsed.col.howMany')}
                  </th>
                  <th className="h-[46px] px-4 text-end font-semibold">
                    {t('itemUsed.col.value')}
                  </th>
                  <th className="h-[46px] px-4" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && !till ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-4 py-12 text-center text-sm font-medium text-text-quaternary"
                    >
                      {tab === 'bundle'
                        ? t('itemUsed.bundlesNotYet')
                        : query.trim()
                          ? t('itemUsed.empty')
                          : t('itemUsed.none')}
                    </td>
                  </tr>
                ) : (
                  <>
                    {rows.map((row) => (
                      <UsedRow
                        key={`${row.kind}-${row.documentId}`}
                        row={row}
                        branch={branchName(row.branchId)}
                      />
                    ))}
                    {till && !query.trim() ? (
                      <TillRollUp till={till} total={count('TILL_SALE')} language={i18n.language} />
                    ) : null}
                  </>
                )}
              </tbody>
            </table>
          </RowsView>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
          <p className="text-sm font-medium text-text-quaternary">
            {t('itemUsed.showing', { shown: rows.length, total: loaded?.totalElements ?? 0 })}
          </p>
          {pageCount > 1 ? (
            <Pager
              page={page + 1}
              pageCount={pageCount}
              onChange={(next) => setPage(Math.min(Math.max(next, 1), pageCount) - 1)}
              labels={{
                nav: t('appList.pager.label'),
                previous: t('appList.pager.previous'),
                next: t('appList.pager.next'),
              }}
            />
          ) : null}
        </div>
      </section>
    </CatalogShell>
  )
}

const formatDay = (iso: string, language: string) => formatDisplayDate(iso.slice(0, 10), language)

/**
 * The till's sales on one line, summed from the rows read (the API's largest page). When more
 * were sold than one page holds, the line says how many it sums.
 * TODO(backend): INCOME.md IP.8. A till total on the usage read would make the line exact.
 */
function TillRollUp({
  till,
  total,
  language,
}: {
  till: NonNullable<ReturnType<typeof rollUpTill>>
  total: number
  language: string
}) {
  const { t } = useTranslation()
  const average = till.quantity > 0 ? omr(round3(till.lineValue / till.quantity)) : omr(0)
  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-4 py-4 align-top">
        <span className="text-sm font-semibold text-primary-700">
          {t('itemUsed.receiptsRolledUp', { count: total.toLocaleString('en-US') })}
        </span>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {till.read < total
            ? t('itemUsed.latestSummed', { count: till.read })
            : t('itemUsed.notListedOneByOne')}
        </p>
      </td>
      <td className="px-4 py-4 align-top">
        <span
          className={[
            'inline-flex h-[24px] items-center rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
            KIND_TONE.TILL_SALE,
          ].join(' ')}
        >
          {t('itemUsed.kind.till')}
        </span>
        <p className="mt-1.5 text-xs font-medium text-text-quaternary">
          {t('itemUsed.walkInCustomers')}
        </p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium text-text-primary">{t('itemUsed.noNamedCustomer')}</p>
      </td>
      <td className="px-4 py-4 align-top">
        <p className="whitespace-nowrap text-sm font-medium text-text-primary" dir="ltr">
          {till.first === till.last
            ? formatDay(till.first, language)
            : `${formatDay(till.first, language)} - ${formatDay(till.last, language)}`}
        </p>
      </td>
      <td className="px-4 py-4 align-top text-end">
        <p className="text-sm font-semibold text-text-primary tabular-nums">
          {till.quantity.toLocaleString('en-US')}
        </p>
      </td>
      <td className="px-4 py-4 align-top text-end">
        <p className="flex items-baseline justify-end gap-1">
          <span className="text-sm font-semibold text-text-primary">
            <Rial />
          </span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">
            {omr(till.lineValue)}
          </span>
        </p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {t('itemUsed.average', { price: average })}
        </p>
      </td>
      <td className="px-4 py-4" />
    </tr>
  )
}

function UsedRow({ row, branch }: { row: ProductUsageRow; branch: string | null }) {
  const { t, i18n } = useTranslation()
  const to = usageLink(row)
  const label = row.number ?? t('itemUsed.noNumber')
  const ago = daysAgo(row.date)
  const unitPrice = row.quantity !== 0 ? omr(round3(row.lineValue / row.quantity)) : omr(0)
  const humanised = row.state.charAt(0) + row.state.slice(1).toLowerCase().replace(/_/g, ' ')

  return (
    <tr className="border-b border-surface-background last:border-0">
      <td className="px-4 py-4 align-top">
        {to ? (
          <Link
            to={to}
            className="text-sm font-semibold text-primary-700 transition-colors hover:underline"
            dir="ltr"
          >
            {label}
          </Link>
        ) : (
          <span className="text-sm font-semibold text-primary-700" dir="ltr">
            {label}
          </span>
        )}
        {branch ? (
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            <bdi>{branch}</bdi>
          </p>
        ) : null}
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className={[
            'inline-flex h-[24px] items-center rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
            KIND_TONE[row.kind] ?? KIND_TONE.INVOICE,
          ].join(' ')}
        >
          {t(`itemUsed.kindOf.${row.kind}`)}
        </span>
        <p className="mt-1.5 text-xs font-medium text-text-quaternary">
          {t(`itemUsed.state.${row.state}`, { defaultValue: humanised })}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium text-text-primary">
          {row.customerName ? <bdi>{row.customerName}</bdi> : t('itemUsed.noNamedCustomer')}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="whitespace-nowrap text-sm font-medium text-text-primary">
          {formatDay(row.date, i18n.language)}
        </p>
        <p className="mt-1 whitespace-nowrap text-xs font-medium text-text-quaternary">
          {ago === 0
            ? t('itemUsed.today')
            : ago < 14
              ? t('itemUsed.daysAgo', { count: ago })
              : t('itemUsed.weeksAgo', { count: Math.floor(ago / 7) })}
        </p>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <p className="text-sm font-semibold text-text-primary tabular-nums">
          {row.quantity.toLocaleString('en-US')}
        </p>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <p className="flex items-baseline justify-end gap-1">
          <span className="text-sm font-semibold text-text-primary">
            <Rial />
          </span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">
            {omr(row.lineValue)}
          </span>
        </p>
        {/* TODO(backend): INCOME.md IP.6. No "at an old price" flag on the row. */}
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {t('itemUsed.atPrice', { price: unitPrice })}
        </p>
      </td>

      <td className="px-4 py-4 align-middle text-end">
        <img
          src={chevronIcon}
          alt=""
          aria-hidden="true"
          className="ms-auto size-5 opacity-40 rtl:rotate-180"
        />
      </td>
    </tr>
  )
}
