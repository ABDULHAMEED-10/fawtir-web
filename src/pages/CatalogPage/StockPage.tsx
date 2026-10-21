import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Kpi, TabStrip } from './CatalogShell'
import { FilterMenu, Rial, RowsView, SortMenu, TableCheckbox } from '../../components/ui'
import { omr, groupName, kindName } from '../../lib/catalog'
import {
  STOCK_ROWS,
  STOCK_TABS,
  STOCK_SORTS,
  STOCK_BOOK,
  MOVED_THIS_WEEK,
  RUNNING_LOW,
  NOTHING_LEFT,
  countStockTab,
  matchesStockTab,
  rowWorth,
  daysLeft,
  coverShare,
  isRunningLow,
  isOut,
  itemOf,
  weekdayName,
  type StockRow,
  type StockTab,
} from '../../lib/catalogStock'
import downloadIcon from '../../assets/catalog/download-white.svg'
import searchIcon from '../../assets/invoices/search.svg'
import kpiWorthIcon from '../../assets/catalog/kpi-worth.svg'
import kpiAttentionIcon from '../../assets/catalog/kpi-attention.svg'
import kpiOutIcon from '../../assets/catalog/kpi-out.svg'
import kpiMovedIcon from '../../assets/catalog/kpi-moved.svg'
import kindBagIcon from '../../assets/catalog/kind-bag.svg'
import kindGrinderIcon from '../../assets/catalog/kind-grinder.svg'
import kindProductIcon from '../../assets/catalog/kind-product.svg'

const rowIcon = (id: string) => {
  if (id.includes('grinder')) return kindGrinderIcon
  if (id.includes('bag') || id.includes('blend') || id.includes('yirg') || id.includes('sidamo'))
    return kindBagIcon
  return kindProductIcon
}

/**
 * Stock (Figma 135:49263) — a place of its own beside the catalog, not a corner of it.
 *
 * Worth, cover and the low-stock colour all come from what is held against what it costs and how
 * fast it goes, so a row cannot look calm while its own numbers say it will run out on Monday.
 */
