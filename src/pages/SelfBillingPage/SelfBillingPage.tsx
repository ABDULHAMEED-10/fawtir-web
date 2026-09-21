import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import {
  invoiceListPath,
  loadInvoicePage,
  type InvoiceRowDto,
  type InvoiceTypeDto,
} from '../../api/invoices/list'
import { AGREEMENTS_PATH, loadAgreements, type AgreementDto } from '../../api/selfBilling/agreements'
import { INVOICE_TABS, isInvoiceTab, tabFilter, toInvoiceListItem, type InvoiceTabId } from '../../lib/invoiceList'
import { canIssueUnder } from '../../lib/selfBillingAgreements'
import { formatAmount, formatDate } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import chevronIcon from '../../assets/invoices/chevron.svg'

const PAGE_SIZE = 25

/**
 * The two document types self-billing produces — 389 and 261 — and both together.
 *
 * "Both" is one request, not two merged: the list binds `type` as a `Set<InvoiceType>`, so the
 * server pages the combined result. Merging two independently paged responses here would drop rows
 * at every page boundary.
 */
const KINDS: { id: 'all' | 'invoices' | 'creditNotes'; types: InvoiceTypeDto[] }[] = [
  { id: 'all', types: ['SELF_BILLED_INVOICE', 'SELF_BILLED_CREDIT_NOTE'] },
  { id: 'invoices', types: ['SELF_BILLED_INVOICE'] },
  { id: 'creditNotes', types: ['SELF_BILLED_CREDIT_NOTE'] },
]

const CHIP: Record<string, string> = {
  draft: 'bg-surface-background text-text-tertiary',
  issued: 'bg-success-100 text-success-700',
  cancelled: 'bg-danger-100 text-danger-700',
  discarded: 'bg-surface-background text-text-tertiary',
}

/**
 * Income › Self-billing — the documents this tenant has written on a seller's behalf (I-12).
 *
 * **These are not receivables.** The tenant is the buyer: it writes the invoice, and the document
 * records what the tenant *owes*. The list therefore says "seller" where the invoices list says
 * customer, and labels the amount as owed rather than due in.
 *
 * **Both types in one page.** `GET /authored-invoices` binds `type` as a `Set<InvoiceType>`, so
 * "All" is a single request the server pages, not two responses stitched together — stitching is
 * how rows go missing at a page boundary. The two types are still separately reachable, because a
 * self-billed credit note is a different document from the invoice it corrects.
 *
 * **No per-tab counts.** `/authored-invoices/summary` takes only a currency and counts every
 * document type, so any figure drawn from it would be the whole ledger's, not self-billing's. An
 * absent count beats a wrong one.
 *
 * **Drafting needs `selfbilling.create`**, which is a different right from drafting your own
 * invoice, so the button appears only for someone who holds it. What it cannot tell you is
 * whether the draft will ever ISSUE — the agreement decides that, and the banner says how many
 * sellers are currently issuable.
 */
export function SelfBillingPage() {
  return (
    <AppShell>
      <SelfBilled />
    </AppShell>
  )
}

