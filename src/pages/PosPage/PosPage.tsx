import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { setSaleLines, useOpenSale, useUncertainSale } from '../../lib/posSale'
import { useTillPriceRules } from '../../lib/posPriceRules'
import { Trans, useTranslation } from 'react-i18next'
import { Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { PosArt } from './PosArt'
import { PosSalePanel } from './PosSalePanel'
import { PosPhoneSaleBar } from './PosPhoneSaleBar'
import { CashierPicker } from './CashierPicker'
import { PosTillGate } from './PosTillGate'
import { PosChooser } from './PosChooser'
import { StockBadge } from './PosStockBadge'
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
  itemsFor,
  listedChoices,
  mayTypePrice,
  saleLineFor,
  shelfItem,
  shelfTabs,
  tilePrice,
  whenPicked,
  type ActiveFilter,
  type ItemChoices,
  type PosItem,
  type SizeChoice,
} from '../../lib/posShelf'
import {
  getProduct,
  productListPath,
  searchProducts,
  type ProductDto,
} from '../../api/catalog/products'
import { getCatalogGroups, type CatalogGroupsDto } from '../../api/catalog/groups'
import type { Page } from '../../api'
import { refusalSentence } from '../../lib/posRefusals'
import { loadOrRecall } from '../../lib/posOffline'
import { captureScans, findOnShelf, lookupBarcode, type ScanHit } from '../../lib/posScan'
import { playErrorBeep } from '../../lib/posBeep'

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
  const price = tilePrice(item, choices)

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
        {/* The branch's stock (backend #815): a flag only, the tile stays sellable. */}
        {item.stock && available ? (
          <StockBadge flag={item.stock} className="absolute start-2 top-2" />
        ) : null}
      </span>
      <span className="flex flex-1 flex-col gap-1 p-3">
        <span className="text-base font-medium leading-[1.2] text-text-primary">{item.name}</span>
        <span className="text-xs font-medium leading-[1.4] text-text-quaternary">
          {sizes || addOns ? (
            [
              sizes ? t('pos.note.sizes', { count: sizes }) : '',
              addOns ? t('pos.note.addOns', { count: addOns }) : '',
            ]
              .filter(Boolean)
              .join(' · ')
          ) : (
            <span dir="ltr">{item.code}</span>
          )}
        </span>
        {/* Pinned to the foot, so the prices line up across a row when a name wraps. */}
        {price > 0 ? (
          <span className="mt-auto inline-flex items-center gap-1 pt-1.5 text-base font-semibold text-text-primary">
            <Rial />
            {omr(price)}
          </span>
        ) : (
          <span className="mt-auto pt-1.5 text-sm font-semibold text-danger-700">
            {t('pos.noPrice.label')}
          </span>
        )}
      </span>
    </button>
  )
}

export function PosPage() {
  return (
    <AppShell>
      <PosTillGate showQueue>
        {(till) => (
          <Shelf
            tillId={till.till.id}
            branchId={till.branchId}
            canSell={till.can.sell}
            tillCtl={<CashierPicker till={till.till} mine={till.mine} />}
          />
        )}
      </PosTillGate>
    </AppShell>
  )
}

