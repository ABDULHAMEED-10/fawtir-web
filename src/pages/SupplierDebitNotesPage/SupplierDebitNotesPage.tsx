import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ActionMenu, FilterMenu, Pager, RowsView, SortMenu } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { SignedAmount } from '../../components/debit/NoteParts'
import { useApiRead } from '../../hooks'
import { pageCountOf, type Page } from '../../api'
import {
  DEBIT_NOTE_SUMMARY_PATH,
  debitNoteListPath,
  debitNoteTabCountsPath,
  loadDebitNotePage,
  loadDebitNoteSummary,
  type DebitNoteRowDto,
  type DebitNoteSummaryDto,
} from '../../api/expenditure/notes'
import { downloadBillOriginal } from '../../api/expenditure/bills'
import {
  DEBIT_ROW_ACTION,
  duplicateCheckPath,
  DEBIT_TABS,
  DEBIT_TAB_LABEL,
  DEBIT_TAB_STATUS,
  DEFAULT_DEBIT_TAB,
  NOTE_SORTS,
  debitAmountNoteKey,
  isDebitTab,
  isNoteSort,
  noteSortOf,
  reasonLabelKey,
  supplierFilterOf,
  supplierOptions,
  toDebitNoteItem,
  type DebitNoteItem,
  type DebitTabId,
  type NoteSort,
} from '../../lib/supplierNoteList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import { saveDownload } from '../../lib/supplierRecord'
import { can, useSession } from '../../lib/session/session'
import { usePlanIncludes } from '../../lib/planAccess'
import kpiEyeIcon from '../../assets/supplier-debit-notes/kpi-eye.svg'
import kpiPlusIcon from '../../assets/supplier-debit-notes/kpi-plus.svg'
import kpiAlertIcon from '../../assets/supplier-debit-notes/kpi-alert.svg'
import actChevronIcon from '../../assets/supplier-credit-notes/act-chevron.svg'
import uploadIcon from '../../assets/bills/upload.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/bills/filter.svg'
import viewIcon from '../../assets/actions/view.svg'
import statementIcon from '../../assets/actions/statement.svg'
import omrIcon from '../../assets/invoices/omr.svg'

/** The pause after typing before the search is sent, as on the Bills list. */
const SEARCH_DELAY_MS = 300

const CHIP: Record<DebitNoteItem['status'], { bg: string; fg: string; dot: string }> = {
  UNCHECKED: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  ACCEPTED: { bg: 'bg-success-100', fg: 'text-[#3d5648]', dot: 'bg-[#3d5648]' },
  REFUSED: { bg: 'bg-danger-100', fg: 'text-danger-700', dot: 'bg-danger-700' },
}

const COLUMNS = ['debitNote', 'supplier', 'against', 'why', 'status', 'extra'] as const

/**
 * Expenditure > Debit notes (E-16), on its frame (Figma 163:21057).
 *
 * **Extra a supplier has charged after the original bill.** Unlike a credit note this INCREASES
 * what is owed and is a payable in its own right, so a row carries its due date, what is still
 * outstanding and whether it is late, and the decision is whether to accept the charge at all.
 *
 * The list and the summary are the server's (`GET /v1/debit-notes?status=…`, `/summary`). The
 * frame opens on All; the charges nobody has checked are one click away on the highlighted card,
 * which asks the server for `status=UNCHECKED`.
 */
export function SupplierDebitNotesPage() {
  return (
    <AppShell>
      <DebitNotesScreen />
    </AppShell>
  )
}

