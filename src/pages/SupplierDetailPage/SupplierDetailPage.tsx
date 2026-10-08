import { useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Popover } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { BillStatusChip } from '../../components/bills/BillStatusChip'
import { OverpaidBy } from '../../components/bills/OverpaidBy'
import { useApiRead } from '../../hooks'
import type { Page } from '../../api'
import { loadSupplier, supplierPath, type SupplierDetailDto } from '../../api/expenditure/suppliers'
import type { BillRowDto } from '../../api/expenditure/bills'
import { loadRuns, runsListPath, type PaymentRunDto } from '../../api/expenditure/paymentRuns'
import {
  downloadSupplierStatement,
  loadSupplierBills,
  loadSupplierContacts,
  loadSupplierDocuments,
  loadSupplierOverview,
  loadSupplierPurchases,
  supplierBillsPath,
  supplierContactsPath,
  supplierDocumentsPath,
  supplierOverviewPath,
  supplierPurchasesPath,
  type StatementFormat,
  type SupplierContactDto,
  type SupplierDocumentDto,
  type SupplierOverviewDto,
  type SupplierPurchaseDto,
} from '../../api/expenditure/supplierRecord'
import { dueNoteOf, toBillListItem } from '../../lib/billList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, initialsOf } from '../../lib/format'
import { muscatToday } from '../../lib/invoiceIssue'
import { addDays } from '../../lib/dates'
import { can, useSession } from '../../lib/session/session'
import {
  DETAIL_TABS,
  addressLine,
  bandsOf,
  earlySettlementNote,
  saveDownload,
  tabCount,
  termsNote,
  yearToDate,
  type DetailTabId,
  type Note,
} from '../../lib/supplierRecord'
import {
  bandNote,
  discountOn,
  documentLine,
  openRun,
  oweExplanation,
  purchasesSummary,
  rowAction,
  runOf,
  sinceLabel,
  whereNote,
} from '../../lib/supplierDetail'
import { AddToPaymentRunModal } from './AddToPaymentRunModal'
import {
  BillsTab,
  DocumentsTab,
  OrdersTab,
  PaymentsTab,
  SupplierContactsModal,
  SwitchSupplierModal,
  UploadDocumentModal,
} from './SupplierRecordParts'
import chevronIcon from '../../assets/invoices/chevron.svg'
import editIcon from '../../assets/actions/edit.svg'
import plusIcon from '../../assets/bill-capture/plus.svg'
import infoIcon from '../../assets/bill-capture/info.svg'
import omrRowIcon from '../../assets/invoices/omr-row.svg'
import peppolIcon from '../../assets/suppliers/chip-peppol.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import cardIcon from '../../assets/suppliers/kpi-owe.svg'
import matchIcon from '../../assets/suppliers/menu-order.svg'
import selfBillIcon from '../../assets/suppliers/menu-attach.svg'
import paperIcon from '../../assets/bill-capture/file.svg'
import shieldIcon from '../../assets/bill-detail/compliance.svg'
import menuStatementIcon from '../../assets/suppliers/menu-statement.svg'
import chevronDownIcon from '../../assets/create-invoice/chevron.svg'

const BAND_TONE: Record<string, string> = {
  notDue: 'bg-[#4c6c5a]',
  dueSoon: 'bg-[#6d5a39]',
  late: 'bg-warning-700',
  onHold: 'bg-border-default',
}

/** Inside the design's amber window: due today or within the next seven days. */
const dueSoon = (dueDate: string | null, today: string) =>
  dueDate !== null && dueDate >= today && dueDate <= addDays(today, 7)

const SMALL_BUTTON =
  'inline-flex h-[34px] items-center whitespace-nowrap rounded-sm border border-border-subtle bg-white px-3 text-xs font-semibold text-text-secondary transition-colors hover:bg-primary-25'
/** The frame prints the IBAN masked, "OM55 ··· 4471 2290": country and check digits, then the last eight. */
function maskIban(iban: string): string {
  const compact = iban.replace(/\s/g, '')
  if (compact.length <= 12) return compact
  const tail = compact.slice(-8)
  return `${compact.slice(0, 4)} ··· ${tail.slice(0, 4)} ${tail.slice(4)}`
}

const SIDE_BUTTON =
  'inline-flex h-[40px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25'

/**
 * `/suppliers/:slug` (Suppliers › Detail, Figma 163:26275); the list links by id. One shell
 * around loading and the record alike.
 *
 * The overview answers three questions in order: what do we owe them, what is that made of, and
 * is anything about the record going to stop a payment going out. Every figure is the server's;
 * every sentence under a figure is derived in `lib/supplierDetail.ts` from a field the API holds.
 */
