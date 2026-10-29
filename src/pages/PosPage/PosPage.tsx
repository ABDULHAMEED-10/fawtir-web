import { useMemo, useState, type ReactNode } from 'react'
import { setSaleLines, useOpenSale } from '../../lib/posSale'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { PosArt } from './PosArt'
import { PosSalePanel } from './PosSalePanel'
import { CashierPicker } from './CashierPicker'
import { PosTillGate } from './PosTillGate'
import { PosChooser } from './PosChooser'
import { Rial } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { useReferenceData } from '../../lib/reference/referenceData'
import { DESIGN_REFERENCE } from '../../lib/invoiceDraft'
import { omr } from '../../lib/pos'
import {
  ACTIVE_FILTERS,
  activeCounts,
  addToSale,
  choicesOf,
  hasChoices,
  itemByBarcode,
  itemsFor,
  saleLineFor,
  shelfItem,
  shelfTabs,
  type ActiveFilter,
  type ItemChoices,
  type PosItem,
} from '../../lib/posShelf'
import {
  getProduct,
  productListPath,
  searchProducts,
  type ProductDto,
} from '../../api/catalog/products'
import { getCatalogGroups, type CatalogGroupsDto } from '../../api/catalog/groups'
import type { Page } from '../../api'
import { posRefusalKey } from '../../lib/posRefusals'
import { loadOrRecall } from '../../lib/posOffline'

/** The whole branch shelf in one read; search and the tabs work on it. */
const SHELF_SIZE = 200

/** A barcode is the fastest way in; typing is the fallback. */
function ScanField({
  value,
  onChange,
  onScan,
}: {
  value: string
  onChange: (v: string) => void
  /** Enter: a scanner ends its code with it. */
  onScan: (code: string) => void
}) {
  const { t } = useTranslation()
  return (
    <label className="flex h-[58px] w-full items-center gap-3 rounded-md border-2 border-primary-700 bg-surface-card px-4">
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        className="shrink-0 text-primary-700"
      >
        <path
          d="M4 7V5a1 1 0 0 1 1-1h2M20 7V5a1 1 0 0 0-1-1h-2M4 17v2a1 1 0 0 0 1 1h2M20 17v2a1 1 0 0 1-1 1h-2"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M7 8v8M10 8v8M13 8v8M17 8v8"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            onScan(value)
          }
        }}
        placeholder={t('pos.scanPlaceholder')}
        className="h-full w-full border-0 bg-transparent text-base font-medium text-text-primary outline-none placeholder:text-text-placeholder"
      />
    </label>
  )
}

function Tile({
  item,
  inSale,
  choices,
  onAdd,
}: {
  item: PosItem
  /** Already on the open sale: the frame rings these tiles in blue. */
  inSale: boolean
  /** Known once the item has been read in full. */
  choices: ItemChoices | undefined
  onAdd: (item: PosItem) => void
}) {
  const { t } = useTranslation()
  const available = item.available
  const sizes = choices?.sizes.length ?? 0
  const addOns = choices?.addOns.length ?? 0

  return (
    <button
      type="button"
      disabled={!available}
      onClick={() => onAdd(item)}
      className={[
        'flex flex-col overflow-hidden rounded-md border bg-surface-card text-start transition-colors',
        !available
          ? 'cursor-not-allowed border-border-subtle opacity-55'
          : inSale
            ? 'border-primary-700 hover:bg-primary-25'
            : 'border-border-subtle hover:border-primary-300 hover:bg-primary-25',
      ].join(' ')}
    >
      {/* The photo sits inset in the tile with its own rounded corners, as the frame draws it. */}
      <span className="relative mx-1.5 mt-1.5 block overflow-hidden rounded-sm">
        <PosArt itemId={item.id} art={item.art} className="block h-[104px] w-full object-cover" />
        {sizes > 0 && available ? (
          <span className="absolute end-2 top-2 rounded-sm bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            {t('pos.badge.sizes')}
          </span>
        ) : null}
        {!available ? (
          <span className="absolute end-2 top-2 rounded-sm bg-neutral-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            {t('pos.badge.offSale')}
          </span>
        ) : null}
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-base font-medium leading-[1.2] text-text-primary">{item.name}</span>
        <span className="text-xs font-medium leading-[1.4] text-text-quaternary">
          {sizes || addOns ? (
            t('pos.note.sizesAddOns', { sizes, addOns })
          ) : (
            <span dir="ltr">{item.code}</span>
          )}
        </span>
        {/* Pinned to the foot, so the prices line up across a row when a name wraps. */}
        <span className="mt-auto inline-flex items-center gap-1 pt-1.5 text-base font-semibold text-text-primary">
          <Rial />
          {omr(item.price)}
        </span>
      </span>
    </button>
  )
}

export function PosPage() {
  return (
    <AppShell>
      <PosTillGate>
        {(till) => (
          <Shelf
            branchId={till.branchId}
            tillCtl={<CashierPicker till={till.till} mine={till.mine} />}
          />
        )}
      </PosTillGate>
    </AppShell>
  )
}

