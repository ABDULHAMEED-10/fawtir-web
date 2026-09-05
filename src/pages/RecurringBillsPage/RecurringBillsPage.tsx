import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, FilterMenu, Popover } from '../../components/ui'
import {
  RECURRING_BILLS,
  RECURRING_TABS,
  RECURRING_TAB_STATES,
  toNumber,
  type BillCategory,
  type RecurringTabId,
  type WatchAction,
  type WatchState,
} from '../../lib/recurringBills'
import catShopIcon from '../../assets/recurring/cat-shop.svg'
import catPowerIcon from '../../assets/recurring/cat-power.svg'
import catInternetIcon from '../../assets/recurring/cat-internet.svg'
import catSoftwareIcon from '../../assets/recurring/cat-software.svg'
import catDeliveryIcon from '../../assets/recurring/cat-delivery.svg'
import calBlueIcon from '../../assets/recurring/cal-blue.svg'
import calAlertIcon from '../../assets/recurring/cal-alert.svg'
import kpiClockIcon from '../../assets/recurring/kpi-clock.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/bills/sort.svg'
import filterIcon from '../../assets/bills/filter.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import viewIcon from '../../assets/actions/view.svg'
import editIcon from '../../assets/actions/edit.svg'
import pauseIcon from '../../assets/actions/pause.svg'
import deleteIcon from '../../assets/actions/delete.svg'

/** Category tiles, tinted to their glyph. */
const CATEGORY_STYLES: Record<BillCategory, { icon: string; tile: string }> = {
  premises: { icon: catShopIcon, tile: 'bg-primary-50' },
  power: { icon: catPowerIcon, tile: 'bg-[#f3f3f3]' },
  internet: { icon: catInternetIcon, tile: 'bg-[#f3f3f3]' },
  software: { icon: catSoftwareIcon, tile: 'bg-success-100' },
  delivery: { icon: catDeliveryIcon, tile: 'bg-[#f3f3f3]' },
}

const STATE_CHIP: Record<WatchState, { bg: string; fg: string; dot: string; labelKey: string }> = {
  late: {
    bg: 'bg-pending-100',
    fg: 'text-pending-700',
    dot: 'bg-pending-700',
    labelKey: 'recurringBills.state.late',
  },
  asExpected: {
    bg: 'bg-success-100',
    fg: 'text-[#3d5648]',
    dot: 'bg-[#3d5648]',
    labelKey: 'recurringBills.state.asExpected',
  },
  dueToArrive: {
    bg: 'bg-primary-50',
    fg: 'text-primary-800',
    dot: 'bg-primary-800',
    labelKey: 'recurringBills.state.dueToArrive',
  },
  paused: {
    bg: 'bg-[#e3e4ea]',
    fg: 'text-[#474a5e]',
    dot: 'bg-[#474a5e]',
    labelKey: 'recurringBills.state.paused',
  },
  stopped: {
    bg: 'bg-[#e3e4ea]',
    fg: 'text-text-muted',
    dot: 'bg-text-muted',
    labelKey: 'recurringBills.state.stopped',
  },
}

/**
 * Row action.
 *
 * `chase` is the only filled one, and it is filled in the amber of the problem it answers rather
 * than the brand blue — the row is already telling you something is wrong.
 */
const ACTION_STYLES: Record<
  WatchAction,
  { labelKey: string; filled?: boolean; chevron?: boolean }
> = {
  chase: { labelKey: 'recurringBills.actions.chase', filled: true },
  whyTheJump: { labelKey: 'recurringBills.actions.whyTheJump', chevron: true },
  resume: { labelKey: 'recurringBills.actions.resume' },
}

const TONE_TEXT = {
  warn: 'text-[#887147]',
  ok: 'text-[#3d5648]',
  muted: 'text-text-quaternary',
} as const

type SortKey = 'natural' | 'amountDesc' | 'amountAsc' | 'titleAsc'

