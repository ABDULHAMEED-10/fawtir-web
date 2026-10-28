import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CatalogShell, TabStrip } from './CatalogShell'
import { ItemTabs } from './ItemTabs'
import { ItemPills, ItemReadState, useItemRecord } from './itemRecord'
import { ChangeChips, useHistoryWords } from './itemHistory'
import { FilterMenu, SortMenu } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  getProductHistory,
  productHistoryPath,
  type HistoryCategory,
  type ProductHistoryEntry,
  type ProductHistoryPageDto,
} from '../../api/catalog/insights'
import downloadIcon from '../../assets/catalog/download-ink.svg'
import searchIcon from '../../assets/invoices/search.svg'
import upIcon from '../../assets/catalog/arrow-up.svg'
import plusIcon from '../../assets/catalog/plus-brand.svg'
import percentIcon from '../../assets/catalog/menu-percent.svg'
import tickIcon from '../../assets/catalog/check-green.svg'
import pencilIcon from '../../assets/catalog/pencil-ink.svg'

/** Entries to a page of the history; "Show more" reads the next. */
const HISTORY_PAGE_SIZE = 20

const CHANGE_TABS = [
  { id: 'all', labelKey: 'itemChanges.tab.all' },
  { id: 'price', labelKey: 'itemChanges.tab.price' },
  { id: 'sizes', labelKey: 'itemChanges.tab.sizes' },
  { id: 'tax', labelKey: 'itemChanges.tab.tax' },
] as const

type ChangeTab = (typeof CHANGE_TABS)[number]['id']

const TAB_CATEGORY: Record<Exclude<ChangeTab, 'all'>, HistoryCategory> = {
  price: 'PRICE',
  sizes: 'SIZES',
  tax: 'TAX',
}

const matchesChangeTab = (entry: ProductHistoryEntry, tab: ChangeTab) =>
  tab === 'all' || entry.categories.includes(TAB_CATEGORY[tab])

/** The icon and its tint, by what the entry touched first. */
const LOOK: Record<HistoryCategory, { icon: string; tint: string }> = {
  CREATED: { icon: tickIcon, tint: 'bg-success-100' },
  PRICE: { icon: upIcon, tint: 'bg-pending-100' },
  SIZES: { icon: plusIcon, tint: 'bg-primary-50' },
  BRANCHES: { icon: plusIcon, tint: 'bg-primary-50' },
  TAX: { icon: percentIcon, tint: 'bg-danger-100' },
  DETAILS: { icon: pencilIcon, tint: 'bg-surface-background' },
  STATUS: { icon: pencilIcon, tint: 'bg-surface-background' },
}

const SORTS = [
  { value: 'newest', labelKey: 'activityLog.sort.newest' },
  { value: 'oldest', labelKey: 'activityLog.sort.oldest' },
]

/**
 * Catalog › one item › Changes (Figma 135:47565), from `GET /v1/products/{id}/history`: each
 * entry is one audit event with who made it and the fields that moved, shown as the API gives
 * them (from and to), with money at three decimals and codes in words. The frame's sentences
 * about what happened to sales afterwards are not drawn: the API does not give them, and they are
 * not made up here. Paged by `hasMore`; the tabs, search and order work over what is loaded.
 */
export function ItemChangesPage() {
  const { id = '' } = useParams()
  const record = useItemRecord(id)
  return (
    <ItemReadState read={record.read}>
      <ItemChanges id={id} record={record} />
    </ItemReadState>
  )
}

