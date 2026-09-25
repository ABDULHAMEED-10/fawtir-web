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
  CREDIT_NOTE_SUMMARY_PATH,
  applyCreditNote,
  creditNoteListPath,
  loadCreditNotePage,
  loadCreditNoteSummary,
  type CreditNoteRowDto,
  type CreditNoteSummaryDto,
} from '../../api/expenditure/notes'
import { downloadBillOriginal } from '../../api/expenditure/bills'
import {
  CREDIT_AMOUNT_NOTE,
  CREDIT_ROW_ACTION,
  CREDIT_STATUS_CHIP,
  CREDIT_STATUS_LABEL,
  CREDIT_TABS,
  CREDIT_TAB_LABEL,
  CREDIT_TAB_STATUS,
  DEFAULT_CREDIT_TAB,
  NOTE_SORTS,
  isCreditTab,
  isNoteSort,
  narrowNotes,
  reasonLabelKey,
  supplierNames,
  toCreditNoteItem,
  type CreditChipTone,
  type CreditNoteItem,
  type CreditTabId,
  type NoteSort,
} from '../../lib/supplierNoteList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import { saveDownload } from '../../lib/supplierRecord'
import { can, useSession } from '../../lib/session/session'
import kpiMinusIcon from '../../assets/supplier-credit-notes/kpi-minus.svg'
import kpiCheckIcon from '../../assets/supplier-credit-notes/kpi-check.svg'
import kpiHomeIcon from '../../assets/supplier-credit-notes/kpi-home.svg'
import actChevronIcon from '../../assets/supplier-credit-notes/act-chevron.svg'
import uploadIcon from '../../assets/bills/upload.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/bills/filter.svg'
import viewIcon from '../../assets/actions/view.svg'
import statementIcon from '../../assets/actions/statement.svg'
import omrIcon from '../../assets/invoices/omr.svg'

const CHIP: Record<CreditChipTone, { bg: string; fg: string; dot: string }> = {
  usable: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  waiting: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  done: { bg: 'bg-success-100', fg: 'text-[#3d5648]', dot: 'bg-[#3d5648]' },
  refunded: { bg: 'bg-primary-50', fg: 'text-primary-800', dot: 'bg-primary-800' },
}

const COLUMNS = ['creditNote', 'supplier', 'against', 'why', 'status', 'credit'] as const

/**
 * Expenditure > Credit notes (E-15), on its frame (Figma 163:18691).
 *
 * **What the supplier credited us, and whether we have had it back yet.** A credit note reduces
 * what the tenant owes, so there is no due date and nothing outstanding: the question a row
 * answers is where the credit went, not when it must be paid.
 *
 * The list and the summary are the server's (`GET /v1/credit-notes?status=…`, `/summary`). The
 * frame's search box, supplier filter and sort narrow the page in hand until the endpoint takes
 * them; the tab counts are the totals the server reported for each tab as it was opened.
 */
export function SupplierCreditNotesPage() {
  // AppShell provides the session, so the body is a child of it: see PaymentRemindersPage.
  return (
    <AppShell>
      <CreditNotesScreen />
    </AppShell>
  )
}

