import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, FilterMenu, Popover } from '../../components/ui'
import {
  DEBIT_TABS,
  DEBIT_TAB_STATES,
  SUPPLIER_DEBIT_NOTES,
  debitValue,
  formatDebit,
  type DebitState,
  type DebitTabId,
} from '../../lib/supplierDebitNotes'
import kpiEyeIcon from '../../assets/supplier-debit-notes/kpi-eye.svg'
import kpiPlusIcon from '../../assets/supplier-debit-notes/kpi-plus.svg'
import kpiAlertIcon from '../../assets/supplier-debit-notes/kpi-alert.svg'
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

const STATE_CHIP: Record<DebitState, { bg: string; fg: string; dot: string }> = {
  unchecked: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  accepted: { bg: 'bg-success-100', fg: 'text-[#3d5648]', dot: 'bg-[#3d5648]' },
  refused: { bg: 'bg-warning-100', fg: 'text-warning-700', dot: 'bg-warning-700' },
  onHold: { bg: 'bg-primary-50', fg: 'text-primary-800', dot: 'bg-primary-800' },
}

/**
 * The one thing each row offers.
 *
 * Only a charge nobody has decided on can be acted on here, so that is the only filled button.
 * Figma offers "See the payment" on a refused note; a refused charge is never paid, so that
 * row goes to the bill it was raised against like the others.
 */
const STATE_ACTION: Record<DebitState, { labelKey: string; primary?: boolean }> = {
  unchecked: { labelKey: 'supplierDebitNotes.actions.acceptOrRefuse', primary: true },
  accepted: { labelKey: 'supplierDebitNotes.actions.viewBill' },
  refused: { labelKey: 'supplierDebitNotes.actions.viewBill' },
  onHold: { labelKey: 'supplierDebitNotes.actions.seeDecision' },
}

type SortKey = 'natural' | 'extraDesc' | 'extraAsc' | 'supplierAsc'

const SORT_OPTIONS: { value: SortKey; labelKey: string }[] = [
  { value: 'natural', labelKey: 'recurringBills.sortOptions.natural' },
  { value: 'extraDesc', labelKey: 'supplierDebitNotes.sortOptions.extraDesc' },
  { value: 'extraAsc', labelKey: 'supplierDebitNotes.sortOptions.extraAsc' },
  { value: 'supplierAsc', labelKey: 'billsPage.sortOptions.supplierAsc' },
]

