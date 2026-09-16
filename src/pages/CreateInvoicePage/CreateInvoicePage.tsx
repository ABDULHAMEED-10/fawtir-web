import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Combobox, DateField, Modal, Select, withRial, type SelectOption } from '../../components/ui'
import { ApiReadFailure, LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import { ProductPicker } from '../../components/invoice/ProductPicker'
import { useApiRead } from '../../hooks'
import { apiRequest, type Page } from '../../api'
import { ApiError } from '../../api/errors'
import { customerListPath, loadCustomerPage, type CustomerDto, type CustomerTypeDto } from '../../api/customers/customers'
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
import { PAYMENT_TERM_DAYS, PAYMENT_TERMS_OPTIONS, TAX_CATEGORIES, TAX_CATEGORY_OPTIONS, UNIT_OPTIONS } from '../../lib/catalogues'
import {
  NEEDS_EXEMPTION_REASON,
  blankDraftForm,
  blankDraftLine,
  fromDraftResponse,
  placeFieldErrors,
  problemsBeforeSave,
  taxOptionOf,
  toDraftRequest,
  type CustomerKind,
  type DraftForm,
  type DraftLine,
  type FormProblem,
} from '../../lib/invoiceDraft'
import { lineFromProduct } from '../../lib/productLine'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount as formatMoney } from '../../lib/format'
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
import backIcon from '../../assets/create-invoice/back.svg'
import businessIcon from '../../assets/create-invoice/business.svg'
import consumerIcon from '../../assets/create-invoice/consumer.svg'
import governmentIcon from '../../assets/create-invoice/government.svg'
import tickIcon from '../../assets/create-invoice/tick.svg'
import customerLogo from '../../assets/create-invoice/customer-logo.svg'
import peppolIcon from '../../assets/create-invoice/peppol.svg'
import chevronIcon from '../../assets/create-invoice/chevron.svg'
import omrIcon from '../../assets/create-invoice/omr.svg'
import saveDraftIcon from '../../assets/create-invoice/save-draft.svg'
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

/** The Oman calendar day, which is the day an invoice is issued on. */
function muscatToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())
}

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
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