function DebitNotesScreen() {
  const { t, i18n } = useTranslation()
  // The upload page itself needs the right to record what is owed, as the credit note one does.
  const mayRecord = can(useSession(), 'invoice.payment.manage')
  // Recording one needs a plan with supplier notes (PL-8); the notes made before stay listed.
  const planIncludes = usePlanIncludes('supplierNotes')
  const canUpload = mayRecord && planIncludes
  const language = i18n.language
  const [params, setParams] = useSearchParams()

  const tab: DebitTabId = isDebitTab(params.get('tab'))
    ? (params.get('tab') as DebitTabId)
    : DEFAULT_DEBIT_TAB
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  // A supplier record's id; an older link that held the supplier's name filters nothing.
  const supplier = supplierFilterOf(params.get('supplier'))
  const sort: NoteSort = isNoteSort(params.get('sort'))
    ? (params.get('sort') as NoteSort)
    : 'natural'
  const [query, setQuery] = useState('')
  // What the server was last asked for: the box as typed, once typing pauses.
  const [searched, setSearched] = useState('')
  const [notice, setNotice] = useState<string | null>(null)

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (value === null || value === '') next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )

  // The search, supplier and sort go to the server, as on the credit-notes list.
  useEffect(() => {
    if (query.trim() === searched) return
    const timer = window.setTimeout(() => {
      setSearched(query.trim())
      update({ page: null })
    }, SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
    // Armed by typing only; `update` reads the params when it runs, so nothing goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  const narrowing = {
    q: searched,
    supplierId: supplier === 'all' ? null : supplier,
    sort: noteSortOf(sort),
  }
  const summary = useApiRead<DebitNoteSummaryDto>(DEBIT_NOTE_SUMMARY_PATH, loadDebitNoteSummary)
  const countsPath = debitNoteTabCountsPath(narrowing)
  const counts = useApiRead<DebitNoteSummaryDto>(countsPath, () =>
    loadDebitNoteSummary(countsPath!),
  )
  const lastTabs = useRef<DebitNoteSummaryDto['tabs'] | null>(null)
  const listPath = debitNoteListPath(DEBIT_TAB_STATUS[tab], pageNumber - 1, narrowing)
  const list = useApiRead<Page<DebitNoteRowDto>>(listPath, () => loadDebitNotePage(listPath))

  const page = list.read.status === 'ready' ? list.read.data : null
  const rows = page ? page.items.map(toDebitNoteItem) : []
  const totals = summary.read.status === 'ready' ? summary.read.data : null
  const count = (value: number) => formatCount(value, language)
  const money = (value: number, currency: string) => formatAmount(value, currency, language)

  // The summary's per-tab counts; with a search or a supplier, counted over the same notes.
  const tabs =
    countsPath === null
      ? (totals?.tabs ?? null)
      : counts.read.status === 'ready'
        ? counts.read.data.tabs
        : (lastTabs.current ?? totals?.tabs ?? null)
  lastTabs.current = countsPath === null ? null : tabs

  // The suppliers met so far, so the filter keeps offering the others once one is chosen.
  const [suppliers, setSuppliers] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!page) return
    const found = supplierOptions(page.items.map(toDebitNoteItem))
    setSuppliers((known) =>
      Object.keys(found).every((id) => known[id] === found[id]) ? known : { ...known, ...found },
    )
  }, [page])

  const onFailure = (error: unknown) => {
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setNotice(
      message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
    )
  }

  const strip: DebitTabId[] = DEBIT_TABS.includes(tab) ? DEBIT_TABS : [...DEBIT_TABS, tab]

  return (
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
        {/* Hidden, not greyed, from someone who may not record a debit note, as on Credit notes. */}
        {canUpload ? (
          <Link
            to="/expenditure/debit-notes/upload"
            className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
          >
            <img src={uploadIcon} alt="" className="size-6" />
            {t('supplierDebitNotes.upload.cta')}
          </Link>
        ) : null}
      </div>

      {summary.read.status === 'failed' ? (
        <ApiReadFailure error={summary.read.error} retry={summary.retry} />
      ) : null}
      {notice ? (
        <Notice
          badge={t('supplierCreditNoteDetail.notDone')}
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      {totals ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Link
            to={
              tab === 'unchecked'
                ? '/expenditure/debit-notes'
                : '/expenditure/debit-notes?tab=unchecked'
            }
            aria-current={tab === 'unchecked' ? 'true' : undefined}
            className={[
              'flex flex-col gap-2.5 rounded-md border p-5 text-start transition-colors',
              tab === 'unchecked'
                ? 'border-pending-700 bg-pending-100'
                : 'border-pending-200 bg-pending-100 hover:border-pending-500',
            ].join(' ')}
          >
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
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">
                {money(totals.needsCheckingTotal, totals.currencyCode)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierDebitNotes.kpi.needsCheckingNote', { count: totals.needsCheckingCount })}
            </p>
          </Link>

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
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">
                {money(totals.acceptedThisQuarterTotal, totals.currencyCode)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierDebitNotes.kpi.acceptedNote', {
                count: count(totals.acceptedThisQuarterCount),
                open: money(totals.acceptedOpenTotal, totals.currencyCode),
              })}
            </p>
          </article>

          <article className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-danger-100">
                <img src={kpiAlertIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('supplierDebitNotes.kpi.refused')}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">
                {money(totals.rejectedThisYearTotal, totals.currencyCode)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierDebitNotes.kpi.rejectedNote', { count: totals.rejectedThisYearCount })}
            </p>
          </article>
        </div>
      ) : null}

      {totals && totals.excludedFromTotals > 0 ? (
        <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
          {t('supplierCreditNotes.excluded', { count: count(totals.excludedFromTotals) })}
        </p>
      ) : null}

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div
          className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4"
          role="tablist"
        >
          {strip.map((entry) => {
            const active = entry === tab
            const total = tabs?.[entry]
            return (
              <button
                key={entry}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() =>
                  update({ tab: entry === DEFAULT_DEBIT_TAB ? null : entry, page: null })
                }
                className={[
                  'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                  active
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(DEBIT_TAB_LABEL[entry])}
                {total !== undefined ? (
                  <span className="inline-flex h-[18px] items-center justify-center rounded-full bg-primary-25 px-1.5 text-xs font-semibold text-text-quaternary">
                    {count(total)}
                  </span>
                ) : null}
                {active ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-800" />
                ) : null}
              </button>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
            <img src={searchIcon} alt="" className="size-5 shrink-0" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('supplierNotes.searchPlaceholder')}
              aria-label={t('supplierNotes.searchPlaceholder')}
              className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <FilterMenu
              label={t('billsPage.filters')}
              value={supplier}
              defaultValue="all"
              icon={filterIcon}
              width={260}
              onChange={(value) => update({ supplier: value === 'all' ? null : value, page: null })}
              options={[
                { value: 'all', label: t('supplierDebitNotes.allSuppliers') },
                ...Object.entries(suppliers).map(([id, name]) => ({ value: id, label: name })),
              ]}
            />
            <SortMenu
              value={sort}
              options={NOTE_SORTS}
              label={t('billsPage.sort')}
              width={230}
              onChange={(value) => update({ sort: value === 'natural' ? null : value, page: null })}
            />
          </div>
        </div>

        {list.read.status === 'loading' ? <LoadingNotice /> : null}
        {list.read.status === 'failed' ? (
          <div className="px-6 pb-6">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : null}

        {page ? (
          <RowsView className="px-6 pb-6">
            <table className="w-full min-w-[980px] border-collapse overflow-hidden rounded-sm text-start">
              <thead>
                <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                  {COLUMNS.map((key) => (
                    <th key={key} className="px-4 py-3 text-start font-semibold">
                      {t(`supplierDebitNotes.col.${key}`)}
                    </th>
                  ))}
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((note) => (
                  <DebitRow key={note.id} note={note} language={language} onFailure={onFailure} />
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="py-12 text-center text-sm font-medium text-text-quaternary">
                {t('supplierDebitNotes.empty')}
              </p>
            ) : null}
          </RowsView>
        ) : null}

        {page && pageCountOf(page) > 1 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-6 py-4">
            <p className="text-xs font-medium text-text-quaternary">
              {t('supplierCreditNotes.pageOf', {
                page: count(pageNumber),
                pages: count(pageCountOf(page)),
              })}
            </p>
            <Pager
              page={pageNumber}
              pageCount={pageCountOf(page)}
              onChange={(next) => update({ page: next === 1 ? null : String(next) })}
              labels={{
                nav: t('supplierNotes.pager.nav'),
                previous: t('common.previous'),
                next: t('common.next'),
              }}
            />
          </div>
        ) : page && page.total === null && (pageNumber > 1 || page.hasMore) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background px-6 py-4">
            <p className="text-xs font-medium text-text-quaternary">
              {t('supplierCreditNotes.pageOnly', { page: count(pageNumber) })}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={pageNumber <= 1}
                onClick={() => update({ page: String(pageNumber - 1) })}
                className="h-[40px] rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-50"
              >
                {t('common.previous')}
              </button>
              <button
                type="button"
                disabled={!page.hasMore}
                onClick={() => update({ page: String(pageNumber + 1) })}
                className="h-[40px] rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-50"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function DebitRow({
  note,
  language,
  onFailure,
}: {
  note: DebitNoteItem
  language: string
  onFailure: (error: unknown) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  // A held copy waiting on its duplicate check says so in place of "Not checked": accepting it
  // is refused until the check is decided. A refusal already taken keeps its own chip.
  const heldUnchecked = note.heldAsDuplicate && note.status === 'UNCHECKED'
  const chip = heldUnchecked ? CHIP.REFUSED : CHIP[note.status]
  const action = DEBIT_ROW_ACTION[note.status]
  const reason = reasonLabelKey(note.reasonCode, note.reasonDetail ?? null)
  const detailTo = `/expenditure/debit-notes/${note.id}`
  // The bill the note adds to, linked as the credit-note row links its bill.
  const billTo = note.againstBillId ? `/expenditure/bills/${note.againstBillId}` : null
  // "Accept or refuse" is hidden, not greyed, from someone who may not decide (owner, 8 Oct).
  const canDecide = can(useSession(), 'invoice.approve')
  const money = (value: number) => formatAmount(value, note.currency, language)

  const download = async () => {
    if (!note.inboundDeliveryId) {
      navigate(detailTo)
      return
    }
    try {
      const file = await downloadBillOriginal(
        `/v1/inbound-invoices/${encodeURIComponent(note.inboundDeliveryId)}/document`,
      )
      saveDownload(file, `${note.number ?? note.id}.xml`)
    } catch (error) {
      onFailure(error)
    }
  }

  // "Accepted by Hafidh" as the frame prints it, from `decidedByName` (row 5.15); without a name
  // the chip says what it said before.
  const statusLabel = heldUnchecked
    ? t('supplierDebitNotes.held.chip')
    : note.status === 'ACCEPTED'
      ? note.decidedByName
        ? t('supplierDebitNotes.state.accepted', { who: note.decidedByName })
        : t('supplierDebitNotes.state.acceptedPlain')
      : note.status === 'REFUSED'
        ? note.decidedByName
          ? t('supplierDebitNotes.state.refusedBy', { who: note.decidedByName })
          : note.decisionReason
            ? t('supplierDebitNotes.state.refusedWhy', { reason: note.decisionReason })
            : t('supplierDebitNotes.state.refused')
        : t('supplierDebitNotes.state.unchecked')

  return (
    <tr className="border-b border-[#f3f3f3] last:border-b-0">
      <td className="px-4 py-4 align-middle">
        <Link
          to={detailTo}
          className="text-sm font-semibold leading-[1.2] text-primary-700 hover:underline"
        >
          {note.number ?? t('supplierCreditNotes.rows.unnumbered')}
        </Link>
        {note.issueDate ? (
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
            {t('supplierDebitNotes.rows.arrived', { date: formatDate(note.issueDate, language) })}
          </p>
        ) : null}
      </td>

      <td className="px-4 py-4 align-middle">
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">
          {note.supplier ?? t('supplierCreditNotes.rows.unknownSupplier')}
        </p>
        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
          {t(`supplierNotes.channel.${note.source}`)}
        </p>
      </td>

      <td className="px-4 py-4 align-middle">
        {billTo ? (
          <Link
            to={billTo}
            className="text-sm font-semibold leading-[1.2] text-primary-700 hover:underline"
          >
            {note.againstBillNumber ?? t('supplierNotes.thisBill')}
          </Link>
        ) : (
          <p className="text-sm font-semibold leading-[1.2] text-text-primary">
            {/* Text, not a link, when the server names no bill on file (`relatesTo.billId`, row
                5.15): a link built from a number would go to the wrong bill or nowhere. */}
            {note.againstBillNumber ?? (
              <span className="font-medium text-text-quaternary">
                {t('supplierCreditNotes.rows.noBill')}
              </span>
            )}
          </p>
        )}
        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
          {note.againstBillIssueDate
            ? t('supplierNotes.rows.billed', {
                date: formatDate(note.againstBillIssueDate, language),
              })
            : note.dueDate
              ? t('supplierNotes.rows.due', { date: formatDate(note.dueDate, language) })
              : t('supplierDebitNotes.rows.stillUnpaid')}
        </p>
      </td>

      <td className="px-4 py-4 align-middle">
        <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
          {reason
            ? t(reason.key, { defaultValue: reason.fallback })
            : t('supplierCreditNotes.rows.noReason')}
        </p>
      </td>

      <td className="px-4 py-4 align-middle">
        <span
          className={[
            'inline-flex max-w-[220px] items-center gap-2 rounded-sm px-3 py-1 text-sm font-semibold leading-[1.2]',
            chip.bg,
            chip.fg,
          ].join(' ')}
        >
          <span className={['size-1.5 shrink-0 rounded-full', chip.dot].join(' ')} />
          <span className="truncate">{statusLabel}</span>
        </span>
        {heldUnchecked ? (
          <div className="mt-2">
            <Link
              to={duplicateCheckPath(note.id)}
              className="inline-flex items-center gap-1 text-xs font-medium text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t('supplierDebitNotes.held.open')}
              <img src={actChevronIcon} alt="" className="size-3 rtl:rotate-180" />
            </Link>
          </div>
        ) : action.primary && !canDecide ? null : (
          <div className="mt-2">
            {action.primary ? (
              <Link
                to={detailTo}
                className="inline-flex h-[34px] items-center rounded-sm bg-primary-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-primary-800"
              >
                {t(action.labelKey)}
              </Link>
            ) : (
              <Link
                to={action.goesTo === 'bill' && billTo ? billTo : detailTo}
                className="inline-flex items-center gap-1 text-xs font-medium text-text-quaternary transition-colors hover:text-text-secondary"
              >
                {t(action.labelKey)}
                <img src={actChevronIcon} alt="" className="size-3 rtl:rotate-180" />
              </Link>
            )}
          </div>
        )}
      </td>

      <td className="px-4 py-4 align-middle">
        {note.total === null ? (
          <span className="text-base font-semibold text-text-quaternary">—</span>
        ) : (
          // A debit note raises what you owe, so the figure carries a plus (the frame's minus
          // here is a slip: it is the credit-note row's sign). Red once it is late.
          <SignedAmount
            sign="+"
            value={money(note.total)}
            className={[
              'text-base font-semibold',
              note.owes && note.overdue ? 'text-danger-700' : 'text-pending-700',
            ].join(' ')}
          />
        )}
        <p
          className={[
            'mt-1 text-xs font-medium leading-[1.2]',
            note.owes && note.overdue ? 'text-danger-700' : 'text-text-quaternary',
          ].join(' ')}
        >
          {note.status === 'REFUSED'
            ? t('supplierDebitNotes.rows.disputed')
            : note.owes && note.outstanding !== note.total
              ? t(
                  note.overdue
                    ? 'supplierDebitNotes.rows.overdue'
                    : 'supplierDebitNotes.rows.outstanding',
                  { amount: money(note.outstanding) },
                )
              : note.owes && note.overdue
                ? t('supplierDebitNotes.rows.overdue', { amount: money(note.outstanding) })
                : t(debitAmountNoteKey(note))}
        </p>
      </td>

      <td className="px-2 py-4 align-middle">
        <ActionMenu
          label={t('supplierDebitNotes.menu.rowActions')}
          floating
          items={[
            { id: 'open', labelKey: 'supplierDebitNotes.menu.open', icon: viewIcon, to: detailTo },
            {
              id: 'download',
              labelKey: 'supplierDebitNotes.menu.download',
              icon: statementIcon,
              onSelect: () => void download(),
            },
          ]}
        />
      </td>
    </tr>
  )
}
