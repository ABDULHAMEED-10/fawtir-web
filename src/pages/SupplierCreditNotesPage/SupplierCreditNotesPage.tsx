import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, FilterMenu, Popover, RowsView } from '../../components/ui'
import {
  CREDIT_TABS,
  CREDIT_TAB_STATES,
  SUPPLIER_CREDIT_NOTES,
  creditValue,
  formatCredit,
  type CreditState,
  type CreditTabId,
} from '../../lib/supplierCreditNotes'
import kpiMinusIcon from '../../assets/supplier-credit-notes/kpi-minus.svg'
import kpiCheckIcon from '../../assets/supplier-credit-notes/kpi-check.svg'
import kpiHomeIcon from '../../assets/supplier-credit-notes/kpi-home.svg'
import actChevronIcon from '../../assets/supplier-credit-notes/act-chevron.svg'
import uploadIcon from '../../assets/bills/upload.svg'
import searchIcon from '../../assets/invoices/search.svg'
import sortIcon from '../../assets/bills/sort.svg'
import filterIcon from '../../assets/bills/filter.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import viewIcon from '../../assets/actions/view.svg'
import statementIcon from '../../assets/actions/statement.svg'
import deleteIcon from '../../assets/actions/delete.svg'

const STATE_CHIP: Record<CreditState, { bg: string; fg: string; dot: string; labelKey: string }> = {
  notUsed: {
    bg: 'bg-pending-100',
    fg: 'text-pending-700',
    dot: 'bg-pending-700',
    labelKey: 'supplierCreditNotes.state.notUsed',
  },
  waitingForBill: {
    bg: 'bg-pending-100',
    fg: 'text-pending-700',
    dot: 'bg-pending-700',
    labelKey: 'supplierCreditNotes.state.waitingForBill',
  },
  used: {
    bg: 'bg-success-100',
    fg: 'text-[#3d5648]',
    dot: 'bg-[#3d5648]',
    labelKey: 'supplierCreditNotes.state.used',
  },
  refunded: {
    bg: 'bg-primary-50',
    fg: 'text-primary-800',
    dot: 'bg-primary-800',
    labelKey: 'supplierCreditNotes.state.refunded',
  },
}

/**
 * The one thing each row offers.
 *
 * Only an unused note against an unpaid bill can be acted on here, so that is the only filled
 * button; the rest link away to whatever already happened.
 */
const STATE_ACTION: Record<CreditState, { labelKey: string; primary?: boolean }> = {
  notUsed: { labelKey: 'supplierCreditNotes.actions.setAgainst', primary: true },
  waitingForBill: { labelKey: 'supplierCreditNotes.actions.viewBill' },
  used: { labelKey: 'supplierCreditNotes.actions.viewBill' },
  refunded: { labelKey: 'supplierCreditNotes.actions.seePayment' },
}

type SortKey = 'natural' | 'creditDesc' | 'creditAsc' | 'supplierAsc'

const SORT_OPTIONS: { value: SortKey; labelKey: string }[] = [
  { value: 'natural', labelKey: 'recurringBills.sortOptions.natural' },
  { value: 'creditDesc', labelKey: 'supplierCreditNotes.sortOptions.creditDesc' },
  { value: 'creditAsc', labelKey: 'supplierCreditNotes.sortOptions.creditAsc' },
  { value: 'supplierAsc', labelKey: 'billsPage.sortOptions.supplierAsc' },
]

