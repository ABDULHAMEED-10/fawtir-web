import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useReferenceData } from '../../lib/reference/referenceData'
import { AppShell } from '../../layouts/AppShell'
import { TableCheckbox } from '../../components/ui'
import { SelectField, TextAreaField } from '../../components/form'
import { ApiReadFailure, LoadingNotice, Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { IssueInvoiceModal } from '../../components/invoice/IssueInvoiceModal'
import { ApiError } from '../../api'
import { loadInvoice, loadReceivable, type InvoiceDetailDto, type InvoiceReceivableDto } from '../../api/invoices/detail'
import { createNote, loadDraft, newIdempotencyKey, saveDraft, type DraftResponse, type NoteKind } from '../../api/invoices/drafts'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount, formatDate } from '../../lib/format'
import { dueDateFor, muscatToday } from '../../lib/invoiceIssue'
import {
  NOTE_REFUSALS,
  NOTE_ROUTES,
  REASON_CODES,
  creditEffect,
  fromInvoice,
  fromNoteDraft,
  noteProblems,
  noteTotals,
  toNoteRequest,
  type NoteForm,
  type NoteLine,
  type NoteProblems,
} from '../../lib/salesNote'
import { can, useSession } from '../../lib/session/session'

type Loaded = { invoice: InvoiceDetailDto; receivable: InvoiceReceivableDto | null; draft: DraftResponse | null }

/**
 * Income › a credit or debit note (I-10/I-11): `/income/credit-notes/new?invoice=<id>` starts one
 * from an issued invoice, `/income/credit-notes/:id/edit` reopens a draft. Same for debit notes.
 */
export function SalesNotePage({ kind }: { kind: NoteKind }) {
  const { id } = useParams()
  const [search] = useSearchParams()
  return (
    <AppShell>
      <SalesNote key={id ?? search.get('invoice') ?? 'none'} kind={kind} draftId={id ?? null} invoiceId={search.get('invoice')} />
    </AppShell>
  )
}

function SalesNote({ kind, draftId, invoiceId }: { kind: NoteKind; draftId: string | null; invoiceId: string | null }) {
  const { t } = useTranslation()
  const session = useSession()
  const [loaded, setLoaded] = useState<{ status: 'loading' } | { status: 'ready'; data: Loaded } | { status: 'failed'; error: unknown }>({
    status: 'loading',
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let live = true
    const load = async (): Promise<Loaded> => {
      const draft = draftId ? await loadDraft(draftId) : null
      const originalId = draft?.correctionOfInvoiceId ?? invoiceId
      if (!originalId) throw new Error('no invoice')
      const invoice = await loadInvoice(originalId)
      const receivable = kind === 'CREDIT_NOTE' ? await loadReceivable(originalId).catch(() => null) : null
      return { invoice, receivable, draft }
    }
    load().then(
      (data) => live && setLoaded({ status: 'ready', data }),
      (error) => live && setLoaded({ status: 'failed', error }),
    )
    return () => {
      live = false
    }
  }, [draftId, invoiceId, kind, attempt])

  const permission = kind === 'CREDIT_NOTE' ? 'creditnote.create' : 'debitnote.create'
  if (!can(session, permission)) return <PermissionDeniedNotice />
  if (!draftId && !invoiceId) return <Notice body={t('salesNote.pickInvoice')} />
  if (loaded.status === 'loading') return <LoadingNotice />
  if (loaded.status === 'failed') return <ApiReadFailure error={loaded.error} retry={() => setAttempt((n) => n + 1)} />
  return <NoteEditor kind={kind} {...loaded.data} />
}