const SORT_OPTIONS: { value: SortKey; labelKey: string }[] = [
  { value: 'natural', labelKey: 'recurringBills.sortOptions.natural' },
  { value: 'amountDesc', labelKey: 'recurringBills.sortOptions.amountDesc' },
  { value: 'amountAsc', labelKey: 'recurringBills.sortOptions.amountAsc' },
  { value: 'titleAsc', labelKey: 'recurringBills.sortOptions.titleAsc' },
]

const CATEGORY_FILTERS: { id: BillCategory | 'all'; labelKey: string }[] = [
  { id: 'all', labelKey: 'recurringBills.categoryFilter.all' },
  { id: 'premises', labelKey: 'recurringBills.categoryFilter.premises' },
  { id: 'power', labelKey: 'recurringBills.categoryFilter.power' },
  { id: 'internet', labelKey: 'recurringBills.categoryFilter.internet' },
  { id: 'software', labelKey: 'recurringBills.categoryFilter.software' },
  { id: 'delivery', labelKey: 'recurringBills.categoryFilter.delivery' },
]

function KpiCard({
  icon,
  tint,
  title,
  children,
  meta,
  link,
}: {
  icon: string
  tint: string
  title: string
  children: React.ReactNode
  meta: string
  link?: string
}) {
  return (
    <article className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
      <div className="flex items-center gap-3.5">
        <span
          className={['flex size-11 shrink-0 items-center justify-center rounded-full', tint].join(
            ' ',
          )}
        >
          <img src={icon} alt="" className="size-6" />
        </span>
        <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h3>
      </div>
      {children}
      <p className="text-sm font-medium leading-[1.3] text-text-tertiary">{meta}</p>
      {link ? (
        <button
          type="button"
          className="inline-flex w-fit items-center gap-0.5 text-base font-semibold leading-[1.2] text-primary-800 transition-colors hover:text-primary-900"
        >
          {link}
          <img src={chevronIcon} alt="" className="size-5 rtl:rotate-180" />
        </button>
      ) : null}
    </article>
  )
}

