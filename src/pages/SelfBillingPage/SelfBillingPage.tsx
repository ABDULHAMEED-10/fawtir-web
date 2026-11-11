import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  FilterMenu,
  Modal,
  RialMark,
  RowsView,
  SortMenu,
  TableCheckbox,
  type ActionMenuItem,
} from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError, pageCountOf, type Page } from '../../api'
import {
  exportInvoices,
  invoiceListPath,
  invoiceSummaryPath,
  loadInvoicePage,
  loadInvoiceSummary,
  type InvoiceListFilter,
  type InvoiceRowDto,
  type InvoiceSummaryDto,
  type InvoiceTypeDto,
} from '../../api/invoices/list'
import { discardDraft } from '../../api/invoices/drafts'
import {
  AGREEMENTS_PATH,
  loadAgreements,
  type AgreementDto,
} from '../../api/selfBilling/agreements'
import {
  INVOICE_SORTS,
  isInvoiceSort,
  isInvoiceTab,
  tabFilter,
  toInvoiceListItem,
  type AuthoringChip,
  type InvoiceListItem,
  type InvoiceSortKey,
  type PaymentChip,
  type PeppolResponse,
} from '../../lib/invoiceList'
import {
  EXPIRING_WITHIN_DAYS,
  blockerOf,
  canIssueUnder,
  daysBetween,
  expiringSoon,
} from '../../lib/selfBillingAgreements'
import { calculateInvoice, projectInvoice } from '../../lib/invoiceMath'
import { describeApiFailure } from '../../lib/apiFailure'
import { muscatToday } from '../../lib/invoiceIssue'
import { formatAmount, formatCount, formatDate, minorUnitsOf } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import { usePlanIncludes } from '../../lib/planAccess'
import raisedIcon from '../../assets/self-billing/kpi-raised.svg'
import inputVatIcon from '../../assets/self-billing/kpi-input-vat.svg'
import awaitingIcon from '../../assets/self-billing/kpi-awaiting.svg'
import expiringIcon from '../../assets/self-billing/kpi-expiring.svg'
import agreementsIcon from '../../assets/self-billing/agreements.svg'
import omrIcon from '../../assets/invoices/omr.svg'
import exportIcon from '../../assets/invoices/export.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import searchIcon from '../../assets/invoices/search.svg'
import filterIcon from '../../assets/credit-notes/filter.svg'
import viewIcon from '../../assets/actions/view.svg'
import editIcon from '../../assets/actions/edit.svg'
import deleteIcon from '../../assets/actions/delete.svg'
import { LIST_PAGE_SIZES as PAGE_SIZES, ListPager } from './ListPager'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'

const DEFAULT_PAGE_SIZE = 6

/**
 * Where a draft reopens: a self-billed credit note in the credit-note composer it was written in
 * (D6), a self-billed invoice in the self-bill composer.
 */
const draftEditPath = (row: { id: string; type: InvoiceTypeDto }) =>
  row.type === 'SELF_BILLED_CREDIT_NOTE'
    ? `/expenditure/self-billing/credit-notes/${row.id}/edit`
    : `/expenditure/self-billing/${row.id}/edit`
/**
 * The cards' figures: self-billed invoices only (a self-billed credit note would otherwise reduce
 * "Raised this month"), in the rial the cards draw.
 */
const SUMMARY_TYPE: InvoiceTypeDto = 'SELF_BILLED_INVOICE'
const SUMMARY_CURRENCY = 'OMR'
const SEARCH_DELAY_MS = 300

const OUTLINE_BUTTON =
  'inline-flex h-[46px] items-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'

/**
 * The two document types self-billing produces (389 and 261) and both together.
 *
 * "Both" is one request, not two merged: the list binds `type` as a `Set<InvoiceType>`, so the
 * server pages the combined result. Merging two independently paged responses here would drop
 * rows at every page boundary.
 */
type KindId = 'all' | 'invoices' | 'creditNotes'
const KINDS: { id: KindId; types: InvoiceTypeDto[] }[] = [
  { id: 'all', types: ['SELF_BILLED_INVOICE', 'SELF_BILLED_CREDIT_NOTE'] },
  { id: 'invoices', types: ['SELF_BILLED_INVOICE'] },
  { id: 'creditNotes', types: ['SELF_BILLED_CREDIT_NOTE'] },
]

/**
 * The design's tabs (Figma 154:157643), in its order, over what the list can answer. "To send" is
 * issued documents not yet delivered by any means: the list's `delivery=TO_SEND`, the same filter
 * the invoices list uses. "Awaiting confirmation" is what is issued and not yet settled, the
 * nearest state the platform has. "Disputed" and "Confirmed" have no state at all (nothing records
 * a supplier's confirmation), so they ask for nothing and say so.
 */