function CreditNotesScreen() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [params, setParams] = useSearchParams()
  const session = useSession()
  const canSettle = can(session, 'invoice.payment.manage')

  const tab: CreditTabId = isCreditTab(params.get('tab'))
    ? (params.get('tab') as CreditTabId)
    : DEFAULT_CREDIT_TAB
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

  const summary = useApiRead<CreditNoteSummaryDto>(CREDIT_NOTE_SUMMARY_PATH, loadCreditNoteSummary)
  const listPath = creditNoteListPath(CREDIT_TAB_STATUS[tab], pageNumber - 1)
  const list = useApiRead<Page<CreditNoteRowDto>>(listPath, () => loadCreditNotePage(listPath))

  const page = list.read.status === 'ready' ? list.read.data : null
  const items = page ? page.items.map(toCreditNoteItem) : []
  const rows = narrowNotes(items, { query, supplier, sort })
  const totals = summary.read.status === 'ready' ? summary.read.data : null
  const count = (value: number) => formatCount(value, language)
  const money = (value: number, currency: string) => formatAmount(value, currency, language)

  /*
   * The frame prints a count on every tab. The server reports a total only for the tab that was
   * asked for, so each tab remembers the last total it was opened with; the others fill in as
   * they are visited. TODO(backend): per-status counts on `GET /v1/credit-notes/summary`, as the
   * Bills summary already carries `tabs` (row 5.2 in EXPENDITURE_DESIGN_REALIGNMENT_BACKEND_ASKS.md).
   */
  const [tabTotals, setTabTotals] = useState<Partial<Record<CreditTabId, number>>>({})
  useEffect(() => {
    if (page && page.total !== null) setTabTotals((known) => ({ ...known, [tab]: page.total! }))
  }, [page, tab])

  const afterAction = () => {
    list.retry()
    summary.retry()
  }
  const onFailure = (error: unknown) => {
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setNotice(
      message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
    )
  }

  const strip: CreditTabId[] = CREDIT_TABS.includes(tab) ? CREDIT_TABS : [...CREDIT_TABS, tab]

  return (
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
          {/* The tinted card is the frame's way in to the credit nobody has used yet. */}
          <Link
            to={
              tab === 'unapplied'
                ? '/expenditure/credit-notes'
                : '/expenditure/credit-notes?tab=unapplied'
            }
            aria-current={tab === 'unapplied' ? 'true' : undefined}
            className={[
              'flex flex-col gap-2.5 rounded-md border p-5 text-start transition-colors',
              tab === 'unapplied'
                ? 'border-[#3d5648] bg-[#eef5f0]'
                : 'border-[#cfe0d5] bg-[#eef5f0] hover:border-[#9fbfab]',
            ].join(' ')}
          >
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
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">
                {money(totals.usableCredit, totals.currencyCode)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierCreditNotes.kpi.stillUsableMeta', { count: totals.usableCount })}
            </p>
          </Link>

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
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">
                {money(totals.recoveredThisQuarter, totals.currencyCode)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierCreditNotes.kpi.recoveredMeta', {
                count: totals.recoveredThisQuarterCount,
              })}
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
            <p className="truncate text-[32px] font-semibold leading-[1.2] text-text-secondary">
              {totals.topSupplier?.supplierName ?? t('supplierCreditNotes.kpi.noTopSupplier')}
            </p>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {totals.topSupplier
                ? // TODO(backend): the frame reads "3 short deliveries in 14 · worth reviewing"; the
                  // summary counts notes, not deliveries (row 5.3).
                  t('supplierCreditNotes.kpi.mostFromMeta', { count: totals.topSupplier.noteCount })
                : t('supplierCreditNotes.kpi.noTopSupplierMeta')}
            </p>
          </article>
        </div>
      ) : null}

      {totals && totals.excludedFromTotals > 0 ? (
        // Said out loud rather than quietly dropped: a figure that silently omits rows is a
        // figure someone will reconcile against and fail to match.
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
                  update({ tab: entry === DEFAULT_CREDIT_TAB ? null : entry, page: null })
                }
                className={[
                  'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                  active
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(CREDIT_TAB_LABEL[entry])}
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
                { value: 'all', label: t('supplierCreditNotes.allSuppliers') },
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
                      {t(`supplierCreditNotes.col.${key}`)}
                    </th>
                  ))}
                  <th className="w-12 px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {rows.map((note) => (
                  <CreditRow
                    key={note.id}
                    note={note}
                    language={language}
                    canSettle={canSettle}
                    onDone={afterAction}
                    onFailure={onFailure}
                  />
                ))}
              </tbody>
            </table>
            {rows.length === 0 ? (
              <p className="py-12 text-center text-sm font-medium text-text-quaternary">
                {t('supplierCreditNotes.empty')}
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

function CreditRow({
  note,
  language,
  canSettle,
  onDone,
  onFailure,
}: {
  note: CreditNoteItem
  language: string
  canSettle: boolean
  onDone: () => void
  onFailure: (error: unknown) => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const chip = CHIP[CREDIT_STATUS_CHIP[note.status]]
  const action = CREDIT_ROW_ACTION[note.status]
  const reason = reasonLabelKey(note.reasonCode)
  const [busy, setBusy] = useState(false)
  const detailTo = `/expenditure/credit-notes/${note.id}`
  const billTo = note.againstBillId ? `/expenditure/bills/${note.againstBillId}` : null

  /*
   * The frame's "Set against the bill" acts from the row. It can only when the server already
   * names the one bill the credit reduces (`credits.billId`); otherwise the note opens so the
   * bill can be chosen, since `POST /apply` needs its id.
   */
  const setAgainst = async () => {
    if (!note.againstBillId || !canSettle) {
      navigate(detailTo)
      return
    }
    setBusy(true)
    try {
      await applyCreditNote(note.id, note.againstBillId, null)
      onDone()
    } catch (error) {
      onFailure(error)
    } finally {
      setBusy(false)
    }
  }

  const download = async () => {
    // TODO(backend): an uploaded note's intake id is not on the list row, so only a Peppol
    // document downloads from here; the others open the note, which has it (row 5.4).
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
            {/* TODO(backend): the frame prints the arrival date; the row carries the issue date
                only, so that is what "Arrived" shows until `receivedAt` exists (row 5.4). */}
            {t('supplierCreditNotes.rows.arrived', { date: formatDate(note.issueDate, language) })}
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
        {billTo ? (
          <Link
            to={billTo}
            className="text-sm font-semibold leading-[1.2] text-primary-700 hover:underline"
          >
            {note.againstBillNumber ?? t('supplierCreditNotes.rows.theBill')}
          </Link>
        ) : (
          <span className="text-sm font-medium leading-[1.2] text-text-quaternary">
            {/* The supplier may have named a bill we cannot resolve, or the credit may reduce
                several. Both are "no single bill", and neither is a link. */}
            {note.againstBillNumber ?? t('supplierCreditNotes.rows.noBill')}
          </span>
        )}
        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
          {note.status === 'WAITING_FOR_BILL'
            ? t('supplierCreditNotes.rows.noBillYet')
            : note.againstBillIssueDate
              ? t('supplierNotes.rows.billed', {
                  date: formatDate(note.againstBillIssueDate, language),
                })
              : note.applied
                ? t('supplierCreditNotes.rows.reducedByThis')
                : t('supplierCreditNotes.rows.stillUnpaid')}
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
            'inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold leading-[1.2]',
            chip.bg,
            chip.fg,
          ].join(' ')}
        >
          <span className={['size-1.5 rounded-full', chip.dot].join(' ')} />
          {t(CREDIT_STATUS_LABEL[note.status])}
        </span>
        <div className="mt-2">
          {action.primary ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void setAgainst()}
              className="inline-flex h-[34px] items-center rounded-sm bg-primary-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              {busy ? t('common.saving') : t(action.labelKey)}
            </button>
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
      </td>

      <td className="px-4 py-4 align-top">
        {note.credited === null ? (
          <span className="text-base font-semibold text-text-quaternary">—</span>
        ) : (
          <SignedAmount
            sign={'−'}
            value={formatAmount(note.credited, note.currency, language)}
            className="text-base font-semibold text-[#3d5648]"
          />
        )}
        <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
          {note.usable && note.credited !== null && note.remaining !== note.credited
            ? t('supplierCreditNotes.rows.remaining', {
                amount: formatAmount(note.remaining, note.currency, language),
              })
            : t(CREDIT_AMOUNT_NOTE[note.status])}
        </p>
      </td>

      <td className="px-2 py-4 align-top">
        <ActionMenu
          label={t('supplierCreditNotes.rowMenu')}
          floating
          items={[
            { id: 'open', labelKey: 'supplierCreditNotes.menu.open', icon: viewIcon, to: detailTo },
            {
              id: 'download',
              labelKey: 'supplierCreditNotes.menu.download',
              icon: statementIcon,
              onSelect: () => void download(),
            },
          ]}
        />
      </td>
    </tr>
  )
}