export function RecurringBillsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<RecurringTabId>('active')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<BillCategory | 'all'>('all')
  const [sort, setSort] = useState<SortKey>('natural')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLButtonElement>(null)
  const [paused, setPaused] = useState<string[]>([])

  /** Resuming a watch flips it back to whatever the server would report; here, due to arrive. */
  const bills = useMemo(
    () =>
      RECURRING_BILLS.map((bill) =>
        paused.includes(bill.id)
          ? bill.state === 'paused'
            ? { ...bill, state: 'dueToArrive' as WatchState, action: undefined }
            : { ...bill, state: 'paused' as WatchState, action: 'resume' as WatchAction }
          : bill,
      ),
    [paused],
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = bills.filter((bill) => {
      const states = RECURRING_TAB_STATES[activeTab]
      const inTab = states.length === 0 || states.includes(bill.state)
      const inCategory = category === 'all' || bill.category === category
      const matches =
        needle === '' ||
        bill.title.toLowerCase().includes(needle) ||
        bill.supplier.toLowerCase().includes(needle)
      return inTab && inCategory && matches
    })
    if (sort === 'natural') return filtered
    return [...filtered].sort((a, b) => {
      if (sort === 'titleAsc') return a.title.localeCompare(b.title)
      const diff = toNumber(a.amount) - toNumber(b.amount)
      return sort === 'amountAsc' ? diff : -diff
    })
  }, [activeTab, bills, category, query, sort])

  const counts = (tab: RecurringTabId) => {
    const states = RECURRING_TAB_STATES[tab]
    return states.length === 0
      ? bills.length
      : bills.filter((bill) => states.includes(bill.state)).length
  }

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[620px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('recurringBills.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.35] text-[#8f8f8f]">
              {t('recurringBills.subtitle')}
            </p>
          </div>
          <Link
            to="/expenditure/recurring-bills/new"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
          >
            <img src={plusIcon} alt="" className="size-6" />
            {t('recurringBills.add')}
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard
            icon={calBlueIcon}
            tint="bg-primary-50"
            title={t('recurringBills.kpi.expected')}
            meta={t('recurringBills.kpi.expectedMeta')}
          >
            <div className="flex items-center gap-1">
              <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
                2,214.500
              </p>
            </div>
          </KpiCard>

          <KpiCard
            icon={calAlertIcon}
            tint="bg-pending-100"
            title={t('recurringBills.kpi.late')}
            meta={t('recurringBills.kpi.lateMeta')}
            link={t('recurringBills.kpi.chaseIt')}
          >
            <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
              {counts('late')}
            </p>
          </KpiCard>

          <KpiCard
            icon={kpiClockIcon}
            tint="bg-primary-50"
            title={t('recurringBills.kpi.next')}
            meta={t('recurringBills.kpi.nextMeta')}
          >
            <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">1 Aug</p>
          </KpiCard>
        </div>

        <section className="overflow-hidden rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
            {RECURRING_TABS.map((tab) => {
              const active = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                    active
                      ? 'font-semibold text-primary-800'
                      : 'font-medium text-text-quaternary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(tab.labelKey)}
                  <span
                    className={[
                      'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                      active
                        ? 'bg-primary-25 text-primary-800'
                        : 'bg-primary-25 text-text-quaternary',
                    ].join(' ')}
                  >
                    {counts(tab.id)}
                  </span>
                  {active ? (
                    <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-800" />
                  ) : null}
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
            <label className="flex h-11 w-full max-w-[346px] items-center max-md:max-w-none max-md:basis-full gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4">
              <img src={searchIcon} alt="" className="size-5 shrink-0" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('recurringBills.searchPlaceholder')}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>

            <div className="flex items-center gap-3">
              <FilterMenu
                label={t('billsPage.filters')}
                value={category}
                defaultValue="all"
                onChange={setCategory}
                options={CATEGORY_FILTERS.map((option) => ({
                  value: option.id,
                  label: t(option.labelKey),
                }))}
                icon={filterIcon}
              />
              <div>
                <button
                  ref={sortRef}
                  type="button"
                  onClick={() => setSortOpen((open) => !open)}
                  aria-haspopup="listbox"
                  aria-expanded={sortOpen}
                  className="inline-flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-sm border border-border-subtle bg-surface-tab-bar px-3 text-sm font-semibold text-text-tertiary"
                >
                  <img src={sortIcon} alt="" className="size-6" />
                  {sort === 'natural'
                    ? t('billsPage.sort')
                    : t(SORT_OPTIONS.find((option) => option.value === sort)!.labelKey)}
                </button>
                <Popover
                  open={sortOpen}
                  anchorRef={sortRef}
                  onClose={() => setSortOpen(false)}
                  width={220}
                  align="end"
                >
                  <ul role="listbox" className="py-1">
                    {SORT_OPTIONS.map((option) => (
                      <li key={option.value}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={option.value === sort}
                          onClick={() => {
                            setSort(option.value)
                            setSortOpen(false)
                          }}
                          className={[
                            'w-full px-4 py-2.5 text-start text-sm transition-colors hover:bg-primary-25',
                            option.value === sort
                              ? 'font-semibold text-primary-800'
                              : 'font-medium text-text-secondary',
                          ].join(' ')}
                        >
                          {t(option.labelKey)}
                        </button>
                      </li>
                    ))}
                  </ul>
                </Popover>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 px-6 pb-6">
            {rows.map((bill) => {
              const style = CATEGORY_STYLES[bill.category]
              const chip = STATE_CHIP[bill.state]
              const action = bill.action ? ACTION_STYLES[bill.action] : null
              return (
                <article
                  key={bill.id}
                  className="flex flex-wrap items-center gap-4 rounded-sm border border-border-subtle p-4"
                >
                  <span
                    className={[
                      'flex size-[52px] shrink-0 items-center justify-center rounded-sm',
                      style.tile,
                    ].join(' ')}
                  >
                    <img src={style.icon} alt="" className="size-6" />
                  </span>

                  <div className="min-w-[190px] flex-1">
                    <Link
                      to={`/expenditure/recurring-bills/${bill.id}`}
                      className="text-base font-semibold leading-[1.2] text-text-primary hover:text-primary-700"
                    >
                      {bill.title}
                    </Link>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium leading-[1.2] text-text-tertiary">
                        {bill.supplier}
                      </span>
                      <span className="inline-flex items-center rounded-[3px] bg-surface-background px-2 py-1 text-xs font-medium leading-[1.2] text-text-tertiary">
                        {t(bill.cadenceKey)}
                      </span>
                    </div>
                  </div>

                  <div className="min-w-[150px]">
                    <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
                      {t(`recurringBills.timing.${bill.timingKind}`)}
                    </p>
                    <p className="mt-1 text-base font-semibold leading-[1.2] text-text-primary">
                      {bill.timingDate.startsWith('recurringBills.')
                        ? t(bill.timingDate)
                        : bill.timingDate}
                    </p>
                    <p
                      className={[
                        'mt-1 text-xs font-medium leading-[1.2]',
                        TONE_TEXT[bill.timingTone],
                      ].join(' ')}
                    >
                      {t(bill.timingNoteKey)}
                    </p>
                  </div>

                  <div className="min-w-[140px] text-end">
                    <div className="flex items-center justify-end gap-1">
                      <img src={omrRowIcon} alt="" className="h-auto w-5 shrink-0" />
                      <p className="text-[22px] font-semibold leading-[1.2] text-text-secondary">
                        {bill.amount}
                      </p>
                    </div>
                    <p
                      className={[
                        'mt-1 text-xs font-medium leading-[1.2]',
                        TONE_TEXT[bill.amountTone],
                      ].join(' ')}
                    >
                      {t(bill.amountNoteKey)}
                    </p>
                  </div>

                  <div className="flex min-w-[180px] flex-col items-start gap-2">
                    <span
                      className={[
                        'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold leading-[1.2]',
                        chip.bg,
                        chip.fg,
                      ].join(' ')}
                    >
                      <span className={['size-1.5 rounded-full', chip.dot].join(' ')} />
                      {t(chip.labelKey)}
                    </span>

                    {action ? (
                      <button
                        type="button"
                        onClick={() =>
                          bill.action === 'resume' || bill.state === 'paused'
                            ? setPaused((current) =>
                                current.includes(bill.id)
                                  ? current.filter((id) => id !== bill.id)
                                  : [...current, bill.id],
                              )
                            : undefined
                        }
                        className={[
                          'inline-flex h-[34px] items-center gap-1 rounded-sm px-3 text-xs font-semibold leading-[1.2] transition-colors',
                          action.filled
                            ? 'bg-pending-700 text-white hover:bg-[#5b4a2f]'
                            : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                        ].join(' ')}
                      >
                        {t(action.labelKey)}
                        {action.chevron ? (
                          <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
                        ) : null}
                      </button>
                    ) : null}
                  </div>

                  <ActionMenu
                    label={t('recurringBills.rowMenu')}
                    items={[
                      {
                        id: 'open',
                        labelKey: 'recurringBills.menu.open',
                        icon: viewIcon,
                        to: `/expenditure/recurring-bills/${bill.id}`,
                      },
                      { id: 'edit', labelKey: 'recurringBills.menu.edit', icon: editIcon },
                      {
                        id: 'pause',
                        labelKey:
                          bill.state === 'paused'
                            ? 'recurringBills.menu.resume'
                            : 'recurringBills.menu.pause',
                        icon: pauseIcon,
                        onSelect: () =>
                          setPaused((current) =>
                            current.includes(bill.id)
                              ? current.filter((id) => id !== bill.id)
                              : [...current, bill.id],
                          ),
                      },
                      {
                        id: 'stop',
                        labelKey: 'recurringBills.menu.stop',
                        icon: deleteIcon,
                        danger: true,
                      },
                    ]}
                  />
                </article>
              )
            })}

            {rows.length === 0 ? (
              <p className="py-12 text-center text-sm font-medium text-text-tertiary">
                {t('recurringBills.empty')}
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </AppShell>
  )
}