type TabId = 'all' | 'drafts' | 'toSend' | 'awaiting' | 'disputed' | 'confirmed' | 'paid'
const TABS: { id: TabId; labelKey: string; danger?: boolean }[] = [
  { id: 'all', labelKey: 'selfBilling.tabs.all' },
  { id: 'drafts', labelKey: 'selfBilling.tabs.drafts' },
  { id: 'toSend', labelKey: 'selfBilling.tabs.toSend' },
  { id: 'awaiting', labelKey: 'selfBilling.tabs.awaiting' },
  { id: 'disputed', labelKey: 'selfBilling.tabs.disputed', danger: true },
  { id: 'confirmed', labelKey: 'selfBilling.tabs.confirmed' },
  { id: 'paid', labelKey: 'selfBilling.tabs.paid' },
]
const isTab = (value: string | null): value is TabId => TABS.some((tab) => tab.id === value)
/** The tabs no response can answer yet. */
const UNREPORTED_TABS: TabId[] = ['disputed', 'confirmed']

type Chip = { bg: string; dot: string; text: string }

const AUTHORING_STYLES: Record<AuthoringChip, Chip> = {
  draft: { bg: 'bg-neutral-25', dot: 'bg-text-quaternary', text: 'text-text-quaternary' },
  issued: { bg: 'bg-primary-25', dot: 'bg-primary-800', text: 'text-primary-800' },
  cancelled: { bg: 'bg-neutral-25', dot: 'bg-text-muted', text: 'text-text-muted' },
  discarded: { bg: 'bg-neutral-25', dot: 'bg-text-muted', text: 'text-text-muted' },
}

const PAYMENT_STYLES: Record<PaymentChip, Chip> = {
  overdue: { bg: 'bg-danger-100', dot: 'bg-danger-700', text: 'text-danger-700' },
  awaiting: { bg: 'bg-pending-100', dot: 'bg-pending-700', text: 'text-pending-700' },
  partial: { bg: 'bg-pending-100', dot: 'bg-pending-700', text: 'text-pending-700' },
  toSend: { bg: 'bg-primary-25', dot: 'bg-primary-900', text: 'text-primary-900' },
  paid: { bg: 'bg-success-100', dot: 'bg-success-700', text: 'text-success-700' },
  credited: { bg: 'bg-success-100', dot: 'bg-success-700', text: 'text-success-700' },
}

/** The PEPPOL/OTA column, as the design prints it: AB, AP or RE, spelled out in the tooltip. */
const DELIVERY_STYLES: Record<PeppolResponse | 'sentManually', Chip> = {
  AB: { bg: 'bg-warning-100', dot: 'bg-[#6d5a39]', text: 'text-[#6d5a39]' },
  AP: { bg: 'bg-success-100', dot: 'bg-success-700', text: 'text-success-700' },
  RE: { bg: 'bg-danger-100', dot: 'bg-danger-700', text: 'text-danger-700' },
  sentManually: { bg: 'bg-neutral-25', dot: 'bg-text-muted', text: 'text-text-tertiary' },
}
const DELIVERY_HINTS: Record<PeppolResponse, string> = {
  AB: 'invoicesPage.transmission.acknowledgedHint',
  AP: 'invoicesPage.transmission.acceptedHint',
  RE: 'invoicesPage.transmission.rejectedHint',
}

/** The note under the supplier's name: what the agreement on file permits today. */
type AgreementNote = {
  key: string
  values?: Record<string, string | number>
  tone: 'ok' | 'expiring' | 'missing'
}
const NOTE_TONE: Record<AgreementNote['tone'], string> = {
  ok: 'text-text-tertiary',
  expiring: 'text-pending-700',
  missing: 'text-danger-700',
}

type Translate = (key: string, values?: Record<string, unknown>) => string

function agreementNoteOf(
  agreement: AgreementDto | undefined,
  today: string,
  language: string,
): AgreementNote {
  if (!agreement) return { key: 'selfBilling.agreementNote.missing', tone: 'missing' }
  const blocker = blockerOf(agreement, today)
  if (blocker === 'unverified')
    return { key: 'selfBilling.agreementNote.unverified', tone: 'expiring' }
  if (blocker !== null) return { key: 'selfBilling.agreementNote.blocked', tone: 'missing' }
  if (agreement.effectiveTo === null)
    return { key: 'selfBilling.agreementNote.openEnded', tone: 'ok' }
  if (expiringSoon(agreement, today)) {
    return {
      key: 'selfBilling.agreementNote.expiresIn',
      values: { count: daysBetween(today, agreement.effectiveTo) },
      tone: 'expiring',
    }
  }
  return {
    key: 'selfBilling.agreementNote.validTo',
    values: { date: formatDate(agreement.effectiveTo, language) },
    tone: 'ok',
  }
}

