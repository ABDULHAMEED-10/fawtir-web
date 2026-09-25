import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import {
  Combobox,
  DateField,
  FileDropzone,
  Modal,
  OmAmount,
  Popover,
  Select,
  Switch,
  withRial,
  type SelectOption,
} from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { AddCustomerModal } from '../../components/AddCustomerModal'
import { IssueInvoiceModal } from '../../components/invoice/IssueInvoiceModal'
import { ClassificationField } from '../../components/invoice/ClassificationField'
import { useApiRead } from '../../hooks'
import { apiRequest, type Page } from '../../api'
import { ApiError } from '../../api/errors'
import {
  createCustomer,
  customerListPath,
  loadCustomerPage,
  newCustomerKey,
  type CustomerDto,
  type CustomerTypeDto,
} from '../../api/customers/customers'
import { productSearchPath, searchProducts, type ProductDto } from '../../api/catalog/products'
import {
  BRANCHES_PATH,
  createDraft,
  discardDraft,
  loadBranches,
  loadDraft,
  loadInternalNote,
  newIdempotencyKey,
  previewDraft,
  saveDraft,
  type BranchDto,
  type DraftPreview,
} from '../../api/invoices/drafts'
import { PAYMENT_METHOD_OPTIONS, TAX_CATEGORIES } from '../../lib/catalogues'
import {
  NEEDS_EXEMPTION_REASON,
  PAYMENT_TERMS,
  blankDraftForm,
  blankDraftLine,
  fromDraftResponse,
  itemTypeOfUnit,
  paymentTermOf,
  placeFieldErrors,
  problemsBeforeIssue,
  problemsBeforeSave,
  taxOptionOf,
  toDraftRequest,
  unitsFor,
  type CustomerKind,
  type DraftForm,
  type DraftLine,
  type FormProblem,
  type ItemType,
} from '../../lib/invoiceDraft'
import { blankCustomerForm, customerProblems, toCustomerRequest } from '../../lib/customerForm'
import { lineFromProduct, taxCategoryOf } from '../../lib/productLine'
import { describeApiFailure } from '../../lib/apiFailure'
import { missingCustomerFields } from '../../lib/customerEligibility'
import { formatAmount as formatMoney } from '../../lib/format'
import { ACCOUNTS } from '../../lib/shell'
import { usageForecast } from '../../lib/settings'
import { can, useSession } from '../../lib/session/session'
import {
  calculateInvoice,
  formatAmount,
  formatAtScale,
  parseAmount,
  projectInvoice,
  toExclusivePrice,
  type DiscountType,
} from '../../lib/invoiceMath'
import { INDUSTRIAL_CLASSIFICATION } from '../../lib/settingsCompany'
import { nameOf } from '../../lib/codeLists/codeList'
import backIcon from '../../assets/create-invoice/back.svg'
import businessIcon from '../../assets/create-invoice/business.svg'
import consumerIcon from '../../assets/create-invoice/consumer.svg'
import governmentIcon from '../../assets/create-invoice/government.svg'
import tickIcon from '../../assets/create-invoice/tick.svg'
import customerLogo from '../../assets/create-invoice/customer-logo.svg'
import peppolIcon from '../../assets/create-invoice/peppol.svg'
import chevronIcon from '../../assets/create-invoice/chevron.svg'
import saveDraftIcon from '../../assets/create-invoice/save-draft.svg'
import arrowIcon from '../../assets/create-invoice/arrow.svg'
import qrBadgeIcon from '../../assets/create-invoice/qr-badge.svg'
import receiptQrIcon from '../../assets/create-invoice/receipt-qr.svg'
import deleteLineIcon from '../../assets/create-invoice/delete.svg'

const CUSTOMER_TYPE: Record<CustomerKind, CustomerTypeDto> = {
  business: 'BUSINESS',
  consumer: 'CONSUMER',
  government: 'GOVERNMENT',
}
const KIND_OF: Record<CustomerTypeDto, CustomerKind> = {
  BUSINESS: 'business',
  CONSUMER: 'consumer',
  GOVERNMENT: 'government',
}

/** How long typing pauses before a server search goes. */
const SEARCH_DELAY_MS = 250
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024
const ATTACHMENT_TYPES = '.pdf,.jpg,.jpeg,.png,.xlsx'

/** The Oman calendar day, which is the day an invoice is issued on. */
function muscatToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())
}

/** Preview refusals the composer can explain in words; anything else reads as a general failure. */
const PREVIEW_REASONS = new Set([
  'INVOICE_LINES_REQUIRED',
  'LINE_DISCOUNT_EXCEEDS_BASE',
  'HEADER_DISCOUNT_EXCEEDS_BASE',
  'LINE_DISCOUNT_PERCENTAGE_INVALID',
  'HEADER_DISCOUNT_PERCENTAGE_INVALID',
  'EXEMPTION_REASON_REQUIRED',
  'TAX_CATEGORY_METADATA_CONFLICT',
])

type Translate = (key: string, values?: Record<string, unknown>) => string

function failureText(t: Translate, error: unknown): string {
  const message = describeApiFailure(error)
  const body = t(message.key, message.values)
  return message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body
}

/** A price as the row keeps it: three decimals, never negative, `0.000` for nothing. */
function normalisePrice(raw: string): string {
  const cleaned = raw.replace(/,/g, '').trim()
  if (cleaned === '' || Number.isNaN(Number(cleaned))) return '0.000'
  const value = parseAmount(cleaned)
  return formatAmount(value < 0n ? 0n : value, 3).replace(/,/g, '')
}

/**
 * The branch the account is working in (`lib/shell`), found among the tenant's branches by its
 * town, code or name; the head office, then the first branch, stand in when none matches.
 */
