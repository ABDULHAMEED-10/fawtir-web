import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DateField, Modal, Select } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { BillStatusChip } from '../../components/bills/BillStatusChip'
import { FieldGrid, FieldLabel, PhoneField, TextAreaField, TextField } from '../../components/form'
import { useApiRead } from '../../hooks'
import type { ApiRead } from '../../hooks/useApiRead'
import { ApiError, type Page } from '../../api'
import type { BillRowDto } from '../../api/expenditure/bills'
import { switchSupplier } from '../../api/expenditure/suppliers'
import {
  addSupplierContact,
  downloadSupplierDocument,
  loadSupplierBills,
  loadSupplierOrders,
  loadSupplierPayments,
  makeMainContact,
  removeSupplierContact,
  retireSupplierDocument,
  supplierBillsPath,
  supplierOrdersPath,
  supplierPaymentsPath,
  updateSupplierContact,
  uploadSupplierDocument,
  type ContactPurpose,
  type DocumentKind,
  type PurchaseOrderRowDto,
  type SupplierContactDto,
  type SupplierDocumentDto,
  type SupplierPaymentDto,
} from '../../api/expenditure/supplierRecord'
import { dueNoteOf, toBillListItem } from '../../lib/billList'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate } from '../../lib/format'
import {
  blankContact,
  contactProblems,
  documentMeta,
  documentRemovable,
  fileSize,
  paymentLines,
  saveDownload,
  type ContactForm,
} from '../../lib/supplierRecord'
import { muscatToday } from '../../lib/invoiceIssue'
import { e164, nationalPhone } from '../../lib/supplierForm'
import omrRowIcon from '../../assets/invoices/omr-row.svg'

const PAGE_SIZE = 20

function useFailureText() {
  const { t } = useTranslation()
  return (error: unknown) => {
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    return message.reference
      ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
      : body
  }
}

/** Previous and next only: the supplier lists carry no total, so a full page is the hint of another. */
function PageNav({
  page,
  hasMore,
  onChange,
}: {
  page: number
  hasMore: boolean
  onChange: (page: number) => void
}) {
  const { t } = useTranslation()
  if (page === 0 && !hasMore) return null
  const button =
    'inline-flex h-9 items-center rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:opacity-40'
  return (
    <nav
      aria-label={t('supplierRecord.pages')}
      className="mt-4 flex items-center justify-end gap-2"
    >
      <button
        type="button"
        className={button}
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
      >
        {t('supplierRecord.previous')}
      </button>
      <span className="text-sm font-medium text-text-quaternary">
        {t('supplierRecord.pageNumber', { page: page + 1 })}
      </span>
      <button
        type="button"
        className={button}
        disabled={!hasMore}
        onClick={() => onChange(page + 1)}
      >
        {t('supplierRecord.next')}
      </button>
    </nav>
  )
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="rounded-md bg-surface-card p-5">{children}</section>
}

