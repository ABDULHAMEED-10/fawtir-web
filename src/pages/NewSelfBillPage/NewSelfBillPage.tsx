import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Notice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError, type Page } from '../../api'
import {
  BRANCHES_PATH,
  createSelfBilledDraft,
  loadBranches,
  loadDraft,
  newIdempotencyKey,
  previewDraft,
  saveDraft,
  type BranchDto,
  type DraftPreview,
  type DraftResponse,
} from '../../api/invoices/drafts'
import {
  AGREEMENTS_PATH,
  loadAgreements,
  type AgreementDto,
} from '../../api/selfBilling/agreements'
import { customerListPath, loadCustomerPage, type CustomerDto } from '../../api/customers/customers'
import {
  loadAttachments,
  removeAttachment,
  uploadAttachment,
  type InvoiceAttachmentDto,
} from '../../api/invoices/detail'
import { muscatToday, plusDays } from '../../lib/invoiceIssue'
import { netDaysFor, useReferenceData } from '../../lib/reference/referenceData'
import { describeApiFailure } from '../../lib/apiFailure'
import { selfBilledIssueMessageKey } from '../../lib/selfBillingRefusals'
import { can, useSession } from '../../lib/session/session'
import { formatAmount } from '../../lib/format'
import {
  SELF_BILL_KINDS,
  blankSelfBillForm,
  fromSelfBilledDraft,
  paymentMethodCodes,
  paymentTermCodes,
  problemsBeforeSave,
  supplierOptions,
  FALLBACK_TAX_CATEGORIES,
  lineTaxCode,
  taxCategoryCodes,
  taxCategoryOf,
  toSelfBilledDraftRequest,
  type SelfBillForm,
  type SelfBillKind,
  type SupplierOption,
} from '../../lib/selfBillCreate'
import { useLineTotals } from '../../components/invoice'
import { IssueInvoiceModal } from '../../components/invoice/IssueInvoiceModal'
import {
  DateField,
  FileDropzone,
  LockIcon,
  OmAmount,
  Popover,
  Select,
  Switch,
  type SelectOption,
} from '../../components/ui'
import { LineComposer } from './LineComposer'
import { omanTaxCategories } from '../../lib/invoiceDraft'
import { formatAtScale } from '../../lib/invoiceMath'
import businessIcon from '../../assets/create-invoice/business.svg'
import statutoryIcon from '../../assets/customers/type-government.svg'
import tickCircle from '../../assets/customers/tick-circle.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import backIcon from '../../assets/invoice-details/back.svg'
import savedIcon from '../../assets/create-invoice/tick.svg'
import peppolIcon from '../../assets/periodic/peppol.svg'
import customerLogo from '../../assets/periodic/customer-logo.svg'
import { usePlanUsage } from '../../hooks/usePlanUsage'
import eyeIcon from '../../assets/actions/view.svg'
import saveDraftIcon from '../../assets/customers/save.svg'
import arrowIcon from '../../assets/create-invoice/arrow.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'
import signedIcon from '../../assets/agreements/signed.svg'
import deleteIcon from '../../assets/create-invoice/delete.svg'

/**
 * New self-billed invoice (Figma 154:161180), the dedicated screen the design draws for writing
 * an invoice on a supplier's behalf (I-12).
 *
 * The data path is the self-billed draft's: `POST /self-billed-invoice-drafts` creates it,
 * unwrapped and under `selfbilling.create`; edits go through the shared draft routes; issuing is
 * the same confirmation the invoice composer uses. The supplier picker is the customers list
 * joined to the agreements on file, so the page says per seller whether issuing would be refused
 * and why, in the server's own order.
 *
 * Every field the frame shows is a real control. The payment method is saved on the draft, and
 * files dropped on the page go to the saved draft through the invoice attachment routes. What the
 * draft cannot carry yet stays on the page behind a `TODO(backend)`: the payment reference and the
 * two switches, the "agreed / statutory" kind, and the plan quota.
 */

const KIND_ICONS: Record<SelfBillKind, string> = {
  agreed: businessIcon,
  statutory: statutoryIcon,
}

const CURRENCIES: SelectOption[] = [{ value: 'OMR', label: 'OMR - Omani Rial' }]

/** What the attachment route takes: the invoice composer's list and limit. */
const ATTACHMENT_TYPES = '.pdf,.jpg,.jpeg,.png,.xlsx'
const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024

type DraftMeta = { id: string; version: number; state: DraftResponse['authoringState'] }

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
  htmlFor,
}: {
  label: string
  required?: boolean
  hint?: string
  htmlFor?: string
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex flex-wrap items-baseline gap-1">
      <span className="text-sm font-medium leading-[1.2] text-text-primary">{label}</span>
      {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      {hint ? <span className="text-[10px] font-medium text-text-quaternary">{hint}</span> : null}
    </label>
  )
}

const SHELL =
  'flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border border-primary-300 bg-surface-tab-bar px-4'

/** 50px text field, #fafafa on #8095d4, matching every other form on the app. */
function TextField({
  id,
  label,
  value,
  onChange,
  required,
  hint,
  title,
  highlighted,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  hint?: string
  /** A hover note the frame does not print. */
  title?: string
  /** The design tints the self-bill number's shell. */
  highlighted?: boolean
  disabled?: boolean
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} hint={hint} htmlFor={id} />
      <div title={title} className={[SHELL, highlighted ? 'bg-primary-25' : ''].join(' ')}>
        <input
          id={id}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          maxLength={200}
          className="w-full min-w-0 border-0 bg-transparent text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder"
        />
      </div>
    </div>
  )
}