export function StockPage() {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState<StockTab>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('lowestFirst')
  const [selected, setSelected] = useState<string[]>([
    'kraft-bags-500g',
    'yirgacheffe-1kg',
    'sidamo-1kg',
    'paper-filters-100',
  ])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = STOCK_ROWS.filter(
      (row) =>
        matchesStockTab(row, tab) &&
        (needle === '' ||
          itemOf(row.id).name.toLowerCase().includes(needle) ||
          itemOf(row.id).code.toLowerCase().includes(needle)),
    )
    return [...filtered].sort((a, b) => {
      if (sort === 'worthMost') return rowWorth(b) - rowWorth(a)
      if (sort === 'name') return itemOf(a.id).name.localeCompare(itemOf(b.id).name)
      return coverShare(a) - coverShare(b)
    })
  }, [tab, query, sort])

  const out = STOCK_ROWS.find(isOut)
  const supplier = selected.length
    ? (STOCK_ROWS.find((row) => row.id === selected[0])?.supplier ?? '')
    : ''
  const allSameSupplier = selected.every(
    (id) => STOCK_ROWS.find((row) => row.id === id)?.supplier === supplier,
  )

  return (
    <CatalogShell
      crumbs={[]}
      title={t('stock.title')}
      subtitle={t('stock.subtitle')}
      actions={
        <>
          <button
            type="button"
            className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('stock.countTheShelves')}
          </button>
          <button
            type="button"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={downloadIcon} alt="" className="size-[18px]" />
            {t('stock.recordWhatCameIn')}
          </button>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiWorthIcon}
          label={t('stock.kpi.worth')}
          value={omr(STOCK_BOOK.worth)}
          currency
          note={t('stock.kpi.worthNote', { count: STOCK_BOOK.counted })}
        />
        <Kpi
          icon={kpiAttentionIcon}
          highlight
          tone="pending"
          label={t('stock.kpi.runningLow')}
          value={String(RUNNING_LOW)}
          note={t('stock.kpi.runningLowNote')}
        />
        <Kpi
          icon={kpiOutIcon}
          tint="bg-danger-100"
          tone="danger"
          label={t('stock.kpi.nothingLeft')}
          value={String(NOTHING_LEFT)}
          note={
            out
              ? t('stock.kpi.nothingLeftNote', {
                  name: itemOf(out.id).name,
                  day: out.ranOutOn === undefined ? '' : weekdayName(out.ranOutOn, i18n.language),
                })
              : t('stock.kpi.nothingOut')
          }
        />
        <Kpi
          icon={kpiMovedIcon}
          label={t('stock.kpi.moved')}
          value={String(MOVED_THIS_WEEK)}
          note={t('stock.kpi.movedNote', STOCK_BOOK.movedThisWeek)}
        />
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip tabs={STOCK_TABS} value={tab} onChange={setTab} count={countStockTab} />

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
                count: countStockTab(entry.id),
              }))}
              onChange={setTab}
            />
            <SortMenu
              value={sort}
              onChange={setSort}
              options={STOCK_SORTS.map((entry) => ({
                value: entry.id,
                labelKey: entry.labelKey,
              }))}
            />
          </div>
        </div>

        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-primary-100 bg-primary-25 px-5 py-3">
            <span className="flex items-center gap-2.5">
              <TableCheckbox
                checked
                onChange={() => setSelected([])}
                ariaLabel={t('stock.clear')}
              />
              <span className="text-sm font-semibold text-primary-800">
                {allSameSupplier
                  ? t('stock.selected', { count: selected.length, supplier })
                  : t('catalog.selected', { count: selected.length })}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <button type="button" className={SELECTION_BUTTON}>
                {t('stock.addToPo', { reference: 'PO-0034' })}
              </button>
              <button type="button" className={SELECTION_BUTTON}>
                {t('stock.changeReorder')}
              </button>
              <button type="button" className={SELECTION_BUTTON}>
                {t('stock.writeStockOff')}
              </button>
              <button type="button" onClick={() => setSelected([])} className={SELECTION_BUTTON}>
                {t('stock.clear')}
              </button>
            </span>
          </div>
        ) : null}

        <RowsView>
          <table className="w-full min-w-[1060px] border-collapse">
            <thead>
              <tr className="whitespace-nowrap bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                <th className="h-[46px] w-[46px] ps-5 pe-2" />
                <th className="h-[46px] px-3 text-start font-semibold">{t('stock.col.item')}</th>
                <th className="h-[46px] px-3 text-end font-semibold">{t('stock.col.onHand')}</th>
                <th className="h-[46px] px-3 text-start font-semibold">{t('stock.col.lasts')}</th>
                <th className="h-[46px] px-3 text-end font-semibold">{t('stock.col.orderAt')}</th>
                <th className="h-[46px] px-3 text-start font-semibold">{t('stock.col.onOrder')}</th>
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
                    key={row.id}
                    row={row}
                    checked={selected.includes(row.id)}
                    onToggle={() =>
                      setSelected((list) =>
                        list.includes(row.id)
                          ? list.filter((x) => x !== row.id)
                          : [...list, row.id],
                      )
                    }
                  />
                ))
              )}
            </tbody>
          </table>
        </RowsView>

        <p className="px-5 py-4 text-sm font-medium text-text-quaternary">
          {t('stock.showing', { shown: rows.length, total: STOCK_BOOK.counted })}
        </p>
      </section>
    </CatalogShell>
  )
}

