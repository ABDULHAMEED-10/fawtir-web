import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Pager } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import { invoiceListPath, loadInvoicePage, type InvoiceListPayment, type InvoiceRowDto } from '../../api/invoices/list'
import type { NoteKind } from '../../api/invoices/drafts'
import { formatAmount, formatDate } from '../../lib/format'
import { NOTE_ROUTES } from '../../lib/salesNote'

type Tab = { id: string; state: string | null; payment: InvoiceListPayment | null }

/**
 * Only what the list API can answer (decision 2): a credit note has no refund or "applied" state
 * behind it, so its tabs are its authoring states; a debit note is a receivable, so its tabs follow
 * its payment.
 */
const TABS: Record<NoteKind, Tab[]> = {
  CREDIT_NOTE: [
    { id: 'all', state: 'DRAFT,ISSUED,CANCELLED', payment: null },
    { id: 'drafts', state: 'DRAFT', payment: null },
    { id: 'issued', state: 'ISSUED', payment: null },
    { id: 'cancelled', state: 'CANCELLED', payment: null },
  ],
  DEBIT_NOTE: [
    { id: 'all', state: 'DRAFT,ISSUED,CANCELLED', payment: null },
    { id: 'drafts', state: 'DRAFT', payment: null },
    { id: 'awaiting', state: null, payment: 'AWAITING' },
    { id: 'overdue', state: null, payment: 'OVERDUE' },
    { id: 'paid', state: null, payment: 'PAID' },
  ],
}

const PAGE_SIZE = 20

export function SalesNotesListPage({ kind }: { kind: NoteKind }) {
  return (
    <AppShell>
      <NotesList kind={kind} />
    </AppShell>
  )
}

function NotesList({ kind }: { kind: NoteKind }) {
  const { t, i18n } = useTranslation()
  const [tab, setTab] = useState(TABS[kind][0])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const kindKey = kind === 'CREDIT_NOTE' ? 'credit' : 'debit'
  const path = invoiceListPath({ state: tab.state, payment: tab.payment, type: kind, from: null, to: null, search, sort: 'UPDATED', page, size: PAGE_SIZE })
  const rows = useApiRead<Page<InvoiceRowDto>>(path, () => loadInvoicePage(path))
  const base = NOTE_ROUTES[kind]

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t(`salesNote.${kindKey}.list`)}</h1>
          <p className="mt-1 text-base font-medium text-text-quaternary">{t(`salesNote.${kindKey}.listNote`)}</p>
        </div>
        <Link to="/invoices" className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800">
          {t('salesNote.startFromInvoice')}
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle">
        <div role="tablist" className="flex flex-wrap items-center gap-1">
          {TABS[kind].map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={tab.id === entry.id}
              onClick={() => {
                setTab(entry)
                setPage(0)
              }}
              className={[
                '-mb-px border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors',
                tab.id === entry.id ? 'border-primary-700 text-primary-800' : 'border-transparent text-text-tertiary hover:text-text-secondary',
              ].join(' ')}
            >
              {t(`salesNote.tabs.${entry.id}`)}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setPage(0)
          }}
          placeholder={t('salesNote.search')}
          aria-label={t('salesNote.search')}
          className="mb-2 h-[40px] w-[240px] rounded-sm border border-border-subtle bg-white px-3 text-sm outline-none"
        />
      </div>

      {rows.read.status === 'loading' ? (
        <LoadingNotice />
      ) : rows.read.status === 'failed' ? (
        <ApiReadFailure error={rows.read.error} retry={rows.retry} />
      ) : rows.read.data.items.length === 0 ? (
        <p className="rounded-md bg-surface-card p-8 text-center text-sm font-medium text-text-tertiary">{t(`salesNote.${kindKey}.none`)}</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-md bg-surface-card">
            <table className="w-full min-w-[760px] border-collapse">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                  <th className="px-5 py-3 text-start font-semibold">{t('salesNote.col.number')}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t(`salesNote.${kindKey}.corrects`)}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t('salesNote.col.customer')}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t('salesNote.col.issued')}</th>
                  <th className="px-3 py-3 text-start font-semibold">{t('salesNote.col.state')}</th>
                  <th className="px-5 py-3 text-end font-semibold">{t('salesNote.col.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.read.data.items.map((row) => (
                  <tr key={row.id} className="border-t border-surface-background text-sm font-medium text-text-secondary">
                    <td className="px-5 py-3.5">
                      <Link to={`${base}/${row.id}`} className="font-semibold text-primary-700 hover:underline">
                        {row.invoiceNumber ?? t('salesNote.draft')}
                      </Link>
                    </td>
                    <td className="px-3 py-3.5">
                      {row.correctionOfInvoiceId ? (
                        <Link to={`/invoices/${row.correctionOfInvoiceId}`} className="hover:underline">
                          {row.correctionOfInvoiceNumber ?? '—'}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-3 py-3.5">{row.customerName ?? '—'}</td>
                    <td className="px-3 py-3.5">{row.issueDate ? formatDate(row.issueDate, i18n.language) : '—'}</td>
                    <td className="px-3 py-3.5">
                      {kind === 'DEBIT_NOTE' && row.payment && row.payment.state !== 'NOT_APPLICABLE'
                        ? t(row.payment.overdue ? 'salesNote.payment.OVERDUE' : `salesNote.payment.${row.payment.state}`)
                        : t(`salesNote.state.${row.authoringState}`)}
                    </td>
                    <td className="px-5 py-3.5 text-end font-semibold text-text-primary tabular-nums">
                      {row.totals ? `${formatAmount(row.totals.totalAmount, row.currency, i18n.language)} ${row.currency}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rows.read.data.total !== null && rows.read.data.total > PAGE_SIZE ? (
            <Pager
              page={page + 1}
              pageCount={Math.ceil(rows.read.data.total / PAGE_SIZE)}
              onChange={(next) => setPage(next - 1)}
              labels={{ nav: t('salesNote.pager.nav'), previous: t('salesNote.pager.previous'), next: t('salesNote.pager.next') }}
            />
          ) : null}
        </>
      )}
    </div>
  )
}
