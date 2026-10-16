import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { DateField, Modal } from '../ui'
import { Notice } from '../feedback/ApiNotice'
import { Field, ModalFooter, focusFirstInvalidField } from '../../pages/ConsolePage/subscriptions/modalFields'
import { issueDraft, newIdempotencyKey, previewDraft, type DraftPreview } from '../../api/invoices/drafts'
import type { InvoiceDetailDto } from '../../api/invoices/detail'
import { describeApiFailure } from '../../lib/apiFailure'
import { subscriptionRestrictedAction } from '../../lib/subscriptionRestricted'
import { useCan } from '../../lib/session/session'
import { ApiError } from '../../api'
import { EXTRA_DOCUMENTS_ROUTE } from '../../api/settings/extraDocuments'
import {
  SELF_BILLED_SUPPLIER_SWITCHED_OFF_KEY,
  SELF_BILLING_AGREEMENTS_ROUTE,
  SUPPLIER_ISIC_MISSING_KEY,
  isSelfBilledSupplierSwitchedOff,
  isSupplierIsicMissing,
} from '../../lib/selfBillingRefusals'
import { formatAmount } from '../../lib/format'
import { issueProblems, issueRefusalOf, muscatToday, type IssueField, type IssueForm } from '../../lib/invoiceIssue'

const FORM_ID = 'issue-invoice'
const ORDER: IssueField[] = ['issueDate', 'dueDate']

/**
 * The confirmation before a draft is issued, from the composer and from the draft's own page alike.
 *
 * It shows what issuing freezes — the dates and the server's own total for the saved draft — and
 * says plainly that nothing is sent. The Idempotency-Key is minted for the dates it was sent with:
 * a double click or a retry is one issue, and changing a date after a refusal is a new request.
 */