function Shelf({
  tillId,
  branchId,
  canSell,
  tillCtl,
}: {
  tillId: string
  branchId: string
  canSell: boolean
  tillCtl: ReactNode
}) {
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
  // A scanned code that matched nothing, shown under the scan box until the next scan or typing.
  const [unknownCode, setUnknownCode] = useState<string | null>(null)
  // The item just picked that has no price and cannot be given one here.
  const [noPrice, setNoPrice] = useState<string | null>(null)
  // The size the chooser opens on, when a size's own barcode asked for it.
  const [startSize, setStartSize] = useState<SizeChoice | null>(null)
  // The open sale is shared with the payment and receipt screens (src/lib/posSale.ts).
  const { lines, company } = useOpenSale()
  // The branch's price rules, applied to the lines as they go on (row P.26).
  useTillPriceRules(branchId, company?.id ?? null)

  const path = productListPath({
    branchId,
    includeUnavailable: true,
    sort: 'NAME',
    size: SHELF_SIZE,
    // Sizes, add-ons and stock on every row (backend #808, #815); an older server leaves them null.
    include: ['variants', 'addOns', 'stock'],
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
    filter,
  )
  // What the rows already carry; a row without it is read when tapped.
  const listed = useMemo(
    () =>
      Object.fromEntries(
        items.flatMap((item) => {
          const choices = listedChoices(item, ar)
          return choices ? [[item.id, choices] as const] : []
        }),
      ) as Record<string, ItemChoices>,
    [items, ar],
  )
  const choicesFor = (id: string): ItemChoices | undefined => details[id] ?? listed[id]
  const counts = activeCounts(items)
  const inSale = new Set(lines.map((line) => line.productId))
  const shown = itemsFor(items, group, filter, query)

  /** Opens the chooser. Its choices are kept: an item the server's lookup found is not on the shelf. */
  const choose = (item: PosItem, choices: ItemChoices, size: SizeChoice | null) => {
    setDetails((current) => ({ ...current, [item.id]: choices }))
    setStartSize(size)
    setChoosing(item)
  }

  /** A tap reads the item in full: one with sizes or add-ons asks which. */
  const add = async (item: PosItem) => {
    setError(null)
    setNoPrice(null)
    let choices = choicesFor(item.id) ?? listedChoices(item, ar)
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
    const next = whenPicked(item, choices, canSell)
    if (next === 'refuse') {
      setNoPrice(item.name)
      return
    }
    if (next === 'choose') {
      choose(item, choices, null)
      return
    }
    setSaleLines((current) => addToSale(current, saleLineFor(categories, item, null, [])))
  }

  /**
   * A size's own barcode: that size goes on the sale directly, without the chooser. False when the
   * item no longer sells that size; a failed read shows its error and counts as handled.
   */
  const addSize = async (item: PosItem, variantId: string): Promise<boolean> => {
    setError(null)
    setNoPrice(null)
    let choices = choicesFor(item.id) ?? listedChoices(item, ar)
    if (!choices?.sizes.some((size) => size.id === variantId)) {
      try {
        const detail = await loadOrRecall(`product.${item.id}`, () => getProduct(item.id))
        choices = choicesOf(detail, item.price, ar)
        setDetails((current) => ({ ...current, [item.id]: choices as ItemChoices }))
      } catch (cause) {
        setError(cause)
        return true
      }
    }
    const size = choices.sizes.find((entry) => entry.id === variantId)
    if (!size) return false
    if (!(size.price > 0)) {
      // The size's own barcode at 0.000: ask its price, or say there is none.
      if (mayTypePrice(item, canSell)) choose(item, choices, size)
      else setNoPrice(item.name)
      return true
    }
    setSaleLines((current) => addToSale(current, saleLineFor(categories, item, size, [])))
    return true
  }

  const sell = async (hit: ScanHit): Promise<boolean> => {
    if (hit.variantId) return addSize(hit.item, hit.variantId)
    await add(hit.item)
    return true
  }

  /**
   * A scan, from the scan box or from anywhere on the page: the shelf first, then the server for a
   * code the shelf does not hold (offline: the shelf alone). Nothing found: say so and beep, except
   * for words typed in the scan box that the search already matches (a person searching).
   */
  const scan = async (raw: string, fromBox = false) => {
    const code = raw.trim()
    if (!code) return
    setUnknownCode(null)
    setNoPrice(null)
    const local = findOnShelf(items, code)
    if (local) {
      setQuery('')
      if (await sell(local)) return
    } else {
      const remote = await lookupBarcode(branchId, code)
      if (remote) {
        setQuery('')
        if (await sell({ item: shelfItem(remote.product, ar), variantId: remote.variantId })) return
      }
    }
    if (fromBox && itemsFor(items, group, filter, code).length > 0) return
    setQuery('')
    setUnknownCode(code)
    playErrorBeep()
  }

  // Scans are caught wherever the cursor is (a tile, a button, nowhere), not only in the scan box;
  // a field a person types in keeps its keys. The latest `scan` is read through a ref.
  const scanRef = useRef(scan)
  scanRef.current = scan
  useEffect(() => captureScans((code) => void scanRef.current(code)), [])
  // A sale whose outcome is unknown cannot be changed (E-01): its screen offers only the same sale
  // again or today's sales.
  const uncertain = useUncertainSale(tillId)
  if (uncertain) return <Navigate to="/pos/payment" replace />

  return (
    <div
      className={[
        'mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10',
        // Room under the sale panel for the phone's bar, so it covers nothing.
        lines.length > 0 ? 'max-md:pb-24' : '',
      ].join(' ')}
    >
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
          <ScanField
            value={query}
            onChange={(value) => {
              setQuery(value)
              setUnknownCode(null)
            }}
            onScan={(code) => void scan(code, true)}
          />

          {unknownCode ? (
            <p
              role="alert"
              className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
            >
              <Trans
                i18nKey="pos.scan.unknown"
                values={{ code: unknownCode }}
                components={{ code: <span dir="ltr" /> }}
              />
            </p>
          ) : null}

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
              {refusalSentence(t, error)}
            </p>
          ) : null}

          {noPrice ? (
            <p
              role="alert"
              className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
            >
              {t('pos.noPrice.refused', { name: `\u2068${noPrice}\u2069` })}
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
                  choices={choicesFor(item.id)}
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

      <PosPhoneSaleBar lines={lines} onTakePayment={() => navigate('/pos/payment')} />

      {choosing && choicesFor(choosing.id) ? (
        <PosChooser
          item={choosing}
          choices={choicesFor(choosing.id) as ItemChoices}
          canTypePrice={mayTypePrice(choosing, canSell)}
          startSize={startSize}
          onClose={() => setChoosing(null)}
          onAdd={(size, addOns, typedPrice) => {
            setSaleLines((current) =>
              addToSale(current, saleLineFor(categories, choosing, size, addOns, typedPrice)),
            )
            setChoosing(null)
          }}
        />
      ) : null}
    </div>
  )
}
