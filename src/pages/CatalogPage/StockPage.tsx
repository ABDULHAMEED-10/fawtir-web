import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Kpi, Pill, TabStrip } from './CatalogShell'
import { useWorkingBranch } from '../../components/branch/useWorkingBranch'
import { FilterMenu, Pager, Rial, RowsView, SortMenu, TableCheckbox } from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { pageCountOf, type Page } from '../../api'
import { omr } from '../../lib/catalog'
import { formatDate } from '../../lib/format'
import {
  loadStockPage,
  loadStockSummary,
  stockListPath,
  stockSummaryPath,
  type StockAdjustmentResponse,
  type StockRowDto,
  type StockSummaryDto,
} from '../../api/stock/stock'
import {
  SERVER_STOCK_SORT,
  STOCK_SORTS,
  STOCK_TABS,
  TAB_STATUS,
  countStockTab,
  coverShare,
  isOut,
  isRunningLow,
  movedThisWeek,
  quantityText,
  stockItemHref,
  stockItemName,
  stockKey,
  stockUnitName,
  weekdayName,
  type StockSort,
  type StockTab,
} from '../../lib/catalogStock'
import {
  StockCountModal,
  StockDeliveryModal,
  StockReorderModal,
  StockWriteOffModal,
  useStockAccess,
} from './StockForms'
import downloadIcon from '../../assets/catalog/download-white.svg'
import searchIcon from '../../assets/invoices/search.svg'
import kpiWorthIcon from '../../assets/catalog/kpi-worth.svg'
import kpiAttentionIcon from '../../assets/catalog/kpi-attention.svg'
import kpiOutIcon from '../../assets/catalog/kpi-out.svg'
import kpiMovedIcon from '../../assets/catalog/kpi-moved.svg'
import kindProductIcon from '../../assets/catalog/kind-product.svg'

/** Rows to a page, as the frame's pager pages them; the server pages, this screen asks. */
const STOCK_PAGE_SIZE = 20
/** How long typing pauses before the search goes to the server. */
const SEARCH_DELAY_MS = 250

type Dialog = 'count' | 'writeOff' | 'delivery' | 'reorder' | null

/**
 * Stock (Figma 135:49263): a place of its own beside the catalog, not a corner of it, reading
 * `GET /v1/stock` and `GET /v1/stock/summary` for the branch chosen in the sidebar.
 *
 * Worth is "at what you paid", the weighted average purchase cost; "this week" is today and the
 * six days before it. The low-stock colour and the cover bar come from the server's state and
 * the level set for the item, so a row cannot look calm while its own numbers say it is out.
 */