export function SupplierCreditNotesPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<CreditTabId>('all')
  const [query, setQuery] = useState('')
  const [supplier, setSupplier] = useState<string>('all')
  const [sort, setSort] = useState<SortKey>('natural')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLButtonElement>(null)
  const [applied, setApplied] = useState<string[]>([])

  /** Setting a note against its bill moves it to "used" without a round trip. */
  const notes = useMemo(
    () =>
      SUPPLIER_CREDIT_NOTES.map((note) =>
        applied.includes(note.id) ? { ...note, state: 'used' as CreditState } : note,
      ),
    [applied],
  )

  const suppliers = useMemo(
    () => [...new Set(SUPPLIER_CREDIT_NOTES.map((note) => note.supplier))],
    [],
  )

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = notes.filter((note) => {
      const states = CREDIT_TAB_STATES[activeTab]
      const inTab = states.length === 0 || states.includes(note.state)
      const inSupplier = supplier === 'all' || note.supplier === supplier
      const matches =
        needle === '' ||
        note.id.toLowerCase().includes(needle) ||
        note.supplier.toLowerCase().includes(needle) ||
        (note.againstBill ?? '').toLowerCase().includes(needle)
      return inTab && inSupplier && matches
    })
    if (sort === 'natural') return filtered
    return [...filtered].sort((a, b) => {
      if (sort === 'supplierAsc') return a.supplier.localeCompare(b.supplier)
      const diff = creditValue(a.credit) - creditValue(b.credit)
      return sort === 'creditAsc' ? diff : -diff
    })
  }, [activeTab, notes, query, sort, supplier])

  const counts = (tab: CreditTabId) => {
    const states = CREDIT_TAB_STATES[tab]
    return states.length === 0 ? notes.length : notes.filter((n) => states.includes(n.state)).length
  }

  /** The two KPI figures follow from the notes themselves, so ticking one moves them. */
  const stillUsable = notes.filter((n) => n.state === 'notUsed' || n.state === 'waitingForBill')
  const recovered = notes.filter((n) => n.state === 'used' || n.state === 'refunded')
  const stillUsableTotal = stillUsable.reduce((sum, n) => sum + creditValue(n.credit), 0)
  const recoveredTotal = recovered.reduce((sum, n) => sum + creditValue(n.credit), 0)

  /** Whoever has issued the most notes — the one worth a conversation. */
  const topSupplier = useMemo(() => {
    const tally = new Map<string, number>()
    for (const note of notes) tally.set(note.supplier, (tally.get(note.supplier) ?? 0) + 1)
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0]
  }, [notes])

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[660px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('supplierCreditNotes.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('supplierCreditNotes.subtitle')}
            </p>
          </div>
          <Link
            to="/expenditure/credit-notes/upload"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
          >
            <img src={uploadIcon} alt="" className="size-6" />
            {t('supplierCreditNotes.upload.cta')}
          </Link>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article className="flex flex-col gap-2.5 rounded-md border border-[#cfe0d5] bg-[#eef5f0] p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#3d5648]">
                <img src={kpiMinusIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('supplierCreditNotes.kpi.stillUsable')}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
                {formatCredit(stillUsableTotal)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierCreditNotes.kpi.stillUsableMeta', { count: stillUsable.length })}
            </p>
          </article>

          <article className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-pending-100">
                <img src={kpiCheckIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('supplierCreditNotes.kpi.recovered')}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
                {formatCredit(recoveredTotal)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierCreditNotes.kpi.recoveredMeta', { count: recovered.length })}
            </p>
          </article>

          <article className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-50">
                <img src={kpiHomeIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('supplierCreditNotes.kpi.mostFrom')}
              </h3>
            </div>
            <p className="whitespace-nowrap text-[32px] font-semibold leading-[1.2] text-text-secondary">
              {topSupplier?.[0] ?? '—'}
            </p>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierCreditNotes.kpi.mostFromMeta', { count: topSupplier?.[1] ?? 0 })}
            </p>
          </article>
        </div>

        <section className="overflow-hidden rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4">
            {CREDIT_TABS.map((tab) => {
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
                  <span className="inline-flex h-[18px] items-center justify-center rounded-full bg-primary-25 px-1.5 text-xs font-semibold text-text-quaternary">
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
                placeholder={t('billsPage.searchPlaceholder')}
                className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
              />
            </label>

            <div className="flex items-center gap-3">
              <FilterMenu
                label={t('billsPage.filters')}
                value={supplier}
                defaultValue="all"
                onChange={setSupplier}
                width={260}
                icon={filterIcon}
                options={[
                  { value: 'all', label: t('supplierCreditNotes.allSuppliers') },
                  ...suppliers.map((name) => ({ value: name, label: name })),
                ]}
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
                  width={230}
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

          <RowsView className="px-6 pb-6">
            <table className="w-full min-w-[980px] border-collapse overflow-hidden rounded-sm text-start">
              <thead>
                <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                  {['creditNote', 'supplier', 'against', 'why', 'status', 'credit'].map((key) => (
                    <th key={key} className="px-4 py-3 text-start font-semibold">
                      {t(`supplierCreditNotes.col.${key}`)}
                    </th>
                  ))}
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((note) => {
                  const chip = STATE_CHIP[note.state]
                  const action = STATE_ACTION[note.state]
                  return (
                    <tr key={note.id} className="border-b border-[#f3f3f3] last:border-b-0">
                      <td className="px-4 py-4 align-top">
                        <Link
                          to={`/expenditure/credit-notes/${note.id}`}
                          className="text-sm font-semibold leading-[1.2] text-primary-700 hover:underline"
                        >
                          {note.id}
                        </Link>
                        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                          {t('supplierCreditNotes.rows.arrived', { date: note.arrived })}
                        </p>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <p className="text-sm font-semibold leading-[1.2] text-text-primary">
                          {note.supplier}
                        </p>
                        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                          {t(note.channelKey)}
                        </p>
                      </td>

                      <td className="px-4 py-4 align-top">
                        {note.againstBill ? (
                          <Link
                            to={`/expenditure/bills/${note.againstBill}`}
                            className="text-sm font-semibold leading-[1.2] text-primary-700 hover:underline"
                          >
                            {note.againstBill}
                          </Link>
                        ) : (
                          <span className="text-sm font-medium leading-[1.2] text-text-quaternary">
                            {t('supplierCreditNotes.rows.noBill')}
                          </span>
                        )}
                        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                          {t(note.againstNoteKey)}
                        </p>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
                          {t(note.whyKey)}
                        </p>
                      </td>

                      <td className="px-4 py-4 align-top">
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

                        <div className="mt-2">
                          {action.primary ? (
                            <button
                              type="button"
                              onClick={() => setApplied((current) => [...current, note.id])}
                              className="inline-flex h-[34px] items-center rounded-sm bg-primary-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-primary-800"
                            >
                              {t(action.labelKey)}
                            </button>
                          ) : (
                            <Link
                              to={
                                note.againstBill
                                  ? `/expenditure/bills/${note.againstBill}`
                                  : `/expenditure/credit-notes/${note.id}`
                              }
                              className="inline-flex items-center gap-1 text-xs font-medium text-text-quaternary transition-colors hover:text-text-secondary"
                            >
                              {t(action.labelKey)}
                              <img src={actChevronIcon} alt="" className="size-3 rtl:rotate-180" />
                            </Link>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-4 align-top">
                        <span className="flex items-center gap-1 text-[#3d5648]">
                          <span className="text-base font-semibold">−</span>
                          <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                          <span className="text-base font-semibold">{note.credit}</span>
                        </span>
                        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
                          {t('supplierCreditNotes.rows.youdPayLess')}
                        </p>
                      </td>

                      <td className="px-2 py-4 align-top">
                        <ActionMenu
                          label={t('supplierCreditNotes.rowMenu')}
                          items={[
                            {
                              id: 'open',
                              labelKey: 'supplierCreditNotes.menu.open',
                              icon: viewIcon,
                              to: `/expenditure/credit-notes/${note.id}`,
                            },
                            {
                              id: 'download',
                              labelKey: 'supplierCreditNotes.menu.download',
                              icon: statementIcon,
                            },
                            {
                              id: 'query',
                              labelKey: 'supplierCreditNotes.menu.query',
                              icon: deleteIcon,
                              danger: true,
                            },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {rows.length === 0 ? (
              <p className="py-12 text-center text-sm font-medium text-text-tertiary">
                {t('supplierCreditNotes.empty')}
              </p>
            ) : null}
          </RowsView>
        </section>
      </div>
    </AppShell>
  )
}