function Row({
  row,
  checked,
  onToggle,
}: {
  row: StockRow
  checked: boolean
  onToggle: () => void
}) {
  const { t, i18n } = useTranslation()
  const item = itemOf(row.id)
  const days = daysLeft(row)
  const low = isRunningLow(row)
  const out = isOut(row)
  const cover = coverShare(row)
  const category = `${groupName(item.group)} › ${kindName(item.group, item.kind)} · ${item.code}`
  const note = row.lastsNoteKey
    ? t(row.lastsNoteKey, {
        ...row.lastsNoteValues,
        ...(row.lastsNoteKey === 'stock.sellingAbout'
          ? { rate: t('stockItem.aDay', { count: Number(row.lastsNoteValues?.rate ?? 0) }) }
          : {}),
      })
    : ''

  return (
    <tr
      className={[
        'border-b border-surface-background last:border-0',
        out ? 'border-s-4 border-s-danger-700 bg-[#fdf4f2]' : '',
      ].join(' ')}
    >
      <td className="ps-5 pe-2 py-4 align-middle">
        <TableCheckbox checked={checked} onChange={onToggle} ariaLabel={item.name} />
      </td>

      <td className="px-3 py-4 align-middle">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-50">
            <img src={rowIcon(row.id)} alt="" className="size-[18px]" />
          </span>
          <div className="min-w-0 max-w-[260px]">
            <Link
              to={`/stock/${row.id}`}
              title={item.name}
              className="block truncate text-sm font-semibold text-text-primary transition-colors hover:text-primary-700"
            >
              {item.name}
            </Link>
            <p className="mt-1 truncate text-xs font-medium text-text-quaternary" title={category}>
              {groupName(item.group)} › {kindName(item.group, item.kind)} ·{' '}
              <span dir="ltr">{item.code}</span>
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
        >
          {row.onHand}
        </p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">{t(row.unitKey)}</p>
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
            ? t('stock.ranOut', {
                day: row.ranOutOn === undefined ? '' : weekdayName(row.ranOutOn, i18n.language),
              })
            : days !== null && days <= 7
              ? t('stock.goneBy', { day: dayName(days, i18n.language) })
              : days !== null && days <= 28
                ? t('stock.aboutWeeks', { count: Math.round(days / 7) })
                : t('stock.aboutWeeks', { count: Math.round((days ?? 0) / 7) })}
        </p>
        <p className="mt-1 max-w-[190px] text-xs font-medium leading-[1.4] text-text-quaternary">
          {days !== null && !out
            ? note
              ? t('stock.daysAt', { days, note })
              : t('stockItem.days', { count: days })
            : note}
        </p>
      </td>

      <td className="px-3 py-4 align-middle text-end">
        <p className="text-sm font-semibold text-text-primary tabular-nums">{row.reorderAt}</p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">{t(row.unitKey)}</p>
      </td>

      <td className="px-3 py-4 align-middle">
        {row.onOrder ? (
          <>
            <p className="text-sm font-semibold text-text-primary tabular-nums">
              {row.onOrder.quantity}
            </p>
            <p className="mt-1 whitespace-nowrap text-xs font-medium text-text-quaternary">
              <span dir="ltr">{row.onOrder.reference}</span> ·{' '}
              {t('stock.dueOn', { date: row.onOrder.dueOn })}
            </p>
          </>
        ) : (
          <p className="whitespace-nowrap text-sm font-medium text-text-quaternary">
            {t('stock.nothingOrdered')}
          </p>
        )}
      </td>

      <td className="px-3 py-4 align-middle text-end">
        <p className="inline-flex items-baseline gap-1 whitespace-nowrap">
          <span className="text-sm font-semibold text-text-primary">
            <Rial />
          </span>
          <span className="text-sm font-semibold text-text-primary tabular-nums">
            {omr(rowWorth(row))}
          </span>
        </p>
        <p className="mt-1 whitespace-nowrap text-xs font-medium text-text-quaternary">
          {t('stock.eachAt', { amount: omr(row.cost) })}
        </p>
      </td>

      <td className="ps-3 pe-5 py-4 align-middle text-end">
        <Link
          to={`/stock/${row.id}`}
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
 * A cover of a few days reads better as the day it runs out than as a number. Counted from a
 * Monday as the design does, and named in the interface language.
 */
function dayName(days: number, language: string) {
  return weekdayName(Math.max(0, Math.min(6, days)) + 1, language)
}