/** The VAT the row's lines carry, through the same engine the composer uses; null without lines. */
function vatOf(row: InvoiceRowDto): number | null {
  if (row.lines.length === 0) return null
  const scale = minorUnitsOf(row.currency)
  const amounts = calculateInvoice(
    row.lines.map((line) => ({
      id: String(line.lineNumber),
      lineNumber: line.lineNumber,
      quantity: String(line.quantity),
      unitPrice: String(line.unitPrice),
      vatRate: String(line.taxRate),
      discountType: line.discountType,
      discountValue: String(line.discountValue),
    })),
    row.headerDiscount?.type ?? 'PERCENTAGE',
    String(row.headerDiscount?.value ?? 0),
  )
  return Number(projectInvoice(amounts, scale).vat) / 10 ** scale
}

function failureText(t: Translate, error: unknown): string {
  const message = describeApiFailure(error)
  const body = t(message.key, message.values)
  return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
}

/**
 * Income › Self-billing: the documents this tenant has written on a supplier's behalf (I-12),
 * drawn as Figma 13:35608 over the authored-invoices list.
 *
 * **These are not receivables.** The tenant is the buyer: it writes the invoice, and the document
 * records what the tenant *owes*. The subtitle says so, because a self-billed row looks exactly
 * like one the tenant is owed.
 *
 * **Both types in one page.** `GET /authored-invoices` binds `type` as a `Set<InvoiceType>`, so
 * "All" is a single request the server pages; the Document type filter narrows to one.
 *
 * **Cards from the summary.** `/authored-invoices/summary?type=SELF_BILLED_INVOICE` answers the
 * month's raised total and VAT and what still awaits the supplier (its Expenditure payable is not
 * settled), counted over the whole tenant rather than the page in view.
 *
 * **Drafting needs `selfbilling.create`**, a different right from drafting your own invoice. The
 * agreement decides whether a draft will ever ISSUE, and the row note under each supplier says so.
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
  // No new drafts while the subscription is read-only (ST-2, CA-3).
  const mayDraft = useSubscriptionAllows('CREATE_DRAFTS')
  const mayRead = can(session, 'invoice.read')
  const [params, setParams] = useSearchParams()
  // The Oman calendar day, as the composer and the agreements screen count it.
  const today = muscatToday()

  const kind = KINDS.find((entry) => entry.id === params.get('kind')) ?? KINDS[0]
  const tab: TabId = isTab(params.get('tab')) ? (params.get('tab') as TabId) : 'all'
  const sortKey: InvoiceSortKey = isInvoiceSort(params.get('sort'))
    ? (params.get('sort') as InvoiceSortKey)
    : 'issuedNewest'
  const query = params.get('q') ?? ''
  const sizeParam = Number(params.get('size'))
  const size = (PAGE_SIZES as readonly number[]).includes(sizeParam) ? sizeParam : DEFAULT_PAGE_SIZE
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

  const [typed, setTyped] = useState(query)
  useEffect(() => setTyped(query), [query])
  useEffect(() => {
    if (typed === query) return
    const timer = window.setTimeout(
      () => update({ q: typed.trim() || null, page: null }),
      SEARCH_DELAY_MS,
    )
    return () => window.clearTimeout(timer)
    // Armed by typing only; `update` reads the params when it runs, so nothing goes stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed])

  const unreported = UNREPORTED_TABS.includes(tab)
  const filter: InvoiceListFilter = {
    ...(tab === 'toSend'
      ? { state: 'ISSUED', delivery: 'TO_SEND' as const, payment: null }
      : isInvoiceTab(tab)
        ? tabFilter(tab)
        : tabFilter('all')),
    type: kind.types,
    from: null,
    to: null,
    search: query,
    correctionOf: null,
    customerId: null,
  }
  const listPath = invoiceListPath({
    ...filter,
    sort: INVOICE_SORTS.find((option) => option.value === sortKey)?.sort ?? 'ISSUED_NEWEST',
    page: pageNumber - 1,
    size,
  })
  const list = useApiRead<Page<InvoiceRowDto>>(mayRead && !unreported ? listPath : null, () =>
    loadInvoicePage(listPath),
  )
  const summaryPath = invoiceSummaryPath(SUMMARY_TYPE, SUMMARY_CURRENCY)
  const summary = useApiRead<InvoiceSummaryDto>(mayRead ? summaryPath : null, () =>
    loadInvoiceSummary(SUMMARY_TYPE, SUMMARY_CURRENCY),
  )

  // Read to answer "can I actually issue one of these", which is the question this page raises
  // and the agreements screen answers; the row note under each supplier is drawn from it.
  const canManageAgreements = can(session, 'selfbilling.agreement.manage')
  // A new self-billed draft needs a plan with self-billing (PL-8); drafts made before stay
  // editable and issuable, and everything made before stays listed.
  const selfBillingIncluded = usePlanIncludes('selfBilling')
  const agreements = useApiRead<AgreementDto[]>(
    canManageAgreements ? AGREEMENTS_PATH : null,
    loadAgreements,
  )
  const agreementRows = agreements.read.status === 'ready' ? agreements.read.data : null
  const agreementFor = useMemo(() => {
    const byCustomer = new Map<string, AgreementDto>()
    for (const row of agreementRows ?? []) {
      const current = byCustomer.get(row.customerId)
      if (!current || (current.status === 'WITHDRAWN' && row.status !== 'WITHDRAWN')) {
        byCustomer.set(row.customerId, row)
      }
    }
    return (customerId: string) => byCustomer.get(customerId)
  }, [agreementRows])
  const usable = agreementRows
    ? agreementRows.filter((row) => canIssueUnder(row, today)).length
    : null
  const expiring = agreementRows
    ? agreementRows.filter((row) => expiringSoon(row, today)).length
    : null

  const [notice, setNotice] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const onExport = async () => {
    setExporting(true)
    setNotice(null)
    try {
      const file = await exportInvoices(filter)
      const url = URL.createObjectURL(file.blob)
      const link = document.createElement('a')
      link.href = url
      link.download = file.filename ?? 'fawtir-self-billed.csv'
      link.click()
      URL.revokeObjectURL(url)
      if (file.truncated) setNotice(t('invoicesPage.exportTruncated'))
    } catch (error) {
      setNotice(failureText(t, error))
    } finally {
      setExporting(false)
    }
  }

  const [discarding, setDiscarding] = useState<InvoiceListItem | null>(null)
  const onDiscard = async () => {
    if (!discarding) return
    const target = discarding
    setDiscarding(null)
    try {
      await discardDraft(target.id, target.version)
      list.retry()
    } catch (error) {
      setNotice(
        error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION'
          ? t('invoicesPage.discardStale')
          : failureText(t, error),
      )
      list.retry()
    }
  }

  if (!mayRead) {
    return (
      <div className="mx-auto w-full max-w-[1144px]">
        <PermissionDeniedNotice />
      </div>
    )
  }

  const page = list.read.status === 'ready' ? list.read.data : null
  const count = (value: number) => formatCount(value, language)

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <div className="flex items-end justify-between gap-4 max-lg:flex-wrap">
        <div className="min-w-0 max-w-[620px] flex-1">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('selfBilling.title')}
          </h1>
          {/* Said up front: a self-billed row looks exactly like one the tenant is owed. */}
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('selfBilling.subtitle')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3 max-md:w-full">
          <Link to="/expenditure/self-billing/agreements" className={OUTLINE_BUTTON}>
            <img src={agreementsIcon} alt="" className="size-6" />
            {t('selfBilling.agreements')}
            {agreementRows ? (
              <span className="inline-flex h-[19px] min-w-[19px] items-center justify-center rounded-full bg-neutral-50 px-1 text-xs font-semibold text-text-tertiary">
                {count(agreementRows.length)}
              </span>
            ) : null}
          </Link>
          {can(session, 'invoice.export') ? (
            <button
              type="button"
              onClick={onExport}
              disabled={exporting}
              className={OUTLINE_BUTTON}
            >
              <img src={exportIcon} alt="" className="size-6 rotate-180" />
              {exporting ? t('invoicesPage.exporting') : t('selfBilling.export')}
            </button>
          ) : null}
          {mayDraft && can(session, 'selfbilling.create') && selfBillingIncluded ? (
            <Link
              to="/expenditure/self-billing/new"
              className="inline-flex h-[46px] items-center gap-1.5 rounded-sm bg-primary-700 py-2.5 ps-2.5 pe-4 text-base font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-6" />
              {t('selfBilling.create')}
            </Link>
          ) : null}
        </div>
      </div>

      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      <SelfBillingKpiCards
        page={page}
        summary={summary.read.status === 'ready' ? summary.read.data : null}
        usable={usable}
        expiring={expiring}
        agreementFor={agreementRows ? agreementFor : null}
        today={today}
      />

      <section className="overflow-hidden rounded-md bg-surface-card">
        <div
          role="tablist"
          aria-label={t('selfBilling.tabsLabel')}
          className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-border-subtle px-6 pt-4 max-md:gap-x-6"
        >
          {TABS.map((entry) => {
            const active = entry.id === tab
            // TODO(backend): no per-tab count is drawn yet (the cards' summary asks for invoices
            // only); the active tab shows the page total the list itself reports.
            const tally = active && page && page.total !== null ? page.total : null
            return (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => update({ tab: entry.id === 'all' ? null : entry.id, page: null })}
                className={[
                  'relative flex items-center gap-1 pb-3 text-base leading-[1.2] transition-colors',
                  active
                    ? 'font-semibold text-primary-800'
                    : 'font-medium text-text-quaternary hover:text-text-secondary',
                ].join(' ')}
              >
                {t(entry.labelKey)}
                {tally !== null ? (
                  <span
                    className={[
                      'inline-flex h-[18px] items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                      entry.danger && tally > 0
                        ? 'bg-danger-100 text-danger-700'
                        : 'bg-primary-25 text-primary-800',
                    ].join(' ')}
                  >
                    {count(tally)}
                  </span>
                ) : null}
                {active ? (
                  <span className="absolute inset-x-0 -bottom-px h-0.5 bg-primary-700" />
                ) : null}
              </button>
            )
          })}
        </div>

        {/* Search on the left; Filters and Sort together on the right, as the frame draws them. */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3.5">
          <label className="flex h-11 w-full max-w-[346px] items-center gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4 max-md:max-w-none max-md:basis-full">
            <img src={searchIcon} alt="" className="size-5 shrink-0" />
            <input
              type="search"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder={t('selfBilling.searchPlaceholder')}
              aria-label={t('selfBilling.searchPlaceholder')}
              maxLength={200}
              className="h-full w-full border-0 bg-transparent text-sm font-medium text-text-primary outline-none placeholder:text-text-placeholder"
            />
          </label>
          <div className="flex flex-wrap items-center gap-3">
            {/* The design's Filters: the one filter the list can answer is the document type. */}
            <FilterMenu
              label={t('selfBilling.filters')}
              icon={filterIcon}
              value={kind.id}
              defaultValue="all"
              onChange={(value) => update({ kind: value === 'all' ? null : value, page: null })}
              options={KINDS.map((entry) => ({
                value: entry.id,
                label: t(`selfBilling.kind.${entry.id}`),
              }))}
            />
            <SortMenu
              value={sortKey}
              options={INVOICE_SORTS.map((option) => ({
                value: option.value,
                labelKey: option.labelKey,
              }))}
              onChange={(value) =>
                update({ sort: value === 'issuedNewest' ? null : value, page: null })
              }
              label={t('selfBilling.sort')}
            />
          </div>
        </div>

        {unreported ? (
          // TODO(backend): no supplier-confirmation state, so these two tabs cannot be answered.
          <SelfBilledTable
            page={EMPTY_PAGE}
            emptyKey="selfBilling.empty.notReported"
            noteFor={() => null}
            onDiscard={setDiscarding}
          />
        ) : list.read.status === 'failed' ? (
          <div className="px-6 pb-5">
            <ApiReadFailure error={list.read.error} retry={list.retry} />
          </div>
        ) : list.read.status === 'loading' && page === null ? (
          <LoadingNotice />
        ) : (
          <SelfBilledTable
            page={page}
            emptyKey={`selfBilling.empty.${kind.id}`}
            noteFor={(customerId) =>
              agreementRows ? agreementNoteOf(agreementFor(customerId), today, language) : null
            }
            onDiscard={setDiscarding}
          />
        )}

        {page && page.items.length > 0 && !unreported ? (
          <ListPager
            size={size}
            onSize={(next) =>
              update({ size: next === DEFAULT_PAGE_SIZE ? null : String(next), page: null })
            }
            page={pageNumber}
            pageCount={pageCountOf(page)}
            onPage={(next) => update({ page: next === 1 ? null : String(next) })}
            labels={{
              showResult: t('selfBilling.showResult'),
              previous: t('selfBilling.prevPage'),
              next: t('selfBilling.nextPage'),
              nav: t('invoicesPage.pages'),
            }}
          />
        ) : null}
      </section>

      <Modal
        open={discarding !== null}
        onClose={() => setDiscarding(null)}
        title={t('invoiceDraft.discardTitle')}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDiscarding(null)}
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={onDiscard}
              className="inline-flex h-11 items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white"
            >
              {t('invoiceDraft.discardConfirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t('invoiceDraft.discardBody')}
        </p>
      </Modal>
    </div>
  )
}