function NoteEditor({ kind, invoice, receivable, draft }: { kind: NoteKind } & Loaded) {
  const { t, i18n } = useTranslation()
  const reference = useReferenceData()
  const navigate = useNavigate()
  const session = useSession()
  const [form, setForm] = useState<NoteForm>(() => (draft ? fromNoteDraft(draft, invoice) : fromInvoice(invoice, kind)))
  const [saved, setSaved] = useState<DraftResponse | null>(draft)
  const [problems, setProblems] = useState<NoteProblems>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [issuing, setIssuing] = useState(false)
  const [key] = useState(newIdempotencyKey)
  const inFlight = useRef(false)

  const totals = useMemo(() => noteTotals(form), [form])
  const money = (value: number | string) => `${formatAmount(value, invoice.currency, i18n.language)} ${invoice.currency}`
  const base = NOTE_ROUTES[kind]
  const invoiceIssued = invoice.type === 'INVOICE' && invoice.authoringState === 'ISSUED'
  const effect = receivable?.outstandingAmount != null ? creditEffect(receivable.outstandingAmount, Number(totals.total)) : null

  const setLine = (lineNumber: number, patch: Partial<NoteLine>) =>
    setForm((current) => ({ ...current, lines: current.lines.map((line) => (line.lineNumber === lineNumber ? { ...line, ...patch } : line)) }))

  /** Saves the draft (creating it the first time) and returns it, or null when refused. */
  const persist = async (): Promise<DraftResponse | null> => {
    const found = noteProblems(form, kind)
    setProblems(found)
    if (Object.keys(found).length > 0) {
      setNotice(t('salesNote.fixFirst'))
      return null
    }
    const request = toNoteRequest(form, invoice)
    const next = saved ? await saveDraft(saved.id, saved.version, request) : await createNote(kind, invoice.id, key, request)
    setSaved(next)
    return next
  }

  const run = async (then: (draft: DraftResponse) => void) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      const next = await persist()
      if (next) then(next)
    } catch (error) {
      const coded = error instanceof ApiError && error.code ? NOTE_REFUSALS[error.code] : undefined
      const described = describeApiFailure(error)
      setNotice(coded ? t(coded) : t(described.key, described.values))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const today = muscatToday()
  const kindKey = kind === 'CREDIT_NOTE' ? 'credit' : 'debit'

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-2xl font-medium text-text-quaternary">
            <Link to={base} className="hover:text-text-secondary">
              {t(`salesNote.${kindKey}.list`)}
            </Link>
            <span>›</span>
            <span>{saved ? t('salesNote.draft') : t(`salesNote.${kindKey}.new`)}</span>
          </div>
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t(`salesNote.${kindKey}.title`)}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-base">
            <span className="font-medium text-text-quaternary">{t(`salesNote.${kindKey}.against`)}</span>
            <Link to={`/invoices/${invoice.id}`} className="font-semibold text-text-primary hover:text-primary-700">
              {invoice.invoiceNumber ?? invoice.id}
            </Link>
            {invoice.issueDate ? <span className="font-medium text-text-quaternary">· {formatDate(invoice.issueDate, i18n.language)}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy || !invoiceIssued}
            onClick={() => void run((next) => navigate(`${base}/${next.id}`, { replace: true }))}
            className="inline-flex h-[46px] items-center rounded-sm border border-black/[0.06] bg-[#fdfdfd] px-4 text-sm font-semibold text-[#3a3a3a] disabled:opacity-60"
          >
            {t('salesNote.saveDraft')}
          </button>
          {can(session, 'invoice.issue') ? (
            <button
              type="button"
              disabled={busy || !invoiceIssued}
              onClick={() => void run(() => setIssuing(true))}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-60"
            >
              {t(`salesNote.${kindKey}.issue`)}
            </button>
          ) : null}
        </div>
      </div>

      {!invoiceIssued ? <Notice body={t('salesNote.refused.invoiceNotIssued')} /> : null}
      {notice ? <Notice body={notice} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <section className="rounded-sm bg-surface-card p-4">
            <h2 className="text-xl font-medium text-text-secondary">{t(`salesNote.${kindKey}.linesTitle`)}</h2>
            <p className="mt-1 text-sm font-medium text-text-quaternary">{t(`salesNote.${kindKey}.linesNote`)}</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse">
                <thead>
                  <tr className="text-[11px] font-semibold uppercase tracking-[0.6px] text-text-quaternary">
                    <th className="w-10 pb-2" />
                    <th className="pb-2 text-start font-semibold">{t('salesNote.col.item')}</th>
                    <th className="pb-2 text-end font-semibold">{t('salesNote.col.onInvoice')}</th>
                    <th className="pb-2 text-end font-semibold">{t('salesNote.col.quantity')}</th>
                    <th className="pb-2 text-end font-semibold">{t('salesNote.col.unitPrice')}</th>
                    <th className="pb-2 text-end font-semibold">{t('salesNote.col.vat')}</th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line) => (
                    <tr key={line.lineNumber} className="border-t border-surface-background">
                      <td className="py-2">
                        <TableCheckbox
                          checked={line.include}
                          onChange={() => setLine(line.lineNumber, { include: !line.include })}
                          ariaLabel={t('salesNote.includeLine', { item: line.description })}
                        />
                      </td>
                      <td className="py-2 pe-2">
                        <p className="text-sm font-semibold text-text-primary">{line.description}</p>
                        <p className="text-xs font-medium text-text-quaternary">{line.productCode}</p>
                      </td>
                      <td className="py-2 text-end text-xs font-medium text-text-tertiary tabular-nums">
                        {line.invoiceQuantity} × {formatAmount(line.invoiceUnitPrice, invoice.currency, i18n.language)}
                      </td>
                      {(['quantity', 'unitPrice'] as const).map((field) => (
                        <td key={field} className="px-1 py-2 text-end">
                          <input
                            value={line[field]}
                            inputMode="decimal"
                            disabled={!line.include}
                            onChange={(event) => setLine(line.lineNumber, { [field]: event.target.value })}
                            aria-label={t(`salesNote.col.${field}`) + ' · ' + line.description}
                            className="h-[42px] w-[96px] rounded-sm border border-primary-300 bg-surface-tab-bar px-2 text-end text-sm font-medium text-text-secondary outline-none disabled:opacity-50"
                          />
                        </td>
                      ))}
                      <td className="py-2 text-end text-sm font-medium text-text-tertiary">{line.taxCategory.rate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {problems.lines || problems.amounts ? (
              <p role="alert" className="mt-2 text-xs font-medium text-text-danger">
                {t((problems.lines ?? problems.amounts)!)}
              </p>
            ) : null}
          </section>

          <section className="rounded-sm bg-surface-card p-4">
            <h2 className="text-xl font-medium text-text-secondary">{t('salesNote.why')}</h2>
            <div className="mt-3 grid gap-4">
              <SelectField
                id="note-reason"
                name="reasonCode"
                label={t('salesNote.reason')}
                required
                options={[{ value: '', label: t('salesNote.chooseReason') }, ...REASON_CODES.map((code) => ({ value: code, label: t(`salesNote.reasons.${code}`) }))]}
                value={form.reasonCode}
                onChange={(reasonCode) => setForm((current) => ({ ...current, reasonCode: reasonCode as NoteForm['reasonCode'] }))}
                error={problems.reasonCode ? t(problems.reasonCode) : undefined}
              />
              <TextAreaField
                id="note-customer"
                name="customerVisibleNote"
                label={t('salesNote.noteToCustomer')}
                value={form.note}
                onChange={(note) => setForm((current) => ({ ...current, note }))}
              />
            </div>
          </section>
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-4 xl:w-[340px]">
          <section className="rounded-sm bg-surface-card p-4">
            <h2 className="text-xl font-medium text-text-secondary">{t(`salesNote.${kindKey}.summary`)}</h2>
            <dl className="mt-3 flex flex-col gap-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="font-medium text-text-tertiary">{t('salesNote.net')}</dt>
                <dd className="font-semibold text-text-primary tabular-nums">{money(totals.net)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="font-medium text-text-tertiary">{t('salesNote.vat')}</dt>
                <dd className="font-semibold text-text-primary tabular-nums">{money(totals.vat)}</dd>
              </div>
              <div className="flex justify-between gap-3 border-t border-border-subtle pt-2">
                <dt className="font-semibold text-text-primary">{t(`salesNote.${kindKey}.total`)}</dt>
                <dd className="text-lg font-semibold text-text-primary tabular-nums">{money(totals.total)}</dd>
              </div>
            </dl>
            {kind === 'CREDIT_NOTE' && receivable && effect ? (
              <div className="mt-4 flex flex-col gap-2 rounded-sm bg-surface-tab-bar p-3 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-text-tertiary">{t('salesNote.credit.owedNow')}</span>
                  <span className="font-semibold tabular-nums">{money(receivable.outstandingAmount ?? 0)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="font-medium text-text-tertiary">{t('salesNote.credit.owedAfter')}</span>
                  <span className="font-semibold tabular-nums">{money(effect.after)}</span>
                </div>
                {effect.refund > 0 ? (
                  <p role="status" className="rounded-sm bg-warning-100 p-2 text-xs font-medium text-[#6d5a39]">
                    {t('salesNote.credit.refundOutside', { amount: money(effect.refund) })}
                  </p>
                ) : null}
              </div>
            ) : null}
            {kind === 'DEBIT_NOTE' ? <p className="mt-4 text-xs font-medium leading-[1.5] text-text-tertiary">{t('salesNote.debit.ownReceivable')}</p> : null}
          </section>
        </aside>
      </div>

      {issuing && saved ? (
        <IssueInvoiceModal
          invoiceId={saved.id}
          version={saved.version}
          initialIssueDate={today}
          initialDueDate={dueDateFor(reference, today, invoice.details?.paymentTerms?.code)}
          kind={kind}
          onClose={() => setIssuing(false)}
          onIssued={(issued) => navigate(`${base}/${issued.id}`, { replace: true })}
        />
      ) : null}
    </div>
  )
}