export function SupplierDetailPage() {
  const { slug = '' } = useParams()
  return (
    <AppShell>
      <SupplierRecord key={slug} id={slug} />
    </AppShell>
  )
}

function SupplierRecord({ id }: { id: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManage = can(session, 'supplier.manage')
  const canPay = can(session, 'invoice.payment.manage')
  const canOrder = can(session, 'purchase-order.manage')
  // The Orders tab is the supplier's purchase orders (`purchase-order.read`), each a link to its
  // order. A Viewer or an Approver reads suppliers without that permission, so the tab, whose
  // only content the server would refuse them, is not drawn for them.
  const tabs = DETAIL_TABS.filter(
    (entry) => entry !== 'orders' || can(session, 'purchase-order.read'),
  )
  const today = muscatToday()
  const [tab, setTab] = useState<DetailTabId>('overview')
  const [notice, setNotice] = useState<Note | { body: string } | null>(null)
  const [switching, setSwitching] = useState(false)
  const [managingContacts, setManagingContacts] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [paying, setPaying] = useState(false)
  const [allPurchases, setAllPurchases] = useState(false)
  const [statementOpen, setStatementOpen] = useState(false)
  const statementRef = useRef<HTMLButtonElement>(null)

  const supplier = useApiRead<SupplierDetailDto>(supplierPath(id), () => loadSupplier(id))
  const overview = useApiRead<SupplierOverviewDto>(supplierOverviewPath(id), () =>
    loadSupplierOverview(id),
  )
  const contacts = useApiRead<SupplierContactDto[]>(supplierContactsPath(id), () =>
    loadSupplierContacts(id),
  )
  const documents = useApiRead<SupplierDocumentDto[]>(supplierDocumentsPath(id), () =>
    loadSupplierDocuments(id),
  )
  // The "Open bills" card: the five newest bills still owed, not the five newest documents.
  const recentBillsPath = supplierBillsPath(id, 0, 5, true)
  const recentBills = useApiRead<Page<BillRowDto>>(recentBillsPath, () =>
    loadSupplierBills(recentBillsPath),
  )
  const purchasesPath = supplierPurchasesPath(id, 12)
  const purchases = useApiRead<SupplierPurchaseDto[]>(purchasesPath, () =>
    loadSupplierPurchases(purchasesPath),
  )
  // The runs the open bills sit in, for "Open the run" and "paying 3 Aug"; only a payer may read them.
  const runsPath = runsListPath(null)
  const runs = useApiRead<PaymentRunDto[]>(canPay ? runsPath : null, () => loadRuns(runsPath))

  if (supplier.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        {supplier.read.status === 'loading' ? (
          <LoadingNotice />
        ) : (
          <ApiReadFailure error={supplier.read.error} retry={supplier.retry} />
        )}
      </div>
    )
  }

  const record = supplier.read.data
  const profile = record.profile
  const head = overview.read.status === 'ready' ? overview.read.data : null
  const latest = recentBills.read.status === 'ready' ? recentBills.read.data.items : []
  const runList = runs.read.status === 'ready' ? runs.read.data : []
  const currency = head?.payables.currencyCode ?? 'OMR'
  const money = (value: number) => formatAmount(value, currency, language)
  const day = (value: string | null) => (value ? formatDate(value, language) : '—')
  const text = (note: Note | null) =>
    note
      ? t(note.key, {
          ...note.values,
          ...(typeof note.values?.date === 'string' ? { date: day(note.values.date) } : {}),
        })
      : '—'
  const switchedOff = profile.status === 'SWITCHED_OFF'
  // The server refuses a switched-off supplier's bills in a payment run, so nothing that opens
  // the pay dialog is drawn for one. A run their bills already sit in can still be opened.
  const canPayThem = canPay && !switchedOff
  const complete = profile.health.length === 0
  const terms = termsNote(profile.paymentTerms)
  const run = openRun(latest, runList)

  const failed = (error: unknown) => {
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    setNotice({
      body: message.reference
        ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
        : body,
    })
  }

  const exportStatement = async (format: StatementFormat) => {
    setNotice(null)
    const { from, to } = yearToDate(today)
    try {
      saveDownload(
        await downloadSupplierStatement(id, format, from, to),
        `statement-${profile.displayName}.${format}`,
      )
    } catch (error) {
      failed(error)
    }
  }

  const afterDocuments = () => {
    documents.retry()
    overview.retry()
  }

  const identity = [
    profile.legalName && profile.legalName !== profile.displayName ? profile.legalName : null,
    profile.vatNumber
      ? t('supplierRecord.vat', { vat: profile.vatNumber })
      : t('supplierRecord.noVat'),
    terms
      ? profile.earlyPaymentDiscountPercent && profile.earlyPaymentDiscountDays
        ? t('supplierDetail.termsWithEarly', {
            terms: t(terms.key, terms.values),
            percent: profile.earlyPaymentDiscountPercent,
          })
        : t(terms.key, terms.values)
      : null,
    sinceLabel(profile.supplierSince, language)
      ? t('supplierRecord.since', { date: sinceLabel(profile.supplierSince, language) })
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/suppliers"
            className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-primary-700"
          >
            {t('suppliersPage.title')}
          </Link>
          <img src={chevronIcon} alt="" aria-hidden="true" className="size-5 rtl:rotate-180" />
          <h1 className="text-2xl font-medium leading-[1.2] text-text-primary">
            {profile.displayName}
          </h1>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2.5 max-md:shrink">
          {canManage ? (
            <Link
              to={`/suppliers/${id}/edit`}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              <img src={editIcon} alt="" className="size-5" />
              {t('supplierDetail.editSupplier')}
            </Link>
          ) : null}
          {/* Neither is offered for a switched-off supplier, nor to someone who may not do it. */}
          {canOrder && !switchedOff ? (
            <Link
              to={`/suppliers/${id}/purchase-order`}
              className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierDetail.newPurchaseOrder')}
            </Link>
          ) : null}
          {canPay && !switchedOff ? (
            <Link
              to={`/suppliers/${id}/record-bill`}
              className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
            >
              <img src={plusIcon} alt="" className="size-4 brightness-0 invert" />
              {t('supplierDetail.recordBill')}
            </Link>
          ) : null}
        </div>
      </div>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-surface-card p-5">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-lg font-semibold text-primary-800">
            {initialsOf(profile.displayName)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl font-medium leading-[1.2] text-text-primary">
                {profile.displayName}
              </h2>
              {profile.receivingChannel ? (
                <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-xs font-medium text-[#3d5648]">
                  {profile.receivingChannel === 'PEPPOL' ? (
                    <img src={peppolIcon} alt="" className="size-3" />
                  ) : null}
                  {t(`supplierRecord.channel.${profile.receivingChannel}`)}
                </span>
              ) : null}
              {profile.supplierCategory ? (
                <span className="inline-flex h-[26px] items-center rounded-full bg-primary-50 px-2.5 text-xs font-medium text-primary-800">
                  {profile.supplierCategory}
                </span>
              ) : null}
              {switchedOff ? (
                <span className="inline-flex h-[26px] items-center rounded-full bg-pending-100 px-2.5 text-xs font-medium text-pending-700">
                  {t('supplierRecord.switchedOff')}
                </span>
              ) : complete ? (
                <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-success-100 px-2.5 text-xs font-medium text-[#3d5648]">
                  <img src={tickIcon} alt="" className="size-3" />
                  {t('supplierDetail.recordComplete')}
                </span>
              ) : (
                <span className="inline-flex h-[26px] items-center rounded-full bg-pending-100 px-2.5 text-xs font-medium text-pending-700">
                  {t('supplierRecord.needsFix', { count: profile.health.length })}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm font-medium leading-[1.4] text-text-tertiary">
              {identity}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2.5 max-md:shrink max-md:flex-wrap">
          <button
            ref={statementRef}
            type="button"
            aria-haspopup="menu"
            aria-expanded={statementOpen}
            onClick={() => setStatementOpen((open) => !open)}
            className="inline-flex h-[42px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
          >
            {t('supplierDetail.statement')}
            <img src={chevronDownIcon} alt="" className="size-4 rotate-90" />
          </button>
          <Popover
            anchorRef={statementRef}
            open={statementOpen}
            onClose={() => setStatementOpen(false)}
            width={296}
            align="end"
          >
            <ul role="menu" className="py-1.5">
              {[
                {
                  id: 'open',
                  label: t('supplierRecord.statement.open'),
                  note: t('supplierRecord.statement.openNote'),
                  to: `/suppliers/${id}/statement`,
                },
                ...(['pdf', 'xlsx', 'csv'] as const).map((format) => ({
                  id: format,
                  label: t(`supplierRecord.statement.${format}`),
                  note: t('supplierRecord.statement.note'),
                  onSelect: () => void exportStatement(format),
                })),
              ].map((item) => {
                const body = (
                  <>
                    <img src={menuStatementIcon} alt="" className="mt-0.5 size-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-text-secondary">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block text-xs font-medium leading-[1.4] text-text-quaternary">
                        {item.note}
                      </span>
                    </span>
                  </>
                )
                const className =
                  'flex w-full items-start gap-3 px-4 py-2.5 text-start transition-colors hover:bg-primary-25'
                return (
                  <li key={item.id} role="none">
                    {'to' in item ? (
                      <Link role="menuitem" to={item.to} className={className}>
                        {body}
                      </Link>
                    ) : (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setStatementOpen(false)
                          item.onSelect()
                        }}
                        className={className}
                      >
                        {body}
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          </Popover>
          {/* Hidden for a switched-off supplier, as New purchase order and Record a bill are. */}
          {canPayThem ? (
            <button
              type="button"
              onClick={() => setPaying(true)}
              className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary transition-colors hover:bg-primary-25"
            >
              {t('supplierDetail.payThem')}
            </button>
          ) : null}
        </div>
      </section>

      {notice ? (
        <Notice
          body={'key' in notice ? t(notice.key, notice.values) : notice.body}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      <div
        role="tablist"
        className="flex flex-wrap items-center gap-1 border-b border-border-subtle"
      >
        {tabs.map((entry) => {
          const active = entry === tab
          const count = tabCount(entry, head)
          return (
            <button
              key={entry}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(entry)}
              className={[
                'inline-flex h-[46px] items-center gap-2 border-b-2 px-4 text-sm font-medium transition-colors',
                active
                  ? 'border-primary-700 text-primary-700'
                  : 'border-transparent text-text-quaternary hover:text-text-secondary',
              ].join(' ')}
            >
              {t(`supplierDetail.tabs.${entry}`)}
              {count !== null ? (
                <span className="rounded-sm bg-border-subtle px-1.5 py-0.5 text-[11px] font-semibold text-text-quaternary">
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {tab === 'bills' ? (
        <BillsTab supplierId={id} />
      ) : tab === 'payments' ? (
        <PaymentsTab supplierId={id} />
      ) : tab === 'orders' ? (
        <OrdersTab supplierId={id} />
      ) : tab === 'documents' ? (
        <DocumentsTab
          supplierId={id}
          documents={documents}
          onUpload={() => setUploading(true)}
          onChanged={afterDocuments}
          canManage={canManage}
        />
      ) : (
        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                  {t('supplierDetail.whatYouOwe')}
                </h3>
                {canPayThem ? (
                  <button
                    type="button"
                    onClick={() => setPaying(true)}
                    className="inline-flex h-[38px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                  >
                    {t('supplierDetail.addToPaymentRun')}
                  </button>
                ) : null}
              </div>
              {head === null ? (
                overview.read.status === 'failed' ? (
                  <ApiReadFailure error={overview.read.error} retry={overview.retry} />
                ) : (
                  <p className="mt-4 text-sm font-medium text-text-quaternary">
                    {t('appAccess.loading')}
                  </p>
                )
              ) : (
                <Bands overview={head} money={money} text={text} />
              )}
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                  {t('supplierDetail.openBills')}
                </h3>
                <button
                  type="button"
                  onClick={() => setTab('bills')}
                  className="text-sm font-semibold text-primary-700 hover:underline"
                >
                  {head
                    ? t('supplierDetail.seeAll', { count: head.tabs.bills })
                    : t('supplierRecord.seeAllBills')}
                </button>
              </div>
              {recentBills.read.status === 'ready' ? (
                latest.length === 0 ? (
                  <p className="mt-4 text-sm font-medium text-text-quaternary">
                    {t('suppliersPage.owedNote.nothingOpen')}
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[620px] border-collapse">
                      <thead>
                        <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary">
                          {(['bill', 'due', 'whereItIs', 'amount'] as const).map((key, index) => (
                            <th
                              key={key}
                              className={[
                                'pb-2.5 font-semibold',
                                index === 3 ? 'text-end' : 'text-start',
                              ].join(' ')}
                            >
                              {t(`supplierDetail.col.${key}`)}
                            </th>
                          ))}
                          <th className="pb-2.5" />
                        </tr>
                      </thead>
                      <tbody>
                        {latest.map((row) => {
                          const item = toBillListItem(row)
                          const due = dueNoteOf(item)
                          const billRun = runOf(row, runList)
                          const where = whereNote(row, billRun)
                          const discount = discountOn(row, profile, today)
                          const action = rowAction(row, billRun, canPayThem)
                          return (
                            <tr
                              key={row.id}
                              className="border-b border-surface-background last:border-0"
                            >
                              <td className="py-4 pe-4 align-top">
                                <Link
                                  to={`/expenditure/bills/${row.id}`}
                                  className="text-sm font-semibold text-primary-700 hover:underline"
                                >
                                  {row.supplierBillNumber ?? t('supplierRecord.unnumbered')}
                                </Link>
                                <p className="mt-1 text-xs font-medium text-text-quaternary">
                                  {[
                                    row.issueDate
                                      ? t('supplierDetail.arrived', { date: day(row.issueDate) })
                                      : null,
                                    row.match?.purchaseOrderNumber ?? row.purchaseOrderReference,
                                  ]
                                    .filter(Boolean)
                                    .join(' · ')}
                                </p>
                              </td>
                              <td className="py-4 pe-4 align-top">
                                <p className="text-sm font-medium text-text-secondary">
                                  {day(row.dueDate)}
                                </p>
                                {due ? (
                                  <p
                                    className={[
                                      'mt-1 text-xs font-medium',
                                      dueSoon(row.dueDate, today)
                                        ? 'text-warning-700'
                                        : 'text-text-quaternary',
                                    ].join(' ')}
                                  >
                                    {t(due.key, due.values)}
                                  </p>
                                ) : null}
                              </td>
                              <td className="py-4 pe-4 align-top">
                                <BillStatusChip
                                  item={item}
                                  className="h-[24px] px-2.5 py-0 text-xs"
                                />
                                {where ? (
                                  <p className="mt-1.5 max-w-[180px] text-xs font-medium leading-[1.4] text-text-quaternary">
                                    {text(where)}
                                  </p>
                                ) : null}
                              </td>
                              <td className="py-4 pe-4 align-top text-end">
                                <span className="flex items-center justify-end gap-1 text-sm font-semibold text-text-primary tabular-nums">
                                  <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                                  {money(row.totalIncludingVat ?? row.outstandingAmount)}
                                </span>
                                {discount ? (
                                  <p className="mt-1 whitespace-nowrap text-xs font-medium text-[#3d5648]">
                                    {t('supplierDetail.discountSaves', {
                                      rate: discount.percent,
                                      amount: money(discount.saves),
                                    })}
                                  </p>
                                ) : null}
                              </td>
                              <td className="py-4 align-top text-end">
                                {'pay' in action ? (
                                  <button
                                    type="button"
                                    onClick={() => setPaying(true)}
                                    className={SMALL_BUTTON}
                                  >
                                    {t(action.key)}
                                  </button>
                                ) : (
                                  <Link to={action.to} className={SMALL_BUTTON}>
                                    {t(action.key)}
                                  </Link>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              ) : recentBills.read.status === 'loading' ? (
                <p className="mt-4 text-sm font-medium text-text-quaternary">
                  {t('appAccess.loading')}
                </p>
              ) : (
                <ApiReadFailure error={recentBills.read.error} retry={recentBills.retry} />
              )}
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                    {t('supplierDetail.whatYouBuy')}
                  </h3>
                  <span className="text-xs font-medium text-text-quaternary">
                    {t('supplierDetail.lastTwelveMonths')}
                  </span>
                </div>
                {purchases.read.status === 'ready' && purchases.read.data.length > 4 ? (
                  <button
                    type="button"
                    onClick={() => setAllPurchases((open) => !open)}
                    className="text-sm font-semibold text-primary-700 hover:underline"
                  >
                    {allPurchases
                      ? t('supplierDetail.fewerLines')
                      : t('supplierDetail.fullBreakdown')}
                  </button>
                ) : null}
              </div>
              {purchases.read.status === 'ready' ? (
                purchases.read.data.length === 0 ? (
                  <p className="mt-4 text-sm font-medium text-text-quaternary">
                    {t('supplierRecord.noPurchases')}
                  </p>
                ) : (
                  <>
                    <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
                      {[...purchases.read.data]
                        .sort((a, b) => b.totalAmount - a.totalAmount)
                        .slice(0, allPurchases ? undefined : 4)
                        .map((line) => (
                          <div key={`${line.description}-${line.unit}`}>
                            <p className="text-sm font-medium leading-[1.3] text-text-secondary">
                              {line.description}
                            </p>
                            <p className="mt-1 flex items-baseline gap-2">
                              <span className="flex items-center gap-1 text-lg font-semibold leading-[1.2] text-text-primary tabular-nums">
                                <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                                {formatAmount(line.totalAmount, line.currencyCode, language)}
                              </span>
                              <span className="text-xs font-medium text-text-quaternary">
                                · {new Intl.NumberFormat(language).format(line.totalQuantity)}{' '}
                                {line.unit
                                  ? t(`reference.unitShort.${line.unit}`, {
                                      defaultValue: line.unit,
                                    })
                                  : ''}
                              </span>
                            </p>
                          </div>
                        ))}
                    </div>
                    {/* TODO(backend): the design's price-movement sentence ("Yirgacheffe went up from
                        7.100 to 7.400 per KG in March") has no field behind it (§7.2); the note says
                        what the twelve months add up to instead. */}
                    <p className="mt-5 flex items-start gap-2 rounded-sm bg-surface-background p-3.5 text-xs font-medium leading-[1.5] text-text-tertiary">
                      <img src={infoIcon} alt="" className="mt-px size-4 shrink-0" />
                      {t('supplierDetail.purchasesNote', {
                        count: purchasesSummary(purchases.read.data).bills,
                        amount: money(purchasesSummary(purchases.read.data).total),
                      })}
                    </p>
                  </>
                )
              ) : purchases.read.status === 'loading' ? (
                <p className="mt-4 text-sm font-medium text-text-quaternary">
                  {t('appAccess.loading')}
                </p>
              ) : (
                <ApiReadFailure error={purchases.read.error} retry={purchases.retry} />
              )}
            </section>

            <section className="rounded-md bg-surface-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
                  {t('supplierDetail.papersOnFile')}
                </h3>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => setUploading(true)}
                    className="inline-flex h-[38px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
                  >
                    {t('supplierDetail.attachDocument')}
                  </button>
                ) : null}
              </div>
              {documents.read.status === 'ready' ? (
                documents.read.data.length === 0 ? (
                  <p className="mt-4 text-sm font-medium text-text-quaternary">
                    {t('supplierRecord.noDocuments')}
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col">
                    {documents.read.data.slice(0, 4).map((entry) => {
                      const line = documentLine(entry)
                      return (
                        <li
                          key={entry.document.id}
                          className={[
                            'flex items-center gap-3 border-b border-surface-background py-3.5 last:border-0',
                            entry.standing === 'SUPERSEDED' ? 'opacity-60' : '',
                          ].join(' ')}
                        >
                          <span
                            className={[
                              'flex size-9 shrink-0 items-center justify-center rounded-sm',
                              entry.standing === 'ON_FILE' ? 'bg-success-100' : 'bg-primary-50',
                            ].join(' ')}
                          >
                            <img
                              src={entry.standing === 'ON_FILE' ? shieldIcon : paperIcon}
                              alt=""
                              className="size-[18px]"
                            />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                              {entry.document.title}
                              {entry.document.version !== null && entry.document.series ? (
                                <span className="font-medium text-text-quaternary">
                                  {' '}
                                  ·{' '}
                                  {t('supplierDetail.version', { number: entry.document.version })}
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                              {[text(line.note), line.remark].filter(Boolean).join(' · ')}
                            </p>
                          </div>
                          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                            {t(`supplierRecord.standing.${entry.standing}`)}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )
              ) : documents.read.status === 'loading' ? (
                <p className="mt-4 text-sm font-medium text-text-quaternary">
                  {t('appAccess.loading')}
                </p>
              ) : (
                <ApiReadFailure error={documents.read.error} retry={documents.retry} />
              )}
            </section>
          </div>

          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            {/* The frame fills this card grey (#d0d2d5); the page background made it invisible. */}
            <section className="rounded-md bg-[#d0d2d5] p-5">
              <p className="flex items-center gap-2 text-sm font-medium text-text-tertiary">
                <img src={cardIcon} alt="" className="size-[18px]" />
                {t('supplierDetail.youOweThem')}
              </p>
              <p className="mt-2.5 flex items-center gap-1.5 text-[28px] font-semibold leading-[1.2] text-text-primary tabular-nums">
                <img src={omrRowIcon} alt="" className="h-auto w-[22px] shrink-0" />
                {head ? money(head.payables.total) : '—'}
              </p>
              {head ? (
                <p className="mt-2.5 text-sm font-medium leading-[1.5] text-text-tertiary">
                  {text(oweExplanation(head, latest, runList))}
                </p>
              ) : null}
              {/* "Overpaid by" (owner's answer 13, 8 Oct 2026): what they still hold of what was
                  overpaid on their bills, beside what is owed and never netted against it. */}
              {head && (head.payables.overpaidTotal ?? 0) > 0 ? (
                <p className="mt-2.5 text-sm font-semibold leading-[1.5] text-text-primary">
                  <OverpaidBy amount={money(head.payables.overpaidTotal ?? 0)} />
                </p>
              ) : null}
              {canPay && head && head.payables.total > 0 ? (
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <Link
                    to={run ? `/expenditure/payments/${run.id}` : '/expenditure/payments'}
                    className={SIDE_BUTTON}
                  >
                    {t('supplierDetail.openTheRunAction')}
                  </Link>
                  {canPayThem ? (
                    <button type="button" onClick={() => setPaying(true)} className={SIDE_BUTTON}>
                      {t('supplierDetail.paySeparately')}
                    </button>
                  ) : null}
                </div>
              ) : null}
            </section>

            <SideCard title={t('supplierDetail.payingThem')}>
              <DetailRow label={t('supplierDetail.terms')} value={text(terms)} />
              <DetailRow
                label={t('supplierDetail.earlySettlement')}
                value={text(earlySettlementNote(profile))}
              />
              <DetailRow
                label={t('supplierDetail.bank')}
                value={profile.bankDetails?.bankName ?? '—'}
              />
              <DetailRow
                label={t('supplierDetail.iban')}
                value={profile.bankDetails?.iban ? maskIban(profile.bankDetails.iban) : '—'}
              />
              <DetailRow label={t('supplierDetail.bic')} value={profile.bankDetails?.bic ?? '—'} />
              <DetailRow
                label={t('supplierDetail.detailsLastChanged')}
                value={
                  profile.bankDetails?.changedAt
                    ? day(profile.bankDetails.changedAt.slice(0, 10))
                    : '—'
                }
                last
              />
              {profile.health.includes('BANK_CHANGED_UNCONFIRMED') ? (
                <p className="mt-2 rounded-sm bg-pending-100 p-3 text-xs font-medium leading-[1.4] text-pending-700">
                  {t('supplierRecord.bankUnconfirmed')}
                </p>
              ) : null}
            </SideCard>

            <SideCard title={t('supplierDetail.howTheyBillYou')}>
              <BillingRow
                icon={peppolIcon}
                title={
                  profile.participantId
                    ? t('supplierDetail.overPeppol')
                    : t('supplierRecord.notOnPeppol')
                }
                note={profile.participantId ?? undefined}
                value={
                  profile.receivingChannel === 'PEPPOL'
                    ? t('supplierDetail.always')
                    : profile.receivingChannel
                      ? t(`supplierRecord.channel.${profile.receivingChannel}`)
                      : '—'
                }
              />
              <BillingRow
                icon={matchIcon}
                title={t('supplierDetail.matchedToOrders')}
                note={
                  head && head.match.orderBacked > 0 && head.match.agreed === head.match.orderBacked
                    ? t('supplierDetail.matchedNote')
                    : t('supplierRecord.matchedNote')
                }
                value={
                  head && head.match.orderBacked > 0
                    ? t('supplierDetail.matchedOf', {
                        matched: head.match.agreed,
                        total: head.match.orderBacked,
                      })
                    : '—'
                }
              />
              <BillingRow
                icon={selfBillIcon}
                title={t('supplierDetail.selfBilling')}
                note={
                  profile.selfBillingAgreement
                    ? t('supplierDetail.selfBillingOnNote')
                    : t('supplierDetail.selfBillingNote')
                }
                value={
                  profile.selfBillingAgreement ? t('supplierRecord.on') : t('supplierDetail.off')
                }
                last
              />
            </SideCard>

            <SideCard
              title={t('supplierDetail.whoToSpeakTo')}
              action={
                canManage ? (
                  <button
                    type="button"
                    onClick={() => setManagingContacts(true)}
                    className="text-sm font-semibold text-primary-700 hover:underline"
                  >
                    {t('supplierRecord.contacts.manage')}
                  </button>
                ) : null
              }
            >
              {contacts.read.status === 'ready' ? (
                contacts.read.data.length === 0 ? (
                  <p className="py-3 text-sm font-medium text-text-quaternary">
                    {t('supplierRecord.contacts.none', { name: profile.contactPerson ?? '—' })}
                  </p>
                ) : (
                  contacts.read.data.map((contact) => (
                    <div
                      key={contact.id}
                      className="flex items-center gap-3 border-b border-surface-background py-3 last:border-0"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-800">
                        {initialsOf(contact.fullName)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                          {contact.fullName}
                        </p>
                        <p className="mt-0.5 truncate text-xs font-medium text-text-quaternary">
                          <bdi dir="ltr">
                            {contact.email ?? contact.telephone ?? contact.mobilePhone ?? ''}
                          </bdi>
                        </p>
                      </div>
                      <span className="shrink-0 rounded-sm bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-800">
                        {t(`supplierRecord.purpose.${contact.purpose}`)}
                      </span>
                    </div>
                  ))
                )
              ) : contacts.read.status === 'loading' ? (
                <p className="py-3 text-sm font-medium text-text-quaternary">
                  {t('appAccess.loading')}
                </p>
              ) : (
                <ApiReadFailure error={contacts.read.error} retry={contacts.retry} />
              )}
            </SideCard>

            <SideCard title={t('supplierDetail.record')}>
              <DetailRow
                label={t('supplierDetail.legalName')}
                value={profile.legalName ?? profile.displayName}
              />
              <DetailRow label={t('supplierDetail.vatNumber')} value={profile.vatNumber ?? '—'} />
              <DetailRow
                label={t('supplierDetail.crNumber')}
                value={profile.commercialRegistrationNumber ?? '—'}
              />
              <DetailRow
                label={t('supplierDetail.address')}
                value={addressLine(record.invoiceAddress) ?? '—'}
              />
              <DetailRow
                label={t('supplierDetail.supplierSince')}
                value={day(profile.supplierSince)}
              />
              {/* TODO(backend): who created the record is not on the supplier read (§7.3). */}
              <DetailRow label={t('supplierDetail.addedBy')} value="—" last />
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setSwitching(true)}
                  className="mt-4 inline-flex h-[42px] w-full items-center justify-center rounded-sm border border-border-subtle bg-white text-sm font-semibold text-text-secondary transition-colors hover:border-warning-700 hover:text-warning-700"
                >
                  {switchedOff ? t('supplierRecord.switchOn') : t('supplierDetail.switchOff')}
                </button>
              ) : null}
            </SideCard>
          </aside>
        </div>
      )}

      {switching ? (
        <SwitchSupplierModal
          supplierId={id}
          name={profile.displayName}
          to={switchedOff ? 'on' : 'off'}
          onClose={() => setSwitching(false)}
          onSwitched={(to) => {
            setSwitching(false)
            setNotice({
              key: to === 'off' ? 'supplierForm.done.switchedOff' : 'supplierForm.done.switchedOn',
            })
            supplier.retry()
          }}
        />
      ) : null}
      {managingContacts ? (
        <SupplierContactsModal
          supplierId={id}
          contacts={contacts.read.status === 'ready' ? contacts.read.data : []}
          onClose={() => setManagingContacts(false)}
          onChanged={contacts.retry}
        />
      ) : null}
      {paying ? (
        <AddToPaymentRunModal
          supplierId={id}
          supplierName={profile.displayName}
          currency={profile.defaultCurrency ?? 'OMR'}
          bankName={profile.bankDetails?.bankName ?? null}
          discountPercent={profile.earlyPaymentDiscountPercent}
          discountDays={profile.earlyPaymentDiscountDays}
          onClose={() => setPaying(false)}
        />
      ) : null}
      {uploading ? (
        <UploadDocumentModal
          supplierId={id}
          onClose={() => setUploading(false)}
          onUploaded={() => {
            setUploading(false)
            setNotice({ key: 'supplierRecord.documents.uploadedDone' })
            afterDocuments()
          }}
        />
      ) : null}
    </div>
  )
}

function Bands({
  overview,
  money,
  text,
}: {
  overview: SupplierOverviewDto
  money: (value: number) => string
  text: (note: Note | null) => string
}) {
  const { t } = useTranslation()
  const { bands, total } = bandsOf(overview)
  return (
    <>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-background">
        {total > 0
          ? bands
              .filter((band) => band.amount > 0)
              .map((band) => (
                <span
                  key={band.id}
                  className={BAND_TONE[band.id]}
                  style={{ width: `${(band.amount / total) * 100}%` }}
                />
              ))
          : null}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {bands.map((band) => (
          <div key={band.id} className="border-s-2 border-surface-background ps-3">
            <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-text-quaternary">
              {t(`supplierRecord.band.${band.id}`)}
            </p>
            {band.amount > 0 ? (
              <p className="mt-1.5 flex items-center gap-1 text-xl font-semibold leading-[1.2] text-text-primary tabular-nums">
                <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                {money(band.amount)}
              </p>
            ) : (
              <p className="mt-1.5 text-xl font-semibold leading-[1.2] text-text-quaternary">—</p>
            )}
            <p className="mt-1.5 text-xs font-medium leading-[1.3] text-text-quaternary">
              {text(bandNote(band, overview.payables.everLate))}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}

function SideCard({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold leading-[1.2] text-text-primary">{title}</h3>
        {action}
      </div>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function DetailRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      className={[
        'flex items-center justify-between gap-3 py-2.5',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <dt className="text-sm font-medium leading-[1.3] text-text-tertiary">{label}</dt>
      <dd className="min-w-0 truncate text-end text-sm font-semibold text-text-primary">{value}</dd>
    </div>
  )
}

function BillingRow({
  icon,
  title,
  note,
  value,
  last,
}: {
  icon: string
  title: string
  note?: string
  value: string
  last?: boolean
}) {
  return (
    <div
      className={[
        'flex items-start gap-3 py-3',
        last ? '' : 'border-b border-surface-background',
      ].join(' ')}
    >
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary-50">
        <img src={icon} alt="" className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-[1.3] text-text-primary">{title}</p>
        {note ? (
          <p className="mt-0.5 text-xs font-medium leading-[1.4] text-text-quaternary">{note}</p>
        ) : null}
      </div>
      <span className="shrink-0 text-xs font-medium text-text-tertiary">{value}</span>
    </div>
  )
}