function SelfBilled() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const mayRead = can(session, 'invoice.read')
  const [params, setParams] = useSearchParams()

  const kind = KINDS.find((entry) => entry.id === params.get('kind')) ?? KINDS[0]
  const tab: InvoiceTabId = isInvoiceTab(params.get('tab')) ? (params.get('tab') as InvoiceTabId) : 'all'
  const search = params.get('q') ?? ''
  const pageNumber = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const update = (changes: Record<string, string | null>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current)
        for (const [key, value] of Object.entries(changes)) {
          if (!value) next.delete(key)
          else next.set(key, value)
        }
        return next
      },
      { replace: true },
    )

  const { state, payment } = tabFilter(tab)
  const listPath = invoiceListPath({
    state,
    payment,
    type: kind.types,
    from: null,
    to: null,
    search,
    correctionOf: null,
    customerId: null,
    sort: 'ISSUED_NEWEST',
    page: pageNumber - 1,
    size: PAGE_SIZE,
  })
  const list = useApiRead<Page<InvoiceRowDto>>(mayRead ? listPath : null, () => loadInvoicePage(listPath))

  // Read only to answer "can I actually issue one of these", which is the question this page
  // raises and the agreements screen answers.
  const canManageAgreements = can(session, 'selfbilling.agreement.manage')
  const agreements = useApiRead<AgreementDto[]>(canManageAgreements ? AGREEMENTS_PATH : null, loadAgreements)
  const today = new Date().toISOString().slice(0, 10)
  const usable =
    agreements.read.status === 'ready' ? agreements.read.data.filter((row) => canIssueUnder(row, today)).length : null

  if (!mayRead) {
    return (
      <div className="mx-auto w-full max-w-[1144px]">
        <PermissionDeniedNotice />
      </div>
    )
  }

  const page = list.read.status === 'ready' ? list.read.data : null
  const rows = page ? page.items.map(toInvoiceListItem) : []

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-[660px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('selfBilling.title')}</h1>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{t('selfBilling.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/income/self-billing/agreements"
            className="inline-flex h-[46px] items-center gap-1 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
          >
            {t('selfBilling.agreements')}
            <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          </Link>
          {can(session, 'selfbilling.create') ? (
            <Link
              to="/income/self-billing/new"
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              {t('selfBilling.create')}
            </Link>
          ) : null}
        </div>
      </div>

      {/*
        Stated up front, because it is the difference between this page and every other Income
        screen, and because a self-billed invoice looks exactly like one the tenant is owed.
      */}
      <p className="rounded-md bg-primary-25 p-3 text-sm font-medium leading-[1.5] text-primary-800">
        {t('selfBilling.explainer')}
        {usable !== null ? ` ${t('selfBilling.usableAgreements', { count: usable })}` : ''}
      </p>

      <section className="rounded-md bg-surface-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-background px-5 py-3">
          <div className="flex flex-wrap items-center gap-1" role="tablist" aria-label={t('selfBilling.kindLabel')}>
            {KINDS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === kind.id}
                onClick={() => update({ kind: entry.id === 'all' ? null : entry.id, page: null })}
                className={[
                  'h-[38px] rounded-sm px-4 text-sm font-semibold transition-colors',
                  entry.id === kind.id
                    ? 'bg-primary-700 text-white'
                    : 'border border-border-subtle bg-white text-text-secondary hover:bg-primary-25',
                ].join(' ')}
              >
                {t(`selfBilling.kind.${entry.id}`)}
              </button>
            ))}
          </div>

          <input
            type="search"
            value={search}
            onChange={(event) => update({ q: event.target.value, page: null })}
            placeholder={t('selfBilling.searchPlaceholder')}
            aria-label={t('selfBilling.searchPlaceholder')}
            className="h-[38px] w-full max-w-[280px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 border-b border-surface-background px-5">
          {INVOICE_TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={entry.id === tab}
              onClick={() => update({ tab: entry.id === 'all' ? null : entry.id, page: null })}
              className={[
                'h-[48px] px-4 text-sm font-semibold transition-colors',
                entry.id === tab
                  ? 'border-b-2 border-primary-700 text-primary-800'
                  : 'border-b-2 border-transparent text-text-quaternary hover:text-text-secondary',
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
            <p className="p-10 text-center text-sm font-medium text-text-quaternary">
              {t(`selfBilling.empty.${kind.id}`)}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] table-fixed">
                <thead>
                  <tr className="border-b border-surface-background">
                    {(['number', 'seller', 'issued', 'owed', 'state'] as const).map((key) => (
                      <th
                        key={key}
                        scope="col"
                        className={[
                          'px-5 py-3 text-xs font-semibold uppercase tracking-wide text-text-quaternary',
                          key === 'owed' ? 'text-end' : 'text-start',
                        ].join(' ')}
                      >
                        {t(`selfBilling.col.${key}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-surface-background last:border-0">
                      <td className="px-5 py-4">
                        <Link to={`/invoices/${row.id}`} className="text-sm font-semibold text-primary-700 hover:underline">
                          {row.number ?? t('selfBilling.unnumbered')}
                        </Link>
                      </td>
                      <td className="truncate px-5 py-4 text-sm font-medium text-text-secondary">
                        {row.customer ?? t('selfBilling.unknownSeller')}
                      </td>
                      <td className="px-5 py-4 text-sm font-medium text-text-quaternary">
                        {row.issueDate ? formatDate(row.issueDate, language) : '—'}
                      </td>
                      <td className="px-5 py-4 text-end text-sm font-semibold text-text-primary">
                        {row.amount === null ? '—' : formatAmount(row.amount, row.currency, language)}
                        {row.estimated ? (
                          <span className="ms-1 text-xs font-medium text-text-quaternary">
                            {t('selfBilling.estimated')}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={[
                            'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
                            CHIP[row.authoring] ?? CHIP.draft,
                          ].join(' ')}
                        >
                          {t(`invoicesPage.authoring.${row.authoring}`)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {page && (pageNumber > 1 || page.hasMore) ? (
          <div className="flex items-center justify-between gap-3 border-t border-surface-background px-5 py-3">
            <button
              type="button"
              disabled={pageNumber <= 1}
              onClick={() => update({ page: String(pageNumber - 1) })}
              className="text-sm font-semibold text-primary-700 disabled:text-text-tertiary"
            >
              {t('common.previous')}
            </button>
            <span className="text-sm font-medium text-text-quaternary">
              {t('selfBilling.pageOf', { page: pageNumber })}
            </span>
            <button
              type="button"
              disabled={!page.hasMore}
              onClick={() => update({ page: String(pageNumber + 1) })}
              className="text-sm font-semibold text-primary-700 disabled:text-text-tertiary"
            >
              {t('common.next')}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