function Shelf({ branchId, tillCtl }: { branchId: string; tillCtl: ReactNode }) {
  const { t, i18n } = useTranslation()
  const ar = i18n.language.startsWith('ar')
  const navigate = useNavigate()
  const categories = (useReferenceData() ?? DESIGN_REFERENCE).taxCategories
  const [group, setGroup] = useState('all')
  const [filter, setFilter] = useState<ActiveFilter>('active')
  const [query, setQuery] = useState('')
  const [details, setDetails] = useState<Record<string, ItemChoices>>({})
  const [choosing, setChoosing] = useState<PosItem | null>(null)
  const [error, setError] = useState<unknown>(null)
  // The open sale is shared with the payment and receipt screens (src/lib/posSale.ts).
  const { lines, company } = useOpenSale()

  const path = productListPath({
    branchId,
    includeUnavailable: true,
    sort: 'NAME',
    size: SHELF_SIZE,
  })
  // Kept on the device, with each item read in full, so the till sells offline (lib/posOffline).
  const shelf = useApiRead<Page<ProductDto>>(path, () =>
    loadOrRecall(`shelf.${branchId}`, () => searchProducts(path)),
  )
  const groups = useApiRead<CatalogGroupsDto>('/v1/catalog/groups', getCatalogGroups)

  const items = useMemo(
    () => (shelf.read.status === 'ready' ? shelf.read.data.items.map((p) => shelfItem(p, ar)) : []),
    [shelf.read, ar],
  )
  const tabs = shelfTabs(
    items,
    groups.read.status === 'ready' ? groups.read.data.groups : [],
    ar,
    t('pos.group.all'),
  )
  const counts = activeCounts(items)
  const inSale = new Set(lines.map((line) => line.productId))
  const shown = itemsFor(items, group, filter, query)

  /** A tap reads the item in full: one with sizes or add-ons asks which. */
  const add = async (item: PosItem) => {
    setError(null)
    let choices = details[item.id]
    if (!choices) {
      try {
        const detail = await loadOrRecall(`product.${item.id}`, () => getProduct(item.id))
        choices = choicesOf(detail, item.price, ar)
        setDetails((current) => ({ ...current, [item.id]: choices as ItemChoices }))
      } catch (cause) {
        setError(cause)
        return
      }
    }
    if (hasChoices(choices)) {
      setChoosing(item)
      return
    }
    setSaleLines((current) => addToSale(current, saleLineFor(categories, item, null, [])))
  }

  const scan = (code: string) => {
    const found = itemByBarcode(items, code)
    if (found) {
      setQuery('')
      void add(found)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-[320px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('pos.title')}
          </h1>
          <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-quaternary">
            {t('pos.subtitle')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
          <div
            role="group"
            aria-label={t('pos.showing')}
            className="inline-flex items-center rounded-sm bg-surface-background p-1 max-md:basis-full max-md:overflow-x-auto"
          >
            {ACTIVE_FILTERS.map((option) => {
              const active = option === filter
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setFilter(option)}
                  aria-pressed={active}
                  className={[
                    'inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-sm px-3 text-sm transition-colors',
                    active
                      ? 'bg-surface-card font-semibold text-text-primary shadow-sm'
                      : 'font-medium text-text-quaternary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {option !== 'both' ? (
                    <span
                      aria-hidden="true"
                      className={[
                        'size-1.5 shrink-0 rounded-full',
                        option === 'active' ? 'bg-success-700' : 'bg-neutral-300',
                      ].join(' ')}
                    />
                  ) : null}
                  {t(`pos.filter.${option}`)}
                  <span className="text-xs font-semibold text-text-quaternary">
                    {counts[option]}
                  </span>
                </button>
              )
            })}
          </div>

          {/* The till belongs to the branch chosen in the sidebar's company card, the
              platform's one branch toggle (owner, 21 Oct 2026; P.11). */}
          {tillCtl}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <section className="flex min-w-[320px] flex-1 flex-col gap-4">
          <ScanField value={query} onChange={setQuery} onScan={scan} />

          <div className="flex flex-wrap items-center gap-2">
            {tabs.map((tab) => {
              const active = tab.id === group
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setGroup(tab.id)}
                  aria-pressed={active}
                  className={[
                    'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border px-3.5 text-sm transition-colors',
                    active
                      ? 'border-primary-700 bg-primary-700 font-semibold text-white'
                      : 'border-border-subtle bg-surface-card font-medium text-text-tertiary hover:border-primary-300',
                  ].join(' ')}
                >
                  {tab.label}
                  <span
                    className={[
                      'text-xs font-semibold',
                      active ? 'text-white/75' : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {tab.count}
                  </span>
                </button>
              )
            })}
          </div>

          {error ? (
            <p
              role="alert"
              className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
            >
              {t(posRefusalKey(error))}
            </p>
          ) : null}

          {shelf.read.status === 'loading' ? (
            <LoadingNotice />
          ) : shelf.read.status === 'failed' ? (
            <ApiReadFailure error={shelf.read.error} retry={shelf.retry} />
          ) : shown.length === 0 ? (
            <p className="rounded-md bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
              {t('pos.nothingMatches')}
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-3 max-md:grid-cols-2">
              {shown.map((item) => (
                <Tile
                  key={item.id}
                  item={item}
                  inSale={inSale.has(item.id)}
                  choices={details[item.id]}
                  onAdd={add}
                />
              ))}
            </div>
          )}
          {shelf.read.status === 'ready' ? (
            <p className="text-xs font-medium text-text-quaternary">
              {t('pos.shelfNote', {
                shown: shown.length,
                total: shelf.read.data.total ?? items.length,
              })}
            </p>
          ) : null}
        </section>

        <PosSalePanel
          lines={lines}
          onLines={setSaleLines}
          onTakePayment={() => navigate('/pos/payment')}
          onCompany={() => navigate('/pos/company')}
          company={company ?? undefined}
        />
      </div>

      {choosing && details[choosing.id] ? (
        <PosChooser
          item={choosing}
          choices={details[choosing.id]}
          onClose={() => setChoosing(null)}
          onAdd={(size, addOns) => {
            setSaleLines((current) =>
              addToSale(current, saleLineFor(categories, choosing, size, addOns)),
            )
            setChoosing(null)
          }}
        />
      ) : null}
    </div>
  )
}
