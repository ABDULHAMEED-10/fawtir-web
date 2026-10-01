import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useReferenceData } from '../../lib/reference/referenceData'
import { DESIGN_REFERENCE, omanTaxCategories } from '../../lib/invoiceDraft'
import { AppShell } from '../../layouts/AppShell'
import {
  ActionMenu,
  Combobox,
  DateField,
  FileDropzone,
  OmAmount,
  Select,
  Switch,
  type ActionMenuItem,
} from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import { ApiError, type Page } from '../../api'
import {
  loadInvoice,
  loadReceivable,
  uploadAttachment,
  type InvoiceDetailDto,
  type InvoiceReceivableDto,
} from '../../api/invoices/detail'
import {
  createNote,
  discardDraft,
  issueDraft,
  loadDraft,
  newIdempotencyKey,
  saveDraft,
  type DraftResponse,
  type NoteKind,
} from '../../api/invoices/drafts'
import { invoiceListPath, loadInvoicePage, type InvoiceRowDto } from '../../api/invoices/list'
import { loadCustomer, type CustomerDto } from '../../api/customers/customers'
import { describeApiFailure } from '../../lib/apiFailure'
import { selfBillingMessageKey } from '../../lib/selfBillingRefusals'
import { selfBillOwed } from '../../lib/selfBillDetail'
import { formatAmount, formatDate } from '../../lib/format'
import { issueRefusalOf, muscatToday } from '../../lib/invoiceIssue'
import {
  NOTE_MODES,
  NOTE_REASONS,
  NOTE_REFUSALS,
  NOTE_ROUTES,
  addedLine,
  creditEffect,
  fromInvoice,
  fromNoteDraft,
  noteProblems,
  noteHeaderDiscount,
  noteTotals,
  ownLines,
  patchLine,
  toNoteRequest,
  visibleLines,
  withMode,
  type NoteForm,
  type NoteLine,
  type NoteMode,
  type NoteProblems,
} from '../../lib/salesNote'
import { can, useSession } from '../../lib/session/session'
import { NoteLinesTable } from './NoteLinesTable'
import backIcon from '../../assets/invoice-details/back.svg'
import saveDraftIcon from '../../assets/credit-note/save-draft.svg'
import issueIcon from '../../assets/credit-note/issue.svg'
import invoiceTileIcon from '../../assets/debit-note-create/invoice-tile.svg'
import warningIcon from '../../assets/credit-note/warning.svg'
import infoIcon from '../../assets/debit-note-create/info.svg'
import fullInvoiceIcon from '../../assets/credit-note/full-invoice.svg'
import linesIcon from '../../assets/credit-note/lines.svg'
import customAmountIcon from '../../assets/credit-note/custom-amount.svg'
import correctIcon from '../../assets/debit-note-create/opt-correct.svg'
import additionalIcon from '../../assets/debit-note-create/opt-additional.svg'
import flatIcon from '../../assets/debit-note-create/opt-flat.svg'
import tickIcon from '../../assets/credit-note/tick.svg'
import reducesIcon from '../../assets/credit-note-detail/arrow-up-left.svg'
import increasesIcon from '../../assets/debit-note-create/trend-up.svg'
import peppolIcon from '../../assets/debit-note-create/peppol.svg'
import uploadIcon from '../../assets/create-invoice/upload.svg'
import invoiceActionIcon from '../../assets/actions/invoice.svg'
import deleteIcon from '../../assets/actions/delete.svg'

/**
 * Where a note's page links go. A self-billed credit note (IBT-003 261) corrects a self-billed
 * invoice, so it lives with self-billing: its original, its list and the note itself open there.
 */
type NotePaths = {
  /** The list the breadcrumb returns to. */
  list: string
  /** The page of the document the note corrects. */
  original: (id: string) => string
  /** Where the saved or issued note opens. */
  note: (id: string) => string
}

const SELF_BILLING_PATH = '/income/self-billing'

function notePaths(kind: NoteKind, selfBilled: boolean): NotePaths {
  if (selfBilled) {
    return {
      list: SELF_BILLING_PATH,
      original: (id) => `${SELF_BILLING_PATH}/${id}`,
      note: (id) => `${SELF_BILLING_PATH}/${id}`,
    }
  }
  return {
    list: NOTE_ROUTES[kind],
    original: (id) => `/invoices/${id}`,
    note: (id) => `${NOTE_ROUTES[kind]}/${id}`,
  }
}

/**
 * A self-billed credit note corrects a purchase: the other party is the supplier and the VAT is the
 * tenant's input VAT (handbook 3.1, approved 30 Sep 2026). The composer's sales wording is swapped
 * for these keys on that route only; every other key reads as on a sales note.
 */
const SELF_BILLED_WORDING: Record<string, string> = {
  'salesNote.compose.customerUnknown': 'selfBilledNote.supplierUnknown',
  'salesNote.noteToCustomer': 'selfBilledNote.noteToSupplier',
  'salesNote.compose.peppolTitle': 'selfBilledNote.peppolTitle',
  'salesNote.amount.reduces': 'selfBilledNote.reduces',
  'salesNote.amount.newBalance': 'selfBilledNote.newBalance',
  'salesNote.amount.refundTitle': 'selfBilledNote.refundTitle',
  'salesNote.amount.refundHint': 'selfBilledNote.refundHint',
  'salesNote.amount.refundNone': 'selfBilledNote.refundNone',
  'salesNote.amount.filed.credit': 'selfBilledNote.filed',
  'salesNote.refused.invoiceNotIssued': 'selfBilledNote.invoiceNotIssued',
}

type Loaded = {
  invoice: InvoiceDetailDto
  receivable: InvoiceReceivableDto | null
  draft: DraftResponse | null
  customer: CustomerDto | null
}

