import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { pageCountOf, type Page } from '../../api'
import {
  CREDIT_NOTE_SUMMARY_PATH,
  creditNoteListPath,
  loadCreditNotePage,
  loadCreditNoteSummary,
  type CreditNoteRowDto,
  type CreditNoteSummaryDto,
} from '../../api/expenditure/notes'
import {
  CREDIT_STATUS_CHIP,
  CREDIT_TABS,
  DEFAULT_CREDIT_TAB,
  isCreditTab,
  reasonLabelKey,
  toCreditNoteItem,
  type CreditNoteItem,
  type CreditTabId,
} from '../../lib/supplierNoteList'
import { formatAmount, formatCount, formatDate } from '../../lib/format'
import kpiMinusIcon from '../../assets/supplier-credit-notes/kpi-minus.svg'
import kpiCheckIcon from '../../assets/supplier-credit-notes/kpi-check.svg'
import kpiHomeIcon from '../../assets/supplier-credit-notes/kpi-home.svg'
import uploadIcon from '../../assets/bills/upload.svg'
import omrIcon from '../../assets/invoices/omr.svg'

const CHIP: Record<'usable' | 'waiting' | 'done' | 'refunded', { bg: string; fg: string; dot: string }> = {
  usable: { bg: 'bg-pending-100', fg: 'text-pending-700', dot: 'bg-pending-700' },
  waiting: { bg: 'bg-surface-background', fg: 'text-text-tertiary', dot: 'bg-text-quaternary' },
  done: { bg: 'bg-success-100', fg: 'text-success-700', dot: 'bg-success-700' },
  refunded: { bg: 'bg-primary-50', fg: 'text-primary-800', dot: 'bg-primary-700' },
}

const COLUMNS = ['creditNote', 'supplier', 'against', 'why', 'status', 'credit'] as const

/**
 * Expenditure › Credit notes (E-15).
 *
 * **What the supplier credited us, and whether we have had it back yet.** A credit note reduces
 * what the tenant owes, so there is no due date and nothing outstanding — the question a row
 * answers is where the credit went, not when it must be paid.
 *
 * The search box, supplier filter and sort control the prototype drew are not here: the endpoint
 * filters by status and pages, and nothing else. Drawing controls the server cannot honour would
 * either lie or silently filter one page of results as though it were the whole set.
 */
