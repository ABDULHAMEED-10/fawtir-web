import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, Kpi, TabStrip } from './CatalogShell'
import { GroupsPanel } from './GroupsPanel'
import { ChangePricesModal } from './ChangePricesModal'
import { CatalogEmptyState } from './CatalogEmptyState'
import { ActionMenu, FilterMenu, SortMenu, TableCheckbox, Popover } from '../../components/ui'
import {
  ITEMS,
  GROUPS,
  KIND_COUNT,
  CATALOG_TABS,
  CATALOG_SORTS,
  CATALOG_TOTAL,
  ON_SALE,
  SWITCHED_OFF,
  EARNING,
  attentionSplit,
  countCatalogTab,
  matchesCatalogTab,
  matchesCatalogQuery,
  PAGE_SIZE,
  groupName,
  kindName,
  omr,
  type CatalogTab,
  type Item,
} from '../../lib/catalog'
import searchIcon from '../../assets/invoices/search.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import plusIcon from '../../assets/catalog/plus-white.svg'
import uploadIcon from '../../assets/catalog/upload-ink.svg'
import groupsIcon from '../../assets/catalog/menu-list.svg'
import kpiItemsIcon from '../../assets/catalog/kpi-items.svg'
import kpiGroupsIcon from '../../assets/catalog/kpi-groups.svg'
import kpiEarningIcon from '../../assets/catalog/kpi-earning.svg'
import kpiAttentionIcon from '../../assets/catalog/kpi-attention.svg'
import kindProductIcon from '../../assets/catalog/kind-product.svg'
import kindBagIcon from '../../assets/catalog/kind-bag.svg'
import kindServiceIcon from '../../assets/catalog/kind-service.svg'
import kindHourIcon from '../../assets/catalog/kind-hour.svg'
import kindBundleIcon from '../../assets/catalog/kind-bundle.svg'
import menuOpenIcon from '../../assets/catalog/menu-list.svg'
import menuPriceIcon from '../../assets/catalog/menu-chart.svg'
import menuCopyIcon from '../../assets/catalog/copy-ink.svg'
import menuMoveIcon from '../../assets/catalog/box.svg'
import menuOffIcon from '../../assets/catalog/cross-danger.svg'

const KIND_ICON: Record<string, string> = {
  product: kindProductIcon,
  service: kindServiceIcon,
  byTheHour: kindHourIcon,
  bundle: kindBundleIcon,
}

const TAG_TONE: Record<string, string> = {
  product: 'bg-primary-50 text-primary-800',
  service: 'bg-success-100 text-[#3d5648]',
  byTheHour: 'bg-pending-100 text-pending-700',
  bundle: 'bg-surface-background text-text-tertiary',
}

/**
 * Catalog — everything you sell (Figma 135:44255).
 *
 * Four figures, five tabs, one table. Every count comes from the same list the table draws, so
 * the tabs cannot promise rows the table has not got.
 */
