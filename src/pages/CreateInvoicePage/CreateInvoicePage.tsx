import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { AddCustomerModal, type SavedCustomer } from '../../components/AddCustomerModal'
import { LinkDocumentsModal, LinkedDocuments } from '../../components/invoice'
import { ScanToFillModal, type ScanResult } from '../../components/invoice/ScanToFillModal'
import { DateField, FileDropzone, Select, withRial, type SelectOption } from '../../components/ui'
import { ProductPicker } from '../../components/invoice/ProductPicker'
import { lineFromProduct } from '../../lib/productLine'
import {
  BRANCH_OPTIONS,
  CURRENCY_OPTIONS,
  CUSTOMERS,
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_TERM_DAYS,
  PAYMENT_TERMS_OPTIONS,
  TAX_CATEGORIES,
  TAX_CATEGORY_OPTIONS,
  UNIT_OPTIONS,
} from '../../lib/catalogues'
import { extractInvoice } from '../../lib/scanToFill'
import scanIcon from '../../assets/create-invoice/scan.svg'
import { DEFAULT_LINKED_DOCS, LINK_PICKER_DOCS, type LinkedDoc } from '../../lib/linkedDocuments'
import {
  calculateInvoice,
  formatAmount,
  formatAtScale,
  parseAmount,
  projectInvoice,
  toExclusivePrice,
  type DiscountType,
} from '../../lib/invoiceMath'
import { formatFileSize } from '../../lib/files'
import backIcon from '../../assets/create-invoice/back.svg'
import businessIcon from '../../assets/create-invoice/business.svg'
import consumerIcon from '../../assets/create-invoice/consumer.svg'
import governmentIcon from '../../assets/create-invoice/government.svg'
import tickIcon from '../../assets/create-invoice/tick.svg'
import customerLogo from '../../assets/create-invoice/customer-logo.svg'
import peppolIcon from '../../assets/create-invoice/peppol.svg'
import chevronIcon from '../../assets/create-invoice/chevron.svg'
import plusIcon from '../../assets/invoices/plus.svg'
import omrIcon from '../../assets/create-invoice/omr.svg'
import eyeIcon from '../../assets/create-invoice/eye.svg'
import saveDraftIcon from '../../assets/create-invoice/save-draft.svg'
import arrowIcon from '../../assets/create-invoice/arrow.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'
import qrBadgeIcon from '../../assets/create-invoice/qr-badge.svg'
import receiptQrIcon from '../../assets/create-invoice/receipt-qr.svg'
import deleteLineIcon from '../../assets/create-invoice/delete.svg'

type CustomerType = 'business' | 'consumer' | 'government'

/** The two lines from the design — and the backend's golden vector in `FAWTIR-INV-TD-001` §8. */
const INITIAL_LINES = [
  {
    id: '1',
    productId: null as string | null,
    description: 'Cappuccino - Large',
    unitPrice: '1.8',
    vatRate: '5',
    taxCode: 'S5' as string | null,
    quantity: '12',
    unit: 'EA',
    discountType: 'PERCENTAGE' as DiscountType,
    discountValue: '0',
  },
  {
    id: '2',
    productId: null as string | null,
    description: 'Coffee Beans 1kg - H Blend',
    unitPrice: '9.5',
    vatRate: '5',
    taxCode: 'S5' as string | null,
    quantity: '4',
    unit: 'KGM',
    discountType: 'PERCENTAGE' as DiscountType,
    discountValue: '10',
  },
]

/** A product's unit may be one the short list does not carry; it is shown rather than dropped. */
function unitOptionsWith(code: string): SelectOption[] {
  return UNIT_OPTIONS.some((option) => option.value === code) ? UNIT_OPTIONS : [...UNIT_OPTIONS, { value: code, label: code }]
}

function SectionTitle({ step, title }: { step: number; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
        {step}
      </span>
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
    </div>
  )
}

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
      <span>{label}</span>
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
    </div>
  )
}