function ItemChanges({ id, record }: { id: string; record: ReturnType<typeof useItemRecord> }) {
  const { t } = useTranslation()
  const product = record.product!
  const words = useHistoryWords()
  const [tab, setTab] = useState<ChangeTab>('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(0)

  const path = productHistoryPath(id, { page, size: HISTORY_PAGE_SIZE })
  const read = useApiRead<ProductHistoryPageDto>(path, () => getProductHistory(path))
  const current = read.read.status === 'ready' ? read.read.data : null
  // The pages read so far, oldest page first; a new page is appended once it answers.
  const [pages, setPages] = useState<Record<number, ProductHistoryEntry[]>>({})
  useEffect(() => {
    if (current) setPages((known) => ({ ...known, [current.page]: current.content }))
  }, [current])
  const loaded = useMemo(
    () =>
      Object.keys(pages)
        .map(Number)
        .sort((a, b) => a - b)
        .flatMap((key) => pages[key]),
    [pages],
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = loaded.filter(
      (entry) =>
        matchesChangeTab(entry, tab) &&
        (needle === '' ||
          words.action(entry).toLowerCase().includes(needle) ||
          (entry.actorName ?? '').toLowerCase().includes(needle) ||
          entry.changes.some((change) =>
            [words.field(change), change.from, change.to, change.branchName].some((text) =>
              (text ?? '').toLowerCase().includes(needle),
            ),
          )),
    )
    return sort === 'oldest' ? [...filtered].reverse() : filtered
  }, [loaded, tab, query, sort, words])
  const countTab = (entry: ChangeTab) => loaded.filter((row) => matchesChangeTab(row, entry)).length

  // History of creation starts at deployment; an older item names its creation from the row.
  const recordedCreation = loaded.some((entry) => entry.action === 'ProductCreated')
  const createdAt =
    current && !current.hasMore && !recordedCreation && current.productCreatedAt
      ? current.productCreatedAt
      : null

  return (
    <CatalogShell
      crumbs={[{ labelKey: 'catalog.title', to: '/catalog' }, { label: product.name }]}
      title={product.name}
      subtitle={t('itemChanges.meta', { code: product.code })}
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
      tabs={<ItemTabs id={id} active="changes" />}
    >
      <section className="overflow-hidden rounded-md bg-surface-card">
        <TabStrip tabs={CHANGE_TABS} value={tab} onChange={setTab} count={countTab} />

        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <label className="flex h-[46px] w-full items-center gap-2 rounded-sm border border-border-subtle bg-white px-3 sm:w-[345px]">
            <img src={searchIcon} alt="" className="size-[18px] opacity-60" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('itemChanges.searchChanges')}
              aria-label={t('itemChanges.searchChanges')}
              className="w-full min-w-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
            <FilterMenu
              funnel
              label={t('catalog.filters')}
              value={tab}
              defaultValue="all"
              options={CHANGE_TABS.map((entry) => ({
                value: entry.id,
                label: t(entry.labelKey),
                count: countTab(entry.id),
              }))}
              onChange={setTab}
            />
            <SortMenu value={sort} onChange={setSort} options={SORTS} />
          </div>
        </div>

        {read.read.status === 'failed' ? (
          <div className="px-5 pb-5">
            <ApiReadFailure error={read.read.error} retry={read.retry} />
          </div>
        ) : loaded.length === 0 && read.read.status === 'loading' ? (
          <div className="px-5 pb-5">
            <LoadingNotice />
          </div>
        ) : rows.length === 0 && !createdAt ? (
          <p className="px-5 py-12 text-center text-sm font-medium text-text-quaternary">
            {loaded.length > 0 ? t('itemChanges.empty') : t('itemChanges.none')}
          </p>
        ) : (
          <ul>
            {rows.map((entry) => (
              <ChangeRow key={entry.id} entry={entry} />
            ))}
            {createdAt && tab === 'all' && !query.trim() ? (
              <ChangeRow
                entry={{
                  id: 'created',
                  occurredAt: createdAt,
                  action: 'ProductCreated',
                  categories: ['CREATED'],
                  actorId: current?.productCreatedBy ?? null,
                  actorType: null,
                  actorName: current?.productCreatedByName ?? null,
                  changes: [],
                }}
                note={t('itemChanges.recordedFromNow')}
              />
            ) : null}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-subtle px-5 py-4">
          <p className="text-sm font-medium text-text-quaternary">
            {t('itemChanges.showingLoaded', { count: rows.length })}
          </p>
          {current?.hasMore ? (
            <button
              type="button"
              onClick={() => setPage((value) => value + 1)}
              className="inline-flex h-[38px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('itemChanges.showMore')}
            </button>
          ) : null}
        </div>
      </section>
    </CatalogShell>
  )
}

function ChangeRow({ entry, note }: { entry: ProductHistoryEntry; note?: string }) {
  const words = useHistoryWords()
  const when = words.when(entry.occurredAt)
  const look = LOOK[entry.categories[0] ?? 'DETAILS'] ?? LOOK.DETAILS
  const created = entry.action === 'ProductCreated'

  return (
    <li className="flex flex-wrap items-start gap-4 border-t border-surface-background px-5 py-5">
      <div className="w-[110px] shrink-0">
        <p className="text-sm font-medium text-text-primary">{when.date}</p>
        <p className="mt-0.5 text-xs font-medium text-text-quaternary tabular-nums">{when.time}</p>
      </div>

      {/* The timeline: each entry's icon, with a line running down to the next entry. */}
      <span className="flex shrink-0 flex-col items-center self-stretch">
        <span
          className={[
            'flex size-8 shrink-0 items-center justify-center rounded-full',
            look.tint,
          ].join(' ')}
        >
          <img src={look.icon} alt="" className="size-4" />
        </span>
        <span aria-hidden="true" className="-mb-5 mt-1 w-px flex-1 bg-border-subtle" />
      </span>

      <div className="min-w-0 flex-1 sm:min-w-[280px]">
        <p className="text-base font-semibold leading-[1.3] text-text-primary">
          {words.action(entry)}
        </p>
        {entry.actorName ? (
          <p className="mt-1 text-xs font-medium text-text-quaternary">
            <bdi>{entry.actorName}</bdi>
          </p>
        ) : null}

        {entry.changes.length > 0 ? (
          <span className="mt-3 flex flex-col gap-2">
            {entry.changes.map((change, index) => (
              <ChangeChips
                key={`${change.field}-${change.branchId}-${index}`}
                change={change}
                created={created}
              />
            ))}
          </span>
        ) : null}

        {note ? (
          <p className="mt-3 text-sm font-medium leading-[1.6] text-text-tertiary">{note}</p>
        ) : null}
      </div>
    </li>
  )
}