export function SupplierDebitNotesPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<DebitTabId>('all')
  const [query, setQuery] = useState('')
  const [supplier, setSupplier] = useState('all')
  const [sort, setSort] = useState<SortKey>('natural')
  const [sortOpen, setSortOpen] = useState(false)
  const sortRef = useRef<HTMLButtonElement>(null)

  const notes = SUPPLIER_DEBIT_NOTES

  const suppliers = useMemo(() => [...new Set(notes.map((note) => note.supplier))], [notes])

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const filtered = notes.filter((note) => {
      const states = DEBIT_TAB_STATES[activeTab]
      const inTab = states.length === 0 || states.includes(note.state)
      const inSupplier = supplier === 'all' || note.supplier === supplier
      const matches =
        needle === '' ||
        note.id.toLowerCase().includes(needle) ||
        note.supplier.toLowerCase().includes(needle) ||
        note.againstBill.toLowerCase().includes(needle)
      return inTab && inSupplier && matches
    })
    if (sort === 'natural') return filtered
    return [...filtered].sort((a, b) => {
      if (sort === 'supplierAsc') return a.supplier.localeCompare(b.supplier)
      const diff = debitValue(a.extra) - debitValue(b.extra)
      return sort === 'extraAsc' ? diff : -diff
    })
  }, [activeTab, notes, query, sort, supplier])

  const counts = (tab: DebitTabId) => {
    const states = DEBIT_TAB_STATES[tab]
    return states.length === 0 ? notes.length : notes.filter((n) => states.includes(n.state)).length
  }

  /** All three figures follow from the rows, so the table and the cards can never disagree. */
  const open = notes.filter((n) => n.state === 'unchecked' || n.state === 'onHold')
  const accepted = notes.filter((n) => n.state === 'accepted')
  const refused = notes.filter((n) => n.state === 'refused')
  const sum = (list: typeof notes) => list.reduce((total, n) => total + debitValue(n.extra), 0)
  const openTotal = sum(open)
  const addedTotal = sum(open) + sum(accepted)
  const refusedTotal = sum(refused)

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-[680px]">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('supplierDebitNotes.title')}
            </h1>
            <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
              {t('supplierDebitNotes.subtitle')}
            </p>
          </div>
          <Link
            to="/expenditure/debit-notes/upload"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
          >
            <img src={uploadIcon} alt="" className="size-6" />
            {t('supplierDebitNotes.upload.cta')}
          </Link>
        </div>

        {/* KPIs */}
        <div className="grid gap-4 md:grid-cols-3">
          <article className="flex flex-col gap-2.5 rounded-md border border-pending-200 bg-pending-100 p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-pending-500">
                <img src={kpiEyeIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('supplierDebitNotes.kpi.needsChecking')}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
                {formatDebit(openTotal)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierDebitNotes.kpi.needsCheckingNote', { count: open.length })}
            </p>
          </article>

          <article className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-background">
                <img src={kpiPlusIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('supplierDebitNotes.kpi.added')}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
                {formatDebit(addedTotal)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierDebitNotes.kpi.addedNote', {
                total: open.length + accepted.length,
                accepted: accepted.length,
                open: open.length,
              })}
            </p>
          </article>

          <article className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-warning-100">
                <img src={kpiAlertIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('supplierDebitNotes.kpi.rejected')}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
                {formatDebit(refusedTotal)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierDebitNotes.kpi.rejectedNote', { count: refused.length })}
            </p>
          </article>
        </div>

        {/* Table */}
        <section className="rounded-md bg-surface-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
            {DEBIT_TABS.map((tab) => {
              const active = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={[
                    'inline-flex h-[54px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary-700 text-primary-700'
                      : 'border-transparent text-text-quaternary hover:text-text-secondary',
                  ].join(' ')}
                >
                  {t(tab.labelKey)}
                  <span
                    className={[
                      'text-xs font-semibold',
                      active ? 'text-primary-700' : 'text-text-quaternary',
                    ].join(' ')}
                  >
                    {counts(tab.id)}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 p-5">
            <label className="relative flex h-[46px] w-full max-w-[344px] items-center">
              <img
                src={searchIcon}
                alt=""
                className="pointer-events-none absolute start-3.5 size-5 opacity-60"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('supplierDebitNotes.searchPlaceholder')}
                className="h-full w-full rounded-sm border border-border-subtle bg-white ps-11 pe-4 text-sm font-medium text-text-secondary outline-none placeholder:text-text-quaternary focus:border-primary-300"
              />
            </label>

            <div className="flex items-center gap-2.5">
              <FilterMenu
                label={t('billsPage.filters')}
                value={supplier}
                defaultValue="all"
                icon={filterIcon}
                options={[
                  { value: 'all', label: t('supplierDebitNotes.allSuppliers') },
                  ...suppliers.map((name) => ({ value: name, label: name })),
                ]}
                onChange={setSupplier}
              />
              <button
                ref={sortRef}
                type="button"
                onClick={() => setSortOpen((open) => !open)}
                className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-medium text-text-secondary transition-colors hover:bg-primary-25"
              >
                <img src={sortIcon} alt="" className="size-5" />
                {t('billsPage.sort')}
              </button>
              <Popover anchorRef={sortRef} open={sortOpen} onClose={() => setSortOpen(false)}>
                <ul className="w-[220px] py-1.5">
                  {SORT_OPTIONS.map((option) => (
                    <li key={option.value}>
                      <button
                        type="button"
                        onClick={() => {
                          setSort(option.value)
                          setSortOpen(false)
                        }}
                        className={[
                          'flex w-full items-center px-4 py-2.5 text-start text-sm font-medium transition-colors hover:bg-primary-25',
                          option.value === sort ? 'text-primary-700' : 'text-text-secondary',
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

          <div className="overflow-x-auto px-5 pb-5">
            <table className="w-full min-w-[980px] border-collapse">
              <thead>
                <tr className="bg-[#151c2d] text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-white">
                  {['debitNote', 'supplier', 'against', 'why', 'status', 'extra'].map(
                    (key, index) => (
                      <th
                        key={key}
                        className={[
                          'h-[46px] px-4 text-start font-semibold first:rounded-s-sm',
                          index === 5 ? 'text-end' : '',
                        ].join(' ')}
                      >
                        {t(`supplierDebitNotes.col.${key}`)}
                      </th>
                    ),
                  )}
                  <th className="h-[46px] rounded-e-sm px-4" />
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="py-12 text-center text-sm font-medium text-text-quaternary"
                    >
                      {t('supplierDebitNotes.empty')}
                    </td>
                  </tr>
                ) : (
                  rows.map((note) => {
                    const chip = STATE_CHIP[note.state]
                    const action = STATE_ACTION[note.state]
                    return (
                      <tr
                        key={note.id}
                        className="border-b border-surface-background last:border-0"
                      >
                        <td className="px-4 py-4 align-top">
                          <Link
                            to={`/expenditure/debit-notes/${note.id}`}
                            className="text-sm font-semibold text-primary-700 hover:underline"
                          >
                            {note.id}
                          </Link>
                          <p className="mt-1 text-xs font-medium text-text-quaternary">
                            {t('supplierDebitNotes.rows.arrived', { date: note.arrived })}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <p className="text-sm font-semibold text-text-primary">{note.supplier}</p>
                          <p className="mt-1 text-xs font-medium text-text-quaternary">
                            {t(note.channelKey)}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top">
                          <Link
                            to={`/expenditure/bills/${note.againstBill}`}
                            className="text-sm font-semibold text-primary-700 hover:underline"
                          >
                            {note.againstBill}
                          </Link>
                          <p className="mt-1 text-xs font-medium text-text-quaternary">
                            {t(note.againstNoteKey)}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top text-sm font-medium text-text-secondary">
                          {t(note.whyKey)}
                        </td>
                        <td className="px-4 py-4 align-top">
                          <span
                            className={[
                              'inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-xs font-medium',
                              chip.bg,
                              chip.fg,
                            ].join(' ')}
                          >
                            <span className={['size-1.5 rounded-full', chip.dot].join(' ')} />
                            {note.state === 'accepted'
                              ? t('supplierDebitNotes.state.accepted', { who: note.decidedBy })
                              : t(`supplierDebitNotes.state.${note.state}`)}
                          </span>
                          <div className="mt-2">
                            {action.primary ? (
                              <Link
                                to={`/expenditure/debit-notes/${note.id}`}
                                className="inline-flex h-[34px] items-center rounded-sm bg-primary-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-primary-800"
                              >
                                {t(action.labelKey)}
                              </Link>
                            ) : (
                              <Link
                                to={
                                  note.state === 'onHold'
                                    ? `/expenditure/debit-notes/${note.id}`
                                    : `/expenditure/bills/${note.againstBill}`
                                }
                                className="inline-flex items-center gap-1 text-xs font-medium text-text-tertiary transition-colors hover:text-primary-700"
                              >
                                {t(action.labelKey)}
                                <img
                                  src={actChevronIcon}
                                  alt=""
                                  className="size-3 rtl:rotate-180"
                                />
                              </Link>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4 align-top text-end">
                          {/* A debit note raises what you owe, so the figure carries a plus. */}
                          <p className="flex items-center justify-end gap-1 text-sm font-semibold text-text-primary tabular-nums">
                            +<img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                            {note.extra}
                          </p>
                          <p className="mt-1 text-xs font-medium text-text-quaternary">
                            {t(note.outcomeKey)}
                          </p>
                        </td>
                        <td className="px-4 py-4 align-top text-end">
                          <ActionMenu
                            label={t('supplierDebitNotes.menu.rowActions')}
                            items={[
                              {
                                id: 'open',
                                labelKey: 'supplierDebitNotes.menu.open',
                                icon: viewIcon,
                                to: `/expenditure/debit-notes/${note.id}`,
                              },
                              {
                                id: 'download',
                                labelKey: 'supplierDebitNotes.menu.download',
                                icon: statementIcon,
                              },
                              {
                                id: 'remove',
                                labelKey: 'supplierDebitNotes.menu.remove',
                                icon: deleteIcon,
                                danger: true,
                              },
                            ]}
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