/** A page with nothing on it, for the tabs no response can answer. */
const EMPTY_PAGE: Page<InvoiceRowDto> = {
  items: [],
  page: 0,
  size: 6,
  total: 0,
  hasMore: false,
  truncated: false,
}

/**
 * The design's four cards (Raised this month, Input VAT claimed, Awaiting supplier, Agreements
 * expiring). The first three are the summary's (`issuedThisMonth`, `awaitingSupplier`); the
 * fourth counts the agreements that end within 30 days.
 */
function SelfBillingKpiCards({
  page,
  summary,
  usable,
  expiring,
  agreementFor,
  today,
}: {
  page: Page<InvoiceRowDto> | null
  /** Null while loading, or when it could not be read: the figures then read "—". */
  summary: InvoiceSummaryDto | null
  usable: number | null
  expiring: number | null
  /** Null while the agreements are unknown (not loaded, or not permitted). */
  agreementFor: ((customerId: string) => AgreementDto | undefined) | null
  today: string
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const rows = page?.items ?? []
  const currency = summary?.currencyCode ?? SUMMARY_CURRENCY
  const issued = rows.filter((row) => row.authoringState === 'ISSUED')
  const thisMonth = summary?.issuedThisMonth ?? null
  const awaiting = summary?.awaitingSupplier ?? null
  const oldest = awaiting?.oldestIssueDate ?? null
  const ending = agreementFor
    ? issued
        .map((row) => ({ row, agreement: agreementFor(row.customerId) }))
        .filter(
          (entry): entry is { row: InvoiceRowDto; agreement: AgreementDto } =>
            entry.agreement !== undefined && expiringSoon(entry.agreement, today),
        )
        .sort((a, b) => a.agreement.effectiveTo!.localeCompare(b.agreement.effectiveTo!))
    : []
  const first = ending[0]
  const money = (value: number) => formatAmount(value, currency, language)
  const count = (value: number) => formatCount(value, language)

  const cards = [
    {
      id: 'raised',
      icon: raisedIcon,
      titleKey: 'selfBilling.kpi.raised',
      figure: thisMonth ? money(thisMonth.total) : '—',
      currency: true,
      meta: t('selfBilling.kpi.raisedMeta', { count: thisMonth?.count ?? 0 }),
      danger: false,
    },
    {
      id: 'inputVat',
      icon: inputVatIcon,
      titleKey: 'selfBilling.kpi.inputVat',
      figure: thisMonth ? money(thisMonth.vat) : '—',
      currency: true,
      meta: t('selfBilling.kpi.inputVatMeta'),
      danger: false,
    },
    {
      id: 'awaiting',
      icon: awaitingIcon,
      titleKey: 'selfBilling.kpi.awaiting',
      figure: awaiting ? count(awaiting.count) : '—',
      currency: false,
      meta: oldest
        ? t('selfBilling.kpi.awaitingMeta', { count: daysBetween(oldest, today) })
        : t('selfBilling.kpi.awaitingNone'),
      danger: false,
    },
    {
      id: 'expiring',
      icon: expiringIcon,
      titleKey: 'selfBilling.kpi.expiring',
      figure: expiring === null ? '—' : count(expiring),
      currency: false,
      meta: first
        ? daysBetween(today, first.agreement.effectiveTo!) === 0
          ? t('selfBilling.kpi.expiringToday', { supplier: first.row.customerName })
          : t('selfBilling.kpi.expiringNamed', {
              supplier: first.row.customerName,
              count: daysBetween(today, first.agreement.effectiveTo!),
            })
        : usable === null || (expiring ?? 0) > 0
          ? t('selfBilling.kpi.expiringMeta', { count: EXPIRING_WITHIN_DAYS })
          : t('selfBilling.usableAgreements', { count: usable }),
      danger: usable === 0 || (expiring ?? 0) > 0,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((kpi) => (
        <article key={kpi.id} className="flex flex-col gap-2.5 rounded-md bg-surface-card p-5">
          <div className="flex items-center gap-3.5">
            <img src={kpi.icon} alt="" className="size-11 shrink-0" />
            <h3 className="text-xl font-medium leading-[1.2] text-text-secondary max-xl:text-lg min-[1360px]:whitespace-nowrap">
              {t(kpi.titleKey)}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {kpi.currency ? <img src={omrIcon} alt="" className="h-auto w-8 shrink-0" /> : null}
            <p className="text-[32px] font-semibold leading-[1.2] text-text-secondary tabular-nums">
              {kpi.figure}
            </p>
          </div>
          <p
            className={[
              'text-sm font-medium leading-[1.2]',
              kpi.danger ? 'text-danger-700' : 'text-text-tertiary',
            ].join(' ')}
          >
            {kpi.meta}
          </p>
        </article>
      ))}
    </div>
  )
}

function SelfBilledTable({
  page,
  emptyKey,
  noteFor,
  onDiscard,
}: {
  page: Page<InvoiceRowDto> | null
  emptyKey: string
  /** Null while the agreements are unknown (not loaded, or not permitted). */
  noteFor: (customerId: string) => AgreementNote | null
  onDiscard: (item: InvoiceListItem) => void
}) {
  const { t } = useTranslation()
  const session = useSession()
  const navigate = useNavigate()
  const rows = useMemo(() => (page ? page.items.map(toInvoiceListItem) : []), [page])
  // The list item carries the seller's name only; the id joins the agreement.
  const byRow = useMemo(
    () =>
      new Map(
        (page?.items ?? []).map((row) => [row.id, { customerId: row.customerId, vat: vatOf(row) }]),
      ),
    [page],
  )
  const [selected, setSelected] = useState<string[]>([])
  const allOnPageSelected = rows.length > 0 && rows.every((row) => selected.includes(row.id))
  const someOnPageSelected = !allOnPageSelected && rows.some((row) => selected.includes(row.id))
  const canDraft = can(session, 'selfbilling.create')

  const menuFor = (row: InvoiceListItem): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [
      {
        id: 'view',
        labelKey: 'rowActions.selfBill.view',
        icon: viewIcon,
        to: `/expenditure/self-billing/${row.id}`,
      },
    ]
    if (row.isDraft && canDraft) {
      items.push({
        id: 'edit',
        labelKey: 'rowActions.selfBill.edit',
        icon: editIcon,
        to: draftEditPath(row),
      })
      items.push({
        id: 'delete',
        labelKey: 'rowActions.delete',
        icon: deleteIcon,
        danger: true,
        onSelect: () => onDiscard(row),
      })
    }
    return items
  }

  return (
    <RowsView>
      <table className="w-full min-w-[1040px] border-collapse text-start">
        <thead>
          <tr className="bg-text-secondary text-xs font-semibold uppercase leading-[1.5] text-white">
            <th className="w-10 px-5 py-2.5">
              <TableCheckbox
                checked={allOnPageSelected}
                indeterminate={someOnPageSelected}
                disabled={rows.length === 0}
                onChange={() =>
                  setSelected((current) =>
                    allOnPageSelected
                      ? current.filter((id) => !rows.some((row) => row.id === id))
                      : [...new Set([...current, ...rows.map((row) => row.id)])],
                  )
                }
                ariaLabel={t('selfBilling.selectAll')}
              />
            </th>
            {(
              ['document', 'supplier', 'issued', 'due', 'amount', 'status', 'transmission'] as const
            ).map((key) => (
              <th key={key} scope="col" className="px-2 py-2.5 text-start font-semibold">
                {t(`selfBilling.col.${key}`)}
              </th>
            ))}
            <th className="w-12 px-2 py-2.5" />
          </tr>
        </thead>
        <tbody>
          {page === null ? (
            <tr>
              <td
                colSpan={9}
                role="status"
                className="py-12 text-center text-sm font-medium text-text-quaternary"
              >
                {t('appAccess.loading')}
              </td>
            </tr>
          ) : rows.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                className="py-12 text-center text-sm font-medium text-text-quaternary"
              >
                {t(emptyKey)}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const editable = row.isDraft && canDraft
              return (
                <tr
                  key={row.id}
                  className="cursor-pointer border-b border-[#f3f3f3] last:border-b-0 hover:bg-primary-25/60"
                  onClick={() =>
                    navigate(editable ? draftEditPath(row) : `/expenditure/self-billing/${row.id}`)
                  }
                >
                  <td className="px-5 py-2.5" onClick={(event) => event.stopPropagation()}>
                    <TableCheckbox
                      checked={selected.includes(row.id)}
                      onChange={() =>
                        setSelected((current) =>
                          current.includes(row.id)
                            ? current.filter((id) => id !== row.id)
                            : [...current, row.id],
                        )
                      }
                      ariaLabel={t('selfBilling.selectRow', {
                        id: row.number ?? t('selfBilling.unnumbered'),
                      })}
                    />
                  </td>
                  <SelfBilledRowCells
                    row={row}
                    to={editable ? draftEditPath(row) : `/expenditure/self-billing/${row.id}`}
                    vat={byRow.get(row.id)?.vat ?? null}
                    note={noteFor(byRow.get(row.id)?.customerId ?? '')}
                  />
                  <td className="px-2 py-2.5" onClick={(event) => event.stopPropagation()}>
                    <ActionMenu items={menuFor(row)} label={t('selfBilling.rowMenu')} floating />
                  </td>
                </tr>
              )
            })
          )}
        </tbody>
      </table>
    </RowsView>
  )
}