/** A value the page fills for the reader and does not let them edit: the design draws a lock. */
function LockedField({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <FieldLabel label={label} />
      <div title={hint} className={[SHELL, 'border-border-subtle'].join(' ')}>
        <span className="min-w-0 truncate text-sm font-medium text-text-muted">{value}</span>
        <LockIcon className="shrink-0 text-text-quaternary" />
      </div>
    </div>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  required?: boolean
  disabled?: boolean
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <Select
        value={value}
        onChange={onChange}
        options={options}
        ariaLabel={label}
        disabled={disabled}
      />
    </div>
  )
}

function DateInput({
  label,
  value,
  onChange,
  required,
  hint,
  disabled,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  hint?: string
  disabled?: boolean
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} hint={hint} />
      <DateField value={value} onChange={onChange} ariaLabel={label} disabled={disabled} />
    </div>
  )
}

/** The design's switch sits before its words (Figma 154:161180). */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint: string
  checked: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div className="flex items-start gap-4">
      <span className="mt-0.5 shrink-0">
        <Switch checked={checked} onChange={onChange} label={label} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium leading-[1.2] text-text-primary">{label}</p>
        <p className="mt-1 text-sm font-medium leading-[1.3] text-text-quaternary">{hint}</p>
      </div>
    </div>
  )
}

function NoteField({
  id,
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  id: string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-medium leading-[1.2] text-text-primary">{label}</span>
        <span className="text-xs font-medium text-text-quaternary">{hint}</span>
      </label>
      <textarea
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={3}
        maxLength={1000}
        className="min-h-[85px] w-full resize-y rounded-sm border border-primary-300 bg-surface-tab-bar p-4 text-sm font-medium text-text-primary outline-none focus:border-primary-500 disabled:text-text-muted"
      />
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">{children}</section>
  )
}

/** Net days for a terms code: the platform's list, else the number in the code itself. */
function netDaysOf(reference: ReturnType<typeof useReferenceData>, code: string): number {
  return netDaysFor(reference, code) ?? (Number(code.replace(/\D/g, '')) || 0)
}

export function NewSelfBillPage() {
  return (
    <AppShell>
      <SelfBillComposer />
    </AppShell>
  )
}