export function SupplierCreditNotesPage() {
  // AppShell provides the session, so the body is a child of it — see PaymentRemindersPage.
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

  const tab: CreditTabId = isCreditTab(params.get('tab')) ? (params.get('tab') as CreditTabId) : DEFAULT_CREDIT_TAB
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

  const summary = useApiRead<CreditNoteSummaryDto>(CREDIT_NOTE_SUMMARY_PATH, loadCreditNoteSummary)
  const status = CREDIT_TABS.find((entry) => entry.id === tab)?.status ?? 'ALL'
  const listPath = creditNoteListPath(status, pageNumber - 1)
  const list = useApiRead<Page<CreditNoteRowDto>>(listPath, () => loadCreditNotePage(listPath))

  const page = list.read.status === 'ready' ? list.read.data : null
  const rows = page ? page.items.map(toCreditNoteItem) : []
  const totals = summary.read.status === 'ready' ? summary.read.data : null
  const count = (value: number) => formatCount(value, language)
  const money = (value: number, currency: string) => formatAmount(value, currency, language)

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[660px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('supplierCreditNotes.title')}</h1>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{t('supplierCreditNotes.subtitle')}</p>
        </div>
        <Link
          to="/expenditure/credit-notes/upload"
          className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white"
        >
          <img src={uploadIcon} alt="" className="size-6" />
          {t('supplierCreditNotes.upload.cta')}
        </Link>
      </div>

      {summary.read.status === 'failed' ? <ApiReadFailure error={summary.read.error} retry={summary.retry} /> : null}

      {totals ? (
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
                {money(totals.usableCredit, totals.currencyCode)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierCreditNotes.kpi.stillUsableMeta', { count: count(totals.usableCount) })}
            </p>
          </article>

          <article className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-pending-100">
                <img src={kpiCheckIcon} alt="" className="size-5" />
              </span>
              {/* The server scopes this to the quarter, so the card says so rather than reading
                  as an all-time total. */}
              <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('supplierCreditNotes.kpi.recoveredQuarter')}
              </h3>
            </div>
            <div className="flex items-center gap-1">
              <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" />
              <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary">
                {money(totals.recoveredThisQuarter, totals.currencyCode)}
              </p>
            </div>
            <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
              {t('supplierCreditNotes.kpi.recoveredMeta', { count: count(totals.recoveredThisQuarterCount) })}
            </p>
          </article>

          <article className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
            <div className="flex items-center gap-3.5">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-background">
                <img src={kpiHomeIcon} alt="" className="size-5" />
              </span>
              <h3 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('supplierCreditNotes.kpi.topSupplier')}
              </h3>
            </div>
            <p className="text-2xl font-semibold leading-[1.2] text-text-secondary">
              {totals.topSupplier?.supplierName ?? t('supplierCreditNotes.kpi.noTopSupplier')}
            </p>
            {totals.topSupplier ? (
              <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
                {t('supplierCreditNotes.kpi.topSupplierMeta', { count: count(totals.topSupplier.noteCount) })}
              </p>
            ) : null}
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

      <section className="rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
          {CREDIT_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === tab}
              onClick={() => update({ tab: entry.id === DEFAULT_CREDIT_TAB ? null : entry.id, page: null })}
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
              {t('supplierCreditNotes.empty')}
            </p>
          ) : (
            <RowsView className="px-6 pb-6">
              <table className="w-full min-w-[980px] border-collapse overflow-hidden rounded-sm text-start">
                <thead>
                  <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
                    {COLUMNS.map((key) => (
                      <th key={key} className="px-4 py-3 text-start font-semibold">
                        {t(`supplierCreditNotes.col.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((note) => (
                    <CreditRow key={note.id} note={note} language={language} />
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

function CreditRow({ note, language }: { note: CreditNoteItem; language: string }) {
  const { t } = useTranslation()
  const chip = CHIP[CREDIT_STATUS_CHIP[note.status]]
  const reason = reasonLabelKey(note.reasonCode)

  return (
    <tr className="border-b border-[#f3f3f3] last:border-b-0">
      <td className="px-4 py-4 align-top">
        <Link
          to={`/expenditure/credit-notes/${note.id}`}
          className="text-sm font-semibold leading-[1.2] text-primary-700 hover:underline"
        >
          {note.number ?? t('supplierCreditNotes.rows.unnumbered')}
        </Link>
        {note.issueDate ? (
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-quaternary">
            {t('supplierCreditNotes.rows.issued', { date: formatDate(note.issueDate, language) })}
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
        {note.againstBillId ? (
          <Link
            to={`/expenditure/bills/${note.againstBillId}`}
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
      </td>

      <td className="px-4 py-4 align-top">
        <p className="text-sm font-medium leading-[1.3] text-text-tertiary">
          {reason ? t(reason.key, { defaultValue: reason.fallback }) : t('supplierCreditNotes.rows.noReason')}
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
          {t(`supplierCreditNotes.state.${note.status}`)}
        </span>
      </td>

      <td className="px-4 py-4 align-top">
        <p className="text-base font-semibold leading-[1.2] text-text-secondary tabular-nums">
          {note.credited === null ? '—' : formatAmount(note.credited, note.currency, language)}
        </p>
        {note.usable && note.credited !== null && note.remaining !== note.credited ? (
          <p className="mt-1 text-xs font-medium leading-[1.2] text-text-tertiary">
            {t('supplierCreditNotes.rows.remaining', { amount: formatAmount(note.remaining, note.currency, language) })}
          </p>
        ) : null}
      </td>
    </tr>
  )
}