function FieldShell({
  children,
  suffix,
  highlighted,
}: {
  children: ReactNode
  suffix?: ReactNode
  highlighted?: boolean
}) {
  return (
    <div
      className={[
        'flex h-[50px] w-full items-center justify-between rounded-sm border border-primary-300 px-4',
        highlighted ? 'bg-primary-25' : 'bg-surface-tab-bar',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {suffix}
    </div>
  )
}

function OmAmount({
  value,
  size = 'sm',
  muted,
}: {
  value: string
  size?: 'sm' | 'md' | 'lg'
  muted?: boolean
}) {
  const iconSize = size === 'lg' ? 'w-6 h-auto' : 'w-4 h-auto'
  const textSize =
    size === 'lg'
      ? 'text-[22px] font-semibold'
      : size === 'md'
        ? 'text-base font-semibold'
        : 'text-sm font-semibold'
  return (
    <span
      className={[
        'inline-flex items-center gap-0.5',
        muted ? 'text-text-quaternary' : 'text-text-secondary',
      ].join(' ')}
    >
      <img src={omrIcon} alt="" className={iconSize} />
      <span className={textSize}>{value}</span>
    </span>
  )
}

/** `%` / `OMR` switch. The type is stored explicitly — `INV-FR-180` forbids inferring it. */
function DiscountTypeToggle({
  value,
  onChange,
  label,
}: {
  value: DiscountType
  onChange: (next: DiscountType) => void
  label: string
}) {
  const { t } = useTranslation()
  const options: { id: DiscountType; text: string }[] = [
    { id: 'PERCENTAGE', text: '%' },
    { id: 'FIXED_AMOUNT', text: t('createInvoice.items.omr') },
  ]

  return (
    <span
      role="group"
      aria-label={`${label} — ${t('createInvoice.items.discountType')}`}
      className="inline-flex h-9 shrink-0 items-center rounded-sm border border-primary-300 bg-white p-0.5"
    >
      {options.map((option) => {
        const active = option.id === value
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={active}
            className={[
              'inline-flex h-8 min-w-[34px] items-center justify-center rounded-[2px] px-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-primary-700 text-white' : 'text-text-tertiary hover:text-text-secondary',
            ].join(' ')}
          >
            {withRial(option.text)}
          </button>
        )
      })}
    </span>
  )
}

/** Line discount cell: type, value, and — when a percentage — the OMR it resolves to, live. */
function DiscountField({
  type,
  value,
  onTypeChange,
  onValueChange,
  resolved,
}: {
  type: DiscountType
  value: string
  onTypeChange: (next: DiscountType) => void
  onValueChange: (next: string) => void
  resolved: bigint
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-[50px] items-center gap-1 rounded-sm border border-primary-300 bg-surface-tab-bar px-1.5">
        <input
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          inputMode="decimal"
          aria-label={t('createInvoice.items.discount')}
          className="w-full min-w-0 border-0 bg-transparent px-1 text-sm font-medium text-text-secondary outline-none"
        />
        <DiscountTypeToggle
          value={type}
          onChange={onTypeChange}
          label={t('createInvoice.items.discount')}
        />
      </div>
      {/* A percentage is meaningless to check without the money it comes to. */}
      {type === 'PERCENTAGE' && resolved > 0n ? (
        <span className="ps-1 text-xs font-medium leading-[1.2] text-text-tertiary">
          = {formatAtScale(resolved)} {withRial(t('createInvoice.items.omr'))}
        </span>
      ) : null}
    </div>
  )
}

export function CreateInvoicePage() {
  const { t } = useTranslation()
  const [customerType, setCustomerType] = useState<CustomerType>('business')
  const [exclVat, setExclVat] = useState(true)
  const [lines, setLines] = useState(INITIAL_LINES)
  const [headerDiscountType, setHeaderDiscountType] = useState<DiscountType>('PERCENTAGE')
  const [headerDiscountValue, setHeaderDiscountValue] = useState('0')
  const [issueDate, setIssueDate] = useState('2026-07-18')
  const [dueDate, setDueDate] = useState('2026-08-17')
  /** Once the user sets a due date by hand, payment terms stop overwriting it (INV-PD-005). */
  const [dueDateTouched, setDueDateTouched] = useState(false)
  const [deliveryDate, setDeliveryDate] = useState('2026-07-18')
  const [paymentTerms, setPaymentTerms] = useState('NET30')
  const [branch, setBranch] = useState('MAIN')
  const [currency, setCurrency] = useState('OMR')
  const [defaultTaxCategory, setDefaultTaxCategory] = useState('S5')
  const [subject, setSubject] = useState('Monthly coffee supply & barista training — July')
  const [purchaseOrder, setPurchaseOrder] = useState('PO-88213')
  const [paymentMethod, setPaymentMethod] = useState('30')
  const [paymentReference, setPaymentReference] = useState('MGH-2044-07')
  const [paymentDate, setPaymentDate] = useState('2026-07-18')
  const [markPaid, setMarkPaid] = useState(true)
  const [markSent, setMarkSent] = useState(true)
  const [customerNote, setCustomerNote] = useState(
    'Thank you for your business. Please settle within 30 days by bank transfer using the reference above.',
  )
  const [internalNote, setInternalNote] = useState(
    'Loyalty discount approved by Hafidh on 15 Jul. Follow up if unpaid by 20 Aug.',
  )
  const [scanOpen, setScanOpen] = useState(false)
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: number }[]>([])
  const [uploadError, setUploadError] = useState('')

  /**
   * Preview only. The server recomputes and owns the issued figures (`INV-FR-091`); this runs the
   * same algorithm so what the composer sees matches what is stored.
   */
  const calculated = useMemo(
    () =>
      calculateInvoice(
        lines.map((line, index) => ({
          ...line,
          lineNumber: index + 1,
          unitPrice: exclVat ? line.unitPrice : toExclusivePrice(line.unitPrice, line.vatRate),
        })),
        headerDiscountType,
        headerDiscountValue,
      ),
    [lines, headerDiscountType, headerDiscountValue, exclVat],
  )

  // INV-PD-005 — terms fill the due date until the user takes it over.
  useEffect(() => {
    if (dueDateTouched || !issueDate) return
    const days = PAYMENT_TERM_DAYS[paymentTerms]
    if (days === undefined) return
    const base = new Date(issueDate + 'T00:00:00')
    if (Number.isNaN(base.getTime())) return
    base.setDate(base.getDate() + days)
    const pad = (n: number) => String(n).padStart(2, '0')
    setDueDate(`${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`)
  }, [paymentTerms, issueDate, dueDateTouched])

  /** Every figure on screen comes from here, re-reconciled at 3 dp so columns sum to totals. */
  const projected = useMemo(() => projectInvoice(calculated), [calculated])

  const applyScan = (result: ScanResult) => {
    for (const field of result.fields) {
      if (field.key === 'issueDate') setIssueDate(field.value)
      if (field.key === 'dueDate') {
        setDueDate(field.value)
        setDueDateTouched(true)
      }
      if (field.key === 'purchaseOrder') setPurchaseOrder(field.value)
      if (field.key === 'subject') setSubject(field.value)
      if (field.key === 'customer') {
        const match = CUSTOMERS.find((c) => c.name === field.value)
        if (match) setSelectedCustomerId(match.id)
      }
    }
    if (result.lines.length > 0) {
      setLines(
        result.lines.map((line, index) => ({
          id: `S${index + 1}`,
          productId: null,
          description: line.description,
          unitPrice: line.unitPrice,
          vatRate: '5',
          taxCode: 'S5',
          quantity: line.quantity,
          unit: 'EA',
          discountType: 'PERCENTAGE' as DiscountType,
          discountValue: '0',
        })),
      )
    }
  }

  /**
   * INV-PD-019 option A — inclusive is an *entry* mode. Flipping it converts the typed prices so
   * the money on the invoice never moves; the engine is always fed the exclusive figure.
   */
  const switchVatMode = (toExclusive: boolean) => {
    if (toExclusive === exclVat) return
    setLines((current) =>
      current.map((line) => {
        const rate = parseAmount(line.vatRate)
        const price = parseAmount(line.unitPrice)
        if (rate === 0n || price === 0n) return line
        const hundred = parseAmount('100')
        const factor = hundred + rate
        const next = toExclusive
          ? (price * hundred) / factor // strip VAT out of an inclusive price
          : (price * factor) / hundred // add VAT onto an exclusive price
        return { ...line, unitPrice: formatAmount(next, 3) }
      }),
    )
    setExclVat(toExclusive)
  }

  const updateLine = (id: string, patch: Partial<(typeof INITIAL_LINES)[number]>) =>
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)))

  const removeLine = (id: string) =>
    setLines((current) => (current.length > 1 ? current.filter((line) => line.id !== id) : current))

  const addLine = () =>
    setLines((current) => [
      ...current,
      {
        id: `L${Date.now()}`,
        productId: null,
        description: '',
        unitPrice: '0',
        vatRate: '5',
        taxCode: 'S5',
        quantity: '1',
        unit: 'EA',
        discountType: 'PERCENTAGE' as DiscountType,
        discountValue: '0',
      },
    ])
  /** Shared across all three customer types — a B2C receipt can settle a delivery note too. */
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>(DEFAULT_LINKED_DOCS)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  /** Documents of this customer's that are not on the invoice yet. */
  const linkableCount = LINK_PICKER_DOCS.filter(
    (doc) => !linkedDocs.some((linked) => linked.id === doc.id),
  ).length
  const [customers, setCustomers] = useState<SavedCustomer[]>(
    CUSTOMERS.map((customer) => ({
      id: customer.id,
      name: customer.name,
      vat: customer.vat,
      onPeppol: customer.onPeppol,
      kind: customer.kind === 'consumer' ? 'private' : 'company',
    })),
  )
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>('CUS-001')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addCustomerOpen, setAddCustomerOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId) ?? null

  useEffect(() => {
    if (!pickerOpen) return
    const onDocClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false)
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [pickerOpen])

  const openAddCustomer = () => {
    setPickerOpen(false)
    setAddCustomerOpen(true)
  }

  const handleSaveCustomer = (customer: SavedCustomer) => {
    setCustomers((prev) => [...prev, customer])
    setSelectedCustomerId(customer.id)
  }

  const customerTypes: { id: CustomerType; titleKey: string; subtitleKey: string; icon: string }[] =
    [
      {
        id: 'business',
        titleKey: 'createInvoice.customerTypes.business',
        subtitleKey: 'createInvoice.customerTypes.businessSub',
        icon: businessIcon,
      },
      {
        id: 'consumer',
        titleKey: 'createInvoice.customerTypes.consumer',
        subtitleKey: 'createInvoice.customerTypes.consumerSub',
        icon: consumerIcon,
      },
      {
        id: 'government',
        titleKey: 'createInvoice.customerTypes.government',
        subtitleKey: 'createInvoice.customerTypes.governmentSub',
        icon: governmentIcon,
      },
    ]

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
        {/* Breadcrumb / title */}
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary"
          >
            {t('createInvoice.breadcrumb')}
            <img src={backIcon} alt="" className="size-6 rotate-180" />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('createInvoice.title')}
            </h1>
            <span className="text-sm font-medium text-[#8f8f8f]">
              {t('createInvoice.draftMeta')}
            </span>
          </div>
          {/* Read an existing invoice and pre-fill the form rather than retyping it. */}
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="ms-auto inline-flex h-[46px] items-center gap-2 rounded-sm border border-primary-300 bg-primary-25 px-4 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-50"
          >
            <img src={scanIcon} alt="" className="size-5" />
            {t('scanToFill.button')}
          </button>
        </div>

        {/* 1 Customer + Summary */}
        <div className="grid gap-4 xl:grid-cols-[1fr_332px]">
          <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
            <SectionTitle step={1} title={t('createInvoice.sections.customer')} />
            <div className="h-px w-full bg-border-subtle" />
            <div className="grid gap-3 sm:grid-cols-3">
              {customerTypes.map((type) => {
                const active = type.id === customerType
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setCustomerType(type.id)}
                    className={[
                      'flex h-[65px] items-center justify-between rounded-sm p-4 text-start transition-colors',
                      active
                        ? 'border-2 border-primary-500 bg-primary-50'
                        : 'border border-border-default bg-surface-card',
                    ].join(' ')}
                  >
                    <span className="flex items-center gap-2">
                      <img src={type.icon} alt="" className="size-6" />
                      <span>
                        <span className="block text-base font-medium tracking-[0.16px] text-text-primary">
                          {t(type.titleKey)}
                        </span>
                        <span className="block text-xs font-medium tracking-[0.12px] text-text-tertiary">
                          {t(type.subtitleKey)}
                        </span>
                      </span>
                    </span>
                    {active ? <img src={tickIcon} alt="" className="size-[18px]" /> : null}
                  </button>
                )
              })}
            </div>

            {customerType === 'consumer' ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <FieldLabel label={t('createInvoice.consumer.name')} />
                    <FieldShell>
                      <span className="text-sm font-medium text-text-placeholder">
                        {t('createInvoice.consumer.namePlaceholder')}
                      </span>
                    </FieldShell>
                  </div>
                  <div className="flex flex-col gap-1">
                    <FieldLabel label={t('createInvoice.consumer.contact')} />
                    <FieldShell>
                      <span className="text-sm font-medium text-text-placeholder">
                        {t('createInvoice.consumer.contactPlaceholder')}
                      </span>
                    </FieldShell>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 rounded-sm border border-primary-50 bg-primary-25 p-2">
                  <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-sm bg-white">
                    <img src={qrBadgeIcon} alt="" className="size-8" />
                  </span>
                  <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
                    {t('createInvoice.consumer.peppolNote')}
                  </p>
                </div>
              </>
            ) : customers.length === 0 ? (
              <button
                type="button"
                onClick={openAddCustomer}
                className="inline-flex h-[65px] w-full items-center justify-center gap-2 rounded-sm border border-dashed border-primary-300 bg-primary-25 px-4 text-base font-semibold text-primary-800 transition-colors hover:bg-primary-50"
              >
                <img src={plusIcon} alt="" className="size-6" />
                {t('createInvoice.customer.addCustomer')}
              </button>
            ) : (
              <div
                ref={pickerRef}
                className="relative flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-3 py-4"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {selectedCustomer ? (
                    <img src={customerLogo} alt="" className="size-12 rounded-sm object-cover" />
                  ) : (
                    <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-sm bg-white text-sm font-semibold text-primary-800">
                      +
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text-primary">
                      {selectedCustomer?.name ?? t('createInvoice.customer.select')}
                    </p>
                    <p className="truncate text-xs font-medium text-text-quaternary">
                      {selectedCustomer?.vat ?? t('createInvoice.customer.selectHint')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5">
                  {selectedCustomer?.onPeppol ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary-75 bg-white/70 py-1.5 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
                      <img src={peppolIcon} alt="" className="size-4" />
                      {t('createInvoice.customer.onPeppol')}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    aria-expanded={pickerOpen}
                    onClick={() => setPickerOpen((v) => !v)}
                    className="inline-flex items-center gap-0.5 rounded-sm border border-border-subtle bg-white py-1.5 ps-3.5 pe-2.5 text-sm font-semibold text-primary-800"
                  >
                    {selectedCustomer
                      ? t('createInvoice.customer.change')
                      : t('createInvoice.customer.select')}
                    <img
                      src={chevronIcon}
                      alt=""
                      className={[
                        'size-6 transition-transform',
                        pickerOpen ? '-rotate-90' : 'rotate-90',
                      ].join(' ')}
                    />
                  </button>
                </div>

                {pickerOpen ? (
                  <div className="absolute end-3 top-[calc(100%-8px)] z-20 w-[min(100%,320px)] overflow-hidden rounded-sm border border-border-subtle bg-white shadow-card">
                    <ul className="max-h-56 overflow-y-auto py-1">
                      {customers.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId(c.id)
                              setPickerOpen(false)
                            }}
                            className={[
                              'flex w-full flex-col gap-0.5 px-3 py-2.5 text-start transition-colors hover:bg-primary-25',
                              c.id === selectedCustomerId ? 'bg-primary-25' : '',
                            ].join(' ')}
                          >
                            <span className="text-sm font-semibold text-text-primary">
                              {c.name}
                            </span>
                            <span className="text-xs font-medium text-text-quaternary">
                              {c.vat}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="border-t border-border-subtle p-1">
                      <button
                        type="button"
                        onClick={openAddCustomer}
                        className="inline-flex w-full items-center gap-2 rounded-sm px-3 py-2.5 text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-25"
                      >
                        <img src={plusIcon} alt="" className="size-5" />
                        {t('createInvoice.customer.addCustomer')}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>

          <aside className="rounded-sm border border-[#f3f3f3] bg-surface-card p-4">
            <h3 className="text-base font-medium text-text-primary">
              {t('createInvoice.summary.title')}
            </h3>
            <div className="my-4 h-px bg-border-subtle" />
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary/70">
                  {t('createInvoice.summary.subtotal')}
                </span>
                <OmAmount value={formatAtScale(projected.subtotal)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary/50">
                  {t('createInvoice.summary.discount')}
                </span>
                <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-text-quaternary">
                  −{' '}
                  <OmAmount
                    value={formatAtScale(projected.itemDiscount + projected.headerDiscount)}
                    muted
                  />
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-primary/70">
                  {t('createInvoice.summary.net')}
                </span>
                <OmAmount value={formatAtScale(projected.taxable)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-text-secondary">
                  {t('createInvoice.summary.vat')}
                </span>
                <OmAmount value={formatAtScale(projected.vat)} />
              </div>
            </div>
            <div className="my-4 h-px bg-border-subtle" />
            <div className="flex items-center justify-between">
              <span className="text-base font-medium text-text-primary/90">
                {t('createInvoice.summary.totalDue')}
              </span>
              <OmAmount value={formatAtScale(projected.total)} size="lg" />
            </div>
          </aside>
        </div>

        {/* 2 Invoice details (+ Receipt QR for consumer) */}
        <div
          className={
            customerType === 'consumer' ? 'grid gap-4 xl:grid-cols-[1fr_332px]' : undefined
          }
        >
          <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
            <SectionTitle step={2} title={t('createInvoice.sections.details')} />
            <div className="h-px w-full bg-border-subtle" />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.invoiceNumber')} required />
                <div className="flex h-[50px] w-full items-center rounded-sm border border-primary-300 bg-primary-25 px-4">
                  <span className="text-sm font-medium text-text-quaternary">
                    {t('createInvoice.values.numberOnIssue')}
                  </span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.issueDate')} required />
                <DateField
                  value={issueDate}
                  onChange={setIssueDate}
                  ariaLabel={t('createInvoice.fields.issueDate')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.dueDate')} required />
                <DateField
                  value={dueDate}
                  onChange={(next) => {
                    setDueDate(next)
                    setDueDateTouched(true)
                  }}
                  min={issueDate}
                  ariaLabel={t('createInvoice.fields.dueDate')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.deliveryDate')} />
                <DateField
                  value={deliveryDate}
                  onChange={setDeliveryDate}
                  max={issueDate}
                  ariaLabel={t('createInvoice.fields.deliveryDate')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.paymentTerms')} required />
                <Select
                  value={paymentTerms}
                  onChange={setPaymentTerms}
                  options={PAYMENT_TERMS_OPTIONS}
                  ariaLabel={t('createInvoice.fields.paymentTerms')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.branch')} required />
                <Select
                  value={branch}
                  onChange={setBranch}
                  options={BRANCH_OPTIONS}
                  ariaLabel={t('createInvoice.fields.branch')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.currency')} required />
                <Select
                  value={currency}
                  onChange={setCurrency}
                  options={CURRENCY_OPTIONS}
                  ariaLabel={t('createInvoice.fields.currency')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.taxCategory')} required />
                <Select
                  value={defaultTaxCategory}
                  onChange={setDefaultTaxCategory}
                  options={TAX_CATEGORY_OPTIONS}
                  ariaLabel={t('createInvoice.fields.taxCategory')}
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.project')} />
                <div className="flex h-[50px] w-full items-center rounded-sm border border-border-subtle bg-neutral-25 px-4">
                  <span className="text-sm font-medium text-text-quaternary">
                    {t('createInvoice.values.projectPending')}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.subject')} />
                <FieldShell>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={500}
                    aria-label={t('createInvoice.fields.subject')}
                    className="w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                  />
                </FieldShell>
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel label={t('createInvoice.fields.po')} />
                <FieldShell>
                  <input
                    value={purchaseOrder}
                    onChange={(e) => setPurchaseOrder(e.target.value)}
                    maxLength={200}
                    aria-label={t('createInvoice.fields.po')}
                    className="w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                  />
                </FieldShell>
              </div>
            </div>
          </section>

          {customerType === 'consumer' ? (
            <aside className="flex min-h-[400px] flex-col rounded-sm border border-[#f3f3f3] bg-surface-card p-4">
              <h3 className="text-base font-medium text-text-primary">
                {t('createInvoice.consumer.receiptQr')}
              </h3>
              <div className="my-4 h-px bg-border-subtle" />
              <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
                <img src={receiptQrIcon} alt="" className="size-[140px]" />
                <p className="max-w-[175px] whitespace-pre-line text-sm font-medium leading-[1.2] text-text-secondary">
                  {t('createInvoice.consumer.receiptQrHint')}
                </p>
              </div>
            </aside>
          ) : null}
        </div>

        {/* 3 Items */}
        <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle step={3} title={t('createInvoice.sections.items')} />
            <div className="inline-flex rounded-md border border-border-subtle p-0.5">
              <button
                type="button"
                onClick={() => switchVatMode(true)}
                className={[
                  'rounded-sm px-3 py-1.5 text-sm font-medium',
                  exclVat ? 'bg-primary-50 text-primary-800' : 'text-text-quaternary',
                ].join(' ')}
              >
                {t('createInvoice.items.exclVat')}
              </button>
              <button
                type="button"
                onClick={() => switchVatMode(false)}
                className={[
                  'rounded-sm px-3 py-1.5 text-sm font-medium',
                  !exclVat ? 'bg-primary-50 text-primary-800' : 'text-text-quaternary',
                ].join(' ')}
              >
                {t('createInvoice.items.inclVat')}
              </button>
            </div>
          </div>
          <div className="h-px w-full bg-border-subtle" />

          <div className="overflow-x-auto">
            <div className="min-w-[1040px]">
              <div className="grid grid-cols-[1.5fr_0.5fr_0.6fr_0.5fr_0.5fr_0.85fr_0.7fr] gap-2 px-1 text-sm font-medium text-text-tertiary">
                <span>{t('createInvoice.items.description')}</span>
                <span>{t(exclVat ? 'createInvoice.items.excl' : 'createInvoice.items.incl')}</span>
                <span>{t('createInvoice.items.vat')}</span>
                <span>{t('createInvoice.items.qty')}</span>
                <span>{t('createInvoice.items.unit')}</span>
                <span>{t('createInvoice.items.discount')}</span>
                <span>{t('createInvoice.items.totExcl')}</span>
              </div>
              <div className="mt-3 flex flex-col gap-3">
                {lines.map((row, index) => {
                  const amounts = projected.lines[index]
                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1.5fr_0.5fr_0.6fr_0.5fr_0.5fr_0.85fr_0.7fr] items-start gap-2"
                    >
                      {/* A line names a catalogue product (decision D7, over INV-PD-010's free text). */}
                      <ProductPicker
                        productId={row.productId}
                        label={row.description}
                        onPick={(product) => updateLine(row.id, lineFromProduct(product, exclVat))}
                      />
                      <FieldShell>
                        <input
                          value={row.unitPrice}
                          onChange={(e) => updateLine(row.id, { unitPrice: e.target.value })}
                          inputMode="decimal"
                          aria-label={t('createInvoice.items.excl')}
                          className="w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                        />
                      </FieldShell>
                      {/* Catalogue-resolved: the rate is never typed (INV-FR-161/162). */}
                      <Select
                        value={row.taxCode ?? TAX_CATEGORIES.find((c) => c.rate === row.vatRate)?.code ?? 'S5'}
                        onChange={(code) =>
                          updateLine(row.id, {
                            taxCode: code,
                            vatRate: TAX_CATEGORIES.find((c) => c.code === code)?.rate ?? '5',
                          })
                        }
                        options={TAX_CATEGORY_OPTIONS}
                        ariaLabel={t('createInvoice.items.vat')}
                      />
                      <FieldShell>
                        <input
                          value={row.quantity}
                          onChange={(e) => updateLine(row.id, { quantity: e.target.value })}
                          inputMode="decimal"
                          aria-label={t('createInvoice.items.qty')}
                          className="w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                        />
                      </FieldShell>
                      <Select
                        value={row.unit}
                        onChange={(unit) => updateLine(row.id, { unit })}
                        options={unitOptionsWith(row.unit)}
                        ariaLabel={t('createInvoice.items.unit')}
                      />
                      <DiscountField
                        type={row.discountType}
                        value={row.discountValue}
                        onTypeChange={(discountType) => updateLine(row.id, { discountType })}
                        onValueChange={(discountValue) => updateLine(row.id, { discountValue })}
                        resolved={amounts?.lineDiscount ?? 0n}
                      />
                      <div className="flex items-center justify-between gap-2 pe-1 pt-3">
                        <OmAmount
                          value={formatAtScale(amounts?.afterLineDiscount ?? 0n)}
                          size="md"
                        />
                        <button
                          type="button"
                          onClick={() => removeLine(row.id)}
                          className="inline-flex size-8 items-center justify-center rounded-sm hover:bg-neutral-25"
                          aria-label={t('createInvoice.items.remove')}
                        >
                          <img src={deleteLineIcon} alt="" className="size-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={addLine}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-sm border border-dashed border-primary-300 text-sm font-semibold text-primary-800"
          >
            <span className="text-xl leading-none">+</span>
            {t('createInvoice.items.addLine')}
          </button>

          <div className="ms-auto w-full max-w-[360px] space-y-3 pt-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-text-tertiary">
                {t('createInvoice.items.subtotal')}
              </span>
              <OmAmount value={formatAtScale(projected.subtotal)} size="md" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-text-tertiary">
                {t('createInvoice.items.lineDiscounts')}
              </span>
              <span className="inline-flex items-center gap-1 text-text-tertiary">
                −<OmAmount value={formatAtScale(projected.itemDiscount)} size="md" />
              </span>
            </div>

            {/* Document-level discount — allocated across lines after their own discounts. */}
            <div className="flex flex-col gap-2 rounded-sm bg-surface-tab-bar p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-text-secondary">
                  {t('createInvoice.items.documentDiscount')}
                </span>
                <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary">
                  −<OmAmount value={formatAtScale(projected.headerDiscount)} size="md" />
                </span>
              </div>
              <div className="flex items-center gap-2">
                <DiscountTypeToggle
                  value={headerDiscountType}
                  onChange={setHeaderDiscountType}
                  label={t('createInvoice.items.documentDiscount')}
                />
                <input
                  value={headerDiscountValue}
                  onChange={(e) => setHeaderDiscountValue(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  aria-label={t('createInvoice.items.documentDiscount')}
                  className="h-9 min-w-0 flex-1 rounded-sm border border-primary-300 bg-white px-3 text-sm font-medium text-text-secondary outline-none"
                />
              </div>
              <p className="text-xs font-medium leading-[1.3] text-text-tertiary">
                {t('createInvoice.items.documentDiscountHint')}
              </p>
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-text-tertiary">
                {t('createInvoice.items.totalExcluding')}
              </span>
              <OmAmount value={formatAtScale(projected.taxable)} size="md" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-text-tertiary">
                {t('createInvoice.items.vatAmount')}
              </span>
              <OmAmount value={formatAtScale(projected.vat)} size="md" />
            </div>
            <div className="h-px bg-border-subtle" />
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">
                {t('createInvoice.items.totalAmount')}
              </span>
              <OmAmount value={formatAtScale(projected.total)} size="lg" />
            </div>
          </div>
        </section>

        {/* 4 Link related documents — the delivery notes and orders this invoice settles. */}
        <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
          <LinkedDocuments
            titleSlot={<SectionTitle step={4} title={t('createInvoice.sections.linked')} />}
            docs={linkedDocs}
            linkableCount={linkableCount}
            onLink={() => setLinkModalOpen(true)}
            onRemove={(id: string) =>
              setLinkedDocs((cur: LinkedDoc[]) => cur.filter((d) => d.id !== id))
            }
          />
        </section>

        {/* 5 Payment & status */}
        <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
          <SectionTitle step={5} title={t('createInvoice.sections.payment')} />
          <div className="h-px w-full bg-border-subtle" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.paymentMethod')} />
              <Select
                value={paymentMethod}
                onChange={setPaymentMethod}
                options={PAYMENT_METHOD_OPTIONS}
                ariaLabel={t('createInvoice.fields.paymentMethod')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.paymentReference')} />
              <FieldShell>
                <input
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  maxLength={200}
                  aria-label={t('createInvoice.fields.paymentReference')}
                  className="w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                />
              </FieldShell>
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.paymentDate')} />
              <DateField
                value={paymentDate}
                onChange={setPaymentDate}
                min={issueDate}
                ariaLabel={t('createInvoice.fields.paymentDate')}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-8 pt-2">
            <div className="flex max-w-md items-start gap-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={markPaid}
                aria-label={t('createInvoice.toggles.paid')}
                onClick={() => setMarkPaid((v) => !v)}
                className={[
                  'relative mt-0.5 h-[23px] w-[42px] shrink-0 rounded-full transition-colors',
                  markPaid ? 'bg-primary-700' : 'bg-neutral-200',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute top-[2.5px] size-[18px] rounded-full bg-white transition-all',
                    markPaid ? 'start-[21px]' : 'start-[2.5px]',
                  ].join(' ')}
                />
              </button>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {t('createInvoice.toggles.paid')}
                </p>
                <p className="text-sm font-medium text-text-quaternary">
                  {t('createInvoice.toggles.paidHint')}
                </p>
              </div>
            </div>
            <div className="flex max-w-xl items-start gap-2.5">
              <button
                type="button"
                role="switch"
                aria-checked={markSent}
                aria-label={t('createInvoice.toggles.sent')}
                onClick={() => setMarkSent((v) => !v)}
                className={[
                  'relative mt-0.5 h-[23px] w-[42px] shrink-0 rounded-full transition-colors',
                  markSent ? 'bg-primary-700' : 'bg-neutral-200',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute top-[2.5px] size-[18px] rounded-full bg-white transition-all',
                    markSent ? 'start-[21px]' : 'start-[2.5px]',
                  ].join(' ')}
                />
              </button>
              <div>
                <p className="text-sm font-medium text-text-primary">
                  {t('createInvoice.toggles.sent')}
                </p>
                <p className="text-sm font-medium text-text-quaternary">
                  {t('createInvoice.toggles.sentHint')}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 5 Notes */}
        <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
          <SectionTitle step={6} title={t('createInvoice.sections.notes')} />
          <div className="h-px w-full bg-border-subtle" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <span className="text-text-primary">{t('createInvoice.notes.toCustomer')}</span>
                <span className="text-xs text-text-quaternary">
                  {t('createInvoice.notes.onInvoice')}
                </span>
              </div>
              <textarea
                value={customerNote}
                onChange={(e) => setCustomerNote(e.target.value)}
                rows={3}
                aria-label={t('createInvoice.notes.toCustomer')}
                className="min-h-[71px] w-full resize-y rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-4 text-sm font-medium leading-[1.4] text-text-secondary outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <span className="text-text-primary">{t('createInvoice.notes.internal')}</span>
                <span className="text-xs text-text-quaternary">
                  {t('createInvoice.notes.private')}
                </span>
              </div>
              <textarea
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                rows={3}
                aria-label={t('createInvoice.notes.internal')}
                className="min-h-[71px] w-full resize-y rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-4 text-sm font-medium leading-[1.4] text-text-secondary outline-none"
              />
            </div>
          </div>
          {attachments.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {attachments.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-3 py-2.5"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-text-primary">
                      {file.name}
                    </span>
                    <span className="text-xs font-medium text-text-quaternary">
                      {formatFileSize(file.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setAttachments((cur) => cur.filter((f) => f.id !== file.id))}
                    aria-label={t('createInvoice.notes.removeFile', { name: file.name })}
                    className="flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-neutral-25"
                  >
                    <img src={deleteLineIcon} alt="" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {uploadError ? (
            <p className="text-sm font-medium text-danger-700">{uploadError}</p>
          ) : null}
          <FileDropzone
            accept=".pdf,.jpg,.jpeg,.png,.xlsx"
            multiple
            maxBytes={10 * 1024 * 1024}
            onFiles={(files) => {
              setUploadError('')
              setAttachments((cur) =>
                [
                  ...cur,
                  ...files.map((f, i) => ({
                    id: `F${Date.now()}-${i}`,
                    name: f.name,
                    size: f.size,
                  })),
                ].slice(0, 10),
              )
            }}
            onReject={(reason, file) =>
              setUploadError(
                t(
                  reason === 'size'
                    ? 'createInvoice.notes.tooLarge'
                    : 'createInvoice.notes.wrongType',
                  {
                    name: file.name,
                  },
                ),
              )
            }
          >
            {({ dragging }) => (
              <span
                className={[
                  'flex min-h-[129px] flex-col items-center justify-center gap-2 rounded-sm border border-dashed px-4 py-6 text-center transition-colors',
                  dragging
                    ? 'border-primary-700 bg-primary-25'
                    : 'border-primary-300 bg-surface-tab-bar',
                ].join(' ')}
              >
                <img src={uploadIcon} alt="" className="size-6" />
                <span className="text-sm font-semibold text-text-secondary">
                  {t('createInvoice.notes.uploadTitle')}
                </span>
                <span className="text-sm font-medium text-text-quaternary">
                  {t('createInvoice.notes.uploadHint')}
                </span>
              </span>
            )}
          </FileDropzone>
        </section>
      </div>

      {/* Sticky footer actions */}
      {/* Starts after the 248px sidebar so the bar never sits on top of it. */}
      <div className="fixed bottom-0 end-0 start-0 z-20 border-t border-black/10 bg-surface-tab-bar md:start-[248px]">
        <div className="mx-auto flex max-w-[1144px] items-center justify-end gap-3 px-4 py-4">
          <button
            type="button"
            className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
          >
            <img src={eyeIcon} alt="" className="size-6" />
            {t('createInvoice.actions.preview')}
          </button>
          <button
            type="button"
            className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
          >
            <img src={saveDraftIcon} alt="" className="size-6 rotate-180" />
            {t('createInvoice.actions.saveDraft')}
          </button>
          <button
            type="button"
            className="inline-flex h-[54px] w-[255px] items-center justify-center gap-1.5 rounded-sm bg-primary-700 text-base font-semibold text-white hover:bg-primary-800"
          >
            {t('createInvoice.actions.submit')}
            <img src={arrowIcon} alt="" className="size-[18px]" />
          </button>
        </div>
      </div>

      <ScanToFillModal
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onApply={applyScan}
        onExtract={extractInvoice}
      />
      <LinkDocumentsModal
        open={linkModalOpen}
        customer={selectedCustomer?.name ?? ''}
        initialSelected={linkedDocs.map((d) => d.id)}
        onClose={() => setLinkModalOpen(false)}
        onConfirm={(docs) => {
          setLinkedDocs(docs)
          setLinkModalOpen(false)
        }}
      />
      <AddCustomerModal
        open={addCustomerOpen}
        onClose={() => setAddCustomerOpen(false)}
        onSave={handleSaveCustomer}
      />
    </AppShell>
  )
}
