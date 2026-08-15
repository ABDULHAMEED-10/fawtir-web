import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { OmAmount } from '../../components/ui'
import {
  cartTotals,
  formatOmr,
  itemInitials,
  POS_ITEMS,
  POS_PROFILE,
  POS_SORTS,
  type CartLine,
  type PosItem,
  type PosSort,
} from '../../lib/pos'
import { CartIcon, InvoiceIcon, MinusIcon, PlusIcon, TrashIcon } from './posIcons'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/invoices/sort.svg'

/** "All" plus every pre-built group of the tenant's sub business type. -1 means "no filter". */
const ALL = -1

function PosHeader({ subType }: { subType: string }) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('pos.title')}
        </h1>
        <p className="mt-1 text-sm font-medium leading-[1.2] text-[#8f8f8f]">{t('pos.subtitle')}</p>
      </div>
      <span className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-card px-4">
        <span className="text-xs font-medium leading-[1.2] text-text-tertiary">
          {t('pos.sellingAs')}
        </span>
        <span className="text-sm font-semibold leading-[1.2] text-primary-800">{subType}</span>
      </span>
    </div>
  )
}

function ItemTile({ item, onAdd }: { item: PosItem; onAdd: () => void }) {
  const { t } = useTranslation()
  /** Remote photos can fail; drop back to initials rather than leave an empty tile. */
  const [imageFailed, setImageFailed] = useState(false)

  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex flex-col gap-2 rounded-md bg-surface-card p-3 text-start transition-colors hover:bg-primary-25 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-700"
    >
      <span className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm bg-primary-25">
        {item.image && !imageFailed ? (
          <img
            src={item.image}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="size-full object-cover"
          />
        ) : (
          <span className="text-2xl font-semibold leading-none text-primary-800">
            {itemInitials(item.name)}
          </span>
        )}
        {/* Oman zero-rates basic foodstuffs — worth seeing before the line is rung up. */}
        {item.vatRate === 0 ? (
          <span className="absolute end-1.5 top-1.5 rounded-full bg-success-100 px-1.5 py-0.5 text-[10px] font-semibold leading-[1.2] text-[#3d5648]">
            {t('pos.zeroRated')}
          </span>
        ) : null}
      </span>
      <span className="line-clamp-2 min-h-[34px] text-sm font-semibold leading-[1.2] text-text-primary">
        {item.name}
      </span>
      <OmAmount
        size="xs"
        amount={formatOmr(item.price)}
        amountClassName="text-base font-bold leading-[1.2] text-primary-800"
      />
    </button>
  )
}

function CartRow({
  line,
  onDec,
  onInc,
  onRemove,
}: {
  line: CartLine
  onDec: () => void
  onInc: () => void
  onRemove: () => void
}) {
  const { t } = useTranslation()
  const lineTotal = line.item.price * line.qty

  return (
    <li className="flex flex-col gap-2 border-b border-border-subtle py-3 last:border-b-0">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold leading-[1.2] text-text-primary">
          {line.item.name}
        </p>
        <OmAmount
          size="xs"
          amount={formatOmr(lineTotal)}
          amountClassName="text-sm font-bold leading-[1.2] text-text-primary"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label={t('pos.removeItem', { name: line.item.name })}
          className="shrink-0 text-text-quaternary transition-colors hover:text-danger-700"
        >
          <TrashIcon className="size-4" />
        </button>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded-sm border border-border-subtle bg-surface-tab-bar">
          <button
            type="button"
            onClick={onDec}
            aria-label={t('pos.decrease', { name: line.item.name })}
            className="flex size-7 items-center justify-center text-text-secondary transition-colors hover:text-primary-800"
          >
            <MinusIcon className="size-3.5" />
          </button>
          <span className="min-w-[20px] text-center text-sm font-semibold text-text-primary">
            {line.qty}
          </span>
          <button
            type="button"
            onClick={onInc}
            aria-label={t('pos.increase', { name: line.item.name })}
            className="flex size-7 items-center justify-center text-text-secondary transition-colors hover:text-primary-800"
          >
            <PlusIcon className="size-3.5" />
          </button>
        </span>
        <span className="text-xs font-medium leading-[1.2] text-text-tertiary">
          {t('pos.each', { price: formatOmr(line.item.price) })}
        </span>
      </div>
    </li>
  )
}