function currentBranch(branches: BranchDto[]): BranchDto | undefined {
  const current = ACCOUNTS.find((account) => account.current)
  const town = current?.town.toLowerCase() ?? ''
  const match =
    town &&
    branches.find((branch) =>
      [branch.city, branch.code, branch.name, branch.id].some((part) =>
        part?.toLowerCase().includes(town),
      ),
    )
  return match || branches.find((branch) => branch.type === 'HEAD_OFFICE') || branches[0]
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

function FieldLabel({
  label,
  required,
  hint,
}: {
  label: string
  required?: boolean
  hint?: string
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-medium leading-[1.2] text-text-primary">
      <span>{label}</span>
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      {hint ? <span className="text-xs text-text-quaternary">{hint}</span> : null}
    </div>
  )
}

function FieldShell({
  children,
  highlighted,
  tone,
}: {
  children: ReactNode
  highlighted?: boolean
  tone?: 'text'
}) {
  return (
    <div
      className={[
        'flex h-[50px] w-full items-center justify-between rounded-sm border px-4',
        tone === 'text' ? 'border-border-subtle bg-neutral-25' : 'border-primary-300',
        tone !== 'text' && highlighted
          ? 'bg-primary-25'
          : tone !== 'text'
            ? 'bg-surface-tab-bar'
            : '',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

const INPUT =
  'w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder'

/** A figure with the rial sign at the figure's size; the sign takes the figure's colour. */
function Money({
  value,
  size = 'sm',
  muted,
}: {
  value: string
  size?: 'sm' | 'md' | 'lg'
  muted?: boolean
}) {
  const text =
    size === 'lg'
      ? 'text-[22px] font-semibold'
      : size === 'md'
        ? 'text-base font-semibold'
        : 'text-sm font-semibold'
  return (
    <OmAmount
      amount={value}
      size={size === 'lg' ? 'md' : 'xs'}
      className={['gap-0.5', muted ? 'text-text-quaternary' : 'text-text-secondary'].join(' ')}
      iconClassName={muted ? 'text-text-quaternary' : ''}
      amountClassName={[text, muted ? 'text-text-quaternary' : 'text-text-secondary'].join(' ')}
    />
  )
}

/** `%` / rial switch. The type is stored explicitly — `INV-FR-180` forbids inferring it. */
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
      aria-label={`${label}, ${t('createInvoice.items.discountType')}`}
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

/** Goods or service, one per line; the unit list follows it. */
function ItemTypeToggle({
  value,
  onChange,
  line,
}: {
  value: ItemType
  onChange: (next: ItemType) => void
  line: number
}) {
  const { t } = useTranslation()
  const options: ItemType[] = ['goods', 'service']
  return (
    <span
      role="group"
      aria-label={t('createInvoice.items.typeOfLine', { line })}
      className="inline-flex h-[50px] w-full items-center overflow-hidden rounded-sm border border-primary-300 bg-surface-tab-bar p-1"
    >
      {options.map((option) => {
        const active = option === value
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={active}
            className={[
              'inline-flex h-[40px] min-w-0 flex-1 items-center justify-center rounded-[3px] px-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-primary-700 text-white' : 'text-text-tertiary hover:text-text-secondary',
            ].join(' ')}
          >
            {t(`createInvoice.items.${option}`)}
          </button>
        )
      })}
    </span>
  )
}

/** Line discount cell: type, value, and — when a percentage — the rial it resolves to, live. */
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
          onFocus={selectAllOnFocus}
          aria-label={t('createInvoice.items.discount')}
          className="w-full min-w-0 border-0 bg-transparent px-1 text-sm font-medium text-text-secondary outline-none"
        />
        <DiscountTypeToggle
          value={type}
          onChange={onTypeChange}
          label={t('createInvoice.items.discount')}
        />
      </div>
      {type === 'PERCENTAGE' && resolved > 0n ? (
        <span className="ps-1 text-xs font-medium leading-[1.2] text-text-tertiary">
          = {formatAtScale(resolved)} {withRial(t('createInvoice.items.omr'))}
        </span>
      ) : null}
    </div>
  )
}

function FieldError({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium leading-[1.3] text-danger-700">{children}</p>
}

/**
 * The catalogue, beside a line's description: a product fills the line (name, unit, price, tax)
 * and the description stays free text after it. Nothing is fetched until the list is opened.
 */
function CataloguePick({ onPick }: { onPick: (product: ProductDto) => void }) {
  const { t, i18n } = useTranslation()
  const [typed, setTyped] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  useEffect(() => {
    if (typed === null) return
    const timer = window.setTimeout(() => setQuery(typed), typed === '' ? 0 : SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [typed])
  const path = query === null ? null : productSearchPath(query)
  const found = useApiRead<Page<ProductDto>>(path, () => searchProducts(path!))
  const products = found.read.status === 'ready' ? found.read.data.items : []
  const emptyText =
    found.read.status === 'failed'
      ? t(describeApiFailure(found.read.error).key)
      : found.read.status === 'loading' || query === null
        ? t('productPicker.searching')
        : t('productPicker.none')
  return (
    <Combobox
      value=""
      onChange={(id) => {
        const product = products.find((candidate) => candidate.id === id)
        if (product) onPick(product)
      }}
      options={products.map((product) => ({
        value: product.id,
        label: product.name,
        hint: t('productPicker.hint', {
          code: product.code,
          price: formatMoney(product.defaultUnitPrice, 'OMR', i18n.language),
          unit: product.defaultUnitCode,
          tax:
            taxCategoryOf(product.defaultTaxCategory, product.defaultTaxRate)?.label ??
            product.defaultTaxCategory,
        }),
      }))}
      onSearch={setTyped}
      searchPlaceholder={t('productPicker.search')}
      emptyText={emptyText}
      ariaLabel={t('createInvoice.items.pickFromCatalogue')}
      renderTrigger={({ open }) => (
        <span
          title={t('createInvoice.items.pickFromCatalogue')}
          className={[
            'inline-flex size-8 items-center justify-center rounded-sm text-primary-800 transition-colors hover:bg-primary-25',
            open ? 'bg-primary-25' : '',
          ].join(' ')}
        >
          <img
            src={chevronIcon}
            alt=""
            className={['size-6', open ? '-rotate-90' : 'rotate-90'].join(' ')}
          />
        </span>
      )}
    />
  )
}

export function CreateInvoicePage() {
  return (
    <AppShell>
      <InvoiceComposer />
    </AppShell>
  )
}

type DraftMeta = {
  id: string
  version: number
  state: 'DRAFT' | 'ISSUED' | 'CANCELLED' | 'DISCARDED'
}
type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: DraftPreview }
  | { status: 'failed'; error: unknown }

/** A consumer invoice names the person by name and one way to send the receipt. */
type WalkIn = { name: string; contact: string }

/** Payment & status. TODO(backend): no draft field carries any of these; kept on screen only. */
type PaymentState = {
  method: string
  reference: string
  date: string
  paid: boolean
  sent: boolean
}

/**
 * The invoice composer, for a new draft (`/invoices/new`) or a saved one (`/invoices/:id/edit`).
 *
 * What a draft holds is saved. The design's payment block, linked documents and
 * attachments are drawn and wait for their fields (each marked TODO(backend)). Issuing saves first,
 * then confirms.
 */
function InvoiceComposer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const session = useSession()
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const canSave = can(session, 'invoice.draft')
  const canIssue = canSave && can(session, 'invoice.issue')
  const canReadNote = can(session, 'invoice.internal-note.read')
  const canAddCustomer = can(session, 'customer.manage')

  const [form, setForm] = useState<DraftForm>(blankDraftForm)
  const [exclVat, setExclVat] = useState(true)
  const [meta, setMeta] = useState<DraftMeta | null>(null)
  const [customer, setCustomer] = useState<CustomerDto | null>(null)
  const [walkIn, setWalkIn] = useState<WalkIn>({ name: '', contact: '' })
  const [loading, setLoading] = useState(Boolean(id))
  const [loadError, setLoadError] = useState<unknown>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [problems, setProblems] = useState<FormProblem[]>([])
  const [serverLineErrors, setServerLineErrors] = useState<Record<number, Record<string, string>>>(
    {},
  )
  const [notice, setNotice] = useState<{
    tone: 'error' | 'success'
    body: string
    stale?: boolean
  } | null>(null)
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' })
  const [issueDate, setIssueDate] = useState(muscatToday)
  const [dueDate, setDueDate] = useState(() => paymentTermOf('NET30')!.due(muscatToday()))
  const [dueDateTouched, setDueDateTouched] = useState(false)
  const [defaultTax, setDefaultTax] = useState('S5')
  const [payment, setPayment] = useState<PaymentState>({
    method: '30',
    reference: '',
    date: '',
    paid: false,
    sent: false,
  })
  // TODO(backend): attachments need a draft to exist and an upload endpoint; held here until then.
  const [attachments, setAttachments] = useState<File[]>([])
  const [discardOpen, setDiscardOpen] = useState(false)
  /** The saved draft being confirmed for issue. */
  const [issuing, setIssuing] = useState<DraftMeta | null>(null)
  /** The draft this screen just created; landing on its edit URL must not reload it over the form. */
  const justCreated = useRef<string | null>(null)

  const branches = useApiRead<BranchDto[]>(BRANCHES_PATH, loadBranches)
  const branchList = useMemo(
    () => (branches.read.status === 'ready' ? branches.read.data : []),
    [branches.read],
  )

  const runPreview = async (draftId: string) => {
    setPreview({ status: 'loading' })
    try {
      setPreview({ status: 'ready', data: await previewDraft(draftId) })
    } catch (error) {
      setPreview({ status: 'failed', error })
    }
  }

  useEffect(() => {
    if (!id || justCreated.current === id) return
    let cancelled = false
    setLoading(true)
    setLoadError(null)
    ;(async () => {
      try {
        const loaded = await loadDraft(id)
        const record = await apiRequest<CustomerDto>(
          `/v1/customers/${encodeURIComponent(loaded.customerId)}`,
        ).catch(() => null)
        const kind: CustomerKind = record
          ? KIND_OF[record.type]
          : loaded.details.transactionType === 'SIMPLIFIED'
            ? 'consumer'
            : 'business'
        const next = fromDraftResponse(loaded, kind)
        if (canReadNote) {
          next.internalNote = await loadInternalNote(id)
            .then((note) => note.internalNote ?? '')
            .catch(() => null)
        }
        if (cancelled) return
        setForm(next)
        setCustomer(record)
        if (record && kind === 'consumer') {
          setWalkIn({
            name: record.displayName,
            contact: record.profile.contact?.emailRecipients?.[0] ?? '',
          })
        }
        setMeta({ id: loaded.id, version: loaded.version, state: loaded.authoringState })
        setDirty(false)
        if (loaded.authoringState === 'DRAFT') void runPreview(loaded.id)
      } catch (error) {
        if (!cancelled) setLoadError(error)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // The note permission is fixed for the session; the draft id is what reloads the screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // A new draft starts on the branch the account is working in.
  useEffect(() => {
    if (form.branchId || branchList.length === 0) return
    const preferred = currentBranch(branchList)
    if (preferred) setForm((current) => ({ ...current, branchId: preferred.id }))
  }, [branchList, form.branchId])

  // INV-PD-005 — terms fill the due date until the person takes it over.
  useEffect(() => {
    if (dueDateTouched || !issueDate) return
    const term = paymentTermOf(form.paymentTerms)
    if (term) setDueDate(term.due(issueDate))
  }, [form.paymentTerms, issueDate, dueDateTouched])

  // "Saved just now" ages into a time after a minute.
  const [, tick] = useState(0)
  useEffect(() => {
    if (savedAt === null) return
    const timer = window.setInterval(() => tick((n) => n + 1), 30_000)
    return () => window.clearInterval(timer)
  }, [savedAt])

  const change = (patch: Partial<DraftForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    setDirty(true)
  }
  const updateLine = (lineId: string, patch: Partial<DraftLine>) => {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)),
    }))
    setDirty(true)
  }
  const removeLine = (lineId: string) => {
    setForm((current) =>
      current.lines.length > 1
        ? { ...current, lines: current.lines.filter((line) => line.id !== lineId) }
        : current,
    )
    setDirty(true)
  }
  const addLine = () => {
    setForm((current) => ({ ...current, lines: [...current.lines, blankDraftLine(defaultTax)] }))
    setDirty(true)
  }
  /**
   * Goods or service: the unit follows when the current one does not belong to the new kind, and
   * the other kind's classification is cleared (an HS code means nothing on a service line).
   */
  const setItemType = (line: DraftLine, itemType: ItemType) => {
    const units = unitsFor(itemType)
    updateLine(line.id, {
      itemType,
      unit: units.includes(line.unit) ? line.unit : units[0],
      ...(itemType === 'goods' ? { serviceType: undefined } : { hsCode: undefined }),
    })
  }
  const fillFromProduct = (line: DraftLine, product: ProductDto) => {
    const patch = lineFromProduct(product, exclVat)
    updateLine(line.id, { ...patch, itemType: itemTypeOfUnit(patch.unit) })
  }
  /** The header's default category goes onto every line still at the previous default. */
  const setDefaultTaxCategory = (code: string) => {
    const tax = TAX_CATEGORIES.find((category) => category.code === code)
    if (!tax) return
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.taxCode === defaultTax ? { ...line, taxCode: tax.code, vatRate: tax.rate } : line,
      ),
    }))
    setDefaultTax(code)
    setDirty(true)
  }

  /** INV-PD-019 option A — inclusive is an entry mode; flipping it converts the typed prices. */
  const switchVatMode = (toExclusive: boolean) => {
    if (toExclusive === exclVat) return
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) => {
        const rate = parseAmount(line.vatRate)
        const price = parseAmount(line.unitPrice)
        if (rate === 0n || price === 0n) return line
        const hundred = parseAmount('100')
        const next = toExclusive
          ? (price * hundred) / (hundred + rate)
          : (price * (hundred + rate)) / hundred
        return { ...line, unitPrice: formatAmount(next, 3).replace(/,/g, '') }
      }),
    }))
    setExclVat(toExclusive)
  }

  /** The live estimate: the same algorithm as the server, and only an estimate until saved. */
  const estimate = useMemo(
    () =>
      projectInvoice(
        calculateInvoice(
          form.lines.map((line, index) => ({
            id: line.id,
            lineNumber: index + 1,
            quantity: line.quantity || '0',
            unitPrice: exclVat
              ? line.unitPrice || '0'
              : toExclusivePrice(line.unitPrice || '0', line.vatRate),
            vatRate: line.vatRate || '0',
            discountType: line.discountType,
            discountValue: line.discountValue || '0',
          })),
          form.headerDiscountType,
          form.headerDiscountValue || '0',
        ),
      ),
    [form.lines, form.headerDiscountType, form.headerDiscountValue, exclVat],
  )

  const saved = preview.status === 'ready' && !dirty ? preview.data : null
  const figures = saved
    ? {
        subtotal: formatMoney(saved.totals.subtotal, 'OMR', language),
        discount: formatMoney(saved.totals.totalDiscount, 'OMR', language),
        lineDiscount: formatMoney(saved.totals.itemLevelDiscount, 'OMR', language),
        headerDiscount: formatMoney(saved.totals.headerDiscount, 'OMR', language),
        taxable: formatMoney(saved.totals.taxableAmount, 'OMR', language),
        vat: formatMoney(saved.totals.vatAmount, 'OMR', language),
        total: formatMoney(saved.totals.totalAmount, 'OMR', language),
      }
    : {
        subtotal: formatAtScale(estimate.subtotal),
        discount: formatAtScale(estimate.itemDiscount + estimate.headerDiscount),
        lineDiscount: formatAtScale(estimate.itemDiscount),
        headerDiscount: formatAtScale(estimate.headerDiscount),
        taxable: formatAtScale(estimate.taxable),
        vat: formatAtScale(estimate.vat),
        total: formatAtScale(estimate.total),
      }
  const figuresNote = saved
    ? t('invoiceDraft.figures.saved')
    : preview.status === 'failed' && !dirty
      ? t('invoiceDraft.figures.failed', { reason: previewReason(t, preview.error) })
      : meta
        ? t('invoiceDraft.figures.dirty')
        : t('invoiceDraft.figures.new')

  const editable = canSave && (!meta || meta.state === 'DRAFT')
  const consumer = form.customerType === 'consumer'

  /**
   * A walk-in consumer becomes a customer record first (the draft names one): name split into
   * first and last, and the contact as an e-mail or a phone. Answers the id, or null when refused.
   */
  const ensureConsumer = async (): Promise<string | null> => {
    if (form.customerId) return form.customerId
    if (!walkIn.name.trim()) {
      setProblems((current) => [
        ...current,
        { field: 'customer', key: 'invoiceDraft.problem.walkInName' },
      ])
      return null
    }
    if (!canAddCustomer) {
      setNotice({ tone: 'error', body: t('invoiceDraft.walkInPermission') })
      return null
    }
    const words = walkIn.name.trim().split(/\s+/)
    const values = blankCustomerForm('CONSUMER')
    values.firstName = words[0]
    values.lastName = words.slice(1).join(' ') || words[0]
    const contact = walkIn.contact.trim()
    if (contact.includes('@')) values.emails = contact
    else values.mobilePhone = contact
    const refused = Object.entries(customerProblems(values))
    if (refused.length > 0) {
      setNotice({
        tone: 'error',
        body: t('invoiceDraft.walkInRefused', { reason: t(refused[0][1]) }),
      })
      return null
    }
    try {
      const created = await createCustomer(newCustomerKey(), toCustomerRequest(values))
      setCustomer(created)
      setForm((current) => ({ ...current, customerId: created.id }))
      return created.id
    } catch (error) {
      setNotice({
        tone: 'error',
        body: t('invoiceDraft.walkInRefused', { reason: failureText(t, error) }),
      })
      return null
    }
  }

  /** Saves the form as the draft and answers the saved draft, or null when it was refused. */
  const persist = async (): Promise<DraftMeta | null> => {
    let current = form
    setServerLineErrors({})
    setProblems([])
    if (consumer && !current.customerId) {
      setSaving(true)
      const customerId = await ensureConsumer().finally(() => setSaving(false))
      if (!customerId) {
        setNotice((existing) => existing ?? { tone: 'error', body: t('invoiceDraft.fixFirst') })
        return null
      }
      current = { ...current, customerId }
    }
    const found = problemsBeforeSave(current)
    setProblems(found)
    if (found.length > 0) {
      setNotice({ tone: 'error', body: t('invoiceDraft.fixFirst') })
      return null
    }
    setSaving(true)
    setNotice(null)
    const body = toDraftRequest(current, exclVat)
    try {
      const result = meta
        ? await saveDraft(meta.id, meta.version, body)
        : await createDraft(newIdempotencyKey(), body)
      const savedMeta: DraftMeta = {
        id: result.id,
        version: result.version,
        state: result.authoringState,
      }
      setMeta(savedMeta)
      setDirty(false)
      setSavedAt(Date.now())
      if (!meta) {
        justCreated.current = result.id
        navigate(`/invoices/${result.id}/edit`, { replace: true })
      }
      void runPreview(result.id)
      return savedMeta
    } catch (error) {
      if (error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION') {
        setNotice({ tone: 'error', body: t('invoiceDraft.stale'), stale: true })
      } else if (error instanceof ApiError && error.fieldErrors.length > 0) {
        const placed = placeFieldErrors(error.fieldErrors)
        setServerLineErrors(placed.lines)
        setNotice({
          tone: 'error',
          body: [t('invoiceDraft.serverRefused'), ...placed.other].join(' '),
        })
      } else {
        setNotice({ tone: 'error', body: failureText(t, error) })
      }
      return null
    } finally {
      setSaving(false)
    }
  }

  const save = async () => {
    if (await persist()) setNotice({ tone: 'success', body: t('invoiceDraft.saved') })
  }

  /** The design's Preview: the draft saved and priced by the server, so the figures are real. */
  const previewFigures = async () => {
    if (meta && !dirty) {
      await runPreview(meta.id)
      setNotice({ tone: 'success', body: t('invoiceDraft.previewed') })
      return
    }
    if (await persist()) setNotice({ tone: 'success', body: t('invoiceDraft.previewed') })
  }

  /**
   * Issuing is of the draft as stored, so what is on screen is saved first when it differs. The
   * line classification is checked here rather than at save: a draft may still lack it, an
   * issued full tax invoice may not (IBR-079-OM, IBR-155-OM); a consumer's invoice skips it.
   */
  const issue = async () => {
    const missing = problemsBeforeIssue(form)
    if (missing.length > 0) {
      setProblems([...problemsBeforeSave(form), ...missing])
      setNotice({ tone: 'error', body: t('invoiceDraft.fixFirst') })
      return
    }
    const savedMeta = meta && !dirty ? meta : await persist()
    if (savedMeta) setIssuing(savedMeta)
  }

  const discard = async () => {
    if (!meta) return
    try {
      await discardDraft(meta.id, meta.version)
      navigate('/invoices')
    } catch (error) {
      setDiscardOpen(false)
      setNotice({
        tone: 'error',
        body:
          error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION'
            ? t('invoiceDraft.stale')
            : failureText(t, error),
        stale: error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION',
      })
    }
  }

  const pickCustomerType = (kind: CustomerKind) => {
    if (kind === form.customerType) return
    // A customer of another kind cannot stay: the invoice's transaction type follows the tab.
    const keep = customer && KIND_OF[customer.type] === kind
    change({ customerType: kind, customerId: keep ? form.customerId : null })
    if (!keep) setCustomer(null)
  }

  const problemFor = (field: string) =>
    problems.find((problem) => problem.field === field && problem.line === undefined)
  const lineMessages = (index: number): string[] => [
    ...problems.filter((problem) => problem.line === index).map((problem) => t(problem.key)),
    ...Object.values(serverLineErrors[index] ?? {}),
  ]

  if (loading) {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
        <LoadingNotice />
      </div>
    )
  }
  if (loadError) {
    return (
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
        <ApiReadFailure error={loadError} retry={() => navigate(0)} />
      </div>
    )
  }

  const customerTypes: { id: CustomerKind; titleKey: string; subtitleKey: string; icon: string }[] =
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
  const branchOptions: SelectOption[] = branchList.map((branch) => ({
    value: branch.id,
    label: branch.name,
    hint: branch.code,
  }))
  const termOptions: SelectOption[] = PAYMENT_TERMS.map((term) => ({
    value: term.code,
    label: t(term.labelKey),
  }))
  if (form.paymentTerms && !paymentTermOf(form.paymentTerms)) {
    termOptions.push({
      value: form.paymentTerms,
      label: form.paymentTermsLabel ?? form.paymentTerms,
    })
  }
  const taxOptions: SelectOption[] = TAX_CATEGORIES.map((category) => ({
    value: category.code,
    label: t(`createInvoice.taxCategories.${category.code}`),
    hint: `EN 16931 · ${category.categoryId}`,
  }))
  const unitOptions = (line: DraftLine): SelectOption[] => {
    const codes = [...unitsFor(line.itemType)]
    // A product's unit may be one the short list does not carry; it is shown rather than dropped.
    if (!codes.includes(line.unit)) codes.push(line.unit)
    return codes.map((code) => ({
      value: code,
      label: t(`createInvoice.units.${code}`, { defaultValue: code }),
    }))
  }
  const usage = usageForecast()
  const savedText = dirty
    ? t('createInvoice.header.unsaved')
    : savedAt === null
      ? meta
        ? t('createInvoice.header.saved')
        : t('createInvoice.header.notSaved')
      : Date.now() - savedAt < 60_000
        ? t('createInvoice.header.savedJustNow')
        : t('createInvoice.header.savedAt', {
            time: new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(
              savedAt,
            ),
          })
  const lineColumns = consumer
    ? 'grid-cols-[minmax(220px,1fr)_124px_96px_66px_66px_106px_118px_100px]'
    : 'grid-cols-[minmax(220px,1fr)_124px_156px_96px_66px_66px_106px_118px_100px]'
  const steps = consumer
    ? { items: 3, payment: 4, notes: 5 }
    : { items: 3, linked: 4, payment: 5, notes: 6 }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28 max-md:pb-44">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/invoices"
            className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary"
          >
            {t('createInvoice.breadcrumb')}
            <img src={backIcon} alt="" className="size-6 rotate-180 rtl:rotate-0" />
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {meta ? t('invoiceDraft.editTitle') : t('createInvoice.title')}
            </h1>
            <span className="text-sm font-medium text-[#8f8f8f]">
              {meta ? t('invoiceDraft.meta.saved') : t('invoiceDraft.meta.new')}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <span
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-tertiary"
            aria-live="polite"
          >
            <img
              src={tickIcon}
              alt=""
              className={[
                'size-[18px]',
                dirty || savedAt === null ? 'opacity-40 grayscale' : '',
              ].join(' ')}
            />
            {savedText}
          </span>
          {/* TODO(backend): the plan's invoice count for the period; `lib/settings` stands in. */}
          <div className="flex min-w-[190px] flex-col gap-1">
            <p className="text-sm font-medium leading-none text-text-primary">
              <span className="text-base font-semibold">{usage.used.toLocaleString(language)}</span>{' '}
              <span className="text-xs text-text-quaternary">
                {t('createInvoice.header.usage', {
                  allowance: usage.allowance.toLocaleString(language),
                })}
              </span>
            </p>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-background">
              <div
                className="h-full rounded-full bg-primary-700"
                style={{ width: `${Math.min(100, usage.percent)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {meta && meta.state !== 'DRAFT' ? (
        <Notice
          body={t('invoiceDraft.notEditable', { state: t(`invoiceDraft.state.${meta.state}`) })}
        />
      ) : !canSave ? (
        <Notice body={t('invoiceDraft.readOnly')} />
      ) : null}
      {notice ? (
        <Notice
          body={notice.body}
          action={
            notice.stale
              ? { label: t('invoiceDraft.reload'), onClick: () => navigate(0) }
              : { label: t('common.close'), onClick: () => setNotice(null) }
          }
        />
      ) : null}

      {/* 1 Customer + Summary */}
      <div className="grid gap-4 xl:grid-cols-[1fr_332px]">
        <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
          <SectionTitle step={1} title={t('createInvoice.sections.customer')} />
          <div className="h-px w-full bg-border-subtle" />
          <div className="grid gap-3 sm:grid-cols-3">
            {customerTypes.map((type) => {
              const active = type.id === form.customerType
              return (
                <button
                  key={type.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => pickCustomerType(type.id)}
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

          {consumer ? (
            <WalkInFields
              value={walkIn}
              customer={customer}
              onChange={(next) => {
                setWalkIn(next)
                // A changed name is a different person: the record is looked up or created again.
                if (customer && next.name !== customer.displayName) {
                  setCustomer(null)
                  change({ customerId: null })
                } else setDirty(true)
              }}
              onPick={(picked) => {
                setCustomer(picked)
                setWalkIn({
                  name: picked.displayName,
                  contact: picked.profile.contact?.emailRecipients?.[0] ?? '',
                })
                change({ customerId: picked.id })
              }}
            />
          ) : (
            <CustomerCard
              kind={form.customerType}
              customer={customer}
              onPick={(picked) => {
                setCustomer(picked)
                change({ customerId: picked.id })
              }}
            />
          )}
          {problemFor('customer') ? (
            <FieldError>{t(problemFor('customer')!.key)}</FieldError>
          ) : null}
          {consumer ? (
            <div className="flex items-center gap-2.5 rounded-sm border border-primary-50 bg-primary-25 p-2">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-sm bg-white">
                <img src={qrBadgeIcon} alt="" className="size-8" />
              </span>
              <p className="text-xs font-medium leading-[1.2] text-text-tertiary">
                {t('createInvoice.consumer.peppolNote')}
              </p>
            </div>
          ) : null}
        </section>

        <aside
          className="rounded-sm border border-[#f3f3f3] bg-surface-card p-4"
          aria-label={t('createInvoice.summary.title')}
        >
          <h3 className="text-base font-medium text-text-primary">
            {t('createInvoice.summary.title')}
          </h3>
          <div className="my-4 h-px bg-border-subtle" />
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary/70">
                {t('createInvoice.summary.subtotal')}
              </span>
              <Money value={figures.subtotal} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary/50">
                {t('createInvoice.summary.discount')}
              </span>
              <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-text-quaternary">
                − <Money value={figures.discount} muted />
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary/70">
                {t('createInvoice.summary.net')}
              </span>
              <Money value={figures.taxable} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">
                {t('createInvoice.summary.vat')}
              </span>
              <Money value={figures.vat} />
            </div>
          </div>
          <div className="my-4 h-px bg-border-subtle" />
          <div className="flex items-center justify-between">
            <span className="text-base font-medium text-text-primary/90">
              {t('createInvoice.summary.totalDue')}
            </span>
            <Money value={figures.total} size="lg" />
          </div>
          <p
            className={[
              'mt-3 text-xs font-medium leading-[1.3]',
              preview.status === 'failed' && !dirty ? 'text-danger-700' : 'text-text-tertiary',
            ].join(' ')}
          >
            {figuresNote}
          </p>
        </aside>
      </div>

      {/* 2 Invoice details (+ Receipt QR for consumer) */}
      <div className={consumer ? 'grid gap-4 xl:grid-cols-[1fr_332px]' : undefined}>
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
              <span className="text-xs font-medium text-text-tertiary">
                {t('invoiceDraft.datesAtIssue')}
              </span>
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
                value={form.deliveryDate}
                onChange={(deliveryDate) => change({ deliveryDate })}
                max={issueDate}
                ariaLabel={t('createInvoice.fields.deliveryDate')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.paymentTerms')} required />
              <Select
                value={form.paymentTerms}
                onChange={(paymentTerms) => {
                  setDueDateTouched(false)
                  change({ paymentTerms })
                }}
                options={termOptions}
                ariaLabel={t('createInvoice.fields.paymentTerms')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.branch')} required />
              <Select
                value={form.branchId ?? ''}
                onChange={(branchId) => change({ branchId })}
                options={branchOptions}
                placeholder={
                  branches.read.status === 'failed'
                    ? t('invoiceDraft.branchesFailed')
                    : t('appAccess.loading')
                }
                ariaLabel={t('createInvoice.fields.branch')}
              />
              {problemFor('branch') ? (
                <FieldError>{t(problemFor('branch')!.key)}</FieldError>
              ) : null}
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.currency')} required />
              {/* INV-PD-006: invoices are in OMR, the tenant's tax currency; issue refuses any other. */}
              <Select
                value="OMR"
                onChange={() => undefined}
                options={[{ value: 'OMR', label: t('createInvoice.values.currency') }]}
                ariaLabel={t('createInvoice.fields.currency')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.taxCategory')} required />
              <Select
                value={defaultTax}
                onChange={setDefaultTaxCategory}
                options={taxOptions}
                ariaLabel={t('createInvoice.fields.taxCategory')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.po')} />
              <FieldShell>
                <input
                  value={form.purchaseOrder}
                  onChange={(e) => change({ purchaseOrder: e.target.value })}
                  maxLength={200}
                  aria-label={t('createInvoice.fields.po')}
                  className={INPUT}
                />
              </FieldShell>
            </div>
          </div>
          <div className="grid gap-4">
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.subject')} />
              <FieldShell>
                <input
                  value={form.subject}
                  onChange={(e) => change({ subject: e.target.value })}
                  maxLength={500}
                  aria-label={t('createInvoice.fields.subject')}
                  className={INPUT}
                />
              </FieldShell>
            </div>
          </div>
          {/* The issuer's ISIC activity is a company setting the backend copies onto every line
              (IBR-081-OM); the composer shows it and never asks for it. */}
          {consumer ? null : (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-medium leading-[1.3] text-text-tertiary">
              <span className="text-text-secondary">
                {t('invoiceDraft.businessActivity', {
                  code: INDUSTRIAL_CLASSIFICATION.code,
                  name: nameOf(INDUSTRIAL_CLASSIFICATION, language),
                })}
              </span>
              <span>{t('invoiceDraft.businessActivityHint')}</span>
              <Link
                to="/settings/company"
                className="font-semibold text-primary-800 hover:underline"
              >
                {t('invoiceDraft.businessActivityLink')}
              </Link>
            </p>
          )}
        </section>

        {consumer ? (
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
          <SectionTitle step={steps.items} title={t('createInvoice.sections.items')} />
          <div
            role="group"
            aria-label={t('createInvoice.vatMode.label')}
            className="inline-flex rounded-md border border-border-subtle p-0.5"
          >
            {[true, false].map((exclusive) => (
              <button
                key={String(exclusive)}
                type="button"
                onClick={() => switchVatMode(exclusive)}
                aria-pressed={exclVat === exclusive}
                className={[
                  'whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium transition-colors',
                  exclVat === exclusive ? 'bg-primary-50 text-primary-800' : 'text-text-quaternary',
                ].join(' ')}
              >
                {t(
                  exclusive ? 'createInvoice.vatMode.exclShort' : 'createInvoice.vatMode.inclShort',
                )}
              </button>
            ))}
          </div>
        </div>
        <div className="h-px w-full bg-border-subtle" />

        <div className="overflow-x-auto">
          <div className="min-w-[1080px]">
            <div
              className={[
                'grid gap-1.5 px-1 text-xs font-semibold uppercase tracking-[0.06em] text-text-tertiary',
                lineColumns,
              ].join(' ')}
            >
              <span>{t('createInvoice.items.description')}</span>
              <span>{t('createInvoice.items.type')}</span>
              {consumer ? null : <span>{t('createInvoice.items.classification')}</span>}
              <span>{t(exclVat ? 'createInvoice.items.excl' : 'createInvoice.items.incl')}</span>
              <span>{t('createInvoice.items.vat')}</span>
              <span>{t('createInvoice.items.qty')}</span>
              <span>{t('createInvoice.items.unit')}</span>
              <span>{t('createInvoice.items.discount')}</span>
              <span>{t('createInvoice.items.totExcl')}</span>
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {form.lines.map((row, index) => {
                const amounts = estimate.lines[index]
                const tax = taxOptionOf(row)
                const messages = lineMessages(index)
                return (
                  <div key={row.id} className="flex flex-col gap-1">
                    <div className={['grid items-start gap-1.5', lineColumns].join(' ')}>
                      {/* The catalogue sits inside the field's end, so the text keeps the width. */}
                      <div className="flex h-[50px] min-w-0 items-center gap-1 rounded-sm border border-primary-300 bg-surface-tab-bar ps-4 pe-1.5">
                        <input
                          value={row.description}
                          onChange={(e) => updateLine(row.id, { description: e.target.value })}
                          maxLength={500}
                          placeholder={t('createInvoice.items.descriptionPlaceholder')}
                          aria-label={t('createInvoice.items.description')}
                          className={[INPUT, 'min-w-0 flex-1'].join(' ')}
                        />
                        <span className="w-8 shrink-0">
                          <CataloguePick onPick={(product) => fillFromProduct(row, product)} />
                        </span>
                      </div>
                      <ItemTypeToggle
                        value={row.itemType}
                        onChange={(itemType) => setItemType(row, itemType)}
                        line={index + 1}
                      />
                      {/* One column, two lists: the HS code of a product, the type of a service. */}
                      {consumer ? null : row.itemType === 'goods' ? (
                        <ClassificationField
                          kind="goods"
                          value={row.hsCode ?? ''}
                          onChange={(hsCode) => updateLine(row.id, { hsCode })}
                          ariaLabel={t('classification.hsCode')}
                        />
                      ) : (
                        <ClassificationField
                          kind="service"
                          value={row.serviceType ?? ''}
                          onChange={(serviceType) => updateLine(row.id, { serviceType })}
                          ariaLabel={t('classification.serviceType')}
                        />
                      )}
                      <FieldShell>
                        <input
                          value={row.unitPrice}
                          onChange={(e) => updateLine(row.id, { unitPrice: e.target.value })}
                          onBlur={(e) =>
                            updateLine(row.id, { unitPrice: normalisePrice(e.target.value) })
                          }
                          inputMode="decimal"
                          onFocus={selectAllOnFocus}
                          aria-label={t(
                            exclVat ? 'createInvoice.items.excl' : 'createInvoice.items.incl',
                          )}
                          className={INPUT}
                        />
                      </FieldShell>
                      <div className="flex flex-col gap-1">
                        {/* Read from the catalogue or the header default, never picked here (INV-FR-161/162). */}
                        <FieldShell tone="text">
                          <span
                            className="block truncate text-sm font-medium text-text-secondary"
                            title={t(`createInvoice.taxCategories.${tax.code}`)}
                          >
                            {tax.rate}%
                            <span className="ms-1 text-xs font-medium text-text-quaternary">
                              {tax.categoryId}
                            </span>
                          </span>
                        </FieldShell>
                        {NEEDS_EXEMPTION_REASON.has(tax.categoryId) ? (
                          <input
                            value={row.exemptionReason}
                            onChange={(e) =>
                              updateLine(row.id, { exemptionReason: e.target.value })
                            }
                            maxLength={500}
                            placeholder={t('invoiceDraft.exemptionReason')}
                            aria-label={t('invoiceDraft.exemptionReason')}
                            className="h-9 w-full rounded-sm border border-primary-300 bg-white px-2 text-xs font-medium text-text-secondary outline-none"
                          />
                        ) : null}
                      </div>
                      <FieldShell>
                        <input
                          value={row.quantity}
                          onChange={(e) => updateLine(row.id, { quantity: e.target.value })}
                          inputMode="decimal"
                          onFocus={selectAllOnFocus}
                          aria-label={t('createInvoice.items.qty')}
                          className={INPUT}
                        />
                      </FieldShell>
                      <Select
                        value={row.unit}
                        onChange={(unit) => updateLine(row.id, { unit })}
                        options={unitOptions(row)}
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
                        <Money value={formatAtScale(amounts?.afterLineDiscount ?? 0n)} size="md" />
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
                    {messages.length > 0 ? (
                      <div
                        className="flex flex-col gap-0.5 ps-1"
                        data-testid={`line-${index + 1}-errors`}
                      >
                        {messages.map((message) => (
                          <FieldError key={message}>
                            {t('invoiceDraft.lineError', { line: index + 1, message })}
                          </FieldError>
                        ))}
                      </div>
                    ) : null}
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
            <Money value={figures.subtotal} size="md" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-text-tertiary">
              {t('createInvoice.items.lineDiscounts')}
            </span>
            <span className="inline-flex items-center gap-1 text-text-tertiary">
              −<Money value={figures.lineDiscount} size="md" />
            </span>
          </div>
          {/* Document-level discount — allocated across lines after their own discounts. */}
          <div className="flex flex-col gap-2 rounded-sm bg-surface-tab-bar p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text-secondary">
                {t('createInvoice.items.documentDiscount')}
              </span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary">
                −<Money value={figures.headerDiscount} size="md" />
              </span>
            </div>
            <div className="flex items-center gap-2">
              <DiscountTypeToggle
                value={form.headerDiscountType}
                onChange={(headerDiscountType) => change({ headerDiscountType })}
                label={t('createInvoice.items.documentDiscount')}
              />
              <input
                value={form.headerDiscountValue}
                onChange={(e) => change({ headerDiscountValue: e.target.value })}
                inputMode="decimal"
                onFocus={selectAllOnFocus}
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
              {t('createInvoice.items.netAmount')}
            </span>
            <Money value={figures.taxable} size="md" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-text-tertiary">{t('createInvoice.summary.vat')}</span>
            <Money value={figures.vat} size="md" />
          </div>
          <div className="h-px bg-border-subtle" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">
              {t('createInvoice.items.totalAmount')}
            </span>
            <Money value={figures.total} size="lg" />
          </div>
        </div>
      </section>

      {/* 4 Link related documents — business and government (Figma 154:162909) */}
      {consumer ? null : (
        <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <SectionTitle step={steps.linked!} title={t('createInvoice.sections.linked')} />
            {/* TODO(backend): order forms and delivery notes have no API yet; nothing can be linked. */}
            <button
              type="button"
              disabled
              title={t('createInvoice.linked.pending')}
              className="inline-flex h-11 items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-50"
            >
              {t('createInvoice.linked.linkDocuments')}
            </button>
          </div>
          <div className="h-px w-full bg-border-subtle" />
          <p className="rounded-sm border border-dashed border-primary-300 px-4 py-5 text-center text-sm font-medium text-text-tertiary">
            {t('createInvoice.linked.empty')}
          </p>
        </section>
      )}

      {/* 5 Payment & status */}
      <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
        <SectionTitle step={steps.payment} title={t('createInvoice.sections.payment')} />
        <div className="h-px w-full bg-border-subtle" />
        {/* TODO(backend): payment method, reference, date and the two marks have no draft field. */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="flex flex-col gap-1">
            <FieldLabel label={t('createInvoice.fields.paymentMethod')} />
            <Select
              value={payment.method}
              onChange={(method) => setPayment((current) => ({ ...current, method }))}
              options={PAYMENT_METHOD_OPTIONS.map((option) => ({
                ...option,
                label: t(`createInvoice.paymentMethods.${option.value}`),
              }))}
              ariaLabel={t('createInvoice.fields.paymentMethod')}
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel label={t('createInvoice.fields.paymentReference')} />
            <FieldShell>
              <input
                value={payment.reference}
                onChange={(e) =>
                  setPayment((current) => ({ ...current, reference: e.target.value }))
                }
                maxLength={100}
                aria-label={t('createInvoice.fields.paymentReference')}
                className={INPUT}
              />
            </FieldShell>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel label={t('createInvoice.fields.paymentDate')} />
            <DateField
              value={payment.date}
              onChange={(date) => setPayment((current) => ({ ...current, date }))}
              ariaLabel={t('createInvoice.fields.paymentDate')}
            />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2 md:divide-x md:divide-border-subtle">
          {(
            [
              {
                id: 'paid',
                title: t('createInvoice.toggles.paid'),
                hint: t('createInvoice.toggles.paidHint'),
              },
              {
                id: 'sent',
                title: t('createInvoice.toggles.sent'),
                hint: t('createInvoice.toggles.sentHint'),
              },
            ] as const
          ).map((toggle) => (
            <div key={toggle.id} className="flex items-start gap-3 md:ps-4 md:first:ps-0">
              <Switch
                checked={payment[toggle.id]}
                onChange={(next) => setPayment((current) => ({ ...current, [toggle.id]: next }))}
                label={toggle.title}
              />
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-text-primary">{toggle.title}</span>
                <span className="text-xs font-medium leading-[1.3] text-text-tertiary">
                  {toggle.hint}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 6 Notes & attachments */}
      <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
        <SectionTitle step={steps.notes} title={t('createInvoice.sections.notes')} />
        <div className="h-px w-full bg-border-subtle" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel
              label={t('createInvoice.notes.toCustomer')}
              hint={t('createInvoice.notes.onInvoice')}
            />
            <textarea
              value={form.customerNote}
              onChange={(e) => change({ customerNote: e.target.value })}
              maxLength={2000}
              rows={3}
              aria-label={t('createInvoice.notes.toCustomer')}
              className="min-h-[71px] w-full resize-y rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-4 text-sm font-medium leading-[1.4] text-text-secondary outline-none"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel
              label={t('createInvoice.notes.internal')}
              hint={t('createInvoice.notes.private')}
            />
            {form.internalNote === null ? (
              <p className="rounded-sm border border-border-subtle bg-neutral-25 px-4 py-4 text-sm font-medium text-text-tertiary">
                {t('invoiceDraft.noteHidden')}
              </p>
            ) : (
              <textarea
                value={form.internalNote}
                onChange={(e) => change({ internalNote: e.target.value })}
                maxLength={2000}
                rows={3}
                aria-label={t('createInvoice.notes.internal')}
                className="min-h-[71px] w-full resize-y rounded-sm border border-primary-300 bg-surface-tab-bar px-4 py-4 text-sm font-medium leading-[1.4] text-text-secondary outline-none"
              />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel label={t('createInvoice.notes.supportingDocuments')} />
          <FileDropzone
            accept={ATTACHMENT_TYPES}
            multiple
            maxBytes={ATTACHMENT_MAX_BYTES}
            onFiles={(files) => setAttachments((current) => [...current, ...files])}
            onReject={(reason, file) =>
              setNotice({
                tone: 'error',
                body: t(
                  reason === 'size'
                    ? 'createInvoice.notes.tooLarge'
                    : 'createInvoice.notes.wrongType',
                  { name: file.name },
                ),
              })
            }
            className="w-full"
          >
            {({ dragging }) => (
              <span
                className={[
                  'flex min-h-[120px] w-full flex-col items-center justify-center gap-1 rounded-sm border border-dashed px-4 py-6 text-center transition-colors',
                  dragging
                    ? 'border-primary-500 bg-primary-25'
                    : 'border-primary-300 bg-surface-tab-bar',
                ].join(' ')}
              >
                <img src={saveDraftIcon} alt="" className="size-6 rotate-180" />
                <span className="text-sm font-medium text-text-secondary">
                  {t('createInvoice.notes.uploadTitle')}
                </span>
                <span className="text-xs font-medium text-text-tertiary">
                  {t('createInvoice.notes.uploadHint')}
                </span>
              </span>
            )}
          </FileDropzone>
          {attachments.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-1">
              {attachments.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle bg-white px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-medium text-text-secondary">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setAttachments((current) => current.filter((_, i) => i !== index))
                    }
                    aria-label={t('createInvoice.notes.removeFile', { name: file.name })}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-neutral-25"
                  >
                    <img src={deleteLineIcon} alt="" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </section>

      {/* Sticky footer actions. Starts after the 248px sidebar so the bar never sits on top of it. */}
      {editable ? (
        <div className="fixed bottom-0 end-0 start-0 z-20 border-t border-black/10 bg-surface-tab-bar md:start-[248px]">
          <div className="mx-auto flex max-w-[1144px] flex-wrap items-center justify-end gap-3 px-4 py-4">
            {meta ? (
              <button
                type="button"
                onClick={() => setDiscardOpen(true)}
                className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-danger-700"
              >
                <img src={deleteLineIcon} alt="" className="size-5" />
                {t('invoiceDraft.discard')}
              </button>
            ) : null}
            <button
              type="button"
              onClick={previewFigures}
              disabled={saving}
              className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-60"
            >
              <EyeIcon />
              {t('createInvoice.actions.preview')}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className={
                canIssue
                  ? 'inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-60'
                  : 'inline-flex h-[54px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60'
              }
            >
              <img
                src={saveDraftIcon}
                alt=""
                className={canIssue ? 'size-6 rotate-180' : 'size-6 rotate-180 brightness-0 invert'}
              />
              {saving ? t('invoiceDraft.saving') : t('createInvoice.actions.saveDraft')}
            </button>
            {canIssue ? (
              <button
                type="button"
                onClick={issue}
                disabled={saving}
                className="inline-flex h-[54px] w-[255px] max-w-full items-center justify-center gap-1.5 rounded-sm bg-primary-700 text-base font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
              >
                {t('createInvoice.actions.submit')}
                <img src={arrowIcon} alt="" className="size-[18px] rtl:-scale-x-100" />
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {issuing ? (
        <IssueInvoiceModal
          invoiceId={issuing.id}
          version={issuing.version}
          initialIssueDate={issueDate}
          initialDueDate={dueDate}
          onClose={() => setIssuing(null)}
          onIssued={(issued) =>
            navigate(`/invoices/${issued.id}`, { state: { issuedNumber: issued.invoiceNumber } })
          }
        />
      ) : null}

      <Modal
        open={discardOpen}
        onClose={() => setDiscardOpen(false)}
        title={t('invoiceDraft.discardTitle')}
        footer={
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setDiscardOpen(false)}
              className="inline-flex h-11 items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary"
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={discard}
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

function EyeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

/** The server's field paths as a sentence; see `lib/customerEligibility.ts`. */
function missingFieldsText(paths: readonly string[], t: Translate, language: string): string {
  const join = (items: string[]) =>
    new Intl.ListFormat(language, { type: 'conjunction' }).format(items)
  return join(
    missingCustomerFields(paths, (key) => t(key), join).map((phrase) =>
      t(phrase.key, phrase.values),
    ),
  )
}

function previewReason(t: Translate, error: unknown): string {
  if (error instanceof ApiError && error.code && PREVIEW_REASONS.has(error.code)) {
    return t(`invoiceDraft.previewReason.${error.code}`)
  }
  return failureText(t, error)
}

/** Debounced server search of the tab's kind of customer, for a picker and for name suggestions. */
function useCustomerSearch(kind: CustomerKind) {
  const [typed, setTyped] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  useEffect(() => {
    if (typed === null) return
    const timer = window.setTimeout(() => setQuery(typed), typed === '' ? 0 : SEARCH_DELAY_MS)
    return () => window.clearTimeout(timer)
  }, [typed])
  const path =
    query === null
      ? null
      : customerListPath({
          type: CUSTOMER_TYPE[kind],
          search: query,
          sort: 'NAME_ASC',
          page: 0,
          size: 20,
        })
  const found = useApiRead<Page<CustomerDto>>(path, () => loadCustomerPage(path!))
  return {
    search: setTyped,
    query,
    status: found.read.status,
    candidates: found.read.status === 'ready' ? found.read.data.items : [],
  }
}

/**
 * The chosen customer, and the picker that changes it. Only customers of the tab's kind are
 * offered: the invoice's transaction type (full or simplified) follows the tab. Quick add sits
 * under the list, so the card keeps the design's one control.
 */
function CustomerCard({
  kind,
  customer,
  onPick,
}: {
  kind: CustomerKind
  customer: CustomerDto | null
  onPick: (customer: CustomerDto) => void
}) {
  const { t, i18n } = useTranslation()
  const session = useSession()
  // Quick add covers a company; a government customer needs the full form's procurement references.
  const canAdd = kind === 'business' && can(session, 'customer.manage')
  const [adding, setAdding] = useState(false)
  const language = i18n.language
  const { search, query, status, candidates } = useCustomerSearch(kind)
  const vat = customer?.profile.details?.vatRegistrationNumber ?? null

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-3 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {customer ? (
            <img src={customerLogo} alt="" className="size-12 rounded-sm object-cover" />
          ) : (
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-sm bg-white text-sm font-semibold text-primary-800">
              +
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">
              {customer?.displayName ?? t('createInvoice.customer.select')}
            </p>
            <p className="truncate text-xs font-medium text-text-quaternary">
              {customer
                ? vat
                  ? t('invoiceDraft.vat', { number: vat })
                  : '—'
                : t('invoiceDraft.selectHint')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {customer?.peppolDelivery === 'ACTIVE' ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary-75 bg-white/70 py-1.5 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
              <img src={peppolIcon} alt="" className="size-4" />
              {t('createInvoice.customer.onPeppol')}
            </span>
          ) : null}
          <div className="w-auto">
            <Combobox
              value={customer?.id ?? ''}
              onChange={(picked) => {
                const next = candidates.find((candidate) => candidate.id === picked)
                if (next) onPick(next)
              }}
              options={candidates.map((candidate) => ({
                value: candidate.id,
                label: candidate.displayName,
                hint: candidate.profile.details?.vatRegistrationNumber ?? undefined,
              }))}
              onSearch={search}
              searchPlaceholder={t('invoiceDraft.customerSearch')}
              emptyText={
                status === 'loading' || query === null
                  ? t('productPicker.searching')
                  : t('invoiceDraft.noCustomers')
              }
              ariaLabel={
                customer ? t('createInvoice.customer.change') : t('createInvoice.customer.select')
              }
              renderTrigger={({ open }) => (
                <span className="inline-flex items-center gap-0.5 rounded-sm border border-border-subtle bg-white py-1.5 ps-3.5 pe-2.5 text-sm font-semibold text-primary-800">
                  {customer
                    ? t('createInvoice.customer.change')
                    : t('createInvoice.customer.select')}
                  <img
                    src={chevronIcon}
                    alt=""
                    className={[
                      'size-6 transition-transform',
                      open ? '-rotate-90' : 'rotate-90',
                    ].join(' ')}
                  />
                </span>
              )}
              footer={
                canAdd
                  ? ({ close }) => (
                      <button
                        type="button"
                        onClick={() => {
                          close()
                          setAdding(true)
                        }}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-start text-sm font-semibold text-primary-800 transition-colors hover:bg-primary-25"
                      >
                        <span aria-hidden="true" className="text-lg leading-none">
                          +
                        </span>
                        {t('createInvoice.customer.addCustomer')}
                      </button>
                    )
                  : undefined
              }
            />
          </div>
        </div>
      </div>
      {canAdd ? (
        <AddCustomerModal
          open={adding}
          kind="company"
          onClose={() => setAdding(false)}
          onCreated={(created) => onPick(created)}
        />
      ) : null}
      {customer && customer.invoiceEligible === false ? (
        <p className="text-xs font-medium leading-[1.3] text-pending-700">
          {t('invoiceDraft.notEligible', {
            fields: missingFieldsText(customer.missingInvoiceFields ?? [], t, language),
          })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A consumer, as the design asks: a name and one way to send the receipt. Consumers already on
 * file are offered as the name is typed; a new name becomes a record when the draft is saved.
 */
function WalkInFields({
  value,
  customer,
  onChange,
  onPick,
}: {
  value: WalkIn
  customer: CustomerDto | null
  onChange: (next: WalkIn) => void
  onPick: (customer: CustomerDto) => void
}) {
  const { t } = useTranslation()
  const anchor = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const { search, candidates } = useCustomerSearch('consumer')
  const suggestions = customer ? [] : candidates

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-1" ref={anchor}>
        <FieldLabel label={t('createInvoice.consumer.name')} required />
        <FieldShell>
          <input
            value={value.name}
            onChange={(e) => {
              onChange({ ...value, name: e.target.value })
              search(e.target.value)
              setOpen(e.target.value.trim() !== '')
            }}
            onFocus={() => value.name.trim() && !customer && setOpen(true)}
            maxLength={200}
            placeholder={t('createInvoice.consumer.namePlaceholder')}
            aria-label={t('createInvoice.consumer.name')}
            autoComplete="off"
            className={INPUT}
          />
        </FieldShell>
        <Popover
          open={open && suggestions.length > 0}
          anchorRef={anchor}
          onClose={() => setOpen(false)}
        >
          <ul
            role="listbox"
            aria-label={t('invoiceDraft.customerSearch')}
            className="max-h-[220px] overflow-y-auto py-1"
          >
            {suggestions.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => {
                    onPick(candidate)
                    setOpen(false)
                  }}
                  className="flex w-full flex-col gap-0.5 px-4 py-2.5 text-start transition-colors hover:bg-primary-25"
                >
                  <span className="text-sm font-medium leading-[1.2] text-text-secondary">
                    {candidate.displayName}
                  </span>
                  {candidate.profile.contact?.emailRecipients?.[0] ? (
                    <span className="text-xs font-medium leading-[1.2] text-text-quaternary">
                      {candidate.profile.contact.emailRecipients[0]}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </Popover>
        {customer ? (
          <span className="text-xs font-medium text-text-tertiary">
            {t('invoiceDraft.walkInOnFile')}
          </span>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <FieldLabel label={t('createInvoice.consumer.contact')} />
        <FieldShell>
          <input
            value={value.contact}
            onChange={(e) => onChange({ ...value, contact: e.target.value })}
            maxLength={200}
            placeholder={t('createInvoice.consumer.contactPlaceholder')}
            aria-label={t('createInvoice.consumer.contact')}
            className={INPUT}
          />
        </FieldShell>
      </div>
    </div>
  )
}