const MODE_ICONS: Record<NoteMode, string> = {
  full: fullInvoiceIcon,
  lines: linesIcon,
  custom: customAmountIcon,
  correctLines: correctIcon,
  additionalItems: additionalIcon,
  flatCharge: flatIcon,
}

const GHOST_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] transition-colors hover:bg-white disabled:opacity-60'
const PRIMARY_BUTTON =
  'inline-flex h-[46px] items-center justify-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-60'
const FIELD =
  'flex h-[50px] w-full items-center rounded-sm border border-primary-300 bg-white px-4 text-sm font-medium text-text-secondary'
const FIELD_READONLY =
  'flex h-[50px] w-full items-center rounded-sm border border-primary-75 bg-primary-25/60 px-4 text-sm font-medium text-text-secondary'

/**
 * Income › a credit or debit note (I-10/I-11), as the "Create debit note" and "New credit note"
 * frames draw it: `/income/credit-notes/new?invoice=<id>` starts one from an issued invoice,
 * `/income/credit-notes/new` asks which invoice first, `/income/credit-notes/:id/edit` reopens a
 * draft. Same for debit notes. Everything — the lines, the reason, the dates, issuing — is on the
 * one page; nothing opens over it.
 */
export function SalesNotePage({
  kind,
  selfBilled = false,
}: {
  kind: NoteKind
  /**
   * A self-billed credit note (decision D6: the credit-note composer, reached from an issued
   * self-billed invoice): created on `/authored-invoices/{id}/self-billed-credit-notes` under
   * `selfbilling.create`, and opened from and returned to self-billing.
   */
  selfBilled?: boolean
}) {
  const { id } = useParams()
  const [search] = useSearchParams()
  return (
    <AppShell>
      <SalesNote
        key={id ?? search.get('invoice') ?? 'none'}
        kind={kind}
        selfBilled={selfBilled}
        draftId={id ?? null}
        invoiceId={search.get('invoice')}
      />
    </AppShell>
  )
}

function SalesNote({
  kind,
  selfBilled,
  draftId,
  invoiceId,
}: {
  kind: NoteKind
  selfBilled: boolean
  draftId: string | null
  invoiceId: string | null
}) {
  const { t } = useTranslation()
  const session = useSession()
  const [loaded, setLoaded] = useState<
    { status: 'loading' } | { status: 'ready'; data: Loaded } | { status: 'failed'; error: unknown }
  >({
    status: 'loading',
  })
  const [attempt, setAttempt] = useState(0)
  const customerReadable = can(session, 'customer.read')

  useEffect(() => {
    if (!draftId && !invoiceId) return
    let live = true
    const load = async (): Promise<Loaded> => {
      const draft = draftId ? await loadDraft(draftId) : null
      const originalId = draft?.correctionOfInvoiceId ?? invoiceId
      if (!originalId) throw new Error('no invoice')
      const invoice = await loadInvoice(originalId)
      const [receivable, customer] = await Promise.all([
        loadReceivable(originalId).catch(() => null),
        customerReadable
          ? loadCustomer(invoice.customerId).catch(() => null)
          : Promise.resolve(null),
      ])
      return { invoice, receivable, draft, customer }
    }
    load().then(
      (data) => live && setLoaded({ status: 'ready', data }),
      (error) => live && setLoaded({ status: 'failed', error }),
    )
    return () => {
      live = false
    }
  }, [draftId, invoiceId, kind, attempt, customerReadable])

  // The self-billed route asks `selfbilling.create`, not `creditnote.create`.
  const permission = selfBilled
    ? 'selfbilling.create'
    : kind === 'CREDIT_NOTE'
      ? 'creditnote.create'
      : 'debitnote.create'
  const paths = notePaths(kind, selfBilled)
  if (!can(session, permission)) return <PermissionDeniedNotice />
  // A self-billed credit note is started from its self-billed invoice's page; there is no picker.
  if (!draftId && !invoiceId && selfBilled) return <Navigate to={paths.list} replace />
  if (!draftId && !invoiceId) return <InvoicePicker kind={kind} />
  if (loaded.status === 'loading') {
    return (
      <Frame
        kind={kind}
        paths={paths}
        selfBilled={selfBilled}
        title={t(`salesNote.${kind === 'CREDIT_NOTE' ? 'credit' : 'debit'}.new`)}
      >
        <LoadingNotice />
      </Frame>
    )
  }
  if (loaded.status === 'failed') {
    return (
      <Frame
        kind={kind}
        paths={paths}
        selfBilled={selfBilled}
        title={t(`salesNote.${kind === 'CREDIT_NOTE' ? 'credit' : 'debit'}.new`)}
      >
        <ApiReadFailure error={loaded.error} retry={() => setAttempt((n) => n + 1)} />
      </Frame>
    )
  }
  return <NoteEditor kind={kind} selfBilled={selfBilled} paths={paths} {...loaded.data} />
}