function Empty({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm font-medium text-text-quaternary">{text}</p>
}

const TH =
  'pb-2.5 text-start text-[11px] font-semibold uppercase leading-[1.5] tracking-[0.6px] text-text-quaternary'

export function BillsTab({ supplierId }: { supplierId: string }) {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(0)
  const path = supplierBillsPath(supplierId, page, PAGE_SIZE)
  const bills = useApiRead<Page<BillRowDto>>(path, () => loadSupplierBills(path))
  if (bills.read.status === 'loading') return <LoadingNotice />
  if (bills.read.status === 'failed')
    return <ApiReadFailure error={bills.read.error} retry={bills.retry} />
  const data = bills.read.data
  return (
    <Panel>
      {data.items.length === 0 ? (
        <Empty text={t('supplierRecord.noBills')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr className="border-b border-surface-background">
                <th className={TH}>{t('supplierDetail.col.bill')}</th>
                <th className={TH}>{t('supplierDetail.col.due')}</th>
                <th className={TH}>{t('supplierDetail.col.whereItIs')}</th>
                <th className={`${TH} text-end`}>{t('supplierRecord.col.outstanding')}</th>
                <th className={`${TH} text-end`}>{t('supplierDetail.col.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((row) => {
                const item = toBillListItem(row)
                const due = dueNoteOf(item)
                return (
                  <tr key={row.id} className="border-b border-surface-background last:border-0">
                    <td className="py-3.5 pe-4 align-top">
                      <Link
                        to={`/expenditure/bills/${row.id}`}
                        className="text-sm font-semibold text-primary-700 hover:underline"
                      >
                        {row.supplierBillNumber ?? t('supplierRecord.unnumbered')}
                      </Link>
                      <p className="mt-1 text-xs font-medium text-text-quaternary">
                        {[
                          row.issueDate
                            ? t('supplierRecord.issued', {
                                date: formatDate(row.issueDate, i18n.language),
                              })
                            : null,
                          row.purchaseOrderReference,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </td>
                    <td className="py-3.5 pe-4 align-top">
                      <p className="text-sm font-medium text-text-secondary">
                        {row.dueDate ? formatDate(row.dueDate, i18n.language) : '—'}
                      </p>
                      {due ? (
                        <p className="mt-1 text-xs font-medium text-text-quaternary">
                          {t(due.key, due.values)}
                        </p>
                      ) : null}
                    </td>
                    <td className="py-3.5 pe-4 align-top">
                      <BillStatusChip item={item} />
                    </td>
                    <td className="py-3.5 pe-4 text-end align-top text-sm font-medium text-text-secondary tabular-nums">
                      {formatAmount(row.outstandingAmount, row.currencyCode, i18n.language)}
                    </td>
                    <td className="py-3.5 text-end align-top">
                      <span className="flex items-center justify-end gap-1 text-sm font-semibold text-text-primary tabular-nums">
                        <img src={omrRowIcon} alt="" className="h-auto w-4 shrink-0" />
                        {row.totalIncludingVat === null
                          ? '—'
                          : formatAmount(row.totalIncludingVat, row.currencyCode, i18n.language)}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <PageNav page={page} hasMore={data.hasMore} onChange={setPage} />
    </Panel>
  )
}

export function PaymentsTab({ supplierId }: { supplierId: string }) {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(0)
  const path = supplierPaymentsPath(supplierId, page, PAGE_SIZE)
  const payments = useApiRead<Page<SupplierPaymentDto>>(path, () => loadSupplierPayments(path))
  if (payments.read.status === 'loading') return <LoadingNotice />
  if (payments.read.status === 'failed')
    return <ApiReadFailure error={payments.read.error} retry={payments.retry} />
  const data = payments.read.data
  const lines = paymentLines(data.items)
  return (
    <Panel>
      {lines.length === 0 ? (
        <Empty text={t('supplierRecord.noPayments')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-surface-background">
                <th className={TH}>{t('supplierRecord.col.paidOn')}</th>
                <th className={TH}>{t('supplierRecord.col.method')}</th>
                <th className={TH}>{t('supplierRecord.col.reference')}</th>
                <th className={TH}>{t('supplierDetail.col.bill')}</th>
                <th className={`${TH} text-end`}>{t('supplierDetail.col.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr
                  key={line.id}
                  className={[
                    'border-b border-surface-background last:border-0',
                    line.reversed ? 'opacity-60' : '',
                  ].join(' ')}
                >
                  <td className="py-3.5 pe-4 text-sm font-medium text-text-secondary">
                    {line.paymentDate ? formatDate(line.paymentDate, i18n.language) : '—'}
                  </td>
                  <td className="py-3.5 pe-4 text-sm font-medium text-text-secondary">
                    {line.methodCode
                      ? t(`invoiceDetails.pay.means.${line.methodCode}`, {
                          defaultValue: line.methodCode,
                        })
                      : '—'}
                  </td>
                  <td className="py-3.5 pe-4 text-sm font-medium text-text-secondary">
                    {line.paymentReference ?? '—'}
                  </td>
                  <td className="py-3.5 pe-4">
                    <Link
                      to={`/expenditure/bills/${line.billId}`}
                      className="text-sm font-semibold text-primary-700 hover:underline"
                    >
                      {t('supplierRecord.openBill')}
                    </Link>
                  </td>
                  <td className="py-3.5 text-end">
                    <span
                      className={[
                        'text-sm font-semibold tabular-nums',
                        line.reversed ? 'text-text-quaternary line-through' : 'text-text-primary',
                      ].join(' ')}
                    >
                      {formatAmount(line.amount, line.currency, i18n.language)}
                    </span>
                    {line.reversed ? (
                      <p className="text-xs font-medium text-text-quaternary">
                        {t('supplierRecord.reversed')}
                      </p>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PageNav page={page} hasMore={data.hasMore} onChange={setPage} />
    </Panel>
  )
}

export function OrdersTab({ supplierId }: { supplierId: string }) {
  const { t, i18n } = useTranslation()
  const [page, setPage] = useState(0)
  const path = supplierOrdersPath(supplierId, page, PAGE_SIZE)
  const orders = useApiRead<Page<PurchaseOrderRowDto>>(path, () => loadSupplierOrders(path))
  if (orders.read.status === 'loading') return <LoadingNotice />
  if (orders.read.status === 'failed')
    return <ApiReadFailure error={orders.read.error} retry={orders.retry} />
  const data = orders.read.data
  return (
    <Panel>
      {data.items.length === 0 ? (
        <Empty text={t('supplierRecord.noOrders')} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr className="border-b border-surface-background">
                <th className={TH}>{t('supplierRecord.col.order')}</th>
                <th className={TH}>{t('supplierRecord.col.state')}</th>
                <th className={TH}>{t('supplierRecord.col.ordered')}</th>
                <th className={TH}>{t('supplierRecord.col.wantedBy')}</th>
                <th className={`${TH} text-end`}>{t('supplierDetail.col.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((order) => (
                <tr key={order.id} className="border-b border-surface-background last:border-0">
                  <td className="py-3.5 pe-4 text-sm font-semibold">
                    {/* The tab listed orders with nowhere to go until the order had a screen of
                        its own; submitting, approving and booking goods in all live there. */}
                    <Link
                      to={`/expenditure/purchase-orders/${order.id}`}
                      className="text-primary-700 hover:underline"
                    >
                      {order.number ?? t('supplierRecord.unnumbered')}
                    </Link>
                  </td>
                  <td className="py-3.5 pe-4">
                    <span className="inline-flex rounded-full bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-800">
                      {t(`supplierRecord.orderState.${order.state}`)}
                    </span>
                  </td>
                  <td className="py-3.5 pe-4 text-sm font-medium text-text-secondary">
                    {order.orderDate ? formatDate(order.orderDate, i18n.language) : '—'}
                  </td>
                  <td className="py-3.5 pe-4 text-sm font-medium text-text-secondary">
                    {order.wantedBy ? formatDate(order.wantedBy, i18n.language) : '—'}
                  </td>
                  <td className="py-3.5 text-end text-sm font-semibold text-text-primary tabular-nums">
                    {order.totalGross === null
                      ? '—'
                      : formatAmount(order.totalGross, order.currency, i18n.language)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PageNav page={page} hasMore={data.hasMore} onChange={setPage} />
    </Panel>
  )
}

export function DocumentsTab({
  supplierId,
  documents,
  onUpload,
  onChanged,
  canManage,
}: {
  supplierId: string
  documents: { read: ApiRead<SupplierDocumentDto[]>; retry: () => void }
  onUpload: () => void
  onChanged: () => void
  canManage: boolean
}) {
  const { t, i18n } = useTranslation()
  const failure = useFailureText()
  const [notice, setNotice] = useState<string | null>(null)
  const [retiring, setRetiring] = useState<SupplierDocumentDto | null>(null)
  const [busy, setBusy] = useState(false)

  if (documents.read.status === 'loading') return <LoadingNotice />
  if (documents.read.status === 'failed')
    return <ApiReadFailure error={documents.read.error} retry={documents.retry} />

  const download = async (entry: SupplierDocumentDto) => {
    setNotice(null)
    try {
      saveDownload(
        await downloadSupplierDocument(supplierId, entry.document.id),
        entry.document.title,
      )
    } catch (error) {
      setNotice(failure(error))
    }
  }

  const today = muscatToday()

  const retire = async () => {
    if (!retiring) return
    setBusy(true)
    try {
      await retireSupplierDocument(supplierId, retiring.document.id)
      setRetiring(null)
      onChanged()
    } catch (error) {
      setRetiring(null)
      setNotice(failure(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold leading-[1.2] text-text-primary">
          {t('supplierDetail.papersOnFile')}
        </h3>
        {canManage ? (
          <button
            type="button"
            onClick={onUpload}
            className="inline-flex h-[38px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800"
          >
            {t('supplierDetail.attachDocument')}
          </button>
        ) : null}
      </div>
      {notice ? (
        <div className="mt-3">
          <Notice
            body={notice}
            action={{ label: t('common.close'), onClick: () => setNotice(null) }}
          />
        </div>
      ) : null}
      {documents.read.data.length === 0 ? (
        <Empty text={t('supplierRecord.noDocuments')} />
      ) : (
        <ul className="mt-2 flex flex-col">
          {documents.read.data.map((entry) => {
            const meta = documentMeta(entry)
            return (
              <li
                key={entry.document.id}
                className="flex flex-wrap items-center gap-3 border-b border-surface-background py-3.5 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      'text-sm font-semibold leading-[1.3] text-text-primary',
                      entry.standing === 'SUPERSEDED' ? 'opacity-60' : '',
                    ].join(' ')}
                  >
                    {entry.document.title}
                  </p>
                  <p className="mt-1 text-xs font-medium leading-[1.4] text-text-quaternary">
                    {[
                      t(`supplierRecord.kind.${entry.document.kind}`),
                      t(meta.key, {
                        date: formatDate(String(meta.values?.date ?? ''), i18n.language),
                      }),
                      fileSize(entry.document.byteSize, i18n.language),
                      entry.document.legalHold.held
                        ? t('supplierRecord.documents.legalHold')
                        : null,
                      entry.document.retainUntil && entry.document.retainUntil >= today
                        ? t('supplierRecord.documents.keptUntil', {
                            date: formatDate(entry.document.retainUntil, i18n.language),
                          })
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                  {t(`supplierRecord.standing.${entry.standing}`)}
                </span>
                <button
                  type="button"
                  onClick={() => void download(entry)}
                  className="text-sm font-semibold text-primary-700 hover:underline"
                >
                  {t('supplierRecord.documents.download')}
                </button>
                {canManage && documentRemovable(entry, today) ? (
                  <button
                    type="button"
                    onClick={() => setRetiring(entry)}
                    className="text-sm font-semibold text-text-tertiary hover:text-danger-700"
                  >
                    {t('supplierRecord.documents.retire')}
                  </button>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
      {retiring ? (
        <Modal
          open
          onClose={() => setRetiring(null)}
          title={t('supplierRecord.documents.retireTitle', { title: retiring.document.title })}
          footer={
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setRetiring(null)}
                className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={() => void retire()}
                disabled={busy}
                className="inline-flex h-[42px] items-center rounded-sm bg-danger-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {t('supplierRecord.documents.retire')}
              </button>
            </div>
          }
        >
          <p className="text-sm font-medium leading-[1.5] text-text-secondary">
            {t('supplierRecord.documents.retireBody')}
          </p>
        </Modal>
      ) : null}
    </Panel>
  )
}

const KINDS: DocumentKind[] = ['AGREEMENT', 'CERTIFICATE', 'PRICE_LIST', 'CORRESPONDENCE', 'OTHER']
const MAX_BYTES = 10 * 1024 * 1024

export function UploadDocumentModal({
  supplierId,
  onClose,
  onUploaded,
}: {
  supplierId: string
  onClose: () => void
  onUploaded: () => void
}) {
  const { t } = useTranslation()
  const failure = useFailureText()
  const [file, setFile] = useState<File | null>(null)
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<DocumentKind>('AGREEMENT')
  const [series, setSeries] = useState('')
  const [documentDate, setDocumentDate] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ file?: string; title?: string }>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: { file?: string; title?: string } = {}
    if (!file) next.file = 'supplierRecord.documents.fileRequired'
    else if (file.size > MAX_BYTES) next.file = 'supplierRecord.documents.fileTooLarge'
    if (!title.trim()) next.title = 'validation.required'
    setErrors(next)
    setNotice(null)
    if (Object.keys(next).length > 0 || !file) return
    setBusy(true)
    try {
      await uploadSupplierDocument(supplierId, { file, title, kind, series, documentDate, note })
      onUploaded()
    } catch (error) {
      setNotice(failure(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={600}
      title={t('supplierRecord.documents.uploadTitle')}
      subtitle={t('supplierRecord.documents.uploadSubtitle')}
      footer={
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="supplier-document-upload"
            disabled={busy}
            className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? t('supplierForm.saving') : t('supplierDetail.attachDocument')}
          </button>
        </div>
      }
    >
      <form
        id="supplier-document-upload"
        noValidate
        onSubmit={submit}
        className="flex flex-col gap-4"
      >
        {notice ? <Notice body={notice} /> : null}
        <div className="flex flex-col gap-1">
          <label htmlFor="supplier-document-file" className="text-sm font-medium text-text-primary">
            {t('supplierRecord.documents.file')}
          </label>
          <input
            id="supplier-document-file"
            type="file"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null)
              setErrors((current) => ({ ...current, file: undefined }))
            }}
            className="text-sm font-medium text-text-secondary"
          />
          {errors.file ? (
            <p role="alert" className="text-xs font-medium text-text-danger">
              {t(errors.file)}
            </p>
          ) : null}
        </div>
        <TextField
          id="supplier-document-title"
          name="title"
          label={t('supplierRecord.documents.title')}
          required
          maxLength={200}
          value={title}
          onChange={setTitle}
          error={errors.title ? t(errors.title) : undefined}
        />
        <FieldGrid>
          <div className="flex flex-col gap-1">
            <FieldLabel label={t('supplierRecord.documents.kindLabel')} />
            <Select
              value={kind}
              onChange={(next) => setKind(next as DocumentKind)}
              options={KINDS.map((value) => ({ value, label: t(`supplierRecord.kind.${value}`) }))}
              ariaLabel={t('supplierRecord.documents.kindLabel')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel label={t('supplierRecord.documents.date')} />
            <DateField
              value={documentDate}
              onChange={setDocumentDate}
              ariaLabel={t('supplierRecord.documents.date')}
            />
          </div>
        </FieldGrid>
        <TextField
          id="supplier-document-series"
          name="series"
          label={t('supplierRecord.documents.series')}
          hint={t('supplierRecord.documents.seriesHint')}
          maxLength={120}
          value={series}
          onChange={setSeries}
        />
        <TextAreaField
          id="supplier-document-note"
          name="note"
          label={t('supplierRecord.documents.note')}
          maxLength={500}
          value={note}
          onChange={setNote}
        />
      </form>
    </Modal>
  )
}

export function SwitchSupplierModal({
  supplierId,
  name,
  to,
  onClose,
  onSwitched,
}: {
  supplierId: string
  name: string
  to: 'off' | 'on'
  onClose: () => void
  onSwitched: (to: 'off' | 'on') => void
}) {
  const { t } = useTranslation()
  const failure = useFailureText()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const confirm = async () => {
    setBusy(true)
    setNotice(null)
    try {
      await switchSupplier(supplierId, to)
      onSwitched(to)
    } catch (error) {
      setNotice(failure(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      width={520}
      title={
        to === 'off'
          ? t('supplierOff.title', { name })
          : t('supplierRecord.switchOnTitle', { name })
      }
      footer={
        <div className="flex justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary"
          >
            {t('supplierOff.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="inline-flex h-[42px] items-center rounded-sm bg-pending-500 px-5 text-sm font-semibold text-white hover:bg-pending-700 disabled:opacity-60"
          >
            {to === 'off' ? t('supplierOff.confirm') : t('supplierRecord.switchOn')}
          </button>
        </div>
      }
    >
      {notice ? <Notice body={notice} /> : null}
      <p className="text-sm font-medium leading-[1.6] text-text-secondary">
        {to === 'off' ? t('supplierRecord.switchOffBody') : t('supplierRecord.switchOnBody')}
      </p>
    </Modal>
  )
}

const PURPOSES: ContactPurpose[] = ['MAIN', 'BILLING', 'DELIVERY', 'OTHER']

/**
 * The supplier's contacts: add, edit, remove, and make one the main contact (decision of 2026-09-17,
 * E-04). No design exists, so it is built on the app's modal and form fields. Making a contact main
 * is one server call that swaps them; saving a second MAIN directly is never offered.
 */
export function SupplierContactsModal({
  supplierId,
  contacts,
  onClose,
  onChanged,
}: {
  supplierId: string
  contacts: SupplierContactDto[]
  onClose: () => void
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const failure = useFailureText()
  const [list, setList] = useState<SupplierContactDto[]>(contacts)
  const [editing, setEditing] = useState<ContactForm | null>(null)
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const hasMain = list.some((contact) => contact.purpose === 'MAIN')

  const refresh = (next: SupplierContactDto[]) => {
    setList(next)
    onChanged()
  }

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setNotice(null)
    try {
      await work()
    } catch (error) {
      setNotice(
        error instanceof ApiError && error.status === 409
          ? t('supplierRecord.contacts.stale')
          : failure(error),
      )
    } finally {
      setBusy(false)
    }
  }

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editing) return
    const problems = contactProblems(editing)
    setErrors(problems)
    if (Object.keys(problems).length > 0) return
    void run(async () => {
      const body = {
        fullName: editing.fullName.trim(),
        roleTitle: editing.roleTitle.trim() || null,
        purpose: editing.purpose,
        email: editing.email.trim() || null,
        telephone: e164(editing.telephone),
        mobilePhone: e164(editing.mobilePhone),
        notes: editing.notes.trim() || null,
        ...(editing.version === undefined ? {} : { version: editing.version }),
      }
      const saved = editing.id
        ? await updateSupplierContact(supplierId, editing.id, body)
        : await addSupplierContact(supplierId, body)
      refresh(
        editing.id
          ? list.map((contact) => (contact.id === saved.id ? saved : contact))
          : [...list, saved],
      )
      setEditing(null)
    })
  }

  const makeMain = (contact: SupplierContactDto) =>
    void run(async () => refresh(await makeMainContact(supplierId, contact.id, contact.version)))

  const remove = (contact: SupplierContactDto) =>
    void run(async () => {
      await removeSupplierContact(supplierId, contact.id)
      refresh(list.filter((entry) => entry.id !== contact.id))
    })

  const field = (name: keyof ContactForm) => ({
    value: String(editing?.[name] ?? ''),
    onChange: (next: string) =>
      setEditing((current) => (current ? { ...current, [name]: next } : current)),
    error: errors[name] ? t(errors[name]!) : undefined,
  })

  return (
    <Modal
      open
      onClose={onClose}
      width={680}
      title={t('supplierRecord.contacts.title')}
      subtitle={t('supplierRecord.contacts.subtitle')}
      footer={
        <div className="flex justify-end gap-2.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="supplier-contact-form"
                disabled={busy}
                className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? t('supplierForm.saving') : t('supplierRecord.contacts.save')}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-[42px] items-center rounded-sm border border-border-subtle bg-white px-5 text-sm font-semibold text-text-secondary"
              >
                {t('common.close')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrors({})
                  setEditing(blankContact(hasMain))
                }}
                className="inline-flex h-[42px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white"
              >
                {t('supplierRecord.contacts.add')}
              </button>
            </>
          )}
        </div>
      }
    >
      {notice ? <Notice body={notice} /> : null}
      {editing ? (
        <form
          id="supplier-contact-form"
          noValidate
          onSubmit={save}
          className="mt-2 flex flex-col gap-4"
        >
          <FieldGrid>
            <TextField
              id="contact-fullName"
              name="fullName"
              label={t('supplierRecord.contacts.name')}
              required
              maxLength={200}
              {...field('fullName')}
            />
            <TextField
              id="contact-roleTitle"
              name="roleTitle"
              label={t('newSupplier.contact.role')}
              maxLength={100}
              {...field('roleTitle')}
            />
          </FieldGrid>
          <div className="flex flex-col gap-1">
            <FieldLabel label={t('supplierRecord.contacts.purpose')} />
            <Select
              value={editing.purpose}
              onChange={(next) =>
                setEditing((current) =>
                  current ? { ...current, purpose: next as ContactPurpose } : current,
                )
              }
              // MAIN is set by "Make main", never by saving a second one.
              options={PURPOSES.filter(
                (purpose) => purpose !== 'MAIN' || !hasMain || editing.purpose === 'MAIN',
              ).map((value) => ({
                value,
                label: t(`supplierRecord.purpose.${value}`),
              }))}
              ariaLabel={t('supplierRecord.contacts.purpose')}
            />
          </div>
          <TextField
            id="contact-email"
            name="email"
            type="email"
            label={t('supplierRecord.contacts.email')}
            maxLength={255}
            {...field('email')}
          />
          <FieldGrid>
            <PhoneField
              id="contact-telephone"
              name="telephone"
              label={t('newSupplier.contact.telephone')}
              {...field('telephone')}
            />
            <PhoneField
              id="contact-mobilePhone"
              name="mobilePhone"
              label={t('newSupplier.contact.mobile')}
              {...field('mobilePhone')}
            />
          </FieldGrid>
          {errors.channel ? (
            <p role="alert" className="text-xs font-medium text-text-danger">
              {t(errors.channel)}
            </p>
          ) : null}
          <TextAreaField
            id="contact-notes"
            name="notes"
            label={t('supplierRecord.contacts.notes')}
            maxLength={1000}
            value={editing.notes}
            onChange={field('notes').onChange}
          />
        </form>
      ) : list.length === 0 ? (
        <Empty text={t('supplierRecord.contacts.empty')} />
      ) : (
        <ul className="flex flex-col">
          {list.map((contact) => (
            <li
              key={contact.id}
              className="flex flex-wrap items-center gap-3 border-b border-surface-background py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary">
                  {contact.fullName}
                  {contact.roleTitle ? (
                    <span className="font-medium text-text-quaternary"> · {contact.roleTitle}</span>
                  ) : null}
                </p>
                <p className="mt-0.5 truncate text-xs font-medium text-text-quaternary">
                  {[contact.email, contact.telephone, contact.mobilePhone]
                    .filter(Boolean)
                    .map((reach, index) => (
                      <span key={index}>
                        {index > 0 ? ' · ' : null}
                        <bdi dir="ltr">{reach}</bdi>
                      </span>
                    ))}
                </p>
              </div>
              <span className="rounded-sm bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-800">
                {t(`supplierRecord.purpose.${contact.purpose}`)}
              </span>
              {contact.purpose !== 'MAIN' ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => makeMain(contact)}
                  className="text-sm font-semibold text-primary-700 hover:underline disabled:opacity-50"
                >
                  {t('supplierRecord.contacts.makeMain')}
                </button>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setErrors({})
                  setEditing({
                    id: contact.id,
                    version: contact.version,
                    fullName: contact.fullName,
                    roleTitle: contact.roleTitle ?? '',
                    purpose: contact.purpose,
                    email: contact.email ?? '',
                    telephone: nationalPhone(contact.telephone),
                    mobilePhone: nationalPhone(contact.mobilePhone),
                    notes: contact.notes ?? '',
                  })
                }}
                className="text-sm font-semibold text-text-secondary hover:underline disabled:opacity-50"
              >
                {t('supplierRecord.contacts.edit')}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(contact)}
                className="text-sm font-semibold text-text-tertiary hover:text-danger-700 disabled:opacity-50"
              >
                {t('supplierRecord.contacts.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