function StatusChip({ chip, label, title }: { chip: Chip; label: string; title?: string }) {
  return (
    <span
      title={title}
      className={[
        'inline-flex items-center gap-2 rounded-full px-3 py-[5px] text-sm font-medium leading-[1.5]',
        chip.bg,
        chip.text,
      ].join(' ')}
    >
      <span className={['size-1.5 shrink-0 rounded-full', chip.dot].join(' ')} />
      {label}
    </span>
  )
}

function SelfBilledRowCells({
  row,
  to,
  vat,
  note,
}: {
  row: InvoiceListItem
  /** Where the number goes: the row's own destination (a draft opens its editor). */
  to: string
  vat: number | null
  note: AgreementNote | null
}) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  // One pill, as the design draws it. TODO(backend): an issued, unsettled document reads as the
  // frame's "Awaiting confirmation" (no confirmation state exists); how late it is goes under the
  // amount, as drawn. Paid and to-be-sent are the platform's own words.
  const status =
    row.payment && row.authoring === 'issued'
      ? {
          chip:
            row.payment === 'paid' || row.payment === 'credited' || row.payment === 'toSend'
              ? PAYMENT_STYLES[row.payment]
              : PAYMENT_STYLES.awaiting,
          label:
            row.payment === 'paid' || row.payment === 'credited' || row.payment === 'toSend'
              ? t(`invoicesPage.payment.${row.payment}`)
              : t('selfBilling.status.awaitingConfirmation'),
          title:
            row.payment === 'overdue'
              ? t('invoicesPage.payment.overdueDays', { count: row.paymentValues?.count ?? 0 })
              : undefined,
        }
      : {
          chip: AUTHORING_STYLES[row.authoring],
          label: t(`invoicesPage.authoring.${row.authoring}`),
          title: undefined,
        }
  // TODO(backend): no Peppol response is answered yet (list.ts `peppolResponse`); a manual send
  // is the one delivery fact recorded, and an undelivered document leaves the column blank.
  const delivery = row.peppolResponse
    ? {
        chip: DELIVERY_STYLES[row.peppolResponse],
        label: row.peppolResponse,
        title: t(DELIVERY_HINTS[row.peppolResponse]),
      }
    : row.sentManually
      ? {
          chip: DELIVERY_STYLES.sentManually,
          label: t('invoicesPage.delivery.sentManually'),
          title: undefined,
        }
      : null
  // Under the amount: how late it is, else the VAT the lines carry (the input VAT to reclaim).
  const amountNote =
    row.payment === 'overdue'
      ? t('invoicesPage.payment.overdueDays', { count: row.paymentValues?.count ?? 0 })
      : vat !== null
        ? t('selfBilling.vatNote', { amount: formatAmount(vat, row.currency, language) })
        : null

  return (
    <>
      <td className="px-2 py-2.5">
        <Link
          to={to}
          onClick={(event) => event.stopPropagation()}
          className="text-sm font-semibold text-text-quaternary hover:underline"
        >
          {row.number ?? t('selfBilling.unnumbered')}
        </Link>
        {row.type === 'SELF_BILLED_CREDIT_NOTE' ? (
          <span className="mt-0.5 block w-fit rounded-sm bg-neutral-25 px-2 py-0.5 text-xs font-semibold text-text-secondary">
            {t('invoicesPage.docType.SELF_BILLED_CREDIT_NOTE')}
          </span>
        ) : null}
      </td>
      <td className="px-2 py-2.5">
        <p className="text-sm font-semibold leading-[1.2] text-text-primary">
          {row.customer ?? t('selfBilling.unknownSeller')}
        </p>
        {note ? (
          <p className={['mt-1 text-xs font-medium leading-[1.2]', NOTE_TONE[note.tone]].join(' ')}>
            {t(note.key, note.values)}
          </p>
        ) : null}
      </td>
      <td className="px-2 py-2.5 text-sm font-medium whitespace-nowrap text-text-tertiary">
        {row.issueDate ? formatDate(row.issueDate, language) : '—'}
      </td>
      <td className="px-2 py-2.5 text-sm font-medium whitespace-nowrap text-text-tertiary">
        {row.dueDate ? formatDate(row.dueDate, language) : '—'}
      </td>
      <td className="px-2 py-2.5">
        {row.amount !== null ? (
          <span
            className="inline-flex items-center gap-1"
            title={row.estimated ? t('invoicesPage.amountNote.estimate') : undefined}
          >
            <RialMark className="w-6 shrink-0 text-text-secondary" />
            <span className="text-base font-semibold leading-[1.2] text-text-secondary tabular-nums">
              {formatAmount(row.amount, row.currency, language)}
            </span>
            {row.estimated ? (
              <span className="text-xs font-medium text-text-quaternary">
                {t('selfBilling.estimated')}
              </span>
            ) : null}
          </span>
        ) : (
          <span className="text-base font-medium text-text-muted">—</span>
        )}
        {amountNote ? (
          <p
            className={[
              'mt-1 text-xs font-semibold leading-[1.2]',
              row.payment === 'overdue' ? 'text-danger-700' : 'text-text-muted',
            ].join(' ')}
          >
            {amountNote}
          </p>
        ) : null}
      </td>
      <td className="px-2 py-2.5">
        <StatusChip chip={status.chip} label={status.label} title={status.title} />
      </td>
      <td className="px-2 py-2.5">
        {delivery ? (
          <StatusChip chip={delivery.chip} label={delivery.label} title={delivery.title} />
        ) : (
          <span className="text-sm font-medium text-text-muted">—</span>
        )}
      </td>
    </>
  )
}
