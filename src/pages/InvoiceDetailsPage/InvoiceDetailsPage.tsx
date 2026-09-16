import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Modal, OmAmount, RowsView } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError } from '../../api'
import {
  cancelInvoice,
  downloadAttachment,
  newPaymentKey,
  reversePayment,
  invoicePath,
  loadAttachments,
  loadHistory,
  loadInternalNote,
  loadInvoice,
  loadPayments,
  loadReceivable,
  type InvoiceAttachmentDto,
  type InvoiceDetailDto,
  type InvoiceHistoryDto,
  type InvoicePaymentDto,
  type InvoiceReceivableDto,
} from '../../api/invoices/detail'
import { loadBranches, type BranchDto } from '../../api/invoices/drafts'
import { loadCustomer, type CustomerDto } from '../../api/customers/customers'
import { RecordPaymentModal } from './RecordPaymentModal'
import { IssueInvoiceModal } from '../../components/invoice/IssueInvoiceModal'
import { dueDateFor, muscatToday } from '../../lib/invoiceIssue'
import {
  PAYMENT_REFUSALS,
  dueNote,
  isDraft,
  lineTotals,
  paidPercent,
  paymentRows,
  statusOf,
  timelineOf,
  type Note as ViewNote,
} from '../../lib/invoiceDetail'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate, formatInstant } from '../../lib/format'
import { formatFileSize } from '../../lib/files'
import { can, useSession } from '../../lib/session/session'
import backIcon from '../../assets/invoice-details/back.svg'
import creditNoteIcon from '../../assets/invoice-details/credit-note.svg'
import clockIcon from '../../assets/invoice-details/clock.svg'
import chevronIcon from '../../assets/invoice-details/chevron.svg'
import downloadIcon from '../../assets/invoice-details/download.svg'
import editIcon from '../../assets/actions/edit.svg'
import timelineCurrentIcon from '../../assets/invoice-details/timeline-check.svg'

type Tone = ReturnType<typeof statusOf>['tone']

/** The same palette the invoices list uses for its chips, so one document reads the same twice. */
const STATUS_TONES: Record<Tone, string> = {
  draft: 'border-black/[0.06] bg-neutral-25 text-text-quaternary',
  issued: 'border-primary-75 bg-primary-25 text-primary-800',
  cancelled: 'border-black/[0.06] bg-neutral-25 text-text-muted',
  awaiting: 'border-[#e7e3da] bg-warning-100 text-[#6d5a39]',
  partial: 'border-[#e7e3da] bg-warning-100 text-[#6d5a39]',
  overdue: 'border-danger-100 bg-danger-100 text-danger-700',
  paid: 'border-success-100 bg-success-100 text-success-700',
}

type Translate = (key: string, values?: Record<string, unknown>) => string

function SectionCard({
  title,
  action,
  children,
  className = '',
}: {
  title: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={['rounded-sm bg-surface-card p-4', className].filter(Boolean).join(' ')}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
        {action}
      </div>
      <div className="mb-3 h-px w-full bg-border-subtle" />
      {children}
    </section>
  )
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="text-xs font-medium leading-[1.2] text-[#727579]">{label}</p>
      <p className="text-sm font-medium leading-[1.2] text-text-primary">{value}</p>
    </div>
  )
}

const GHOST_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'

export function InvoiceDetailsPage() {
  return (
    <AppShell>
      <InvoiceScreen />
    </AppShell>
  )
}