export function CatalogPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState<CatalogTab>('onSale')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('bestSelling')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<string[]>([])
  const [pricesOpen, setPricesOpen] = useState(false)
  const [groupsOpen, setGroupsOpen] = useState(false)
  const groupsRef = useRef<HTMLButtonElement>(null)

  const attention = attentionSplit()

  const rows = useMemo(() => {
    const filtered = ITEMS.filter(
      (item) => matchesCatalogTab(item, tab) && matchesCatalogQuery(item, query),
    )
    return [...filtered].sort((a, b) => {
      if (sort === 'bestSelling') return b.sold90 - a.sold90
      if (sort === 'priceHigh') return (b.price ?? 0) - (a.price ?? 0)
      if (sort === 'priceLow') return (a.price ?? 0) - (b.price ?? 0)
      if (sort === 'recentlyAdded') return a.id.localeCompare(b.id)
      return a.name.localeCompare(b.name)
    })
  }, [tab, query, sort])

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, pageCount)
  const visible = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)

  const toggle = (id: string) =>
    setSelected((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]))

  const reset = () => {
    setPage(1)
    setSelected([])
  }

  if (ITEMS.length === 0) return <CatalogEmptyState />

  return (
    <CatalogShell
      crumbs={[]}
      title={t('catalog.title')}
      subtitle={t('catalog.subtitle')}
      actions={
        <>
          <Link
            to="/catalog/upload"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            <img src={uploadIcon} alt="" className="size-[18px]" />
            {t('catalog.uploadAMenu')}
          </Link>
          <Link
            to="/catalog/new"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-4" />
            {t('catalog.newItem')}
          </Link>
        </>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Kpi
          icon={kpiItemsIcon}
          label={t('catalog.kpi.thingsYouSell')}
          value={String(CATALOG_TOTAL)}
          note={t('catalog.kpi.thingsYouSellNote', {
            onSale: ON_SALE.length,
            off: SWITCHED_OFF.length,
          })}
        />
        <Kpi
          icon={kpiGroupsIcon}
          label={t('catalog.kpi.organised')}
          value={String(GROUPS.length)}
          unit={t('catalog.kpi.groups')}
          note={t('catalog.kpi.organisedNote', { count: KIND_COUNT })}
        />
        <Kpi
          icon={kpiEarningIcon}
          label={t('catalog.kpi.earning')}
          value={String(EARNING.length)}
          unit={t('catalog.kpi.earningOf', { count: ON_SALE.length })}
          note={t('catalog.kpi.earningNote')}
        />
        <Kpi
          icon={kpiAttentionIcon}
          highlight
          tone="pending"
          label={t('catalog.kpi.attention')}
          value={String(countCatalogTab('attention'))}
          note={
            countCatalogTab('attention') === 0
              ? t('catalog.kpi.attentionNone')
              : t('catalog.kpi.attentionNote', {
                  low: attention.runningLow,
                  noPrice: attention.noPrice,
                  noTax: attention.noTax,
                })
          }
        />
      </div>

      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip
          tabs={CATALOG_TABS}
          value={tab}
          onChange={(id) => {
            setTab(id)
            reset()
          }}
          count={countCatalogTab}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] min-w-[280px] flex-1 items-center gap-2 rounded-sm border border-border-subtle bg-white px-3">
            <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                reset()
              }}
              placeholder={t('catalog.search')}
              aria-label={t('catalog.search')}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
            <button
              ref={groupsRef}
              type="button"
              onClick={() => setGroupsOpen((open) => !open)}
              aria-expanded={groupsOpen}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={groupsIcon} alt="" className="size-[18px]" />
              {t('catalog.groups')}
            </button>
            <Popover anchorRef={groupsRef} open={groupsOpen} onClose={() => setGroupsOpen(false)}>
              <GroupsPanel onPick={() => setGroupsOpen(false)} />
            </Popover>

            <FilterMenu
              label={t('catalog.filters')}
              value={tab}
              defaultValue="all"
              options={CATALOG_TABS.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: countCatalogTab(entry.id),
              }))}
              onChange={(value) => {
                setTab(value)
                reset()
              }}
            />
            <SortMenu
              value={sort}
              onChange={setSort}
              options={CATALOG_SORTS.map((entry) => ({
                value: entry.id,
                labelKey: entry.labelKey,
              }))}
            />
          </div>
        </div>

        {/* Bulk bar */}
        {selected.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-primary-100 bg-primary-25 px-5 py-3">
            <span className="flex items-center gap-2.5">
              <TableCheckbox
                checked
                onChange={() => setSelected([])}
                ariaLabel={t('catalog.clear')}
              />
              <span className="text-sm font-semibold text-primary-800">
                {t('catalog.selected', { count: selected.length })}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPricesOpen(true)}
                className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
              >
                {t('catalog.changeThePrice')}
              </button>
              <button
                type="button"
                className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
              >
                {t('catalog.moveToAGroup')}
              </button>
              <button
                type="button"
                className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary transition-colors hover:bg-white/70"
              >
                {t('catalog.switchOff')}
              </button>
              <button
                type="button"
                onClick={() => setSelected([])}
                className="inline-flex h-[38px] items-center rounded-sm px-3 text-sm font-semibold text-primary-700 transition-colors hover:bg-white/70"
              >
                {t('catalog.clear')}
              </button>
            </span>
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                <th className="h-[46px] w-[46px] px-4">
                  <TableCheckbox
                    checked={
                      visible.length > 0 && visible.every((row) => selected.includes(row.id))
                    }
                    indeterminate={visible.some((row) => selected.includes(row.id))}
                    onChange={() =>
                      setSelected((list) =>
                        visible.every((row) => list.includes(row.id))
                          ? list.filter((id) => !visible.some((row) => row.id === id))
                          : [...new Set([...list, ...visible.map((row) => row.id)])],
                      )
                    }
                    ariaLabel={t('catalog.selected', { count: visible.length })}
                  />
                </th>
                <th className="h-[46px] px-4 text-start font-semibold">{t('catalog.col.item')}</th>
                <th className="h-[46px] px-4 text-start font-semibold">{t('catalog.col.kind')}</th>
                <th className="h-[46px] px-4 text-end font-semibold">{t('catalog.col.price')}</th>
                <th className="h-[46px] px-4 text-start font-semibold">{t('catalog.col.tax')}</th>
                <th className="h-[46px] px-4 text-start font-semibold">{t('catalog.col.stock')}</th>
                <th className="h-[46px] px-4 text-end font-semibold">{t('catalog.col.sold')}</th>
                <th className="h-[46px] px-4" />
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm font-medium text-text-quaternary"
                  >
                    {t('catalog.empty')}
                  </td>
                </tr>
              ) : (
                visible.map((item) => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    checked={selected.includes(item.id)}
                    onToggle={() => toggle(item.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
          <p className="text-sm font-medium text-text-quaternary">
            {t('catalog.showing', { shown: visible.length, total: rows.length })}
          </p>
          {pageCount > 1 ? <Pager page={current} pageCount={pageCount} onChange={setPage} /> : null}
        </div>
      </section>

      <ChangePricesModal
        open={pricesOpen}
        onClose={() => setPricesOpen(false)}
        count={selected.length}
      />
    </CatalogShell>
  )
}

function ItemRow({
  item,
  checked,
  onToggle,
}: {
  item: Item
  checked: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  const off = !item.onSale
  const low = item.attention === 'runningLow'

  return (
    <tr
      className={[
        'border-b border-surface-background last:border-0',
        low ? 'bg-pending-100/40' : '',
        off ? 'opacity-60' : '',
      ].join(' ')}
    >
      <td className="px-4 py-4 align-top">
        <TableCheckbox checked={checked} onChange={onToggle} ariaLabel={item.name} />
      </td>

      <td className="px-4 py-4 align-top">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-surface-background">
            <img
              src={item.stockUnitKey === 'catalog.unit.bags' ? kindBagIcon : KIND_ICON[item.tag]}
              alt=""
              className="size-[18px]"
            />
          </span>
          <div className="min-w-0">
            <Link
              to={`/catalog/${item.id}`}
              className="text-sm font-semibold text-text-primary transition-colors hover:text-primary-700"
            >
              {item.name}
            </Link>
            <p className="mt-1 text-xs font-medium text-text-quaternary">
              {groupName(item.group)} › {kindName(item.group, item.kind)} · {item.code}
            </p>
          </div>
        </div>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className={[
            'inline-flex h-[24px] items-center rounded-[3px] px-2 text-[10px] font-semibold uppercase tracking-[0.4px]',
            TAG_TONE[item.tag],
          ].join(' ')}
        >
          {t(`catalog.tag.${item.tag}`)}
        </span>
        <p className="mt-1.5 text-xs font-medium leading-[1.4] text-text-quaternary">
          {t(item.soldAsKey, { ...item.partsValues, date: item.offSince })}
        </p>
      </td>

      <td className="px-4 py-4 align-top text-end">
        {item.price === null ? (
          <p className="text-sm font-semibold text-danger-700">{t('catalog.noPrice')}</p>
        ) : (
          <p className="text-sm font-semibold text-text-primary tabular-nums">{omr(item.price)}</p>
        )}
        {item.priceNoteKey ? (
          <p
            className={[
              'mt-1 text-xs font-medium',
              item.priceNoteKey === 'catalog.rangeBySize' ||
              item.priceNoteKey === 'catalog.savesOnParts'
                ? 'text-primary-700'
                : 'text-text-quaternary',
            ].join(' ')}
          >
            {t(item.priceNoteKey, item.priceNoteValues)}
          </p>
        ) : null}
      </td>

      <td className="px-4 py-4 align-top">
        {item.taxPercent === null ? (
          <p className="text-sm font-semibold text-danger-700">{t('catalog.noTaxSet')}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-text-primary">{item.taxPercent}%</p>
            <p className="mt-1 text-xs font-medium text-text-quaternary">{t('catalog.standard')}</p>
          </>
        )}
      </td>

      <td className="px-4 py-4 align-top">
        {item.onHand === null ? (
          <p className="text-sm font-medium text-text-quaternary">
            {item.tag === 'service' || item.tag === 'byTheHour'
              ? t('catalog.notAStockItem')
              : t('catalog.notTracked')}
          </p>
        ) : (
          <>
            <p
              className={[
                'text-sm font-semibold tabular-nums',
                low ? 'text-pending-700' : 'text-text-primary',
              ].join(' ')}
            >
              {item.onHand}
            </p>
            <p
              className={[
                'mt-1 text-xs font-medium',
                low ? 'text-pending-700' : 'text-text-quaternary',
              ].join(' ')}
            >
              {item.stockNoteKey
                ? t(item.stockNoteKey, { limit: item.reorderAt })
                : t(item.stockUnitKey ?? 'catalog.unit.units')}
            </p>
          </>
        )}
      </td>

      <td className="px-4 py-4 align-top text-end">
        <p className="text-sm font-semibold text-text-primary tabular-nums">
          {item.sold90.toLocaleString('en-US')}
        </p>
        <p className="mt-1 text-xs font-medium text-text-quaternary">
          {item.lastSold ? t('catalog.lastSoldIn', { month: item.lastSold }) : t('catalog.last90')}
        </p>
      </td>

      <td className="px-4 py-4 align-top text-end">
        <ActionMenu
          label={t('catalog.rowMenu.open')}
          items={[
            {
              id: 'open',
              labelKey: 'catalog.rowMenu.open',
              icon: menuOpenIcon,
              to: `/catalog/${item.id}`,
            },
            { id: 'price', labelKey: 'catalog.rowMenu.changePrice', icon: menuPriceIcon },
            { id: 'copy', labelKey: 'catalog.rowMenu.duplicate', icon: menuCopyIcon },
            { id: 'move', labelKey: 'catalog.rowMenu.moveGroup', icon: menuMoveIcon },
            {
              id: 'off',
              labelKey: off ? 'catalog.rowMenu.switchOn' : 'catalog.rowMenu.switchOff',
              icon: menuOffIcon,
              danger: !off,
            },
          ]}
        />
      </td>
    </tr>
  )
}

function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number
  pageCount: number
  onChange: (page: number) => void
}) {
  /** First, last, and a window around the current page — the shape the design draws. */
  const pages = [...new Set([1, 2, 3, page, pageCount])]
    .filter((n) => n >= 1 && n <= pageCount)
    .sort((a, b) => a - b)

  return (
    <nav className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        aria-label="Previous"
        className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25 disabled:opacity-40"
      >
        <img src={chevronIcon} alt="" className="size-4 rotate-180 rtl:rotate-0" />
      </button>
      {pages.map((n, index) => (
        <span key={n} className="flex items-center gap-1">
          {index > 0 && n - pages[index - 1] > 1 ? (
            <span className="px-1 text-sm text-text-quaternary">…</span>
          ) : null}
          <button
            type="button"
            onClick={() => onChange(n)}
            aria-current={n === page ? 'page' : undefined}
            className={[
              'inline-flex size-9 items-center justify-center rounded-sm text-sm font-semibold transition-colors',
              n === page
                ? 'bg-primary-700 text-white'
                : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
            ].join(' ')}
          >
            {n}
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={() => onChange(Math.min(pageCount, page + 1))}
        disabled={page === pageCount}
        aria-label="Next"
        className="inline-flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white transition-colors hover:bg-primary-25 disabled:opacity-40"
      >
        <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
      </button>
    </nav>
  )
}