/** The breadcrumb, title and status pill every state of the page shares. */
function Frame({
  kind,
  paths = notePaths(kind, false),
  selfBilled = false,
  title,
  subtitle,
  actions,
  children,
}: {
  kind: NoteKind
  paths?: NotePaths
  selfBilled?: boolean
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const kindKey = kind === 'CREDIT_NOTE' ? 'credit' : 'debit'
  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-2xl font-medium leading-[1.2] text-text-quaternary">
            <Link
              to="/invoices"
              className="inline-flex items-center gap-1 hover:text-text-secondary"
            >
              {t('salesNote.compose.breadcrumbIncome')}
              <img src={backIcon} alt="" className="size-6 rotate-180 rtl:rotate-0" />
            </Link>
            <Link to={paths.list} className="hover:text-text-secondary">
              {selfBilled
                ? t('selfBillDetail.breadcrumbSelfBilled')
                : t(`salesNote.${kindKey}.list`)}
            </Link>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{title}</h1>
            <span className="inline-flex h-[31px] items-center gap-2 rounded-full border border-black/[0.06] bg-neutral-25 px-3 text-sm font-semibold text-text-quaternary">
              <span className="size-1.5 rounded-full bg-current" />
              {t('salesNote.draft')}
            </span>
          </div>
          {subtitle ? (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-base leading-[1.2]">
              {subtitle}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-3">{actions}</div> : null}
      </div>
      {children}
    </div>
  )
}

/** `/income/credit-notes/new` with no invoice: the "Original invoice" card asks which one, on the page. */
function InvoicePicker({ kind }: { kind: NoteKind }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const kindKey = kind === 'CREDIT_NOTE' ? 'credit' : 'debit'
  const path = invoiceListPath({
    state: 'ISSUED',
    payment: null,
    type: 'INVOICE',
    from: null,
    to: null,
    search: query,
    sort: 'ISSUED_NEWEST',
    page: 0,
    size: 20,
  })
  const invoices = useApiRead<Page<InvoiceRowDto>>(path, () => loadInvoicePage(path))
  const options =
    invoices.read.status === 'ready'
      ? invoices.read.data.items.map((row) => ({
          value: row.id,
          label: `${row.invoiceNumber ?? row.id} · ${row.customerName ?? ''}`.trim(),
          hint: row.totals
            ? `${formatAmount(row.totals.totalAmount, row.currency, i18n.language)} · ${row.issueDate ? formatDate(row.issueDate, i18n.language) : ''}`
            : undefined,
        }))
      : []
  return (
    <Frame kind={kind} title={t(`salesNote.${kindKey}.new`)}>
      <section className="rounded-sm bg-surface-card p-4">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
          {t('salesNote.compose.original')}
        </h2>
        <div className="my-3 h-px w-full bg-border-subtle" />
        <p className="mb-3 text-sm font-medium leading-[1.5] text-text-tertiary">
          {t('salesNote.pickInvoice')}
        </p>
        <div className="max-w-[520px]">
          <Combobox
            value=""
            onChange={(id) =>
              navigate(`${NOTE_ROUTES[kind]}/new?invoice=${encodeURIComponent(id)}`)
            }
            options={options}
            placeholder={t('salesNote.compose.pickInvoicePlaceholder')}
            searchPlaceholder={t('salesNote.compose.pickInvoiceSearch')}
            ariaLabel={t('salesNote.compose.original')}
            emptyText={
              invoices.read.status === 'loading'
                ? t('appAccess.loading')
                : t('salesNote.compose.pickInvoiceNone')
            }
            onSearch={setQuery}
          />
        </div>
        {invoices.read.status === 'failed' ? (
          <div className="mt-3">
            <ApiReadFailure error={invoices.read.error} retry={invoices.retry} />
          </div>
        ) : null}
      </section>
    </Frame>
  )
}

function SectionCard({
  title,
  action,
  children,
}: {
  title: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-sm bg-surface-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
        {action}
      </div>
      <div className="mb-4 h-px w-full bg-border-subtle" />
      {children}
    </section>
  )
}

function Labelled({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium leading-[1.2] text-text-secondary">
        {label}
        {required ? <span className="text-danger-700"> *</span> : null}
        {hint ? (
          <span className="ms-1.5 text-xs font-medium text-text-quaternary">{hint}</span>
        ) : null}
      </span>
      {children}
      {error ? (
        <span role="alert" className="text-xs font-medium leading-[1.2] text-text-danger">
          {error}
        </span>
      ) : null}
    </label>
  )
}

function Stat({ label, amount, tone = '' }: { label: string; amount: string; tone?: string }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-xs font-medium leading-[1.2] text-text-quaternary">{label}</span>
      <OmAmount
        size="xs"
        amount={amount}
        amountClassName={`text-sm font-semibold ${tone || 'text-text-primary'} tabular-nums`}
      />
    </div>
  )
}

function NoteEditor({
  kind,
  selfBilled,
  paths,
  invoice,
  receivable: loadedReceivable,
  draft,
  customer,
}: { kind: NoteKind; selfBilled: boolean; paths: NotePaths } & Loaded) {
  const { t: translate, i18n } = useTranslation()
  const t = (key: string, options?: Record<string, unknown>): string =>
    translate(selfBilled ? (SELF_BILLED_WORDING[key] ?? key) : key, options ?? {})
  // A self-billed document's debt is its Expenditure payable (D2): what is owed, paid and credited
  // is read there, never from the receivable, which is NOT_APPLICABLE on a self-billed document.
  // TODO(backend): INCOME.md 7.21, the payable's creditedAmount must net earlier self-billed
  // credit notes, or "Already credited" and the creditable figure stay as if none was issued.
  const receivable = selfBilled ? selfBillOwed(invoice.payable, loadedReceivable) : loadedReceivable
  const reference = useReferenceData()
  const navigate = useNavigate()
  const session = useSession()
  const credit = kind === 'CREDIT_NOTE'
  const kindKey = credit ? 'credit' : 'debit'
  const [form, setForm] = useState<NoteForm>(() =>
    draft ? fromNoteDraft(draft, invoice, kind, reference) : fromInvoice(invoice, kind, reference),
  )
  const [saved, setSaved] = useState<DraftResponse | null>(draft)
  const [problems, setProblems] = useState<NoteProblems>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  /** Files already on the saved draft, so a retry after a failed upload sends each one once. */
  const uploaded = useRef(new Set<File>())
  // The create's and the issue's keys. A new key is taken only after the server refused the last
  // request (a 4xx problem answer): nothing was created or issued, so the next send is a new
  // request. After a timeout, a network error or a 5xx the retry reuses the key, because the
  // server may have done it, and a second key could create or issue the note twice.
  const createAttempt = useRef<KeyedAttempt>({ key: newIdempotencyKey(), refused: false })
  const issueAttempt = useRef<KeyedAttempt>({ key: newIdempotencyKey(), refused: false })
  const inFlight = useRef(false)
  const canAttach = can(session, 'invoice.attachment.manage')

  const totals = useMemo(
    () => noteTotals(form, noteHeaderDiscount(form, invoice, kind)),
    [form, invoice, kind],
  )
  const money = (value: number | string | null | undefined) =>
    value === null || value === undefined
      ? '—'
      : formatAmount(value, invoice.currency, i18n.language)
  const invoiceNumber = invoice.invoiceNumber ?? invoice.id
  const customerName = customer?.displayName ?? t('salesNote.compose.customerUnknown')
  // The server takes a self-billed credit note only against an issued self-billed invoice, and an
  // ordinary note only against an issued ordinary one (CORRECTED_INVOICE_NOT_ISSUED otherwise).
  const invoiceIssued =
    invoice.type === (selfBilled ? 'SELF_BILLED_INVOICE' : 'INVOICE') &&
    invoice.authoringState === 'ISSUED'
  const today = muscatToday()
  const total = Number(totals.total)
  const outstanding = receivable?.outstandingAmount ?? null
  const effect = outstanding !== null ? creditEffect(outstanding, total) : null
  const documentTotal = receivable?.documentTotal ?? invoice.totals?.totalAmount ?? null
  const credited = receivable?.creditedAmount ?? 0
  const creditable =
    documentTotal === null
      ? null
      : Math.max(0, Math.round((documentTotal - credited) * 1000) / 1000)
  const lines = visibleLines(form)

  const setLine = (lineNumber: number, patch: Partial<NoteLine>) =>
    setForm((current) => patchLine(current, kind, lineNumber, patch))
  // PINT-OM asks a goods line's HS code and a service line's type of business and government
  // customers only; a consumer's simplified document carries neither.
  const classified = customer?.type !== 'CONSUMER'
  const change = (patch: Partial<NoteForm>) => setForm((current) => ({ ...current, ...patch }))
  const changeDate = (patch: Partial<Pick<NoteForm, 'issueDate' | 'dueDate'>>) => change(patch)

  /** Saves the draft (creating it the first time) and returns it, or null when refused. */
  const persist = async (): Promise<DraftResponse | null> => {
    const found = noteProblems(form, kind, today)
    setProblems(found)
    if (Object.keys(found).length > 0) {
      setNotice(t('salesNote.fixFirst'))
      return null
    }
    const request = toNoteRequest(form, invoice, kind)
    const next = saved
      ? await saveDraft(saved.id, saved.version, request)
      : await withKey(createAttempt, (key) =>
          createNote(selfBilled ? 'SELF_BILLED_CREDIT_NOTE' : kind, invoice.id, key, request),
        )
    setSaved(next)
    return next
  }

  /**
   * The files dropped on the page, onto the saved draft (the API takes attachments on a DRAFT only,
   * so this runs after the save and before the issue). A file that went up is not sent again.
   */
  const uploadQueued = async (draft: DraftResponse) => {
    if (!canAttach) return
    for (const file of files) {
      if (uploaded.current.has(file)) continue
      await uploadAttachment(draft.id, file)
      uploaded.current.add(file)
    }
  }

  const run = async (then: (draft: DraftResponse) => Promise<void> | void) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      const next = await persist()
      if (!next) return
      // On a failed upload the draft stays saved and the page stays open with the notice.
      await uploadQueued(next)
      await then(next)
    } catch (error) {
      // A self-billed note meets the agreement gates at issue (an agreement in force on the note's
      // issue date, a verified seller, a complete counterparty record): named before anything else.
      const selfBilling = selfBilled ? selfBillingMessageKey(error) : null
      if (selfBilling) {
        setNotice(t(selfBilling))
        return
      }
      const coded = error instanceof ApiError && error.code ? NOTE_REFUSALS[error.code] : undefined
      const refusal = coded ? null : issueRefusalOf(error)
      const described = describeApiFailure(error)
      setNotice(
        coded
          ? t(coded)
          : refusal
            ? t(refusal.key, refusal.values)
            : t(described.key, described.values),
      )
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const issue = () =>
    run(async (next) => {
      const request = {
        expectedVersion: next.version,
        issueDate: form.issueDate,
        // A credit note is not collected; the API still wants a due date, so the issue date is sent.
        dueDate: credit ? form.issueDate : form.dueDate,
      }
      const issued = await withKey(issueAttempt, (key) => issueDraft(next.id, key, request))
      navigate(paths.note(issued.id), {
        replace: true,
        state: { issuedNumber: issued.invoiceNumber },
      })
    })

  const discard = async () => {
    if (!saved) return
    setBusy(true)
    try {
      await discardDraft(saved.id, saved.version)
      navigate(paths.list, { replace: true })
    } catch (error) {
      const described = describeApiFailure(error)
      setNotice(t(described.key, described.values))
    } finally {
      setBusy(false)
    }
  }

  const menu: ActionMenuItem[] = [
    {
      id: 'invoice',
      labelKey: 'salesNote.compose.openInvoice',
      icon: invoiceActionIcon,
      to: paths.original(invoice.id),
    },
    ...(saved
      ? [
          {
            id: 'discard',
            labelKey: 'salesNote.compose.discardDraft',
            icon: deleteIcon,
            danger: true,
            onSelect: () => void discard(),
          },
        ]
      : []),
  ]

  const paymentState = receivable
    ? receivable.overdue
      ? 'OVERDUE'
      : receivable.paymentState === 'NOT_APPLICABLE'
        ? null
        : receivable.paymentState
    : null
  const own = ownLines(form.mode)
  const sign = credit ? '−' : '+'
  const toneClass = credit ? 'text-danger-700' : 'text-success-700'
  const vatRate = totals.rate ?? invoice.lines[0]?.taxRate ?? 5
  const categoryLabel = noteCategoryLabel(form, invoice, vatRate, t)

  return (
    <Frame
      kind={kind}
      paths={paths}
      selfBilled={selfBilled}
      title={saved?.invoiceNumber ?? t(`salesNote.${kindKey}.new`)}
      subtitle={
        <>
          <span className="font-medium text-text-quaternary">
            {t(`salesNote.compose.${credit ? 'reversing' : 'adjusting'}`)}
          </span>
          <Link
            to={paths.original(invoice.id)}
            className="font-semibold text-text-primary hover:text-primary-700"
          >
            {invoiceNumber}
          </Link>
          <span className="mx-0.5 size-1 rounded-full bg-text-quaternary" />
          <span className="font-medium text-text-quaternary">{t('salesNote.compose.for')}</span>
          <span className="font-semibold text-text-primary">{customerName}</span>
        </>
      }
      actions={
        <>
          <ActionMenu items={menu} label={t('salesNote.compose.more')} variant="bordered" />
          {/* The draft is saved with PUT /invoice-drafts, which asks for invoice.draft. */}
          {can(session, 'invoice.draft') ? (
            <button
              type="button"
              disabled={busy || !invoiceIssued}
              onClick={() => void run((next) => navigate(paths.note(next.id), { replace: true }))}
              className={GHOST_BUTTON}
            >
              <img src={saveDraftIcon} alt="" className="size-5" />
              {t('salesNote.saveDraft')}
            </button>
          ) : null}
          {can(session, 'invoice.issue') ? (
            <button
              type="button"
              disabled={busy || !invoiceIssued}
              onClick={() => void issue()}
              className={PRIMARY_BUTTON}
            >
              <img src={issueIcon} alt="" className="size-5" />
              {t(`salesNote.${kindKey}.issue`)}
            </button>
          ) : null}
        </>
      }
    >
      {!invoiceIssued ? <Notice body={t('salesNote.refused.invoiceNotIssued')} /> : null}
      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      {/* The amount card sits beside the invoice and the "what to" choice only; the rest is full width, as designed. */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_328px]">
        <div className="flex min-w-0 flex-col gap-4 xl:col-start-1 xl:row-start-1">
          {/* Original invoice */}
          <SectionCard title={t('salesNote.compose.original')}>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-sm border border-primary-75 bg-primary-25/60 p-4">
              <div className="flex items-center gap-3">
                <img src={invoiceTileIcon} alt="" className="size-10" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={paths.original(invoice.id)}
                      className="text-base font-semibold text-text-primary hover:text-primary-700"
                    >
                      {invoiceNumber}
                    </Link>
                    {paymentState ? (
                      <span
                        className={[
                          'inline-flex h-[26px] items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold',
                          paymentState === 'PAID'
                            ? 'bg-success-100 text-success-700'
                            : paymentState === 'OVERDUE'
                              ? 'bg-danger-100 text-danger-700'
                              : 'bg-warning-100 text-[#6d5a39]',
                        ].join(' ')}
                      >
                        <span className="size-1.5 rounded-full bg-current" />
                        {t(`salesNote.compose.state.${paymentState}`)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-medium text-text-tertiary">
                    {invoice.issueDate
                      ? t('salesNote.compose.issuedOn', {
                          date: formatDate(invoice.issueDate, i18n.language),
                        })
                      : t('salesNote.draft')}
                    {' · '}
                    {/* TODO(backend): the delivery channel (1.3); the frame says "sent via Peppol". */}
                    {t(
                      invoice.deliveryState === 'SENT_MANUALLY'
                        ? 'salesNote.compose.sentManually'
                        : 'salesNote.compose.notSent',
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-6">
                <Stat label={t('salesNote.compose.invoiceTotal')} amount={money(documentTotal)} />
                {credit ? (
                  <>
                    <Stat label={t('salesNote.compose.alreadyCredited')} amount={money(credited)} />
                    <Stat label={t('salesNote.compose.creditable')} amount={money(creditable)} />
                  </>
                ) : (
                  <>
                    <Stat
                      label={t('salesNote.compose.paid')}
                      amount={money(receivable?.paidAmount ?? 0)}
                    />
                    <Stat label={t('salesNote.compose.outstanding')} amount={money(outstanding)} />
                  </>
                )}
              </div>
            </div>
          </SectionCard>

          {/* What to credit / charge */}
          <SectionCard title={t(`salesNote.compose.what.${kindKey}`)}>
            <div
              role="radiogroup"
              aria-label={t(`salesNote.compose.what.${kindKey}`)}
              className="grid gap-3 md:grid-cols-3"
            >
              {NOTE_MODES[kind].map((mode) => {
                const active = form.mode === mode
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setForm((current) => withMode(current, mode, invoice))}
                    className={[
                      'flex items-start gap-3 rounded-sm border p-3 text-start transition-colors',
                      active
                        ? 'border-primary-700 bg-primary-25'
                        : 'border-border-subtle bg-white hover:border-primary-300',
                    ].join(' ')}
                  >
                    <img src={MODE_ICONS[mode]} alt="" className="mt-0.5 size-6 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm font-semibold text-text-primary">
                        {t(`salesNote.mode.${mode}`)}
                      </span>
                      <span className="text-xs font-medium leading-[1.4] text-text-quaternary">
                        {t(`salesNote.mode.${mode}Hint`)}
                      </span>
                    </span>
                    {active ? <img src={tickIcon} alt="" className="size-4 shrink-0" /> : null}
                  </button>
                )
              })}
            </div>
            <div
              className={[
                'mt-3 flex items-start gap-2 rounded-sm px-3 py-2.5 text-sm font-medium leading-[1.5]',
                form.mode === 'full'
                  ? 'bg-danger-100 text-danger-700'
                  : 'bg-primary-25 text-primary-800',
              ].join(' ')}
            >
              <img
                src={form.mode === 'full' ? warningIcon : infoIcon}
                alt=""
                className="mt-0.5 size-4 shrink-0"
              />
              <span>{t(`salesNote.banner.${form.mode}`, { invoice: invoiceNumber })}</span>
            </div>

            {form.mode === 'full' ? (
              <div className="mt-4">
                <NoteLinesTable
                  lines={lines}
                  totals={totals}
                  currency={invoice.currency}
                  invoiceNumber={invoiceNumber}
                  selectable={false}
                  editable={false}
                  growable={false}
                  classified={classified}
                  tone={kindKey}
                  onChange={setLine}
                />
              </div>
            ) : null}
          </SectionCard>
        </div>

        <div className="flex min-w-0 flex-col gap-4 xl:col-span-2">
          {/* Items */}
          {form.mode !== 'full' ? (
            <SectionCard title={t('salesNote.compose.items')}>
              <NoteLinesTable
                lines={lines}
                totals={totals}
                currency={invoice.currency}
                invoiceNumber={invoiceNumber}
                selectable={credit && !own}
                editable
                growable={form.mode === 'additionalItems' || form.mode === 'custom'}
                classified={classified}
                taxCategories={omanTaxCategories(
                  reference?.taxCategories?.length
                    ? reference.taxCategories
                    : DESIGN_REFERENCE.taxCategories,
                )}
                tone={kindKey}
                onChange={setLine}
                onAdd={() =>
                  setForm((current) => ({
                    ...current,
                    lines: [...current.lines, addedLine(current, invoice)],
                  }))
                }
                onRemove={(lineNumber) =>
                  setForm((current) =>
                    lines.length > 1
                      ? {
                          ...current,
                          lines: current.lines.filter((line) => line.lineNumber !== lineNumber),
                        }
                      : current,
                  )
                }
              />
              {problems.lines || problems.amounts || problems.descriptions ? (
                <p role="alert" className="mt-3 text-xs font-medium text-text-danger">
                  {t((problems.lines ?? problems.amounts ?? problems.descriptions)!)}
                </p>
              ) : null}
              <div className="mt-4 ms-auto flex w-full max-w-[360px] flex-col gap-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-text-tertiary">
                    {t(`salesNote.amount.net.${kindKey}`)}
                  </span>
                  <OmAmount
                    size="xs"
                    prefix={sign}
                    amount={money(totals.net)}
                    amountClassName={`text-base font-semibold ${toneClass} tabular-nums`}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-text-tertiary">
                    {t(`salesNote.amount.vat.${kindKey}`, { rate: vatRate })}
                  </span>
                  <OmAmount
                    size="xs"
                    prefix={sign}
                    amount={money(totals.vat)}
                    amountClassName={`text-base font-semibold ${toneClass} tabular-nums`}
                  />
                </div>
                <div className="my-1 h-px w-full bg-border-subtle" />
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium text-text-primary">
                    {t(`salesNote.amount.total.${kindKey}`)}
                  </span>
                  <OmAmount
                    size="sm"
                    prefix={sign}
                    amount={money(totals.total)}
                    amountClassName={`text-xl font-semibold ${toneClass} tabular-nums`}
                  />
                </div>
              </div>
            </SectionCard>
          ) : problems.lines || problems.amounts ? (
            <p role="alert" className="text-xs font-medium text-text-danger">
              {t((problems.lines ?? problems.amounts)!)}
            </p>
          ) : null}

          {/* Reason */}
          <SectionCard
            title={t(`salesNote.compose.reasonFor.${kindKey}`)}
            action={
              <span className="rounded-full bg-neutral-25 px-3 py-1.5 text-sm font-medium text-text-secondary">
                {t(`salesNote.compose.shownOn.${kindKey}`)}
              </span>
            }
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Labelled
                label={t('salesNote.reason')}
                required
                error={problems.reason ? t(problems.reason) : undefined}
              >
                <Select
                  value={form.reason}
                  onChange={(reason) => change({ reason })}
                  options={NOTE_REASONS[kind].map((reason) => ({
                    value: reason.id,
                    label: t(`salesNote.reasonOptions.${reason.id}`),
                  }))}
                  placeholder={t('salesNote.chooseReason')}
                  ariaLabel={t('salesNote.reason')}
                  highlighted={form.reason !== ''}
                />
              </Labelled>
              <Labelled label={t('salesNote.compose.reference')}>
                <span className={FIELD}>
                  <input
                    value={form.reference}
                    onChange={(event) => change({ reference: event.target.value })}
                    maxLength={200}
                    placeholder={t('salesNote.compose.referencePlaceholder')}
                    aria-label={t('salesNote.compose.reference')}
                    className="w-full border-0 bg-transparent outline-none placeholder:text-text-placeholder"
                  />
                </span>
              </Labelled>
            </div>
            <div className="mt-4">
              <Labelled
                label={t('salesNote.noteToCustomer')}
                hint={t(`salesNote.compose.printedOn.${kindKey}`)}
              >
                <textarea
                  value={form.note}
                  onChange={(event) => change({ note: event.target.value })}
                  maxLength={1000}
                  rows={2}
                  aria-label={t('salesNote.noteToCustomer')}
                  className="w-full rounded-sm border border-primary-300 bg-white px-4 py-3 text-sm font-medium text-text-secondary outline-none placeholder:text-text-placeholder"
                />
              </Labelled>
            </div>
          </SectionCard>

          {/* Details */}
          <SectionCard title={t(`salesNote.compose.detailsTitle.${kindKey}`)}>
            <div className={['grid gap-4', credit ? 'md:grid-cols-2' : 'md:grid-cols-3'].join(' ')}>
              <Labelled label={t(`salesNote.compose.number.${kindKey}`)} required>
                <span className={FIELD_READONLY}>
                  {saved?.invoiceNumber ?? t('salesNote.compose.numberAtIssue')}
                </span>
              </Labelled>
              <Labelled
                label={t('salesNote.compose.issueDate')}
                required
                error={problems.issueDate ? t(problems.issueDate) : undefined}
              >
                <DateField
                  value={form.issueDate}
                  onChange={(issueDate) => changeDate({ issueDate })}
                  max={today}
                  ariaLabel={t('salesNote.compose.issueDate')}
                  highlighted
                />
              </Labelled>
              {credit ? null : (
                <Labelled
                  label={t('salesNote.compose.paymentDue')}
                  required
                  hint={t('salesNote.compose.paymentDueHint')}
                  error={problems.dueDate ? t(problems.dueDate) : undefined}
                >
                  <DateField
                    value={form.dueDate}
                    onChange={(dueDate) => changeDate({ dueDate })}
                    min={form.issueDate || undefined}
                    ariaLabel={t('salesNote.compose.paymentDue')}
                    highlighted
                  />
                </Labelled>
              )}
              <Labelled label={t('salesNote.compose.concerning')}>
                <span className={FIELD_READONLY}>{invoiceNumber}</span>
              </Labelled>
              <Labelled label={t('salesNote.compose.currency')} required>
                <span className={FIELD_READONLY}>
                  {t(`salesNote.compose.currencyName.${invoice.currency}`, {
                    defaultValue: invoice.currency,
                  })}
                </span>
              </Labelled>
              {credit ? null : (
                /* Text only, as the client asked: the note's category, named as the lines table names it. */
                <Labelled label={t('salesNote.compose.taxCategory')} required>
                  <span className={FIELD_READONLY}>{categoryLabel}</span>
                </Labelled>
              )}
            </div>
            {/* TODO(backend): Peppol delivery is not in the API (B4); the switch is drawn as designed and kept with the form. */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-sm border border-border-subtle bg-white px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-medium text-text-primary">
                    {t('salesNote.compose.peppolTitle')}
                  </span>
                  {customer?.peppolDelivery === 'ACTIVE' ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-primary-300 px-2 py-0.5 text-xs font-semibold text-primary-800">
                      <img src={peppolIcon} alt="" className="size-3.5" />
                      {t('salesNote.compose.onPeppol')}
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-sm font-medium text-text-tertiary">
                  {t(`salesNote.compose.peppolHint.${kindKey}`, { customer: customerName })}
                </p>
              </div>
              <Switch
                checked={form.sendPeppol}
                onChange={(sendPeppol) => change({ sendPeppol })}
                label={t('salesNote.compose.peppolTitle')}
              />
            </div>
          </SectionCard>

          {/* Attachments: queued here, uploaded to the draft when it is saved, before it is issued
              (INCOME.md 4.6; POST /authored-invoices/{id}/attachments, DRAFT only). */}
          {canAttach ? (
            <SectionCard title={t('salesNote.compose.attachments')}>
              <FileDropzone
                accept=".pdf,.jpg,.jpeg,.png,.xlsx"
                multiple
                onFiles={(picked) => setFiles((current) => [...current, ...picked])}
                className="block w-full"
              >
                {({ dragging }) => (
                  <div
                    className={[
                      'flex min-h-[168px] flex-col items-center justify-center gap-1.5 rounded-sm border border-dashed bg-surface-tab-bar px-4 py-8 text-center',
                      dragging ? 'border-primary-700' : 'border-primary-300',
                    ].join(' ')}
                  >
                    <img src={uploadIcon} alt="" className="size-6" />
                    <span className="text-base font-medium text-text-primary">
                      {t('salesNote.compose.dropFiles')}
                    </span>
                    <span className="text-sm font-medium text-text-quaternary">
                      {t('salesNote.compose.dropHint')}
                    </span>
                  </div>
                )}
              </FileDropzone>
              {files.length > 0 ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {files.map((file, index) => (
                    <li
                      key={`${file.name}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-sm border border-border-subtle px-3 py-2 text-sm font-medium text-text-secondary"
                    >
                      <span className="truncate">{file.name}</span>
                      <button
                        type="button"
                        onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                        className="text-xs font-semibold text-text-quaternary hover:text-danger-700"
                      >
                        {t('salesNote.compose.removeFile')}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </SectionCard>
          ) : null}
        </div>

        {/* Amount to credit / charge */}
        <aside className="flex flex-col gap-0 rounded-sm bg-surface-card xl:col-start-2 xl:row-start-1">
          <div className="p-4">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
              {t(`salesNote.amount.title.${kindKey}`)}
            </h2>
            <div className="my-3 h-px w-full bg-border-subtle" />
            <OmAmount
              size="lg"
              prefix={sign}
              amount={money(totals.total)}
              amountClassName={`text-[32px] font-semibold leading-none ${toneClass} tabular-nums`}
              className="mt-1"
            />
            <span
              className={[
                'mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium',
                credit ? 'bg-danger-100 text-danger-700' : 'bg-success-100 text-success-700',
              ].join(' ')}
            >
              <img src={credit ? reducesIcon : increasesIcon} alt="" className="size-4" />
              {t(`salesNote.amount.${credit ? 'reduces' : 'increases'}`)}
            </span>
          </div>
          <div className="h-px w-full bg-border-subtle" />
          <dl className="flex flex-col gap-3 p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="font-medium text-text-tertiary">
                {t(`salesNote.amount.net.${kindKey}`)}
              </dt>
              <dd>
                <OmAmount
                  size="xs"
                  prefix={sign}
                  amount={money(totals.net)}
                  amountClassName={`font-semibold ${toneClass} tabular-nums`}
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="font-medium text-text-tertiary">
                {t(`salesNote.amount.vat.${kindKey}`, { rate: vatRate })}
              </dt>
              <dd>
                <OmAmount
                  size="xs"
                  prefix={sign}
                  amount={money(totals.vat)}
                  amountClassName={`font-semibold ${toneClass} tabular-nums`}
                />
              </dd>
            </div>
            <dt className="mt-2 text-[11px] font-semibold uppercase tracking-[0.8px] text-text-quaternary">
              {t('salesNote.amount.effectOn', { customer: customerName })}
            </dt>
            <div className="flex items-center justify-between gap-3">
              <dt className="font-medium text-text-tertiary">
                {t('salesNote.amount.outstanding', { invoice: invoiceNumber })}
              </dt>
              <dd>
                <OmAmount
                  size="xs"
                  amount={money(outstanding)}
                  amountClassName="font-semibold text-text-primary tabular-nums"
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="font-medium text-text-tertiary">
                {t(credit ? 'salesNote.amount.applied' : 'salesNote.amount.added')}
              </dt>
              <dd>
                <OmAmount
                  size="xs"
                  prefix={sign}
                  amount={money(credit ? (effect ? total - effect.refund : total) : total)}
                  amountClassName={`font-semibold ${toneClass} tabular-nums`}
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="font-medium text-text-tertiary">{t('salesNote.amount.newBalance')}</dt>
              <dd>
                <OmAmount
                  size="xs"
                  amount={money(
                    outstanding === null
                      ? null
                      : credit
                        ? (effect?.after ?? outstanding)
                        : Math.round((outstanding + total) * 1000) / 1000,
                  )}
                  amountClassName="font-semibold text-text-primary tabular-nums"
                />
              </dd>
            </div>
            {credit ? (
              <div
                role="status"
                className={[
                  'mt-1 rounded-sm p-3',
                  effect && effect.refund > 0 ? 'bg-success-100' : 'bg-surface-tab-bar',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-text-primary">
                    {t('salesNote.amount.refundTitle')}
                  </span>
                  <OmAmount
                    size="xs"
                    amount={money(effect?.refund ?? 0)}
                    amountClassName="text-base font-semibold text-text-primary tabular-nums"
                  />
                </div>
                <p className="mt-1 text-xs font-medium leading-[1.5] text-text-tertiary">
                  {t(
                    effect && effect.refund > 0
                      ? 'salesNote.amount.refundHint'
                      : 'salesNote.amount.refundNone',
                    { invoice: invoiceNumber },
                  )}
                </p>
              </div>
            ) : null}
            <p className="mt-1 flex items-start gap-1.5 text-xs font-medium leading-[1.4] text-text-quaternary">
              <img src={infoIcon} alt="" className="mt-0.5 size-3.5 shrink-0" />
              {t(`salesNote.amount.filed.${kindKey}`, { invoice: invoiceNumber })}
            </p>
          </dl>
        </aside>
      </div>
    </Frame>
  )
}

type KeyedAttempt = { key: string; refused: boolean }

/**
 * Sends a keyed request: under a new key when the server refused the last one (4xx), under the
 * same key otherwise, so a retry after a timeout, a network error or a 5xx is a replay.
 */
async function withKey<T>(
  attempt: { current: KeyedAttempt },
  send: (key: string) => Promise<T>,
): Promise<T> {
  if (attempt.current.refused) attempt.current = { key: newIdempotencyKey(), refused: false }
  try {
    return await send(attempt.current.key)
  } catch (error) {
    if (error instanceof ApiError && error.status >= 400 && error.status < 500)
      attempt.current = { ...attempt.current, refused: true }
    throw error
  }
}

/**
 * The debit note's "Default tax category": the one category its lines carry (the invoice's while
 * no line is charged yet), named with the category labels the lines table already uses. A standard
 * rate note keeps the drawn "Standard rate · 5%".
 * TODO(owner): a note whose lines mix categories has no drawn wording; it reads as before.
 */
function noteCategoryLabel(
  form: NoteForm,
  invoice: InvoiceDetailDto,
  vatRate: number,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const standard = t('salesNote.compose.standardRate', { rate: vatRate })
  const kept = form.lines.filter((line) => line.include)
  const categories = (
    kept.length > 0
      ? kept.map((line) => line.taxCategory)
      : invoice.lines.map((line) => ({
          code: line.taxCategoryCode,
          en16931Category: line.en16931Category,
        }))
  ).filter((category, index, all) => all.findIndex((c) => c.code === category.code) === index)
  if (categories.length !== 1 || categories[0].en16931Category === 'S') return standard
  const { code, en16931Category } = categories[0]
  return t(`createInvoice.taxCategories.${code}`, {
    defaultValue: t(`createInvoice.taxCategories.${en16931Category}0`, { defaultValue: code }),
  })
}