export function PosPage() {
  const { t } = useTranslation()
  const [activeGroup, setActiveGroup] = useState<number>(ALL)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<PosSort>('name')
  const [lines, setLines] = useState<CartLine[]>([])

  /** The sub business type's pre-built item groups, in the current language. */
  const groups = useMemo(() => {
    const translated = t(`subBusinessType.groups.${POS_PROFILE.groupsKey}`, {
      returnObjects: true,
    })
    return Array.isArray(translated) ? (translated as string[]) : []
  }, [t])

  /** Category chip, then the free-text search, then the chosen order. */
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = POS_ITEMS.filter(
      (item) =>
        (activeGroup === ALL || item.groupIndex === activeGroup) &&
        (needle === '' || item.name.toLowerCase().includes(needle)),
    )
    const sorted = [...filtered]
    if (sort === 'priceAsc') sorted.sort((a, b) => a.price - b.price)
    else if (sort === 'priceDesc') sorted.sort((a, b) => b.price - a.price)
    else sorted.sort((a, b) => a.name.localeCompare(b.name))
    return sorted
  }, [activeGroup, query, sort])

  const totals = useMemo(() => cartTotals(lines), [lines])

  const addItem = (item: PosItem) =>
    setLines((current) => {
      const existing = current.find((line) => line.item.id === item.id)
      if (existing) {
        return current.map((line) =>
          line.item.id === item.id ? { ...line, qty: line.qty + 1 } : line,
        )
      }
      return [...current, { item, qty: 1 }]
    })

  /** Stepping the last unit down removes the line, which is what a till does. */
  const changeQty = (id: string, delta: number) =>
    setLines((current) =>
      current.flatMap((line) => {
        if (line.item.id !== id) return [line]
        const qty = line.qty + delta
        return qty <= 0 ? [] : [{ ...line, qty }]
      }),
    )

  const removeItem = (id: string) =>
    setLines((current) => current.filter((line) => line.item.id !== id))

  const itemCount = lines.reduce((sum, line) => sum + line.qty, 0)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <PosHeader subType={t(POS_PROFILE.subTypeLabelKey)} />

        {/* Catalog (796) | Current sale (332) — the standard two-column band. */}
        <div className="grid items-start gap-4 xl:grid-cols-[796fr_332px]">
          <div className="flex flex-col gap-4">
            <section className="rounded-md bg-surface-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveGroup(ALL)}
                  aria-pressed={activeGroup === ALL}
                  className={[
                    'inline-flex h-[38px] items-center rounded-full px-4 text-sm font-semibold leading-[1.2] transition-colors',
                    activeGroup === ALL
                      ? 'bg-primary-700 text-white'
                      : 'border border-border-default bg-surface-card text-text-secondary hover:border-border-brand-subtle',
                  ].join(' ')}
                >
                  {t('pos.allItems')}
                </button>
                {groups.map((group, index) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setActiveGroup(index)}
                    aria-pressed={activeGroup === index}
                    className={[
                      'inline-flex h-[38px] items-center rounded-full px-4 text-sm font-semibold leading-[1.2] transition-colors',
                      activeGroup === index
                        ? 'bg-primary-700 text-white'
                        : 'border border-border-default bg-surface-card text-text-secondary hover:border-border-brand-subtle',
                    ].join(' ')}
                  >
                    {group}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs font-medium leading-[1.2] text-text-tertiary">
                {t('pos.groupsHint')}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border-subtle pt-4">
                <label className="flex h-11 min-w-[240px] flex-1 items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4">
                  <img src={searchIcon} alt="" className="size-5 shrink-0" />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder={t('pos.searchPlaceholder')}
                    className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
                  />
                </label>
                <label className="flex h-11 items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-3">
                  <img src={sortIcon} alt="" className="size-5 shrink-0" />
                  <span className="text-xs font-medium text-text-tertiary">{t('pos.sortBy')}</span>
                  <select
                    value={sort}
                    onChange={(event) => setSort(event.target.value as PosSort)}
                    aria-label={t('pos.sortBy')}
                    className="border-0 bg-transparent text-sm font-semibold text-text-secondary outline-none"
                  >
                    {POS_SORTS.map((option) => (
                      <option key={option} value={option}>
                        {t(`pos.sort.${option}`)}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-xs font-medium leading-[1.2] text-text-tertiary">
                  {t('pos.itemCount', { count: visibleItems.length })}
                </span>
              </div>
            </section>

            {visibleItems.length === 0 ? (
              <section className="rounded-md bg-surface-card p-10 text-center">
                <p className="text-sm font-medium text-text-tertiary">{t('pos.noMatches')}</p>
              </section>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {visibleItems.map((item) => (
                  <ItemTile key={item.id} item={item} onAdd={() => addItem(item)} />
                ))}
              </div>
            )}

            <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
              {t('pos.tapHint')}
            </p>
          </div>

          <aside className="flex flex-col overflow-hidden rounded-md bg-surface-card xl:sticky xl:top-0">
            <div className="flex items-center justify-between gap-2 bg-primary-700 px-4 py-3.5 text-white">
              <span className="inline-flex items-center gap-2">
                <CartIcon className="size-5" />
                <span className="text-base font-semibold leading-[1.2]">
                  {t('pos.currentSale')}
                </span>
              </span>
              {itemCount > 0 ? (
                <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-white/20 px-1.5 text-xs font-semibold">
                  {itemCount}
                </span>
              ) : null}
            </div>

            <div className="flex flex-col gap-4 p-4">
              {lines.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <span className="text-text-quaternary">
                    <CartIcon className="size-8" />
                  </span>
                  <p className="text-sm font-semibold leading-[1.2] text-text-secondary">
                    {t('pos.emptyTitle')}
                  </p>
                  <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
                    {t('pos.emptyHint')}
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col">
                  {lines.map((line) => (
                    <CartRow
                      key={line.item.id}
                      line={line}
                      onDec={() => changeQty(line.item.id, -1)}
                      onInc={() => changeQty(line.item.id, 1)}
                      onRemove={() => removeItem(line.item.id)}
                    />
                  ))}
                </ul>
              )}

              <dl className="flex flex-col gap-2 border-t border-border-subtle pt-4">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-sm font-medium leading-[1.2] text-text-tertiary">
                    {t('pos.subtotal')}
                  </dt>
                  <dd>
                    <OmAmount
                      size="xs"
                      amount={formatOmr(totals.net)}
                      amountClassName="text-sm font-semibold leading-[1.2] text-text-secondary"
                    />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-sm font-medium leading-[1.2] text-text-tertiary">
                    {t('pos.vat')}
                  </dt>
                  <dd>
                    <OmAmount
                      size="xs"
                      amount={formatOmr(totals.vat)}
                      amountClassName="text-sm font-semibold leading-[1.2] text-text-secondary"
                    />
                  </dd>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 border-t border-border-subtle pt-3">
                  <dt className="text-base font-semibold leading-[1.2] text-text-primary">
                    {t('pos.total')}
                  </dt>
                  <dd>
                    <OmAmount
                      size="sm"
                      amount={formatOmr(totals.total)}
                      amountClassName="text-xl font-bold leading-[1.2] text-primary-800"
                    />
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                disabled={lines.length === 0}
                className="inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-sm bg-primary-700 text-base font-semibold text-white transition-colors hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <InvoiceIcon className="size-5" />
                {t('pos.generateInvoice')}
              </button>

              {lines.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setLines([])}
                  className="text-xs font-semibold text-text-tertiary transition-colors hover:text-danger-700"
                >
                  {t('pos.clearSale')}
                </button>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  )
}