export function StockPage() {
  const { t, i18n } = useTranslation()
  const access = useStockAccess()
  const branchRead = useWorkingBranch()
  const branchName = branchRead.name
  const branchId = branchRead.branch?.id ?? null
  const [tab, setTabState] = useState<StockTab>('all')
  const [query, setQuery] = useState('')
  const [{ search, page }, setPaging] = useState({ search: '', page: 0 })
  const [sort, setSortState] = useState<StockSort>('lowestFirst')
  const [selected, setSelected] = useState<StockRowDto[]>([])
  const [dialog, setDialog] = useState<Dialog>(null)
  const [done, setDone] = useState<string | null>(null)

  const setPage = (next: number) => setPaging((current) => ({ ...current, page: next }))
  const setTab = (next: StockTab) => {
    setTabState(next)
    setPage(0)
  }
  const setSort = (next: StockSort) => {
    setSortState(next)
    setPage(0)
  }
  useEffect(() => {
    const id = window.setTimeout(() => {
      const next = query.trim()
      setPaging((current) => (current.search === next ? current : { search: next, page: 0 }))
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(id)
  }, [query])
  // Another branch is another shelf: what was ticked there is not on this one.
  useEffect(() => setSelected([]), [branchId])

  const readable = access.canRead && branchId !== null
  const listPath = readable
    ? stockListPath({
        branchId,
        status: TAB_STATUS[tab],
        q: search,
        sort: SERVER_STOCK_SORT[sort],
        page,
        size: STOCK_PAGE_SIZE,
      })
    : null
  const list = useApiRead<Page<StockRowDto>>(listPath, () => loadStockPage(listPath!))
  const summaryPath = readable ? stockSummaryPath(branchId) : null
  const summary = useApiRead<StockSummaryDto>(summaryPath, () => loadStockSummary(summaryPath!))
  const book = summary.read.status === 'ready' ? summary.read.data : null
  // The Nothing left card names the item that ran out: one row is enough to say which.
  const outPath =
    readable && book && book.nothingLeft > 0
      ? stockListPath({ branchId, status: 'OUT', size: 1 })
      : null
  const out = useApiRead<Page<StockRowDto>>(outPath, () => loadStockPage(outPath!))
  const outRow = out.read.status === 'ready' ? (out.read.data.items[0] ?? null) : null

  const loaded = list.read.status === 'ready' ? list.read.data : null
  const rows = useMemo(() => loaded?.items ?? [], [loaded])
  const total = loaded ? (loaded.total ?? rows.length) : 0

  const supplierOf = (row: StockRowDto) => row.supplier?.supplierId ?? null
  const first = selected[0] ?? null
  const allSameSupplier =
    first !== null &&
    supplierOf(first) !== null &&
    selected.every((row) => supplierOf(row) === supplierOf(first))

  const refresh = () => {
    list.retry()
    summary.retry()
    out.retry()
  }
  const finished = (result?: StockAdjustmentResponse) => {
    setDialog(null)
    setDone(
      result
        ? t(`stock.forms.done.${result.kind}`, { number: result.number })
        : t('stock.reorder.saved'),
    )
    refresh()
  }

  const toggle = (row: StockRowDto) =>
    setSelected((list) =>
      list.some((x) => stockKey(x) === stockKey(row))
        ? list.filter((x) => stockKey(x) !== stockKey(row))
        : [...list, row],
    )

  const shell = (body: React.ReactNode, actions?: React.ReactNode) => (
    <CatalogShell
      crumbs={[]}
      title={t('stock.title')}
      subtitle={t('stock.subtitle')}
      // The counts are the branch chosen in the sidebar, the platform's one branch toggle (owner,
      // 21 Oct 2026): every read and write names it (INCOME.md P.10).
      pills={
        branchName ? (
          <Pill tone="brand">
            {t('stock.atBranch')} <bdi>{branchName}</bdi>
          </Pill>
        ) : undefined
      }
      actions={actions}
    >
      {body}
    </CatalogShell>
  )

  if (!access.ready || branchRead.read.status === 'loading') return shell(<LoadingNotice />)
  if (!access.canRead) return shell(<PermissionDeniedNotice />)
  if (branchRead.read.status === 'failed')
    return shell(
      <ApiReadFailure error={branchRead.read.error} retry={() => window.location.reload()} />,
    )
  if (summary.read.status === 'failed')
    return shell(<ApiReadFailure error={summary.read.error} retry={summary.retry} />)

  // The page's own selection is what the count and write-off forms start from; with nothing
  // ticked, the count covers the rows on screen.
  const countRows = selected.length ? selected : rows

  return shell(
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiWorthIcon}
          label={t('stock.kpi.worth')}
          value={book ? omr(book.worth) : '…'}
          currency
          note={t('stock.kpi.worthNote', { count: book?.counted ?? 0 })}
        />
        <Kpi
          icon={kpiAttentionIcon}
          highlight
          tone="pending"
          label={t('stock.kpi.runningLow')}
          value={book ? String(book.runningLow) : '…'}
          note={t('stock.live.runningLowNote')}
        />
        <Kpi
          icon={kpiOutIcon}
          tint="bg-danger-100"
          tone="danger"
          label={t('stock.kpi.nothingLeft')}
          value={book ? String(book.nothingLeft) : '…'}
          note={
            outRow
              ? outRow.lastMovementAt
                ? t('stock.kpi.nothingLeftNote', {
                    name: stockItemName(outRow, i18n.language),
                    day: weekdayName(new Date(outRow.lastMovementAt).getDay(), i18n.language),
                  })
                : stockItemName(outRow, i18n.language)
              : t('stock.kpi.nothingOut')
          }
        />
        <Kpi
          icon={kpiMovedIcon}
          label={t('stock.kpi.moved')}
          value={book ? quantityText(movedThisWeek(book), i18n.language) : '…'}
          note={t('stock.kpi.movedNote', {
            sold: quantityText(book?.lastSevenDays.sold ?? 0, i18n.language),
            received: quantityText(book?.lastSevenDays.received ?? 0, i18n.language),
            writtenOff: quantityText(book?.lastSevenDays.writtenOff ?? 0, i18n.language),
          })}
        />
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip
          tabs={STOCK_TABS}
          value={tab}
          onChange={setTab}
          count={(id) => countStockTab(book, id) ?? 0}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] w-[345px] max-w-full items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 max-md:w-full">
            <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('stock.search')}
              aria-label={t('stock.search')}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <FilterMenu
              funnel
              label={t('catalog.filters')}
              value={tab}
              defaultValue="all"
              options={STOCK_TABS.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: countStockTab(book, entry.id) ?? undefined,
              }))}
              onChange={setTab}
            />
            <SortMenu
              value={sort}
              onChange={(value) => setSort(value as StockSort)}
              options={STOCK_SORTS.map((entry) => ({
                value: entry.id,
                labelKey: entry.labelKey,
              }))}
            />
          </div>
        </div>

        {done ? (
          <p
            role="status"
            className="border-t border-surface-background px-5 py-3 text-sm font-semibold text-[#3d5648]"
          >
            {done}
          </p>
        ) : null}

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-primary-100 bg-primary-25 px-5 py-3">
            <span className="flex items-center gap-2.5">
              <TableCheckbox
                checked
                onChange={() => setSelected([])}
                ariaLabel={t('stock.clear')}
              />
              <span className="text-sm font-semibold text-primary-800">
                {allSameSupplier && first?.supplier
                  ? t('stock.selected', { count: selected.length, supplier: first.supplier.name })
                  : t('catalog.selected', { count: selected.length })}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {/* A purchase order is raised from its supplier's page; the items are picked on
                  its lines there. */}
              {allSameSupplier && first?.supplier ? (
                <Link
                  to={`/suppliers/${encodeURIComponent(first.supplier.supplierId)}/purchase-order`}
                  className={SELECTION_BUTTON}
                >
                  {t('stock.live.orderFrom', { supplier: first.supplier.name })}
                </Link>
              ) : null}
              {access.canManage ? (
                <button
                  type="button"
                  onClick={() => setDialog('reorder')}
                  className={SELECTION_BUTTON}
                >
                  {t('stock.changeReorder')}
                </button>
              ) : null}
              {access.canAdjust ? (
                <button
                  type="button"
                  onClick={() => setDialog('writeOff')}
                  className={SELECTION_BUTTON}
                >
                  {t('stock.writeStockOff')}
                </button>
              ) : null}
              <button type="button" onClick={() => setSelected([])} className={SELECTION_BUTTON}>
                {t('stock.clear')}
              </button>
            </span>
          </div>
        ) : null}

        {list.read.status === 'failed' ? (
          <div className="p-5 pt-0">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : list.read.status === 'loading' ? (
          <div className="p-5 pt-0">
            <LoadingNotice />
          </div>
        ) : (
          <RowsView>
            <table className="w-full min-w-[1060px] border-collapse">
              <thead>
                <tr className="whitespace-nowrap bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                  <th className="h-[46px] w-[46px] ps-5 pe-2" />
                  <th className="h-[46px] px-3 text-start font-semibold">{t('stock.col.item')}</th>
                  <th className="h-[46px] px-3 text-end font-semibold">{t('stock.col.onHand')}</th>
                  <th className="h-[46px] px-3 text-start font-semibold">{t('stock.col.lasts')}</th>
                  <th className="h-[46px] px-3 text-end font-semibold">{t('stock.col.orderAt')}</th>
                  <th className="h-[46px] px-3 text-start font-semibold">
                    {t('stock.col.onOrder')}
                  </th>
                  <th className="h-[46px] px-3 text-end font-semibold">{t('stock.col.worth')}</th>
                  <th className="h-[46px] ps-3 pe-5" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-4 py-12 text-center text-sm font-medium text-text-quaternary"
                    >
                      {t('stock.empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <Row
                      key={stockKey(row)}
                      row={row}
                      checked={selected.some((x) => stockKey(x) === stockKey(row))}
                      onToggle={() => toggle(row)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </RowsView>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-sm font-medium text-text-quaternary">
            {t('stock.live.showing', { shown: rows.length, total })}
          </p>
          <Pager
            page={page + 1}
            pageCount={loaded ? Math.max(1, pageCountOf(loaded)) : 1}
            onChange={(next) => setPage(next - 1)}
            disabled={!loaded}
            labels={{
              nav: t('appList.pager.label'),
              previous: t('appList.pager.previous'),
              next: t('appList.pager.next'),
            }}
          />
        </div>
      </section>

      {branchId && access.canAdjust ? (
        <>
          <StockCountModal
            open={dialog === 'count'}
            onClose={() => setDialog(null)}
            branchId={branchId}
            rows={countRows}
            onDone={finished}
          />
          <StockWriteOffModal
            open={dialog === 'writeOff'}
            onClose={() => setDialog(null)}
            branchId={branchId}
            rows={selected}
            onDone={finished}
          />
          <StockDeliveryModal
            open={dialog === 'delivery'}
            onClose={() => setDialog(null)}
            branchId={branchId}
            initial={selected}
            onDone={finished}
          />
        </>
      ) : null}
      {branchId && access.canManage ? (
        <StockReorderModal
          open={dialog === 'reorder'}
          onClose={() => setDialog(null)}
          branchId={branchId}
          rows={selected}
          onDone={() => finished()}
        />
      ) : null}
    </>,
    access.canAdjust ? (
      <>
        <button
          type="button"
          onClick={() => setDialog('count')}
          className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
        >
          {t('stock.countTheShelves')}
        </button>
        <button
          type="button"
          onClick={() => setDialog('delivery')}
          className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
        >
          <img src={downloadIcon} alt="" className="size-[18px]" />
          {t('stock.recordWhatCameIn')}
        </button>
      </>
    ) : undefined,
  )
}

function Row({
  row,
  checked,
  onToggle,
}: {
  row: StockRowDto
  checked: boolean
  onToggle: () => void
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const name = stockItemName(row, language)
  const unit = stockUnitName(t, row.unitCode, language)
  const days = row.daysLeft
  const low = isRunningLow(row)
  const out = isOut(row)
  const notCounted = row.onHand === null
  const cover = coverShare(row)
  const orders = row.onOrder ?? []
  const firstOrder = orders[0] ?? null
  const onOrder = orders.reduce((sum, order) => sum + order.quantity, 0)
  const href = stockItemHref(row)

  return (
    <tr
      className={[
        'border-b border-surface-background last:border-0',
        out ? 'border-s-4 border-s-danger-700 bg-[#fdf4f2]' : '',
      ].join(' ')}
    >
      <td className="ps-5 pe-2 py-4 align-middle">
        <TableCheckbox checked={checked} onChange={onToggle} ariaLabel={name} />
      </td>

      <td className="px-3 py-4 align-middle">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-50">
            <img src={kindProductIcon} alt="" className="size-[18px]" />
          </span>
          <div className="min-w-0 max-w-[260px]">
            <Link
              to={href}
              title={name}
              className="block truncate text-sm font-semibold text-text-primary transition-colors hover:text-primary-700"
            >
              {name}
            </Link>
            {/* TODO(backend): the frame prints the item's group and kind before its code; the
                stock row carries neither (docs/backend-guides/INCOME.md, row P.19). */}
            <p className="mt-1 truncate text-xs font-medium text-text-quaternary">
              <span dir="ltr">{row.code}</span>
              {row.variantRetired ? ` · ${t('stock.live.retired')}` : ''}
            </p>
          </div>
        </div>
      </td>

      <td className="px-3 py-4 align-middle text-end">
        <p
          className={[
            'text-lg font-semibold tabular-nums',
            out ? 'text-danger-700' : low ? 'text-pending-700' : 'text-text-primary',
          ].join(' ')}
          dir="ltr"
        >
          {notCounted ? '—' : quantityText(row.onHand ?? 0, language)}
        </p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {notCounted ? t('stock.live.notCountedYet') : unit}
        </p>
      </td>

      <td className="px-3 py-4 align-middle">
        <span className="flex h-1.5 w-[140px] overflow-hidden rounded-full bg-surface-background">
          <span
            className={out ? 'bg-danger-700' : low ? 'bg-pending-500' : 'bg-[#4c6c5a]'}
            style={{ width: `${Math.max(3, Math.round(cover * 100))}%` }}
          />
        </span>
        <p
          className={[
            'mt-1.5 whitespace-nowrap text-sm font-semibold',
            out ? 'text-danger-700' : low ? 'text-pending-700' : 'text-text-primary',
          ].join(' ')}
        >
          {out
            ? row.lastMovementAt
              ? t('stock.ranOut', {
                  day: weekdayName(new Date(row.lastMovementAt).getDay(), language),
                })
              : t('stock.kpi.nothingLeft')
            : notCounted
              ? t('stock.live.notCountedYet')
              : days === null
                ? t('stock.live.nothingSells')
                : days <= 7
                  ? t('stock.goneBy', { day: dayName(days, language) })
                  : t('stock.aboutWeeks', { count: Math.round(days / 7) })}
        </p>
        <p className="mt-1 max-w-[190px] text-xs font-medium leading-[1.4] text-text-quaternary">
          {days !== null && !out
            ? t('stock.daysAt', {
                days,
                note: t('stock.sellingAbout', {
                  rate: t('stockItem.aDay', { count: Math.round(row.perDay * 10) / 10 }),
                }),
              })
            : ''}
        </p>
      </td>

      <td className="px-3 py-4 align-middle text-end">
        <p className="text-sm font-semibold text-text-primary tabular-nums" dir="ltr">
          {row.reorderLevel === null ? '—' : quantityText(row.reorderLevel, language)}
        </p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {row.reorderLevel === null ? t('stock.live.noLevel') : unit}
        </p>
      </td>

      <td className="px-3 py-4 align-middle">
        {firstOrder ? (
          <>
            <p className="text-sm font-semibold text-text-primary tabular-nums">
              {quantityText(onOrder, language)}
            </p>
            <p className="mt-1 whitespace-nowrap text-xs font-medium text-text-quaternary">
              <Link
                to={`/expenditure/purchase-orders/${encodeURIComponent(firstOrder.purchaseOrderId)}`}
                className="hover:text-primary-700"
              >
                <span dir="ltr">{firstOrder.number}</span>
              </Link>
              {orders.length > 1 ? ` ${t('stock.live.andMore', { count: orders.length - 1 })}` : ''}
              {firstOrder.wantedBy
                ? ` · ${t('stock.dueOn', { date: formatDate(firstOrder.wantedBy, language) })}`
                : ''}
            </p>
          </>
        ) : (
          <p className="whitespace-nowrap text-sm font-medium text-text-quaternary">
            {t('stock.nothingOrdered')}
          </p>
        )}
      </td>

      <td className="px-3 py-4 align-middle text-end">
        {row.worth === null ? (
          <p className="text-sm font-semibold text-text-quaternary">—</p>
        ) : (
          <p className="inline-flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-sm font-semibold text-text-primary">
              <Rial />
            </span>
            <span className="text-sm font-semibold text-text-primary tabular-nums">
              {omr(row.worth)}
            </span>
          </p>
        )}
        <p className="mt-1 whitespace-nowrap text-xs font-medium text-text-quaternary">
          {row.averageCost === null
            ? t('stock.live.noCost')
            : t('stock.eachAt', { amount: omr(row.averageCost) })}
        </p>
      </td>

      <td className="ps-3 pe-5 py-4 align-middle text-end">
        <Link
          to={href}
          className={[
            'inline-flex h-[38px] items-center whitespace-nowrap rounded-sm border px-4 text-sm font-semibold transition-colors',
            low || out
              ? 'border-pending-500/50 bg-pending-100 text-pending-700 hover:bg-pending-200/60'
              : 'border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
          ].join(' ')}
        >
          {low || out ? t('stock.orderNow') : t('stock.movements')}
        </Link>
      </td>
    </tr>
  )
}

/** The selection bar's actions: outlined in the brand blue, Clear included. */
const SELECTION_BUTTON =
  'inline-flex h-[38px] items-center whitespace-nowrap rounded-sm border border-primary-300 bg-white px-3 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-25'

/**
 * A cover of a few days reads better as the day it runs out than as a number, counted from today
 * and named in the interface language.
 */
function dayName(days: number, language: string) {
  return weekdayName(new Date().getDay() + Math.max(0, days), language)
}