function SelfBillComposer() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const usage = usePlanUsage()
  const navigate = useNavigate()
  const { id: routeId } = useParams<{ id: string }>()
  const session = useSession()
  const reference = useReferenceData()
  const today = muscatToday()

  // `selfbilling.create`, not `invoice.draft`: writing an invoice on someone else's behalf is a
  // different authority from writing your own.
  const canSave = can(session, 'selfbilling.create')
  const canReadInternalNote = can(session, 'invoice.internal-note.read')
  const canSeeAgreements = can(session, 'selfbilling.agreement.manage')
  const canAttach = can(session, 'invoice.attachment.manage')

  const [form, setForm] = useState<SelfBillForm>(() => blankSelfBillForm(today))
  const [exclVat, setExclVat] = useState(true)
  const [meta, setMeta] = useState<DraftMeta | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [notice, setNotice] = useState<{ tone: 'error' | 'info'; body: string } | null>(null)
  const [issuing, setIssuing] = useState<DraftMeta | null>(null)
  const [priced, setPriced] = useState<DraftPreview | null>(null)
  const [pickingSupplier, setPickingSupplier] = useState(false)
  // Files dropped before the draft is saved wait here; the save sends them up.
  const [heldFiles, setHeldFiles] = useState<File[]>([])
  const [storedFiles, setStoredFiles] = useState<InvoiceAttachmentDto[]>([])
  const changeRef = useRef<HTMLButtonElement>(null)

  const patch = (changes: Partial<SelfBillForm>) =>
    setForm((current) => ({ ...current, ...changes }))

  /* ---------------------------------------------------------- reads */

  const agreements = useApiRead<AgreementDto[]>(
    canSeeAgreements ? AGREEMENTS_PATH : null,
    loadAgreements,
  )
  // TODO(backend): EXPENDITURE.md S.2. The seller is kept in a customer record (`customerId` on
  // the agreements and the draft), so the supplier picker reads the customers list, not suppliers.
  const customersPath = customerListPath({
    type: null,
    search: '',
    sort: 'NAME_ASC',
    page: 0,
    size: 100,
  })
  const customers = useApiRead<Page<CustomerDto>>(customersPath, () =>
    loadCustomerPage(customersPath),
  )
  const branches = useApiRead<BranchDto[]>(BRANCHES_PATH, loadBranches)
  const draftPath = routeId ? `/v1/invoice-drafts/${routeId}` : null
  const draft = useApiRead<DraftResponse>(draftPath, () => loadDraft(routeId!))

  const suppliers = useMemo(
    () =>
      supplierOptions(
        customers.read.status === 'ready' ? customers.read.data.items : [],
        agreements.read.status === 'ready' ? agreements.read.data : [],
        today,
      ),
    [customers.read, agreements.read, today],
  )
  const supplier: SupplierOption | null =
    suppliers.find((option) => option.id === form.customerId) ?? null

  // A saved draft fills the form once per address; a new one starts blank.
  const filledFrom = useRef<string | null>(null)
  useEffect(() => {
    if (!routeId) {
      filledFrom.current = null
      return
    }
    if (draft.read.status !== 'ready' || filledFrom.current === routeId) return
    filledFrom.current = routeId
    setForm(fromSelfBilledDraft(draft.read.data, today))
    setMeta({
      id: draft.read.data.id,
      version: draft.read.data.version,
      state: draft.read.data.authoringState,
    })
    if (draft.read.data.authoringState === 'DRAFT') {
      // Storage may be off: the list is then simply empty, as on the invoice composer.
      const draftId = draft.read.data.id
      loadAttachments(draftId)
        .then((files) => {
          if (filledFrom.current === draftId) setStoredFiles(files)
        })
        .catch(() => undefined)
    }
  }, [routeId, draft.read, today])

  // The branch is pre-filled (the head office), as the frame draws it.
  useEffect(() => {
    if (branches.read.status !== 'ready' || form.branchId) return
    const rows = branches.read.data
    const main = rows.find((branch) => branch.type === 'HEAD_OFFICE') ?? rows[0]
    if (main) patch({ branchId: main.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches.read, form.branchId])

  // The agreement field is locked to the chosen supplier's agreement.
  useEffect(() => {
    const next = supplier?.agreement?.agreementReference ?? null
    if (supplier && next !== form.agreementReference) patch({ agreementReference: next })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier])

  // Nobody may read the note: it is left out of the save so the server keeps what is stored.
  useEffect(() => {
    if (!canReadInternalNote && form.noteInternal !== null) patch({ noteInternal: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canReadInternalNote])

  /* ------------------------------------------------------- derived */

  const totals = useLineTotals(form.lines, exclVat)
  // The summary names the category when every line shares one; mixed lines read plain "VAT".
  const lineCategories = new Set(form.lines.map((line) => lineTaxCode(line, form.taxCategory)))
  const onlyCategory = lineCategories.size === 1 ? [...lineCategories][0] : null
  const vatLabel = onlyCategory
    ? t('newSelfBill.summary.vatOf', {
        category: t(`createInvoice.taxCategories.${onlyCategory}`, { defaultValue: onlyCategory }),
      })
    : t('newSelfBill.summary.vatMixed')
  const isAgreed = form.kind === 'agreed'
  const editable = canSave && (meta === null || meta.state === 'DRAFT')

  // The due date follows the terms, counted from the issue date, unless the reader sets it.
  const onIssueDate = (next: string) => {
    patch({
      issueDate: next,
      ...(next ? { paymentDue: plusDays(next, netDaysOf(reference, form.paymentTerms)) } : {}),
    })
  }
  const onTerms = (next: string) => {
    patch({
      paymentTerms: next,
      ...(form.issueDate
        ? { paymentDue: plusDays(form.issueDate, netDaysOf(reference, next)) }
        : {}),
    })
  }
  // The header's default: new lines take it, and it moves only the lines still on the old default.
  // A moved line's reason belonged to the old category, so it is cleared.
  const onTaxCategory = (next: string) => {
    const tax = taxCategoryOf(reference, next)
    patch({
      taxCategory: next,
      exemptionReasonCode: '',
      exemptionReason: '',
      lines: form.lines.map((line) =>
        lineTaxCode(line, form.taxCategory) === form.taxCategory
          ? {
              ...line,
              taxCode: tax.code,
              vatRate: String(Number(tax.rate)),
              exemptionReasonCode: '',
              exemptionReason: '',
            }
          : line,
      ),
    })
  }
  const chooseSupplier = (option: SupplierOption) => {
    patch({
      customerId: option.id,
      agreementReference: option.agreement?.agreementReference ?? null,
    })
    setPickingSupplier(false)
  }

  /* --------------------------------------------------------- writes */

  /** The payment method as the reader sees it; stored beside the code as a snapshot, like the terms. */
  const methodLabel = (code: string) =>
    t(`reference.paymentMethod.${code}`, {
      defaultValue: t(`createInvoice.paymentMethods.${code}`, { defaultValue: code }),
    })

  const failureText = (error: unknown): string => {
    const named = selfBilledIssueMessageKey(error)
    if (named) return t(named)
    if (error instanceof ApiError && error.code === 'STALE_INVOICE_VERSION')
      return t('invoiceDraft.stale')
    const message = describeApiFailure(error)
    const body = t(message.key, message.values)
    return message.reference
      ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
      : body
  }

  /**
   * Sends the held files to the saved draft (the route takes files only while it is a draft). A
   * refused file stays held, with the reason shown, and is sent again next time. Answers whether
   * every file went up.
   */
  const uploadHeld = async (draftId: string): Promise<boolean> => {
    for (const file of heldFiles) {
      try {
        const stored = await uploadAttachment(draftId, file)
        setStoredFiles((current) => [...current, stored])
        setHeldFiles((current) => current.filter((held) => held !== file))
      } catch (error) {
        setNotice({
          tone: 'error',
          body: t('newSelfBill.attachments.uploadFailed', {
            name: file.name,
            reason: failureText(error),
          }),
        })
        return false
      }
    }
    return true
  }

  const removeStored = async (file: InvoiceAttachmentDto) => {
    if (!meta) return
    try {
      await removeAttachment(meta.id, file.id)
      setStoredFiles((current) => current.filter((held) => held.id !== file.id))
    } catch (error) {
      setNotice({ tone: 'error', body: failureText(error) })
    }
  }

  /** For an issue, a file that failed to upload answers null: the draft is saved but not issued. */
  const save = async ({ forIssue = false } = {}): Promise<DraftMeta | null> => {
    if (!editable) return null
    const problems = problemsBeforeSave(form, reference)
    if (problems.length > 0) {
      setNotice({ tone: 'error', body: t(`newSelfBill.problems.${problems[0]}`) })
      return null
    }
    setSaving(true)
    setNotice(null)
    // The stored terms label is a snapshot of what the reader saw: the translated text, not the code.
    const body = toSelfBilledDraftRequest(
      form,
      exclVat,
      reference,
      (code) =>
        t(`reference.paymentTerm.${code}`, {
          defaultValue: t(`createInvoice.terms.${code}`, { defaultValue: code }),
        }),
      methodLabel,
    )
    try {
      const result = meta
        ? await saveDraft(meta.id, meta.version, body)
        : await createSelfBilledDraft(newIdempotencyKey(), body)
      const saved: DraftMeta = {
        id: result.id,
        version: result.version,
        state: result.authoringState,
      }
      setMeta(saved)
      setSavedAt(Date.now())
      setPriced(null)
      if (!meta) {
        filledFrom.current = result.id
        navigate(`/expenditure/self-billing/${result.id}/edit`, { replace: true })
      }
      const uploadsDone = await uploadHeld(result.id)
      return forIssue && !uploadsDone ? null : saved
    } catch (error) {
      setNotice({ tone: 'error', body: failureText(error) })
      return null
    } finally {
      setSaving(false)
    }
  }

  /** The design's Preview: the server prices the saved draft, and the rail shows its figures. */
  const preview = async () => {
    const saved = await save()
    if (!saved) return
    try {
      setPriced(await previewDraft(saved.id))
    } catch (error) {
      setNotice({ tone: 'error', body: failureText(error) })
    }
  }

  const issue = async () => {
    const saved = await save({ forIssue: true })
    if (saved) setIssuing(saved)
  }

  /* ---------------------------------------------------------- view */

  const branchOptions: SelectOption[] =
    branches.read.status === 'ready'
      ? branches.read.data.map((branch) => ({ value: branch.id, label: branch.name }))
      : form.branchId
        ? [{ value: form.branchId, label: form.branchId }]
        : []

  const supplierLine = (option: SupplierOption) =>
    [option.vat ? `VAT ${option.vat}` : null, option.participant].filter(Boolean).join(' · ')

  // The design's drop zone, unchanged; it takes files once the reader may attach them.
  const dropZone = (
    <div className="flex flex-col items-center justify-center gap-1 rounded-sm border border-dashed border-border-default bg-surface-tab-bar py-8">
      <img src={uploadIcon} alt="" className="size-8" />
      <p className="text-base font-medium text-text-secondary">
        {t('newSelfBill.attachments.drop')}
      </p>
      <p className="text-sm font-medium text-text-muted">{t('newSelfBill.attachments.hint')}</p>
    </div>
  )

  const savedNote =
    savedAt === null
      ? meta
        ? t('newSelfBill.savedEarlier')
        : t('newSelfBill.notSaved')
      : t('newSelfBill.savedJustNow')

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
        {/* Header: breadcrumb, draft reference, save note and the quota counter. */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/expenditure/self-billing"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t('newSelfBill.breadcrumb')}
            </Link>
            <img
              src={backIcon}
              alt=""
              aria-hidden="true"
              className="size-6 rotate-180 rtl:rotate-0"
            />
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t(meta ? 'newSelfBill.editTitle' : 'newSelfBill.title')}
            </h1>
            <span className="ms-1 text-sm font-medium leading-[1.2] text-[#8f8f8f]">
              {meta
                ? t('newSelfBill.draftRef', { id: form.number || meta.id })
                : t('newSelfBill.unsavedRef')}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-6">
            <span className="inline-flex items-center gap-2">
              <img src={savedIcon} alt="" className="size-4" />
              <span className="text-sm font-medium leading-[1.2] text-text-secondary">
                {saving ? t('newSelfBill.saving') : savedNote}
              </span>
            </span>
            {/*
              Quota: 189x11 track with a blue fill, per Figma; drawn only when the plan read
              answers.
            */}
            {usage ? (
              <span className="flex flex-col gap-1.5">
                <span className="flex items-baseline gap-1">
                  <span className="text-[22px] font-semibold leading-[1.2] text-text-primary">
                    {usage.used.toLocaleString(language)}
                  </span>
                  <span className="text-[11px] font-medium leading-[1.2] text-text-primary">
                    {t('newSelfBill.quotaOf', { total: usage.allowance.toLocaleString(language) })}
                  </span>
                </span>
                <span className="block h-[11px] w-[189px] overflow-hidden rounded-[2px] bg-white">
                  <span
                    className="block h-full rounded-[2px] bg-primary-700"
                    style={{ width: `${Math.min(100, usage.percent)}%` }}
                  />
                </span>
              </span>
            ) : null}
          </div>
        </div>

        {!canSave ? (
          <Notice badge={t('appAccess.noAccess')} body={t('invoiceDraft.readOnly')} />
        ) : null}
        {meta && meta.state !== 'DRAFT' ? <Notice body={t('newSelfBill.notADraft')} /> : null}
        {notice ? (
          <Notice
            badge={notice.tone === 'error' ? t('agreements.notDone') : undefined}
            body={notice.body}
            action={{ label: t('common.close'), onClick: () => setNotice(null) }}
          />
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1fr_332px]">
          {/* 1 Supplier you are billing for */}
          <Card>
            <SectionTitle step={1} title={t('newSelfBill.sections.supplier')} />
            <div className="h-px w-full bg-surface-background" />

            <div className="grid gap-4 md:grid-cols-2">
              {SELF_BILL_KINDS.map((option) => {
                const active = option.id === form.kind
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={!editable}
                    onClick={() => patch({ kind: option.id })}
                    aria-pressed={active}
                    className={[
                      'flex h-[65px] items-center gap-2 rounded-sm px-4 text-start transition-colors',
                      active
                        ? 'border-2 border-primary-500 bg-primary-50'
                        : 'border border-border-default hover:border-primary-300',
                    ].join(' ')}
                  >
                    <img
                      src={KIND_ICONS[option.id]}
                      alt=""
                      className={['size-6 shrink-0', active ? '' : 'opacity-70'].join(' ')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium leading-[1.2] text-text-primary">
                        {t(option.titleKey)}
                      </span>
                      <span className="block text-xs font-medium leading-[1.2] text-text-tertiary">
                        {t(option.hintKey)}
                      </span>
                    </span>
                    {active ? (
                      <img src={tickCircle} alt="" className="size-[18px] shrink-0" />
                    ) : null}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-2 py-3.5">
              <div className="flex min-w-0 items-center gap-2.5">
                {supplier ? (
                  <img src={customerLogo} alt="" className="size-12 rounded-sm object-cover" />
                ) : (
                  <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-sm bg-white text-sm font-semibold text-primary-800">
                    +
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-base font-medium leading-[1.2] text-text-primary">
                    {supplier?.name ?? t('newSelfBill.noSupplierYet')}
                  </p>
                  <p className="truncate text-xs font-medium leading-[1.2] text-text-quaternary">
                    {supplier ? supplierLine(supplier) : t('newSelfBill.noSupplierHint')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5">
                {supplier?.onPeppol ? (
                  <span className="inline-flex h-7 items-center gap-1 rounded-full border border-primary-75 bg-white py-1.5 ps-1.5 pe-3 text-xs font-semibold text-primary-800">
                    <img src={peppolIcon} alt="" className="size-4" />
                    {t('newSelfBill.onPeppol')}
                  </span>
                ) : null}
                <button
                  ref={changeRef}
                  type="button"
                  disabled={!editable}
                  onClick={() => setPickingSupplier((open) => !open)}
                  aria-haspopup="listbox"
                  aria-expanded={pickingSupplier}
                  className="inline-flex h-[38px] items-center gap-0.5 rounded-sm border border-border-subtle bg-white py-1.5 ps-3.5 pe-2.5 text-sm font-semibold text-primary-800 disabled:opacity-60"
                >
                  {t(supplier ? 'newSelfBill.change' : 'newSelfBill.chooseSupplier')}
                  <img src={chevronIcon} alt="" className="size-5 rotate-90" />
                </button>
                <Popover
                  open={pickingSupplier}
                  anchorRef={changeRef}
                  onClose={() => setPickingSupplier(false)}
                  width={340}
                  align="end"
                >
                  <ul
                    role="listbox"
                    aria-label={t('newSelfBill.chooseSupplier')}
                    className="max-h-[320px] overflow-y-auto py-1"
                  >
                    {suppliers.length === 0 ? (
                      <li className="px-4 py-3 text-sm font-medium text-text-quaternary">
                        {customers.read.status === 'ready'
                          ? t('newSelfBill.noSuppliers')
                          : t('appAccess.loading')}
                      </li>
                    ) : null}
                    {suppliers.map((option) => (
                      <li key={option.id}>
                        <button
                          type="button"
                          role="option"
                          aria-selected={option.id === form.customerId}
                          onClick={() => chooseSupplier(option)}
                          className={[
                            'flex w-full flex-col items-start px-4 py-2.5 text-start transition-colors hover:bg-primary-25',
                            option.id === form.customerId ? 'bg-primary-25' : '',
                          ].join(' ')}
                        >
                          <span className="text-sm font-semibold text-text-primary">
                            {option.name}
                          </span>
                          <span
                            className={[
                              'text-xs font-medium',
                              option.blocker === null ? 'text-success-700' : 'text-text-quaternary',
                            ].join(' ')}
                          >
                            {option.agreement
                              ? t('newSelfBill.pickerAgreement', {
                                  reference: option.agreement.agreementReference,
                                })
                              : t('newSelfBill.pickerNoAgreement')}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Popover>
              </div>
            </div>

            {/* Seller to Buyer, so it is unambiguous who owes whom. */}
            <div className="flex flex-col items-stretch gap-2 md:flex-row md:items-center">
              <div className="flex-1 rounded-sm border border-border-subtle bg-surface-tab-bar p-3.5">
                <p className="text-xs font-semibold leading-[1.2] text-text-quaternary">
                  {t('newSelfBill.parties.seller')}
                </p>
                <p className="mt-1.5 text-base font-medium leading-[1.2] text-text-primary">
                  {supplier?.name ?? '—'}
                </p>
                <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-tertiary">
                  {t('newSelfBill.parties.sellerNote')}
                </p>
              </div>
              <span className="flex shrink-0 items-center justify-center px-2">
                <img src={arrowIcon} alt="" className="size-6 rtl:rotate-180" />
              </span>
              <div className="flex-1 rounded-sm border border-primary-75 bg-primary-25 p-3.5">
                <p className="text-xs font-semibold leading-[1.2] text-text-quaternary">
                  {t('newSelfBill.parties.buyer')}
                </p>
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-base font-medium leading-[1.2] text-text-primary">
                  {session?.tenantName ?? t('newSelfBill.parties.yourCompany')}
                  <span className="inline-flex h-[18px] items-center rounded-[2px] bg-primary-700 px-2 text-[10px] font-semibold text-white">
                    {t('newSelfBill.parties.you')}
                  </span>
                </p>
                <p className="mt-1.5 text-xs font-medium leading-[1.2] text-text-tertiary">
                  {t('newSelfBill.parties.buyerNote')}
                </p>
              </div>
            </div>

            {/* Whether issuing would work, said here rather than discovered at issue. */}
            {supplier && supplier.agreement && supplier.blocker === null ? (
              <div className="flex flex-wrap items-center gap-3 rounded-sm bg-success-100 px-4 py-3">
                <img src={signedIcon} alt="" className="size-[18px] shrink-0" />
                <p className="min-w-0 flex-1 text-sm font-medium leading-[1.2] text-[#3d5648]">
                  {t('newSelfBill.agreementBanner', {
                    reference: supplier.agreement.agreementReference,
                  })}
                </p>
                <Link
                  to="/expenditure/self-billing/agreements"
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
                >
                  {t('newSelfBill.viewAgreement')}
                  <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
                </Link>
              </div>
            ) : supplier && supplier.agreement && supplier.blocker ? (
              <div className="flex flex-wrap items-center gap-3 rounded-sm bg-pending-100 px-4 py-3">
                <p className="min-w-0 flex-1 text-sm font-medium leading-[1.3] text-pending-700">
                  {t(`agreements.blocked.${supplier.blocker}`, {
                    from: supplier.agreement.effectiveFrom,
                    to: supplier.agreement.effectiveTo ?? '',
                  })}
                </p>
                <Link
                  to="/expenditure/self-billing/agreements"
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
                >
                  {t('newSelfBill.viewAgreement')}
                  <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
                </Link>
              </div>
            ) : supplier && isAgreed ? (
              <div className="flex flex-wrap items-center gap-3 rounded-sm bg-danger-100 px-4 py-3">
                <p className="min-w-0 flex-1 text-sm font-medium leading-[1.3] text-danger-700">
                  {t('apiErrors.selfBilling.missing')}
                </p>
                <Link
                  to="/expenditure/self-billing/agreements"
                  className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary-700 hover:underline"
                >
                  {t('newSelfBill.openAgreement')}
                  <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
                </Link>
              </div>
            ) : null}
          </Card>

          {/* Summary rail */}
          <aside className="flex flex-col gap-4">
            <section className="rounded-sm bg-surface-card p-4">
              <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                {t('newSelfBill.summary.title')}
              </h2>
              <div className="mt-4 flex flex-col gap-3.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('newSelfBill.summary.subtotal')}
                  </span>
                  <OmAmount
                    size="xs"
                    amount={
                      priced
                        ? formatAmount(priced.totals.subtotal, priced.currency, language)
                        : formatAtScale(totals.subtotal)
                    }
                    amountClassName="font-semibold text-text-secondary"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('newSelfBill.summary.discount')}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-text-quaternary">
                    −
                    <OmAmount
                      size="xs"
                      amount={
                        priced
                          ? formatAmount(priced.totals.totalDiscount, priced.currency, language)
                          : formatAtScale(totals.itemDiscount + totals.headerDiscount)
                      }
                      amountClassName="font-semibold text-text-quaternary"
                      iconClassName="text-text-quaternary"
                    />
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-primary">
                    {t('newSelfBill.summary.net')}
                  </span>
                  <OmAmount
                    size="xs"
                    amount={
                      priced
                        ? formatAmount(priced.totals.taxableAmount, priced.currency, language)
                        : formatAtScale(totals.taxable)
                    }
                    amountClassName="font-semibold text-text-secondary"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text-secondary">{vatLabel}</span>
                  <OmAmount
                    size="xs"
                    amount={
                      priced
                        ? formatAmount(priced.totals.vatAmount, priced.currency, language)
                        : formatAtScale(totals.vat)
                    }
                    amountClassName="font-semibold text-text-secondary"
                  />
                </div>
                <div className="h-px w-full bg-surface-background" />
                <div className="flex items-center justify-between">
                  <span className="text-base font-medium text-text-primary">
                    {t('newSelfBill.summary.totalDue')}
                  </span>
                  <OmAmount
                    size="md"
                    amount={
                      priced
                        ? formatAmount(priced.totals.totalAmount, priced.currency, language)
                        : formatAtScale(totals.total)
                    }
                    amountClassName="text-[22px] font-semibold leading-[1.2] text-text-primary"
                  />
                </div>
                {priced ? (
                  <p className="text-xs font-medium leading-[1.3] text-text-quaternary">
                    {t('newSelfBill.summary.serverPriced')}
                  </p>
                ) : null}
              </div>
            </section>
            {/* Amber note: a self-bill is an outgoing payable, not revenue. */}
            <p className="rounded-sm bg-pending-100 p-3 text-sm font-medium leading-[1.4] text-text-tertiary">
              {t('newSelfBill.payableNote')}
            </p>
          </aside>
        </div>

        {/* 2 Document details */}
        <Card>
          <SectionTitle step={2} title={t('newSelfBill.sections.document')} />
          <div className="h-px w-full bg-surface-background" />
          <div className="grid gap-4 md:grid-cols-3">
            {/* Optional: PINT-OM makes no rule for IBT-010; the hint sits on the field's title. */}
            <TextField
              id="sb-number"
              label={t('newSelfBill.fields.number')}
              value={form.number}
              onChange={(number) => patch({ number })}
              title={t('newSelfBill.fields.numberHint')}
              highlighted
              disabled={!editable}
            />
            <DateInput
              label={t('newSelfBill.fields.issueDate')}
              value={form.issueDate}
              onChange={onIssueDate}
              required
              disabled={!editable}
            />
            <DateInput
              label={t('newSelfBill.fields.supplyDate')}
              value={form.supplyDate}
              onChange={(supplyDate) => patch({ supplyDate })}
              required
              hint={t('newSelfBill.fields.supplyDateHint')}
              disabled={!editable}
            />
            <SelectField
              label={t('newSelfBill.fields.paymentTerms')}
              value={form.paymentTerms}
              onChange={onTerms}
              options={paymentTermCodes(reference).map((code) => ({
                value: code,
                label: t(`reference.paymentTerm.${code}`, {
                  defaultValue: t(`createInvoice.terms.${code}`, { defaultValue: code }),
                }),
              }))}
              required
              disabled={!editable}
            />
            <DateInput
              label={t('newSelfBill.fields.paymentDue')}
              value={form.paymentDue}
              onChange={(paymentDue) => patch({ paymentDue })}
              required
              disabled={!editable}
            />
            <SelectField
              label={t('newSelfBill.fields.receivingBranch')}
              value={form.branchId ?? ''}
              onChange={(branchId) => patch({ branchId })}
              options={branchOptions}
              required
              disabled={!editable}
            />
            <SelectField
              label={t('newSelfBill.fields.currency')}
              value={form.currency}
              onChange={(currency) => patch({ currency })}
              options={CURRENCIES}
              required
              disabled={!editable}
            />
            <SelectField
              label={t('newSelfBill.fields.taxCategory')}
              value={form.taxCategory}
              onChange={onTaxCategory}
              options={taxCategoryCodes(reference).map((code) => ({
                value: code,
                label: t(`createInvoice.taxCategories.${code}`, {
                  defaultValue: t(`reference.taxCategory.${code}`, { defaultValue: code }),
                }),
              }))}
              required
              disabled={!editable}
            />
            <LockedField
              label={t('newSelfBill.fields.agreement')}
              value={form.agreementReference ?? (supplier ? t('newSelfBill.noAgreement') : '—')}
              hint={t('newSelfBill.agreementLocked')}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-[1fr_376px]">
            <TextField
              id="sb-subject"
              label={t('newSelfBill.fields.subject')}
              value={form.subject}
              onChange={(subject) => patch({ subject })}
              disabled={!editable}
            />
            <TextField
              id="sb-po"
              label={t('newSelfBill.fields.poReference')}
              value={form.poReference}
              onChange={(poReference) => patch({ poReference })}
              disabled={!editable}
            />
          </div>
        </Card>

        {/* 3 Items supplied to you */}
        <LineComposer
          lines={form.lines}
          onChange={(lines) => patch({ lines })}
          exclVat={exclVat}
          onExclVatChange={setExclVat}
          totals={totals}
          taxCategories={omanTaxCategories(
            reference?.taxCategories?.length ? reference.taxCategories : FALLBACK_TAX_CATEGORIES,
          )}
          defaultTax={form.taxCategory}
          readOnly={!editable}
          titleSlot={<SectionTitle step={3} title={t('newSelfBill.sections.items')} />}
          footer={
            <div className="ms-auto flex w-full max-w-[301px] flex-col gap-3.5 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-secondary">
                  {t('newSelfBill.totals.excluding')}
                </span>
                <OmAmount
                  size="xs"
                  amount={formatAtScale(totals.taxable)}
                  amountClassName="text-base font-semibold text-text-secondary"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-secondary">
                  {t('newSelfBill.totals.vat')}
                </span>
                <OmAmount
                  size="xs"
                  amount={formatAtScale(totals.vat)}
                  amountClassName="text-base font-semibold text-text-secondary"
                />
              </div>
              <div className="h-px w-full bg-surface-background" />
              <div className="flex items-center justify-between">
                <span className="font-medium text-text-primary">
                  {t('newSelfBill.totals.total')}
                </span>
                <OmAmount
                  size="sm"
                  amount={formatAtScale(totals.total)}
                  amountClassName="text-xl font-semibold text-text-primary"
                />
              </div>
            </div>
          }
        />

        {/*
          4 Payment to supplier. The method is saved on the draft (IBT-081).
          TODO(backend): no draft field carries the reference or the two switches.
        */}
        <Card>
          <SectionTitle step={4} title={t('newSelfBill.sections.payment')} />
          <div className="h-px w-full bg-surface-background" />
          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label={t('newSelfBill.fields.paymentMethod')}
              value={form.paymentMethod}
              onChange={(paymentMethod) => patch({ paymentMethod })}
              options={paymentMethodCodes(reference).map((code) => ({
                value: code,
                label: methodLabel(code),
              }))}
              disabled={!editable}
            />
            <TextField
              id="sb-payment-reference"
              label={t('newSelfBill.fields.paymentReference')}
              value={form.paymentReference}
              onChange={(paymentReference) => patch({ paymentReference })}
              disabled={!editable}
            />
          </div>
          <div className="grid gap-6 pt-2 md:grid-cols-2 md:divide-x md:divide-border-subtle">
            <ToggleRow
              label={t('newSelfBill.toggles.recordPayment')}
              hint={t('newSelfBill.toggles.recordPaymentHint')}
              checked={form.recordPayment}
              onChange={(recordPayment) => patch({ recordPayment })}
            />
            <div className="md:ps-6">
              <ToggleRow
                label={t('newSelfBill.toggles.deliverByEmail')}
                hint={t('newSelfBill.toggles.deliverByEmailHint')}
                checked={form.deliverByEmail}
                onChange={(deliverByEmail) => patch({ deliverByEmail })}
              />
            </div>
          </div>
        </Card>

        {/* 5 Notes & attachments */}
        <Card>
          <SectionTitle step={5} title={t('newSelfBill.sections.notes')} />
          <div className="h-px w-full bg-surface-background" />
          <div className="grid gap-4 md:grid-cols-2">
            <NoteField
              id="sb-note-supplier"
              label={t('newSelfBill.notes.supplier')}
              hint={t('newSelfBill.notes.printed')}
              value={form.noteSupplier}
              onChange={(noteSupplier) => patch({ noteSupplier })}
              disabled={!editable}
            />
            <NoteField
              id="sb-note-internal"
              label={t('newSelfBill.notes.internal')}
              hint={
                canReadInternalNote ? t('newSelfBill.notes.private') : t('newSelfBill.notes.hidden')
              }
              value={form.noteInternal ?? ''}
              onChange={(noteInternal) => patch({ noteInternal })}
              disabled={!editable || !canReadInternalNote}
            />
          </div>
          {editable && canAttach ? (
            <FileDropzone
              accept={ATTACHMENT_TYPES}
              multiple
              maxBytes={ATTACHMENT_MAX_BYTES}
              onFiles={(files) => setHeldFiles((current) => [...current, ...files])}
              onReject={(reason, file) =>
                setNotice({
                  tone: 'error',
                  body: t(
                    reason === 'size'
                      ? 'newSelfBill.attachments.tooLarge'
                      : 'newSelfBill.attachments.wrongType',
                    { name: file.name },
                  ),
                })
              }
            >
              {() => dropZone}
            </FileDropzone>
          ) : (
            dropZone
          )}
          {heldFiles.length > 0 || storedFiles.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {storedFiles.map((file) => (
                <li
                  key={file.id}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle bg-white px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-medium text-text-secondary">
                    {file.filename}
                  </span>
                  {editable && canAttach ? (
                    <button
                      type="button"
                      onClick={() => void removeStored(file)}
                      aria-label={t('newSelfBill.attachments.remove', { name: file.filename })}
                      className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-neutral-25"
                    >
                      <img src={deleteIcon} alt="" className="size-4" />
                    </button>
                  ) : null}
                </li>
              ))}
              {heldFiles.map((file, index) => (
                <li
                  key={`${file.name}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle bg-white px-3 py-2 text-sm"
                >
                  <span className="min-w-0 truncate font-medium text-text-secondary">
                    {file.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHeldFiles((current) => current.filter((_, i) => i !== index))}
                    aria-label={t('newSelfBill.attachments.remove', { name: file.name })}
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-sm hover:bg-neutral-25"
                  >
                    <img src={deleteIcon} alt="" className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      {/* Sticky action bar: starts after the 248px sidebar so it never covers the nav. */}
      <div className="fixed bottom-0 end-0 start-0 z-20 border-t border-black/10 bg-surface-tab-bar md:start-[248px]">
        <div className="mx-auto flex max-w-[1144px] flex-wrap items-center justify-end gap-3 px-4 py-4">
          <button
            type="button"
            disabled={!editable || saving}
            onClick={preview}
            className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-60"
          >
            <img src={eyeIcon} alt="" className="size-6" />
            {t('newSelfBill.actions.preview')}
          </button>
          {canSave ? (
            <button
              type="button"
              disabled={!editable || saving}
              onClick={() => void save()}
              className="inline-flex h-[54px] items-center gap-2 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary disabled:opacity-60"
            >
              <img src={saveDraftIcon} alt="" className="size-6" />
              {t('newSelfBill.actions.saveDraft')}
            </button>
          ) : null}
          {canSave ? (
            <button
              type="button"
              disabled={!editable || saving}
              onClick={issue}
              className="inline-flex h-[54px] min-w-[255px] items-center justify-center gap-1.5 rounded-sm bg-primary-700 text-base font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60"
            >
              {t('newSelfBill.actions.issue')}
              <img
                src={chevronIcon}
                alt=""
                className="size-[18px] brightness-0 invert rtl:rotate-180"
              />
            </button>
          ) : null}
        </div>
      </div>

      {issuing ? (
        <IssueInvoiceModal
          invoiceId={issuing.id}
          version={issuing.version}
          initialIssueDate={form.issueDate || today}
          initialDueDate={form.paymentDue || form.issueDate || today}
          selfBilled
          onClose={() => setIssuing(null)}
          onIssued={(invoice) => {
            setIssuing(null)
            navigate(`/expenditure/self-billing/${invoice.id}`)
          }}
        />
      ) : null}
    </>
  )
}