function FieldShell({ children, highlighted }: { children: ReactNode; highlighted?: boolean }) {
  return (
    <div
      className={[
        'flex h-[50px] w-full items-center justify-between rounded-sm border border-primary-300 px-4',
        highlighted ? 'bg-primary-25' : 'bg-surface-tab-bar',
      ].join(' ')}
    >
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

function OmAmount({ value, size = 'sm', muted }: { value: string; size?: 'sm' | 'md' | 'lg'; muted?: boolean }) {
  const iconSize = size === 'lg' ? 'w-6 h-auto' : 'w-4 h-auto'
  const textSize = size === 'lg' ? 'text-[22px] font-semibold' : size === 'md' ? 'text-base font-semibold' : 'text-sm font-semibold'
  return (
    <span className={['inline-flex items-center gap-0.5', muted ? 'text-text-quaternary' : 'text-text-secondary'].join(' ')}>
      <img src={omrIcon} alt="" className={iconSize} />
      <span className={textSize}>{value}</span>
    </span>
  )
}

/** `%` / `OMR` switch. The type is stored explicitly — `INV-FR-180` forbids inferring it. */
function DiscountTypeToggle({ value, onChange, label }: { value: DiscountType; onChange: (next: DiscountType) => void; label: string }) {
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
        <DiscountTypeToggle value={type} onChange={onTypeChange} label={t('createInvoice.items.discount')} />
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

function FieldError({ children }: { children: ReactNode }) {
  return <p className="text-xs font-medium leading-[1.3] text-danger-700">{children}</p>
}

export function CreateInvoicePage() {
  return (
    <AppShell>
      <InvoiceComposer />
    </AppShell>
  )
}

type DraftMeta = { id: string; version: number; state: 'DRAFT' | 'ISSUED' | 'CANCELLED' | 'DISCARDED' }
type PreviewState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; data: DraftPreview }
  | { status: 'failed'; error: unknown }

/**
 * The invoice composer, for a new draft (`/invoices/new`) or a saved one (`/invoices/:id/edit`).
 *
 * What a draft holds is saved; what the design shows beyond it waits for its own slice: the
 * payment at creation and "mark as sent" (issue and payments), linked documents (order forms),
 * the project (no backend field), attachments (a draft must exist first), and issuing itself.
 */
function InvoiceComposer() {
  const { id } = useParams()
  const navigate = useNavigate()
  const session = useSession()
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const canSave = can(session, 'invoice.draft')
  const canReadNote = can(session, 'invoice.internal-note.read')

  const [form, setForm] = useState<DraftForm>(blankDraftForm)
  const [exclVat, setExclVat] = useState(true)
  const [meta, setMeta] = useState<DraftMeta | null>(null)
  const [customer, setCustomer] = useState<CustomerDto | null>(null)
  const [loading, setLoading] = useState(Boolean(id))
  const [loadError, setLoadError] = useState<unknown>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [problems, setProblems] = useState<FormProblem[]>([])
  const [serverLineErrors, setServerLineErrors] = useState<Record<number, Record<string, string>>>({})
  const [notice, setNotice] = useState<{ tone: 'error' | 'success'; body: string; stale?: boolean } | null>(null)
  const [preview, setPreview] = useState<PreviewState>({ status: 'idle' })
  const [issueDate, setIssueDate] = useState(muscatToday)
  const [dueDate, setDueDate] = useState(() => addDays(muscatToday(), PAYMENT_TERM_DAYS.NET30))
  const [dueDateTouched, setDueDateTouched] = useState(false)
  const [defaultTax, setDefaultTax] = useState('S5')
  const [discardOpen, setDiscardOpen] = useState(false)
  /** The draft this screen just created; landing on its edit URL must not reload it over the form. */
  const justCreated = useRef<string | null>(null)

  const branches = useApiRead<BranchDto[]>(BRANCHES_PATH, loadBranches)
  const branchList = useMemo(() => (branches.read.status === 'ready' ? branches.read.data : []), [branches.read])

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
        const record = await apiRequest<CustomerDto>(`/v1/customers/${encodeURIComponent(loaded.customerId)}`).catch(() => null)
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

  // A new draft starts on the head office, or the first branch the tenant has.
  useEffect(() => {
    if (form.branchId || branchList.length === 0) return
    const preferred = branchList.find((branch) => branch.type === 'HEAD_OFFICE') ?? branchList[0]
    setForm((current) => ({ ...current, branchId: preferred.id }))
  }, [branchList, form.branchId])

  // INV-PD-005 — terms fill the due date until the person takes it over.
  useEffect(() => {
    if (dueDateTouched || !issueDate) return
    const days = PAYMENT_TERM_DAYS[form.paymentTerms]
    if (days !== undefined) setDueDate(addDays(issueDate, days))
  }, [form.paymentTerms, issueDate, dueDateTouched])

  const change = (patch: Partial<DraftForm>) => {
    setForm((current) => ({ ...current, ...patch }))
    setDirty(true)
  }
  const updateLine = (lineId: string, patch: Partial<DraftLine>) => {
    setForm((current) => ({ ...current, lines: current.lines.map((line) => (line.id === lineId ? { ...line, ...patch } : line)) }))
    setDirty(true)
  }
  const removeLine = (lineId: string) => {
    setForm((current) => (current.lines.length > 1 ? { ...current, lines: current.lines.filter((line) => line.id !== lineId) } : current))
    setDirty(true)
  }
  const addLine = () => {
    setForm((current) => ({ ...current, lines: [...current.lines, blankDraftLine(defaultTax)] }))
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
        const next = toExclusive ? (price * hundred) / (hundred + rate) : (price * (hundred + rate)) / hundred
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
            unitPrice: exclVat ? line.unitPrice || '0' : toExclusivePrice(line.unitPrice || '0', line.vatRate),
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

  const save = async () => {
    const found = problemsBeforeSave(form)
    setProblems(found)
    setServerLineErrors({})
    if (found.length > 0) {
      setNotice({ tone: 'error', body: t('invoiceDraft.fixFirst') })
      return
    }
    setSaving(true)
    setNotice(null)
    const body = toDraftRequest(form, exclVat)
    try {
      const result = meta ? await saveDraft(meta.id, meta.version, body) : await createDraft(newIdempotencyKey(), body)
      setMeta({ id: result.id, version: result.version, state: result.authoringState })
      setDirty(false)
      setNotice({ tone: 'success', body: t('invoiceDraft.saved') })
      if (!meta) {
        justCreated.current = result.id
        navigate(`/invoices/${result.id}/edit`, { replace: true })
      }
      void runPreview(result.id)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION') {
        setNotice({ tone: 'error', body: t('invoiceDraft.stale'), stale: true })
      } else if (error instanceof ApiError && error.fieldErrors.length > 0) {
        const placed = placeFieldErrors(error.fieldErrors)
        setServerLineErrors(placed.lines)
        setNotice({ tone: 'error', body: [t('invoiceDraft.serverRefused'), ...placed.other].join(' ') })
      } else {
        setNotice({ tone: 'error', body: failureText(t, error) })
      }
    } finally {
      setSaving(false)
    }
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
        body: error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION' ? t('invoiceDraft.stale') : failureText(t, error),
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

  const problemFor = (field: string) => problems.find((problem) => problem.field === field && problem.line === undefined)
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

  const customerTypes: { id: CustomerKind; titleKey: string; subtitleKey: string; icon: string }[] = [
    { id: 'business', titleKey: 'createInvoice.customerTypes.business', subtitleKey: 'createInvoice.customerTypes.businessSub', icon: businessIcon },
    { id: 'consumer', titleKey: 'createInvoice.customerTypes.consumer', subtitleKey: 'createInvoice.customerTypes.consumerSub', icon: consumerIcon },
    { id: 'government', titleKey: 'createInvoice.customerTypes.government', subtitleKey: 'createInvoice.customerTypes.governmentSub', icon: governmentIcon },
  ]
  const branchOptions: SelectOption[] = branchList.map((branch) => ({ value: branch.id, label: branch.name, hint: branch.code }))

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
      <div className="flex flex-wrap items-center gap-2">
        <Link to="/invoices" className="inline-flex items-center gap-1 text-2xl font-medium leading-[1.2] text-text-quaternary">
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

      {meta && meta.state !== 'DRAFT' ? (
        <Notice body={t('invoiceDraft.notEditable', { state: t(`invoiceDraft.state.${meta.state}`) })} />
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
                    active ? 'border-2 border-primary-500 bg-primary-50' : 'border border-border-default bg-surface-card',
                  ].join(' ')}
                >
                  <span className="flex items-center gap-2">
                    <img src={type.icon} alt="" className="size-6" />
                    <span>
                      <span className="block text-base font-medium tracking-[0.16px] text-text-primary">{t(type.titleKey)}</span>
                      <span className="block text-xs font-medium tracking-[0.12px] text-text-tertiary">{t(type.subtitleKey)}</span>
                    </span>
                  </span>
                  {active ? <img src={tickIcon} alt="" className="size-[18px]" /> : null}
                </button>
              )
            })}
          </div>

          <CustomerCard
            kind={form.customerType}
            customer={customer}
            onPick={(picked) => {
              setCustomer(picked)
              change({ customerId: picked.id })
            }}
          />
          {problemFor('customer') ? <FieldError>{t(problemFor('customer')!.key)}</FieldError> : null}
          {form.customerType === 'consumer' ? (
            <div className="flex items-center gap-2.5 rounded-sm border border-primary-50 bg-primary-25 p-2">
              <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-sm bg-white">
                <img src={qrBadgeIcon} alt="" className="size-8" />
              </span>
              <p className="text-xs font-medium leading-[1.2] text-text-tertiary">{t('createInvoice.consumer.peppolNote')}</p>
            </div>
          ) : null}
        </section>

        <aside className="rounded-sm border border-[#f3f3f3] bg-surface-card p-4" aria-label={t('createInvoice.summary.title')}>
          <h3 className="text-base font-medium text-text-primary">{t('createInvoice.summary.title')}</h3>
          <div className="my-4 h-px bg-border-subtle" />
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary/70">{t('createInvoice.summary.subtotal')}</span>
              <OmAmount value={figures.subtotal} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary/50">{t('createInvoice.summary.discount')}</span>
              <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-text-quaternary">
                − <OmAmount value={figures.discount} muted />
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-primary/70">{t('createInvoice.summary.net')}</span>
              <OmAmount value={figures.taxable} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-text-secondary">{t('createInvoice.summary.vat')}</span>
              <OmAmount value={figures.vat} />
            </div>
          </div>
          <div className="my-4 h-px bg-border-subtle" />
          <div className="flex items-center justify-between">
            <span className="text-base font-medium text-text-primary/90">{t('createInvoice.summary.totalDue')}</span>
            <OmAmount value={figures.total} size="lg" />
          </div>
          <p className={['mt-3 text-xs font-medium leading-[1.3]', preview.status === 'failed' && !dirty ? 'text-danger-700' : 'text-text-tertiary'].join(' ')}>
            {figuresNote}
          </p>
        </aside>
      </div>

      {/* 2 Invoice details (+ Receipt QR for consumer) */}
      <div className={form.customerType === 'consumer' ? 'grid gap-4 xl:grid-cols-[1fr_332px]' : undefined}>
        <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
          <SectionTitle step={2} title={t('createInvoice.sections.details')} />
          <div className="h-px w-full bg-border-subtle" />
          <div className="grid gap-4 md:grid-cols-3">
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.invoiceNumber')} required />
              <div className="flex h-[50px] w-full items-center rounded-sm border border-primary-300 bg-primary-25 px-4">
                <span className="text-sm font-medium text-text-quaternary">{t('createInvoice.values.numberOnIssue')}</span>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.issueDate')} required />
              <DateField value={issueDate} onChange={setIssueDate} ariaLabel={t('createInvoice.fields.issueDate')} />
              <span className="text-xs font-medium text-text-tertiary">{t('invoiceDraft.datesAtIssue')}</span>
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
                onChange={(paymentTerms) => change({ paymentTerms })}
                options={PAYMENT_TERMS_OPTIONS}
                ariaLabel={t('createInvoice.fields.paymentTerms')}
              />
            </div>
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.branch')} required />
              <Select
                value={form.branchId ?? ''}
                onChange={(branchId) => change({ branchId })}
                options={branchOptions}
                placeholder={branches.read.status === 'failed' ? t('invoiceDraft.branchesFailed') : t('appAccess.loading')}
                ariaLabel={t('createInvoice.fields.branch')}
              />
              {problemFor('branch') ? <FieldError>{t(problemFor('branch')!.key)}</FieldError> : null}
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
              <Select value={defaultTax} onChange={setDefaultTax} options={TAX_CATEGORY_OPTIONS} ariaLabel={t('createInvoice.fields.taxCategory')} />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <FieldLabel label={t('createInvoice.fields.subject')} />
              <FieldShell>
                <input
                  value={form.subject}
                  onChange={(e) => change({ subject: e.target.value })}
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
                  value={form.purchaseOrder}
                  onChange={(e) => change({ purchaseOrder: e.target.value })}
                  maxLength={200}
                  aria-label={t('createInvoice.fields.po')}
                  className="w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                />
              </FieldShell>
            </div>
          </div>
        </section>

        {form.customerType === 'consumer' ? (
          <aside className="flex min-h-[400px] flex-col rounded-sm border border-[#f3f3f3] bg-surface-card p-4">
            <h3 className="text-base font-medium text-text-primary">{t('createInvoice.consumer.receiptQr')}</h3>
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
              className={['rounded-sm px-3 py-1.5 text-sm font-medium', exclVat ? 'bg-primary-50 text-primary-800' : 'text-text-quaternary'].join(' ')}
            >
              {t('createInvoice.items.exclVat')}
            </button>
            <button
              type="button"
              onClick={() => switchVatMode(false)}
              className={['rounded-sm px-3 py-1.5 text-sm font-medium', !exclVat ? 'bg-primary-50 text-primary-800' : 'text-text-quaternary'].join(' ')}
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
              {form.lines.map((row, index) => {
                const amounts = estimate.lines[index]
                const tax = taxOptionOf(row)
                const messages = lineMessages(index)
                return (
                  <div key={row.id} className="flex flex-col gap-1">
                    <div className="grid grid-cols-[1.5fr_0.5fr_0.6fr_0.5fr_0.5fr_0.85fr_0.7fr] items-start gap-2">
                      {/* A line names a catalogue product (decision D7). */}
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
                          aria-label={t(exclVat ? 'createInvoice.items.excl' : 'createInvoice.items.incl')}
                          className="w-full border-0 bg-transparent text-sm font-medium text-text-secondary outline-none"
                        />
                      </FieldShell>
                      <div className="flex flex-col gap-1">
                        {/* Catalogue-resolved: the rate is never typed (INV-FR-161/162). */}
                        <Select
                          value={tax.code}
                          onChange={(code) =>
                            updateLine(row.id, { taxCode: code, vatRate: TAX_CATEGORIES.find((c) => c.code === code)?.rate ?? '5' })
                          }
                          options={TAX_CATEGORY_OPTIONS}
                          ariaLabel={t('createInvoice.items.vat')}
                        />
                        {NEEDS_EXEMPTION_REASON.has(tax.categoryId) ? (
                          <input
                            value={row.exemptionReason}
                            onChange={(e) => updateLine(row.id, { exemptionReason: e.target.value })}
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
                        <OmAmount value={formatAtScale(amounts?.afterLineDiscount ?? 0n)} size="md" />
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
                      <div className="flex flex-col gap-0.5 ps-1" data-testid={`line-${index + 1}-errors`}>
                        {messages.map((message) => (
                          <FieldError key={message}>{t('invoiceDraft.lineError', { line: index + 1, message })}</FieldError>
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
            <span className="font-medium text-text-tertiary">{t('createInvoice.items.subtotal')}</span>
            <OmAmount value={figures.subtotal} size="md" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-text-tertiary">{t('createInvoice.items.lineDiscounts')}</span>
            <span className="inline-flex items-center gap-1 text-text-tertiary">
              −<OmAmount value={figures.lineDiscount} size="md" />
            </span>
          </div>
          {/* Document-level discount — allocated across lines after their own discounts. */}
          <div className="flex flex-col gap-2 rounded-sm bg-surface-tab-bar p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-text-secondary">{t('createInvoice.items.documentDiscount')}</span>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-text-secondary">
                −<OmAmount value={figures.headerDiscount} size="md" />
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
                placeholder="0"
                aria-label={t('createInvoice.items.documentDiscount')}
                className="h-9 min-w-0 flex-1 rounded-sm border border-primary-300 bg-white px-3 text-sm font-medium text-text-secondary outline-none"
              />
            </div>
            <p className="text-xs font-medium leading-[1.3] text-text-tertiary">{t('createInvoice.items.documentDiscountHint')}</p>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-text-tertiary">{t('createInvoice.items.totalExcluding')}</span>
            <OmAmount value={figures.taxable} size="md" />
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-text-tertiary">{t('createInvoice.items.vatAmount')}</span>
            <OmAmount value={figures.vat} size="md" />
          </div>
          <div className="h-px bg-border-subtle" />
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">{t('createInvoice.items.totalAmount')}</span>
            <OmAmount value={figures.total} size="lg" />
          </div>
        </div>
      </section>

      {/* 4 Notes */}
      <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
        <SectionTitle step={4} title={t('createInvoice.sections.notes')} />
        <div className="h-px w-full bg-border-subtle" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <span className="text-text-primary">{t('createInvoice.notes.toCustomer')}</span>
              <span className="text-xs text-text-quaternary">{t('createInvoice.notes.onInvoice')}</span>
            </div>
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
            <div className="flex items-center gap-1.5 text-sm font-medium">
              <span className="text-text-primary">{t('createInvoice.notes.internal')}</span>
              <span className="text-xs text-text-quaternary">{t('createInvoice.notes.private')}</span>
            </div>
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
      </section>

      {/* Sticky footer actions. Starts after the 248px sidebar so the bar never sits on top of it. */}
      {editable ? (
        <div className="fixed bottom-0 end-0 start-0 z-20 border-t border-black/10 bg-surface-tab-bar md:start-[248px]">
          <div className="mx-auto flex max-w-[1144px] items-center justify-end gap-3 px-4 py-4">
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
              onClick={save}
              disabled={saving}
              className="inline-flex h-[54px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
            >
              <img src={saveDraftIcon} alt="" className="size-6 rotate-180 brightness-0 invert" />
              {saving ? t('invoiceDraft.saving') : t('createInvoice.actions.saveDraft')}
            </button>
          </div>
        </div>
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
            <button type="button" onClick={discard} className="inline-flex h-11 items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white">
              {t('invoiceDraft.discardConfirm')}
            </button>
          </div>
        }
      >
        <p className="text-sm font-medium leading-[1.5] text-text-secondary">{t('invoiceDraft.discardBody')}</p>
      </Modal>
    </div>
  )
}

function previewReason(t: Translate, error: unknown): string {
  if (error instanceof ApiError && error.code && PREVIEW_REASONS.has(error.code)) {
    return t(`invoiceDraft.previewReason.${error.code}`)
  }
  return failureText(t, error)
}

/**
 * The chosen customer, and the picker that changes it. Only customers of the tab's kind are
 * offered: the invoice's transaction type (full or simplified) follows the tab, and a draft for a
 * consumer names a consumer record too (the API requires one; walk-in quick-add comes with I-02).
 */
function CustomerCard({ kind, customer, onPick }: { kind: CustomerKind; customer: CustomerDto | null; onPick: (customer: CustomerDto) => void }) {
  const { t } = useTranslation()
  const [typed, setTyped] = useState<string | null>(null)
  const [query, setQuery] = useState<string | null>(null)
  useEffect(() => {
    if (typed === null) return
    const timer = window.setTimeout(() => setQuery(typed), typed === '' ? 0 : 250)
    return () => window.clearTimeout(timer)
  }, [typed])

  const path = query === null ? null : customerListPath({ type: CUSTOMER_TYPE[kind], search: query, sort: 'NAME_ASC', page: 0, size: 20 })
  const found = useApiRead<Page<CustomerDto>>(path, () => loadCustomerPage(path!))
  const candidates = found.read.status === 'ready' ? found.read.data.items : []
  const vat = customer?.profile.details?.vatRegistrationNumber ?? null

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-3 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          {customer ? (
            <img src={customerLogo} alt="" className="size-12 rounded-sm object-cover" />
          ) : (
            <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-sm bg-white text-sm font-semibold text-primary-800">+</span>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-text-primary">{customer?.displayName ?? t('createInvoice.customer.select')}</p>
            <p className="truncate text-xs font-medium text-text-quaternary">
              {customer ? (vat ? t('invoiceDraft.vat', { number: vat }) : '—') : t('invoiceDraft.selectHint')}
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
              onSearch={setTyped}
              searchPlaceholder={t('invoiceDraft.customerSearch')}
              emptyText={found.read.status === 'loading' || query === null ? t('productPicker.searching') : t('invoiceDraft.noCustomers')}
              ariaLabel={customer ? t('createInvoice.customer.change') : t('createInvoice.customer.select')}
              renderTrigger={({ open }) => (
                <span className="inline-flex items-center gap-0.5 rounded-sm border border-border-subtle bg-white py-1.5 ps-3.5 pe-2.5 text-sm font-semibold text-primary-800">
                  {customer ? t('createInvoice.customer.change') : t('createInvoice.customer.select')}
                  <img src={chevronIcon} alt="" className={['size-6 transition-transform', open ? '-rotate-90' : 'rotate-90'].join(' ')} />
                </span>
              )}
            />
          </div>
        </div>
      </div>
      {customer && customer.invoiceEligible === false ? (
        <p className="text-xs font-medium leading-[1.3] text-pending-700">
          {t('invoiceDraft.notEligible', { fields: (customer.missingInvoiceFields ?? []).join(', ') })}
        </p>
      ) : null}
    </div>
  )
}
