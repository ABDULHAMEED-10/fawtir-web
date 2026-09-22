import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
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
import {
  DEBIT_TABS,
  DEFAULT_DEBIT_TAB,
  isDebitTab,
  reasonLabelKey,
  toDebitNoteItem,
  type DebitNoteItem,
  type DebitTabId,
} from '../../lib/supplierNoteList'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import uploadIcon from '../../assets/bills/upload.svg'
import omrIcon from '../../assets/invoices/omr.svg'

const CHIP: Record<'UNCHECKED' | 'ACCEPTED' | 'REFUSED', string> = {
  UNCHECKED: 'bg-pending-100 text-pending-700',
  ACCEPTED: 'bg-success-100 text-success-700',
  REFUSED: 'bg-surface-background text-text-tertiary',
}

const COLUMNS = ['debitNote', 'supplier', 'against', 'why', 'status', 'extra'] as const

/**
 * Expenditure › Debit notes (E-16).
 *
 * **Extra a supplier has charged after the original bill.** Unlike a credit note this INCREASES
 * what is owed and is a payable in its own right, so a row carries its due date, what is still
 * outstanding and whether it is late — and the decision is whether to accept the charge at all.
 *
 * Search, supplier filter and sort are not drawn: the endpoint filters by status and pages, and
 * nothing more. See the credit-note list for the same reasoning.
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

  const tab: DebitTabId = isDebitTab(params.get('tab')) ? (params.get('tab') as DebitTabId) : DEFAULT_DEBIT_TAB
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

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
  const status = DEBIT_TABS.find((entry) => entry.id === tab)?.status ?? 'ALL'
  const listPath = debitNoteListPath(status, pageNumber - 1)
  const list = useApiRead<Page<DebitNoteRowDto>>(listPath, () => loadDebitNotePage(listPath))

  const page = list.read.status === 'ready' ? list.read.data : null
  const rows = page ? page.items.map(toDebitNoteItem) : []
  const totals = summary.read.status === 'ready' ? summary.read.data : null
  const count = (value: number) => formatCount(value, language)
  const money = (value: number, currency: string) => formatAmount(value, currency, language)

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[660px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('supplierDebitNotes.title')}</h1>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{t('supplierDebitNotes.subtitle')}</p>
        </div>
        <Link
          to="/expenditure/debit-notes/upload"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={uploadIcon} alt="" className="size-6" />
          {t('supplierDebitNotes.upload.cta')}
        </Link>
      </div>

      {summary.read.status === 'failed' ? <ApiReadFailure error={summary.read.error} retry={summary.retry} /> : null}

      {totals ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Kpi
            title={t('supplierDebitNotes.kpi.needsChecking')}
            amount={money(totals.needsCheckingTotal, totals.currencyCode)}
            note={t('supplierDebitNotes.kpi.needsCheckingNote', { count: totals.needsCheckingCount })}
            highlight
          />
          <Kpi
            title={t('supplierDebitNotes.kpi.added')}
            amount={money(totals.acceptedThisQuarterTotal, totals.currencyCode)}
            note={t('supplierDebitNotes.kpi.acceptedNote', {
              count: count(totals.acceptedThisQuarterCount),
              open: money(totals.acceptedOpenTotal, totals.currencyCode),
            })}
          />
          <Kpi
            title={t('supplierDebitNotes.kpi.rejected')}
            amount={money(totals.rejectedThisYearTotal, totals.currencyCode)}
            note={t('supplierDebitNotes.kpi.rejectedNote', { count: totals.rejectedThisYearCount })}
          />
        </div>
      ) : null}

      {totals && totals.excludedFromTotals > 0 ? (
        <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
          {t('supplierCreditNotes.excluded', { count: count(totals.excludedFromTotals) })}
        </p>
      ) : null}

      <section className="rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
          {DEBIT_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === tab}
              onClick={() => update({ tab: entry.id === DEFAULT_DEBIT_TAB ? null : entry.id, page: null })}
              className={[
                'inline-flex h-[54px] items-center border-b-2 px-4 text-sm font-medium transition-colors',
                entry.id === tab
                  ? 'border-primary-700 text-primary-700'
                  : 'border-transparent text-text-quaternary hover:text-text-secondary',
              ].join(' ')}
            >
              {t(entry.labelKey)}
            </button>
          ))}
        </div>

        {list.read.status === 'loading' ? <LoadingNotice /> : null}
        {list.read.status === 'failed' ? <ApiReadFailure error={list.read.error} retry={list.retry} /> : null}

        {page ? (
          rows.length === 0 ? (
            <p className="px-6 py-14 text-center text-sm font-medium text-text-quaternary">
              {t('supplierDebitNotes.empty')}
            </p>
          ) : (
            <RowsView className="px-6 pb-6">
              <table className="w-full min-w-[980px] border-collapse overflow-hidden rounded-sm text-start">
                <thead>
                  <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                    {COLUMNS.map((key) => (
                      <th key={key} className="px-4 py-3 text-start font-semibold">
                        {t(`supplierDebitNotes.col.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((note) => (
                    <DebitRow key={note.id} note={note} language={language} />
                  ))}
                </tbody>
              </table>
            </RowsView>
          )
        ) : null}

        {page && (pageNumber > 1 || page.hasMore) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-background p-4">
            <p className="text-xs font-medium text-text-quaternary">
              {page.total === null
                ? t('supplierCreditNotes.pageOnly', { page: count(pageNumber) })
                : t('supplierCreditNotes.pageOf', { page: count(pageNumber), pages: count(pageCountOf(page)) })}
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

function Kpi({ title, amount, note, highlight }: { title: string; amount: string; note: string; highlight?: boolean }) {
  return (
    <article
      className={[
        'flex flex-col gap-2.5 rounded-md p-5',
        highlight ? 'border border-[#e6d7b8] bg-[#fbf6ea]' : 'bg-surface-card',
      ].join(' ')}
    >
      <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h3>
      <div className="flex items-center gap-1">
        <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
        <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">{amount}</p>
      </div>
      <p className="text-sm font-medium leading-[1.3] text-text-tertiary">{note}</p>
    </article>
  )
}

function DebitRow({ note, language }: { note: DebitNoteItem; language: string }) {
  const { t } = useTranslation()
  const reason = reasonLabelKey(note.reasonCode)

  return (
    <tr className="border-b border-[#f3f3f3] last:border-b-0">
      <td className="px-4 py-4 align-top">
        <Link
          to={`/expenditure/debit-notes/${note.id}`}
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
          {t(`supplierCreditNotes.source.${note.source}`)}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium leading-[1.2] text-text-tertiary">
          {/* The API names the bill the supplier referenced but gives no id for it, so this is
              text rather than a link: a link built from a number we have not resolved would go
              to the wrong bill or nowhere. */}
          {note.relatesToBillNumber ?? t('supplierCreditNotes.rows.noBill')}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
          {reason ? t(reason.key, { defaultValue: reason.fallback }) : t('supplierCreditNotes.rows.noReason')}
        </p>
      </td>

      <td className="px-4 py-4 align-top">
        <span
          className={[
            'inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold leading-[1.2]',
            CHIP[note.status],
          ].join(' ')}
        >
          {t(`supplierDebitNotes.status.${note.status}`)}
        </span>
      </td>

      <td className="px-4 py-4 align-top">
        <p
          className={[
            'text-base font-semibold leading-[1.2] tabular-nums',
            note.owes && note.overdue ? 'text-danger-700' : 'text-text-secondary',
          ].join(' ')}
        >
          {note.total === null ? '—' : formatAmount(note.total, note.currency, language)}
        </p>
        {note.status === 'REFUSED' ? (
          // A refused charge is disputed, so it is not presented as money to pay even while the
          // figure above states what the supplier asked for.
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
            {t('supplierDebitNotes.rows.disputed')}
          </p>
        ) : note.owes ? (
          <p
            className={[
              'mt-1 text-xs font-medium leading-[1.2]',
              note.overdue ? 'text-danger-700' : 'text-text-tertiary',
            ].join(' ')}
          >
            {t(note.overdue ? 'supplierDebitNotes.rows.overdue' : 'supplierDebitNotes.rows.outstanding', {
              amount: formatAmount(note.outstanding, note.currency, language),
            })}
          </p>
        ) : null}
      </td>
    </tr>
  )
}
