import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
import { formatAmount, formatDate } from '../../lib/format'
import { issueRefusalOf, muscatToday } from '../../lib/invoiceIssue'
import {
  NOTE_MODES,
  NOTE_REFUSALS,
  NOTE_ROUTES,
  REASON_CODES,
  addedLine,
  creditEffect,
  fromInvoice,
  fromNoteDraft,
  noteProblems,
  noteTotals,
  ownLines,
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
export function SalesNotePage({ kind }: { kind: NoteKind }) {
  const { id } = useParams()
  const [search] = useSearchParams()
  return (
    <AppShell>
      <SalesNote
        key={id ?? search.get('invoice') ?? 'none'}
        kind={kind}
        draftId={id ?? null}
        invoiceId={search.get('invoice')}
      />
    </AppShell>
  )
}

function SalesNote({
  kind,
  draftId,
  invoiceId,
}: {
  kind: NoteKind
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

  const permission = kind === 'CREDIT_NOTE' ? 'creditnote.create' : 'debitnote.create'
  if (!can(session, permission)) return <PermissionDeniedNotice />
  if (!draftId && !invoiceId) return <InvoicePicker kind={kind} />
  if (loaded.status === 'loading') {
    return (
      <Frame kind={kind} title={t(`salesNote.${kind === 'CREDIT_NOTE' ? 'credit' : 'debit'}.new`)}>
        <LoadingNotice />
      </Frame>
    )
  }
  if (loaded.status === 'failed') {
    return (
      <Frame kind={kind} title={t(`salesNote.${kind === 'CREDIT_NOTE' ? 'credit' : 'debit'}.new`)}>
        <ApiReadFailure error={loaded.error} retry={() => setAttempt((n) => n + 1)} />
      </Frame>
    )
  }
  return <NoteEditor kind={kind} {...loaded.data} />
}

/** The breadcrumb, title and status pill every state of the page shares. */
function Frame({
  kind,
  title,
  subtitle,
  actions,
  children,
}: {
  kind: NoteKind
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
            <Link to={NOTE_ROUTES[kind]} className="hover:text-text-secondary">
              {t(`salesNote.${kindKey}.list`)}
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

function NoteEditor({ kind, invoice, receivable, draft, customer }: { kind: NoteKind } & Loaded) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const session = useSession()
  const credit = kind === 'CREDIT_NOTE'
  const kindKey = credit ? 'credit' : 'debit'
  const [form, setForm] = useState<NoteForm>(() =>
    draft ? fromNoteDraft(draft, invoice, kind) : fromInvoice(invoice, kind),
  )
  const [saved, setSaved] = useState<DraftResponse | null>(draft)
  const [problems, setProblems] = useState<NoteProblems>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [key] = useState(newIdempotencyKey)
  // The issue key is the dates': changing a date after a refusal is a new request, not a replay.
  const [issueKey, setIssueKey] = useState(newIdempotencyKey)
  const inFlight = useRef(false)

  const totals = useMemo(() => noteTotals(form), [form])
  const money = (value: number | string | null | undefined) =>
    value === null || value === undefined
      ? '—'
      : formatAmount(value, invoice.currency, i18n.language)
  const base = NOTE_ROUTES[kind]
  const invoiceNumber = invoice.invoiceNumber ?? invoice.id
  const customerName = customer?.displayName ?? t('salesNote.compose.customerUnknown')
  const invoiceIssued = invoice.type === 'INVOICE' && invoice.authoringState === 'ISSUED'
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
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line) =>
        line.lineNumber === lineNumber ? { ...line, ...patch } : line,
      ),
    }))
  const change = (patch: Partial<NoteForm>) => setForm((current) => ({ ...current, ...patch }))
  const changeDate = (patch: Partial<Pick<NoteForm, 'issueDate' | 'dueDate'>>) => {
    change(patch)
    setIssueKey(newIdempotencyKey())
  }

  /** Saves the draft (creating it the first time) and returns it, or null when refused. */
  const persist = async (): Promise<DraftResponse | null> => {
    const found = noteProblems(form, kind, today)
    setProblems(found)
    if (Object.keys(found).length > 0) {
      setNotice(t('salesNote.fixFirst'))
      return null
    }
    const request = toNoteRequest(form, invoice)
    const next = saved
      ? await saveDraft(saved.id, saved.version, request)
      : await createNote(kind, invoice.id, key, request)
    setSaved(next)
    return next
  }

  const run = async (then: (draft: DraftResponse) => Promise<void> | void) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      const next = await persist()
      if (next) await then(next)
    } catch (error) {
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
      const issued = await issueDraft(next.id, issueKey, {
        expectedVersion: next.version,
        issueDate: form.issueDate,
        // A credit note is not collected; the API still wants a due date, so the issue date is sent.
        dueDate: credit ? form.issueDate : form.dueDate,
      })
      navigate(`${base}/${issued.id}`, {
        replace: true,
        state: { issuedNumber: issued.invoiceNumber },
      })
    })

  const discard = async () => {
    if (!saved) return
    setBusy(true)
    try {
      await discardDraft(saved.id, saved.version)
      navigate(base, { replace: true })
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
      to: `/invoices/${invoice.id}`,
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

  return (
    <Frame
      kind={kind}
      title={saved?.invoiceNumber ?? t(`salesNote.${kindKey}.new`)}
      subtitle={
        <>
          <span className="font-medium text-text-quaternary">
            {t(`salesNote.compose.${credit ? 'reversing' : 'adjusting'}`)}
          </span>
          <Link
            to={`/invoices/${invoice.id}`}
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
          <button
            type="button"
            disabled={busy || !invoiceIssued}
            onClick={() => void run((next) => navigate(`${base}/${next.id}`, { replace: true }))}
            className={GHOST_BUTTON}
          >
            <img src={saveDraftIcon} alt="" className="size-5" />
            {t('salesNote.saveDraft')}
          </button>
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
                      to={`/invoices/${invoice.id}`}
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
                selectable={!own}
                editable
                growable={form.mode === 'additionalItems'}
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
                    amount={`${sign} ${money(totals.net)}`}
                    amountClassName={`text-base font-semibold ${toneClass} tabular-nums`}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 text-sm">
                  <span className="font-medium text-text-tertiary">
                    {t(`salesNote.amount.vat.${kindKey}`, { rate: vatRate })}
                  </span>
                  <OmAmount
                    size="xs"
                    amount={`${sign} ${money(totals.vat)}`}
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
                    amount={`${sign} ${money(totals.total)}`}
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
                error={problems.reasonCode ? t(problems.reasonCode) : undefined}
              >
                <Select
                  value={form.reasonCode}
                  onChange={(reasonCode) =>
                    change({ reasonCode: reasonCode as NoteForm['reasonCode'] })
                  }
                  options={REASON_CODES.map((code) => ({
                    value: code,
                    label: t(`salesNote.reasons.${code}`),
                  }))}
                  placeholder={t('salesNote.chooseReason')}
                  ariaLabel={t('salesNote.reason')}
                  highlighted={form.reasonCode !== ''}
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
                /* Text only, as the client asked: the category is the invoice's. */
                <Labelled label={t('salesNote.compose.taxCategory')} required>
                  <span className={FIELD_READONLY}>
                    {t('salesNote.compose.standardRate', { rate: vatRate })}
                  </span>
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

          {/* Attachments — TODO(backend): no upload endpoint for draft attachments; files chosen here stay with the page. */}
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
              amount={`${sign} ${money(totals.total)}`}
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
                  amount={`${sign} ${money(totals.net)}`}
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
                  amount={`${sign} ${money(totals.vat)}`}
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
                  amount={`${sign} ${money(credit ? (effect ? total - effect.refund : total) : total)}`}
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