export function IssueInvoiceModal({
  invoiceId,
  version,
  initialIssueDate,
  initialDueDate,
  kind = 'INVOICE',
  selfBilled = false,
  onClose,
  onIssued,
}: {
  invoiceId: string
  version: number
  initialIssueDate: string
  initialDueDate: string
  /**
   * What is being issued. A credit note is not collected, so it asks for no due date. The API still
   * requires one (SRS v1.1 Ch15 lists IBT-009 as mandatory; Zain, 2026-09-17), so the issue date is
   * sent as it.
   */
  kind?: 'INVOICE' | 'CREDIT_NOTE' | 'DEBIT_NOTE'
  /**
   * A self-billed document: its seller is the supplier, so a missing business activity (BTOM-033)
   * is the supplier's, set on its agreement, not the company's.
   */
  selfBilled?: boolean
  onClose: () => void
  onIssued: (invoice: InvoiceDetailDto) => void
}) {
  const { t, i18n } = useTranslation()
  const today = muscatToday()
  const noDueDate = kind === 'CREDIT_NOTE'
  const copy = kind === 'CREDIT_NOTE' ? 'invoiceIssue.creditNote' : kind === 'DEBIT_NOTE' ? 'invoiceIssue.debitNote' : 'invoiceIssue'
  const [form, setForm] = useState<IssueForm>({ issueDate: initialIssueDate, dueDate: initialDueDate })
  const [key, setKey] = useState(newIdempotencyKey)
  const [errors, setErrors] = useState<Partial<Record<IssueField, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  // A way out where there is one: the page where the supplier's business activity is set, or, at
  // 0 documents left, buying extra documents.
  const [failureLink, setFailureLink] = useState<{ to: string; labelKey: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const mayBuyExtras = useCan('tenant.plan.manage')
  // Two clicks in one tick both run before `busy` renders the button disabled; the second would be
  // refused by the key (409, request in progress) and flash an error over a successful issue.
  const inFlight = useRef(false)
  const [preview, setPreview] = useState<{ status: 'loading' } | { status: 'ready'; data: DraftPreview } | { status: 'failed' }>({
    status: 'loading',
  })

  useEffect(() => {
    let live = true
    previewDraft(invoiceId).then(
      (data) => live && setPreview({ status: 'ready', data }),
      () => live && setPreview({ status: 'failed' }),
    )
    return () => {
      live = false
    }
  }, [invoiceId])

  const change = (field: IssueField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
    setKey(newIdempotencyKey())
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const target = event.currentTarget
    const sent = noDueDate ? { ...form, dueDate: form.issueDate } : form
    const problems = issueProblems(sent, today)
    setErrors(problems)
    setFailure(null)
    setFailureLink(null)
    if (Object.values(problems).some(Boolean)) {
      focusFirstInvalidField(target, ORDER, problems)
      return
    }
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      const issued = await issueDraft(invoiceId, key, { expectedVersion: version, ...sent })
      onIssued(issued)
    } catch (error) {
      const refusal = issueRefusalOf(error)
      if (selfBilled && isSupplierIsicMissing(error)) {
        setFailure(t(SUPPLIER_ISIC_MISSING_KEY))
        setFailureLink({ to: SELF_BILLING_AGREEMENTS_ROUTE, labelKey: 'apiErrors.selfBilling.supplierIsicAction' })
      } else if (selfBilled && isSelfBilledSupplierSwitchedOff(error)) {
        setFailure(t(SELF_BILLED_SUPPLIER_SWITCHED_OFF_KEY))
      } else if (refusal?.field) {
        setErrors({ [refusal.field]: refusal.key })
      } else if (refusal) {
        setFailure(t(refusal.key, refusal.values))
        // At 0 left the way on is to buy extra documents ahead, for those who may (EX-1).
        if (error instanceof ApiError && error.code === 'QUOTA_EXCEEDED' && mayBuyExtras) {
          setFailureLink({ to: EXTRA_DOCUMENTS_ROUTE, labelKey: 'extraDocuments.entry' })
        }
      } else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setFailure(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
        setFailureLink(subscriptionRestrictedAction(error))
      }
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  const total =
    preview.status === 'ready'
      ? formatAmount(preview.data.totals.totalAmount, preview.data.currency, i18n.language)
      : preview.status === 'loading'
        ? t('invoiceIssue.totalLoading')
        : '—'

  return (
    <Modal
      open
      width={560}
      onClose={onClose}
      title={t(`${copy}.title`)}
      subtitle={t(`${copy}.subtitle`)}
      footer={<ModalFooter formId={FORM_ID} onCancel={onClose} submitLabel={busy ? t('invoiceIssue.issuing') : t(`${copy}.submit`)} disabled={busy} />}
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {failure ? (
          <Notice
            body={failure}
            action={failureLink ? { label: t(failureLink.labelKey), to: failureLink.to } : undefined}
          />
        ) : null}

        <div className="flex items-baseline justify-between gap-3 rounded-sm bg-surface-tab-bar px-4 py-3">
          <span className="text-sm font-medium text-text-secondary">{t('invoiceIssue.total')}</span>
          <span className="text-xl font-semibold text-text-primary">{total}</span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            name="issueDate"
            label={t('createInvoice.fields.issueDate')}
            required
            error={errors.issueDate ? t(errors.issueDate) : undefined}
          >
            <DateField value={form.issueDate} onChange={(value) => change('issueDate', value)} max={today} ariaLabel={t('createInvoice.fields.issueDate')} />
          </Field>
          {noDueDate ? null : (
            <Field
              name="dueDate"
              label={t('createInvoice.fields.dueDate')}
              required
              error={errors.dueDate ? t(errors.dueDate) : undefined}
            >
              <DateField
                value={form.dueDate}
                onChange={(value) => change('dueDate', value)}
                min={form.issueDate || undefined}
                ariaLabel={t('createInvoice.fields.dueDate')}
              />
            </Field>
          )}
        </div>

        <p className="text-sm font-medium leading-[1.5] text-text-secondary">{t(`${copy}.body`)}</p>
        <p className="text-sm font-semibold leading-[1.5] text-text-primary">{t('invoiceIssue.notSent')}</p>
      </form>
    </Modal>
  )
}
