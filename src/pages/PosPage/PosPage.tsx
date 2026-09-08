import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../../layouts/AppShell'
import { PosArt } from './PosArt'
import { PosSalePanel } from './PosSalePanel'
import {
  ACTIVE_FILTERS,
  GROUP_TABS,
  OPEN_SALE,
  POS_ITEMS,
  SHELF_COUNTS,
  activeCounts,
  itemsFor,
  omr,
  onSale,
  type ActiveFilter,
  type GroupTabId,
  type PosItem,
  type SaleLine,
} from '../../lib/pos'
import { CASHIERS } from '../../lib/pos'
import chevron from '../../assets/dashboard/chevron.svg'

/** A barcode is the fastest way in; typing is the fallback. */
function ScanField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
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
        placeholder={t('pos.scanPlaceholder')}
        className="h-full w-full border-0 bg-transparent text-base font-medium text-text-primary outline-none placeholder:text-text-placeholder"
      />
    </label>
  )
}

function Tile({ item, onAdd }: { item: PosItem; onAdd: (item: PosItem) => void }) {
  const { t } = useTranslation()
  const available = onSale(item)

  return (
    <button
      type="button"
      disabled={!available}
      onClick={() => onAdd(item)}
      className={[
        'flex flex-col overflow-hidden rounded-md border bg-surface-card text-start transition-colors',
        available
          ? 'border-border-subtle hover:border-primary-300 hover:bg-primary-25'
          : 'cursor-not-allowed border-border-subtle opacity-55',
      ].join(' ')}
    >
      <span className="relative block">
        <PosArt art={item.art} className="block h-[104px] w-full object-cover" />
        {item.sizes ? (
          <span className="absolute end-2 top-2 rounded-sm bg-white/85 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
            {t('pos.badge.sizes')}
          </span>
        ) : null}
        {item.servingsLeft != null ? (
          <span className="absolute end-2 top-2 rounded-sm bg-pending-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-pending-700">
            {t('pos.badge.low')}
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
          {t(item.noteKey, item.noteValues)}
        </span>
        <span className="mt-1.5 inline-flex items-center gap-1 text-base font-semibold text-text-primary">
          <span className="text-[11px] font-semibold uppercase text-text-quaternary">OMR</span>
          {omr(item.price)}
        </span>
      </span>
    </button>
  )
}

export function PosPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [group, setGroup] = useState<GroupTabId>('all')
  const [filter, setFilter] = useState<ActiveFilter>('active')
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState<SaleLine[]>(OPEN_SALE)
  const [cashier, setCashier] = useState(CASHIERS[0].id)

  const counts = useMemo(() => activeCounts(), [])
  const shown = itemsFor(group, filter, query)

  /** Adding from the shelf takes the default size and no add-ons. */
  const add = (item: PosItem) => {
    setLines((current) => {
      const plain = current.find(
        (line) => line.itemId === item.id && !line.sizeId && line.addOnIds.length === 0,
      )
      if (plain) {
        return current.map((line) => (line.id === plain.id ? { ...line, qty: line.qty + 1 } : line))
      }
      return [
        ...current,
        { id: `l${Date.now()}`, itemId: item.id, qty: 1, addOnIds: [] as string[] },
      ]
    })
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
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
                    {t(`pos.filter.${option}`)}
                    <span className="text-xs font-semibold text-text-quaternary">
                      {option === 'active'
                        ? counts.active
                        : option === 'inactive'
                          ? counts.inactive
                          : counts.both}
                    </span>
                  </button>
                )
              })}
            </div>

            <label className="inline-flex h-11 shrink-0 items-center gap-2 rounded-sm border border-border-subtle bg-surface-card ps-2 pe-3">
              <span className="flex size-7 items-center justify-center rounded-full bg-primary-50 text-[11px] font-semibold text-primary-800">
                {CASHIERS.find((c) => c.id === cashier)?.initials}
              </span>
              <select
                value={cashier}
                onChange={(event) => setCashier(event.target.value as typeof cashier)}
                aria-label={t('pos.whoIsOnTill')}
                className="appearance-none border-0 bg-transparent pe-4 text-sm font-semibold text-text-primary outline-none"
              >
                {CASHIERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <img src={chevron} alt="" className="-ms-4 size-4 rotate-90 opacity-60" />
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-start gap-4">
          <section className="flex min-w-[320px] flex-1 flex-col gap-4">
            <ScanField value={query} onChange={setQuery} />

            <div className="flex flex-wrap items-center gap-2">
              {GROUP_TABS.map((tab) => {
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
                    {t(tab.labelKey)}
                    <span
                      className={[
                        'text-xs font-semibold',
                        active ? 'text-white/75' : 'text-text-quaternary',
                      ].join(' ')}
                    >
                      {SHELF_COUNTS[tab.id]}
                    </span>
                  </button>
                )
              })}
            </div>

            {shown.length === 0 ? (
              <p className="rounded-md bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
                {t('pos.nothingMatches')}
              </p>
            ) : (
              <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-3 max-md:grid-cols-2">
                {shown.map((item) => (
                  <Tile key={item.id} item={item} onAdd={add} />
                ))}
              </div>
            )}
            <p className="text-xs font-medium text-text-quaternary">
              {t('pos.shelfNote', { shown: shown.length, total: POS_ITEMS.length })}
            </p>
          </section>

          <PosSalePanel
            lines={lines}
            onLines={setLines}
            onTakePayment={() => navigate('/pos/payment')}
            onCompany={() => navigate('/pos/company')}
          />
        </div>
      </div>
    </AppShell>
  )
}