function InvoiceScreen() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const { id = '' } = useParams()

  const invoice = useApiRead<InvoiceDetailDto>(invoicePath(id), () => loadInvoice(id))
  const document = invoice.read.status === 'ready' ? invoice.read.data : null

  // Five reads behind three permissions: each is asked for only when this reader may have it, and
  // only when the document it belongs to exists.
  const receivable = useApiRead<InvoiceReceivableDto>(
    document ? `${invoicePath(id)}/receivable` : null,
    () => loadReceivable(id),
  )
  const payments = useApiRead<InvoicePaymentDto[]>(
    document && !isDraft(document) ? `${invoicePath(id)}/payments` : null,
    () => loadPayments(id),
  )
  const attachments = useApiRead<InvoiceAttachmentDto[]>(
    document ? `${invoicePath(id)}/attachments` : null,
    () => loadAttachments(id),
  )
  const history = useApiRead<InvoiceHistoryDto>(document ? `${invoicePath(id)}/history` : null, () => loadHistory(id))
  // Reading the internal note writes an audit event on the server. Loading it with the page made
  // every visit a "note read" — the trail filled with reads nobody made — so it is fetched only
  // when someone asks to see it.
  const [noteWanted, setNoteWanted] = useState(false)
  const internalNote = useApiRead<{ internalNote: string | null }>(
    document && noteWanted && can(session, 'invoice.internal-note.read') ? `${invoicePath(id)}/internal-note` : null,
    () => loadInternalNote(id),
  )
  // The read is the audit event, so the timeline is refreshed once it has happened, not before.
  const noteRead = internalNote.read.status === 'ready'
  useEffect(() => {
    if (noteRead) history.retry()
    // Armed by the read landing only: `retry` is a new function each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteRead])
  const customer = useApiRead<CustomerDto>(
    document && can(session, 'customer.read') ? `/v1/customers/${document.customerId}` : null,
    () => loadCustomer(document!.customerId),
  )
  const branches = useApiRead<BranchDto[]>(document ? '/v1/branches' : null, loadBranches)

  // Arriving from the composer's issue: the number it was given, said once.
  const issuedNumber = (location.state as { issuedNumber?: string | null } | null)?.issuedNumber
  const [notice, setNotice] = useState<{ key: string; values?: Record<string, string> } | { body: string } | null>(
    issuedNumber ? { key: 'invoiceIssue.done', values: { number: issuedNumber } } : null,
  )
  const [issuing, setIssuing] = useState(false)
  // Said once: a reload of this page is not another issue.
  useEffect(() => {
    if (issuedNumber) navigate(location.pathname, { replace: true, state: null })
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [paying, setPaying] = useState(false)
  // The payment being reversed, and the key minted when its confirmation opened: confirming twice
  // is one reversal, not two refusals.
  const [reversing, setReversing] = useState<{ id: string; amount: number; key: string } | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  if (invoice.read.status !== 'ready') {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
        <Breadcrumb />
        {invoice.read.status === 'loading' ? <LoadingNotice /> : <ApiReadFailure error={invoice.read.error} retry={invoice.retry} />}
      </div>
    )
  }

  const data = invoice.read.data
  const draft = isDraft(data)
  const owed = receivable.read.status === 'ready' ? receivable.read.data : null
  const status = statusOf(data, owed)
  const totals = lineTotals(data)
  const money = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : formatAmount(value, data.currency, language)
  const day = (value: string | null) => (value ? formatDate(value, language) : '—')
  const branchName = branches.read.status === 'ready' ? branches.read.data.find((branch) => branch.id === data.branchId)?.name : undefined
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())
  const due = dueNote(owed, today)

  const cancel = async () => {
    const text = reason.trim()
    if (text === '') return
    setBusy(true)
    setNotice(null)
    try {
      await cancelInvoice(id, data.version, text)
      setCancelling(false)
      setReason('')
      setNotice({ key: 'invoiceDetails.done.cancelled' })
      invoice.retry()
      history.retry()
    } catch (error) {
      setNotice({ body: refusalText(t, error) })
    } finally {
      setBusy(false)
    }
  }

  // What a payment changes: the ledger, what is owed, and the trail.
  const afterPayment = () => {
    payments.retry()
    receivable.retry()
    history.retry()
  }

  const reverse = async () => {
    if (!reversing) return
    setBusy(true)
    setNotice(null)
    try {
      await reversePayment(id, reversing.id, reversing.key)
      setReversing(null)
      setNotice({ key: 'invoiceDetails.done.reversed' })
      afterPayment()
    } catch (error) {
      setReversing(null)
      const refusal = error instanceof ApiError && error.code ? PAYMENT_REFUSALS[error.code] : undefined
      setNotice(refusal ? { key: refusal.key } : { body: refusalText(t, error) })
      afterPayment()
    } finally {
      setBusy(false)
    }
  }

  const canPay =
    data.authoringState === 'ISSUED' &&
    can(session, 'invoice.payment.manage') &&
    (owed?.paymentState === 'UNPAID' || owed?.paymentState === 'PARTIALLY_PAID')
  const canReverse = data.authoringState === 'ISSUED' && can(session, 'invoice.payment.manage')

  const download = async (file: InvoiceAttachmentDto) => {
    setNotice(null)
    try {
      const saved = await downloadAttachment(id, file.id)
      const url = URL.createObjectURL(saved.blob)
      const link = window.document.createElement('a')
      link.href = url
      link.download = saved.filename ?? file.filename
      link.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      setNotice({ body: refusalText(t, error) })
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <Breadcrumb />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {data.invoiceNumber ?? t('invoiceDetails.draftTitle')}
          </h1>
          <span
            className={['inline-flex h-[31px] items-center gap-2 rounded-full border px-3 text-sm font-semibold', STATUS_TONES[status.tone]].join(' ')}
          >
            <span className="size-1.5 rounded-full bg-current" />
            {t(status.key, { count: 0 })}
          </span>
          {data.type !== 'INVOICE' ? (
            <span className="inline-flex items-center rounded-sm bg-neutral-25 px-2.5 py-1 text-xs font-semibold text-text-secondary">
              {t(`invoicesPage.docType.${data.type}`)}
            </span>
          ) : null}

          <div className="ms-auto flex flex-wrap items-center gap-3">
            {draft && can(session, 'invoice.draft') ? (
              <Link to={`/invoices/${data.id}/edit`} className={GHOST_BUTTON}>
                <img src={editIcon} alt="" className="size-5" />
                {t('invoiceDetails.actions.edit')}
              </Link>
            ) : null}
            {draft && can(session, 'invoice.issue') ? (
              <button
                type="button"
                onClick={() => setIssuing(true)}
                className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
              >
                {t('invoiceIssue.action')}
              </button>
            ) : null}
            {!draft && data.type === 'INVOICE' && data.authoringState === 'ISSUED' && can(session, 'creditnote.create') ? (
              <button type="button" onClick={() => navigate(`/income/credit-notes/new?invoice=${data.id}`)} className={GHOST_BUTTON}>
                <img src={creditNoteIcon} alt="" className="size-5" />
                {t('invoiceDetails.actions.creditNote')}
              </button>
            ) : null}
            {data.authoringState === 'ISSUED' && can(session, 'invoice.cancel') ? (
              <button
                type="button"
                onClick={() => setCancelling(true)}
                className="inline-flex h-[46px] items-center rounded-sm border border-danger-700 bg-white px-4 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100"
              >
                {t('invoiceDetails.actions.cancel')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
          {data.issueDate ? (
            <>
              <span className="font-medium text-text-quaternary">{t('invoiceDetails.issued')}</span>
              <span className="font-semibold text-text-primary">{day(data.issueDate)}</span>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
            </>
          ) : null}
          <span className="font-medium text-text-quaternary">{t('invoiceDetails.to')}</span>
          <span className="font-semibold text-text-primary">
            {customer.read.status === 'ready' ? customer.read.data.displayName : t('invoiceDetails.customerUnknown')}
          </span>
          {data.deliveryState === 'SENT_MANUALLY' ? (
            <>
              <span className="mx-1 size-1 rounded-full bg-text-quaternary" />
              <span className="font-medium text-text-quaternary">{t('invoiceDetails.sentManually')}</span>
            </>
          ) : null}
        </div>
      </div>

      {notice ? (
        <Notice body={'key' in notice ? t(notice.key, notice.values) : notice.body} action={{ label: t('common.close'), onClick: () => setNotice(null) }} />
      ) : null}

      {draft ? (
        <section className="rounded-sm border border-primary-300 bg-primary-25 p-4">
          <p className="text-sm font-medium leading-[1.5] text-text-secondary">{t('invoiceDetails.draftNotice')}</p>
        </section>
      ) : owed && owed.paymentState !== 'NOT_APPLICABLE' ? (
        <section className="rounded-sm bg-surface-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('invoiceDetails.outstandingBalance')}</h2>
            {due ? (
              <span
                className={[
                  'inline-flex h-[31px] items-center gap-2 rounded-full border py-1 ps-1 pe-3 text-sm font-semibold',
                  due.key === 'invoiceDetails.due.late' ? 'border-danger-100 bg-danger-100 text-danger-700' : 'border-[#e7e3da] bg-warning-100 text-[#6d5a39]',
                ].join(' ')}
              >
                <img src={clockIcon} alt="" className="size-5" />
                {t(due.key, due.values)}
              </span>
            ) : null}
          </div>
          <div className="mb-3 h-px w-full bg-border-subtle" />

          <OmAmount
            size="lg"
            amount={money(owed.outstandingAmount)}
            amountClassName="text-[32px] font-semibold leading-none text-text-primary/90"
            className="mb-2"
          />
          <div className="mb-3 h-3 overflow-hidden rounded-[5px] bg-surface-background">
            <div className="h-full rounded-[5px] bg-primary-700" style={{ width: `${paidPercent(owed)}%` }} />
          </div>
          <div className="mb-3 h-px w-full bg-border-subtle" />

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm font-medium text-[#727579]">{t('invoiceDetails.invoiceTotal')}</p>
              <OmAmount size="sm" amount={money(owed.documentTotal)} className="mt-1" amountClassName="text-xl font-semibold text-text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#727579]">{t('invoiceDetails.paid')}</p>
              <OmAmount size="sm" amount={money(owed.paidAmount)} className="mt-1" amountClassName="text-xl font-semibold text-success-700" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#727579]">
                {owed.creditedAmount > 0 ? t('invoiceDetails.credited') : t('invoiceDetails.outstanding')}
              </p>
              <OmAmount
                size="sm"
                amount={money(owed.creditedAmount > 0 ? owed.creditedAmount : owed.outstandingAmount)}
                className="mt-1"
                amountClassName="text-xl font-semibold text-text-primary"
              />
            </div>
          </div>
        </section>
      ) : null}

      <SectionCard
        title={t('invoiceDetails.billTo')}
        action={
          can(session, 'customer.read') && customer.read.status === 'ready' ? (
            <Link to={`/customers/${data.customerId}`} className="inline-flex items-center gap-0.5 text-base font-semibold text-primary-800">
              {t('invoiceDetails.viewCustomer')}
              <img src={chevronIcon} alt="" className="size-5 rotate-180 rtl:rotate-0" />
            </Link>
          ) : undefined
        }
      >
        {customer.read.status === 'ready' ? (
          <div className="mb-4 rounded-sm border border-primary-300 bg-primary-25 px-2 py-3">
            <p className="truncate text-sm font-medium text-text-primary">{customer.read.data.displayName}</p>
            <p className="truncate text-xs font-medium text-text-quaternary">
              {customer.read.data.profile.details?.vatRegistrationNumber ?? t('invoiceDetails.noVat')}
            </p>
          </div>
        ) : null}

        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap gap-6 lg:gap-20">
            <MetaField label={t('invoiceDetails.fields.issueDate')} value={day(data.issueDate)} />
            <MetaField label={t('invoiceDetails.fields.dueDate')} value={day(data.dueDate)} />
            <MetaField label={t('invoiceDetails.fields.deliveryDate')} value={day(data.details?.deliveryDate ?? null)} />
          </div>
          <div className="flex flex-wrap gap-6 lg:gap-20">
            <MetaField label={t('invoiceDetails.fields.paymentTerms')} value={data.details?.paymentTerms?.label ?? '—'} />
            <MetaField label={t('invoiceDetails.fields.currency')} value={data.currency} />
            <MetaField label={t('invoiceDetails.fields.branch')} value={branchName ?? '—'} />
          </div>
          <div className="flex flex-wrap gap-6 lg:gap-20">
            <MetaField label={t('invoiceDetails.fields.poReference')} value={data.details?.purchaseOrderReference ?? '—'} />
            <MetaField label={t('invoiceDetails.fields.subject')} value={data.details?.subject ?? '—'} />
            <MetaField label={t('invoiceDetails.fields.paymentMethod')} value={data.details?.paymentMethod?.label ?? '—'} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('invoiceDetails.items')}>
        <RowsView>
          <table className="w-full min-w-[720px] border-collapse text-start">
            <thead>
              <tr className="border-b border-surface-background text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.8px] text-text-quaternary">
                <th className="py-2 text-start font-semibold">{t('invoiceDetails.col.description')}</th>
                <th className="py-2 text-start font-semibold">{t('invoiceDetails.col.unitPrice')}</th>
                <th className="py-2 text-start font-semibold">{t('invoiceDetails.col.vat')}</th>
                <th className="py-2 text-start font-semibold">{t('invoiceDetails.col.qty')}</th>
                <th className="py-2 text-start font-semibold">{t('invoiceDetails.col.unit')}</th>
                <th className="py-2 text-start font-semibold">{t('invoiceDetails.col.disc')}</th>
                <th className="py-2 text-end font-semibold">{t('invoiceDetails.col.total')}</th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((line) => (
                <tr key={line.lineNumber} className="border-b border-surface-background">
                  <td className="py-3 pe-4">
                    <p className="text-base font-medium text-text-primary">{line.description}</p>
                    {line.productCode ? <p className="text-sm font-medium text-text-quaternary">{line.productCode}</p> : null}
                  </td>
                  <td className="py-3 text-sm font-medium text-text-secondary">{money(line.unitPrice)}</td>
                  <td className="py-3 text-sm font-medium text-text-secondary">
                    {line.taxRate === null ? t(`invoiceDetails.category.${line.en16931Category}`, { defaultValue: line.taxCategoryCode }) : `${line.taxRate}%`}
                  </td>
                  <td className="py-3 text-base font-medium text-text-secondary">{line.quantity}</td>
                  <td className="py-3 text-base font-medium text-text-secondary">{line.unitCode}</td>
                  <td className="py-3 text-sm font-medium text-text-secondary">
                    {line.discountValue === 0 ? '—' : line.discountType === 'PERCENTAGE' ? `${line.discountValue}%` : money(line.discountValue)}
                  </td>
                  <td className="py-3 text-end text-xl font-semibold text-text-primary/90">{money(totals.get(line.lineNumber))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </RowsView>

        {data.totals ? (
          <div className="mt-4 ms-auto flex w-full max-w-[328px] flex-col gap-2">
            {[
              ['invoiceDetails.totals.subtotal', data.totals.subtotal, 'text-text-primary'],
              ['invoiceDetails.totals.discount', data.totals.totalDiscount, 'text-success-700'],
              ['invoiceDetails.totals.taxable', data.totals.taxableAmount, 'text-text-primary'],
              ['invoiceDetails.totals.vatOnly', data.totals.vatAmount, 'text-text-primary'],
            ].map(([key, value, tone]) => (
              <div key={key as string} className="flex items-center justify-between gap-4 text-sm">
                <span className="font-medium text-text-tertiary">{t(key as string)}</span>
                <OmAmount size="xs" amount={money(value as number)} amountClassName={`text-base font-semibold ${tone as string}`} />
              </div>
            ))}
            <div className="my-1 h-px w-full bg-border-subtle" />
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium text-text-primary">{t('invoiceDetails.totals.total')}</span>
              <OmAmount size="sm" amount={money(data.totals.totalAmount)} amountClassName="text-xl font-semibold text-text-primary" />
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm font-medium text-text-quaternary">{t('invoiceDetails.totals.atIssue')}</p>
        )}
      </SectionCard>

      <SectionCard title={t('invoiceDetails.notes.title')}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-text-primary">
              {t('invoiceDetails.notes.customer')} <span className="text-text-quaternary">{t('invoiceDetails.notes.onInvoice')}</span>
            </p>
            <p className="text-sm font-medium leading-[1.5] text-text-tertiary">{data.details?.customerVisibleNote ?? '—'}</p>
          </div>
          {can(session, 'invoice.internal-note.read') ? (
            <div>
              <p className="mb-2 text-sm font-medium text-text-primary">
                {t('invoiceDetails.notes.internal')} <span className="text-text-quaternary">{t('invoiceDetails.notes.private')}</span>
              </p>
              {noteWanted ? (
                <p className="text-sm font-medium leading-[1.5] text-text-tertiary">
                  {internalNote.read.status === 'ready' ? (internalNote.read.data.internalNote ?? '—') : '…'}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => setNoteWanted(true)}
                  className="text-sm font-semibold text-primary-800 hover:text-primary-700"
                >
                  {t('invoiceDetails.notes.show')}
                </button>
              )}
              {!noteWanted ? (
                <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">{t('invoiceDetails.notes.showHint')}</p>
              ) : null}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title={t('invoiceDetails.attachments.title')}>
        {attachments.read.status === 'ready' && attachments.read.data.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {attachments.read.data.map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-2.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-base font-medium text-text-primary">{file.filename}</p>
                  <p className="truncate text-sm font-medium text-text-quaternary">
                    {formatFileSize(file.byteSize)} · {formatInstant(file.attachedAt, language)}
                  </p>
                </div>
                <button type="button" onClick={() => download(file)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary-800">
                  <img src={downloadIcon} alt="" className="size-5" />
                  {t('invoiceDetails.download')}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm font-medium text-text-quaternary">{t('invoiceDetails.attachments.none')}</p>
        )}
        <p className="mt-3 text-xs font-medium leading-[1.4] text-text-quaternary">
          {t(draft ? 'invoiceDetails.attachments.draftNote' : 'invoiceDetails.attachments.issuedNote')}
        </p>
      </SectionCard>

      {!draft ? (
        <SectionCard
          title={t('invoiceDetails.payments.title')}
          action={
            canPay ? (
              <button
                type="button"
                onClick={() => setPaying(true)}
                className="inline-flex items-center gap-2 text-base font-semibold text-primary-800 hover:text-primary-700"
              >
                {t('invoiceDetails.pay.open')}
              </button>
            ) : undefined
          }
        >
          {payments.read.status === 'ready' && paymentRows(payments.read.data).length > 0 ? (
            <ul className="flex flex-col gap-3">
              {paymentRows(payments.read.data).map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-2.5 py-2.5">
                  <div className="min-w-0">
                    <p className={['truncate text-base font-medium', row.reversed ? 'text-text-quaternary line-through' : 'text-text-primary'].join(' ')}>
                      {money(row.amount)}
                    </p>
                    <p className="truncate text-sm font-medium text-text-quaternary">
                      {[
                        day(row.paymentDate),
                        row.methodCode ? t(`invoiceDetails.pay.means.${row.methodCode}`, { defaultValue: row.methodCode }) : null,
                        row.reference,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  {row.reversed ? (
                    <span className="shrink-0 rounded-full bg-neutral-25 px-3 py-1 text-xs font-semibold text-text-quaternary">
                      {t('invoiceDetails.payments.reversed')}
                    </span>
                  ) : canReverse ? (
                    <button
                      type="button"
                      onClick={() => setReversing({ id: row.id, amount: row.amount, key: newPaymentKey() })}
                      className="shrink-0 text-sm font-semibold text-text-quaternary hover:text-danger-700"
                    >
                      {t('invoiceDetails.pay.reverse')}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm font-medium text-text-quaternary">{t('invoiceDetails.payments.none')}</p>
          )}
        </SectionCard>
      ) : null}

      <SectionCard title={t('invoiceDetails.timeline.title')}>
        {history.read.status === 'ready' ? (
          <ol className="flex flex-col">
            {timelineOf(history.read.data, session?.userId ?? null).map((event, index, all) => (
              <li key={`${event.key}-${event.at}-${index}`} className="flex gap-3">
                <div className="flex w-8 flex-col items-center">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-50">
                    <img src={timelineCurrentIcon} alt="" className="size-3.5" />
                  </span>
                  {index < all.length - 1 ? <span className="w-px flex-1 bg-border-subtle" /> : null}
                </div>
                <div className="pb-5">
                  <p className="text-base font-medium text-text-primary">
                    {t(event.key)}
                    {event.byYou ? <span className="font-medium text-text-quaternary"> · {t('invoiceDetails.byYou')}</span> : null}
                  </p>
                  <p className="mt-1 text-sm font-medium text-text-quaternary">
                    {[formatInstant(event.at, language), event.outcome].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </li>
            ))}
            {history.read.data.truncated ? (
              <li className="text-sm font-medium text-text-quaternary">{t('invoiceDetails.timeline.truncated', { count: history.read.data.limit })}</li>
            ) : null}
          </ol>
        ) : (
          <p className="text-sm font-medium text-text-quaternary">…</p>
        )}
      </SectionCard>

      {issuing ? (
        <IssueInvoiceModal
          invoiceId={data.id}
          version={data.version}
          initialIssueDate={muscatToday()}
          initialDueDate={dueDateFor(muscatToday(), data.details?.paymentTerms?.code)}
          onClose={() => setIssuing(false)}
          onIssued={(issued) => {
            setIssuing(false)
            setNotice({ key: 'invoiceIssue.done', values: { number: issued.invoiceNumber ?? '' } })
            // Payments load on their own once the reread says the invoice is issued.
            invoice.retry()
            receivable.retry()
            history.retry()
          }}
        />
      ) : null}

      {paying && owed ? (
        <RecordPaymentModal
          invoiceId={data.id}
          invoiceNumber={data.invoiceNumber}
          currency={data.currency}
          outstanding={owed.outstandingAmount}
          issueDate={data.issueDate}
          today={today}
          onClose={() => setPaying(false)}
          onRecorded={() => {
            setPaying(false)
            setNotice({ key: 'invoiceDetails.done.recorded' })
            afterPayment()
          }}
        />
      ) : null}

      <Modal
        open={reversing !== null}
        onClose={() => setReversing(null)}
        title={t('invoiceDetails.pay.reverseTitle')}
        footer={
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setReversing(null)} className={GHOST_BUTTON}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={reverse}
              disabled={busy}
              className="inline-flex h-[46px] items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {t('invoiceDetails.pay.reverseConfirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">
          {t('invoiceDetails.pay.reverseBody', { amount: reversing ? money(reversing.amount) : '' })}
        </p>
      </Modal>

      <Modal
        open={cancelling}
        onClose={() => {
          setCancelling(false)
          setReason('')
        }}
        title={t('invoiceDetails.cancel.title')}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => {
                setCancelling(false)
                setReason('')
              }}
              className={GHOST_BUTTON}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={busy || reason.trim() === ''}
              className="inline-flex h-[46px] items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {t('invoiceDetails.cancel.confirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">{t('invoiceDetails.cancel.body')}</p>
        <label className="mt-4 block">
          <span className="text-sm font-semibold text-text-secondary">{t('invoiceDetails.cancel.reason')}</span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={1000}
            rows={3}
            className="mt-1.5 w-full rounded-sm border border-border-subtle p-3 text-sm text-text-primary outline-none focus:border-primary-500"
          />
        </label>
      </Modal>
    </div>
  )
}

function Breadcrumb() {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link to="/invoices" className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary">
        {t('invoiceDetails.breadcrumbIncome')}
        <img src={backIcon} alt="" className="size-6 rotate-180" />
      </Link>
      <Link to="/invoices" className="text-2xl font-medium leading-[1.2] text-text-quaternary hover:text-text-secondary">
        {t('invoiceDetails.breadcrumbInvoices')}
      </Link>
    </div>
  )
}

function refusalText(t: Translate, error: unknown): string {
  if (error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION') return t('invoiceDetails.refused.stale')
  if (error instanceof ApiError && error.code === 'INVOICE_NOT_CANCELLABLE') return t('invoiceDetails.refused.notCancellable')
  if (error instanceof ApiError && error.code === 'DELIVERED_INVOICE_CANCELLATION_NOT_APPROVED') {
    return t('invoiceDetails.refused.delivered')
  }
  const message = describeApiFailure(error)
  const body = t(message.key, message.values)
  return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
}

export type { ViewNote }
