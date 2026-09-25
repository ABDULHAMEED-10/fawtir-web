import { useEffect, useState } from 'react'
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
  loadDebitNotePage,
  loadDebitNoteSummary,
  type DebitNoteRowDto,
  type DebitNoteSummaryDto,
} from '../../api/expenditure/notes'
import { downloadBillOriginal } from '../../api/expenditure/bills'
import {
  DEBIT_ROW_ACTION,
  DEBIT_TABS,
  DEBIT_TAB_LABEL,
  DEBIT_TAB_STATUS,
  DEFAULT_DEBIT_TAB,
  NOTE_SORTS,
  debitAmountNoteKey,
  isDebitTab,
  isNoteSort,
  narrowNotes,
  reasonLabelKey,
  supplierNames,
  toDebitNoteItem,
  type DebitNoteItem,
  type DebitTabId,
  type NoteSort,
} from '../../lib/supplierNoteList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import { saveDownload } from '../../lib/supplierRecord'
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
  const language = i18n.language
  const [params, setParams] = useSearchParams()

  const tab: DebitTabId = isDebitTab(params.get('tab'))
    ? (params.get('tab') as DebitTabId)
    : DEFAULT_DEBIT_TAB
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)
  const supplier = params.get('supplier') ?? 'all'
  const sort: NoteSort = isNoteSort(params.get('sort'))
    ? (params.get('sort') as NoteSort)
    : 'natural'
  const [query, setQuery] = useState('')
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

  const summary = useApiRead<DebitNoteSummaryDto>(DEBIT_NOTE_SUMMARY_PATH, loadDebitNoteSummary)
  const listPath = debitNoteListPath(DEBIT_TAB_STATUS[tab], pageNumber - 1)
  const list = useApiRead<Page<DebitNoteRowDto>>(listPath, () => loadDebitNotePage(listPath))

  const page = list.read.status === 'ready' ? list.read.data : null
  const items = page ? page.items.map(toDebitNoteItem) : []
  const rows = narrowNotes(items, { query, supplier, sort })
  const totals = summary.read.status === 'ready' ? summary.read.data : null
  const count = (value: number) => formatCount(value, language)
  const money = (value: number, currency: string) => formatAmount(value, currency, language)

  // See the credit-notes list: the server totals only the tab asked for (row 5.2).
  const [tabTotals, setTabTotals] = useState<Partial<Record<DebitTabId, number>>>({})
  useEffect(() => {
    if (page && page.total !== null) setTabTotals((known) => ({ ...known, [tab]: page.total! }))
  }, [page, tab])

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
        <Link
          to="/expenditure/debit-notes/upload"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={uploadIcon} alt="" className="size-6" />
          {t('supplierDebitNotes.upload.cta')}
        </Link>
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
                {t('supplierDebitNotes.kpi.rejected')}
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
            const total = tabTotals[entry]
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
              onChange={(value) => update({ supplier: value === 'all' ? null : value })}
              options={[
                { value: 'all', label: t('supplierDebitNotes.allSuppliers') },
                ...supplierNames(items).map((name) => ({ value: name, label: name })),
              ]}
            />
            <SortMenu
              value={sort}
              options={NOTE_SORTS}
              label={t('billsPage.sort')}
              width={230}
              onChange={(value) => update({ sort: value === 'natural' ? null : value })}
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
  const chip = CHIP[note.status]
  const action = DEBIT_ROW_ACTION[note.status]
  const reason = reasonLabelKey(note.reasonCode)
  const detailTo = `/expenditure/debit-notes/${note.id}`
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

  const statusLabel =
    note.status === 'ACCEPTED'
      ? // TODO(backend): `decidedBy` is a user id; the frame prints the person's name ("Accepted
        // by Hafidh"). Until the name is on the row the chip says only that it was accepted (row 5.6).
        t('supplierDebitNotes.state.acceptedPlain')
      : note.status === 'REFUSED'
        ? note.decisionReason
          ? t('supplierDebitNotes.state.refusedWhy', { reason: note.decisionReason })
          : t('supplierDebitNotes.state.refused')
        : t('supplierDebitNotes.state.unchecked')

  return (
    <tr className="border-b border-[#f3f3f3] last:border-b-0">
      <td className="px-4 py-4 align-top">
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

      <td className="px-4 py-4 align-top">
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">
          {note.supplier ?? t('supplierCreditNotes.rows.unknownSupplier')}
        </p>
        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
          {t(`supplierNotes.channel.${note.source}`)}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">
          {/* The API names the bill the supplier referenced but gives no id for it, so this is
              text rather than a link: a link built from a number we have not resolved would go
              to the wrong bill or nowhere. The note itself resolves it (row 5.5). */}
          {note.againstBillNumber ?? (
            <span className="font-medium text-text-quaternary">
              {t('supplierCreditNotes.rows.noBill')}
            </span>
          )}
        </p>
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

      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
          {reason
            ? t(reason.key, { defaultValue: reason.fallback })
            : t('supplierCreditNotes.rows.noReason')}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className={[
            'inline-flex max-w-[220px] items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold leading-[1.2]',
            chip.bg,
            chip.fg,
          ].join(' ')}
        >
          <span className={['size-1.5 shrink-0 rounded-full', chip.dot].join(' ')} />
          <span className="truncate">{statusLabel}</span>
        </span>
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
              to={detailTo}
              className="inline-flex items-center gap-1 text-xs font-medium text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t(action.labelKey)}
              <img src={actChevronIcon} alt="" className="size-3 rtl:rotate-180" />
            </Link>
          )}
        </div>
      </td>

      <td className="px-4 py-4 align-top">
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

      <td className="px-2 py-4 align-top">
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
