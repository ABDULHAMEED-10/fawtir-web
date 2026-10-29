import { useState, type FormEvent } from 'react'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { useTranslation } from 'react-i18next'
import { paymentMethodOptions, useReferenceData } from '../../lib/reference/referenceData'
import { DateField, Input, Modal, Rial, Select, withRial } from '../../components/ui'
import { Notice } from '../../components/feedback/ApiNotice'
import {
  Field,
  ModalFooter,
  focusFirstInvalidField,
} from '../ConsolePage/subscriptions/modalFields'
import { ApiError } from '../../api'
import { newPaymentKey, recordPayment, type RecordPaymentRequest } from '../../api/invoices/detail'
import {
  PAYMENT_REFUSALS,
  paymentProblems,
  type PaymentField,
  type PaymentForm,
} from '../../lib/invoiceDetail'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount } from '../../lib/format'

const FORM_ID = 'record-invoice-payment'

/** What a refusal says is still owed, when it says so and something is: a paid bill has no "most". */
function owedIn(
  problem: Readonly<Record<string, unknown>>,
): { amount: number; currency: string } | null {
  const amount = problem.outstandingAmount
  const currency = problem.currency
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null
  if (typeof currency !== 'string' || currency === '') return null
  return { amount, currency }
}

/**
 * A figure as a sentence prints it: its currency, then the amount at that currency's decimals
 * (three for the rial). `withRial` draws the rial sign in place of "OMR"; any other currency
 * keeps its code.
 */
function figureInSentence(amount: number, currency: string, language: string): string {
  return `${currency} ${formatAmount(amount, currency, language)}`
}

const ORDER: PaymentField[] = ['amount', 'methodCode', 'paymentDate', 'reference']

/**
 * Money arrived against an issued invoice, and someone is recording it. Built on the console's
 * payment modal fields so the two read alike.
 */
export function RecordPaymentModal({
  invoiceId,
  invoiceNumber,
  currency,
  outstanding,
  issueDate,
  today,
  onClose,
  onRecorded,
  record,
  refusals,
  labelKeys,
  amountTooMuchKey,
}: {
  invoiceId: string
  invoiceNumber: string | null
  currency: string
  outstanding: number | null
  issueDate: string | null
  /** The Muscat day, so "not in the future" means what the server means by it. */
  today: string
  onClose: () => void
  onRecorded: () => void
  /**
   * Where the payment is recorded, when not against the invoice itself: a self-billed document's
   * debt is its Expenditure bill, so that page records against the bill. Same key, same form.
   */
  record?: (idempotencyKey: string, payment: RecordPaymentRequest) => Promise<unknown>
  /**
   * Refusals that route can add, named over {@link PAYMENT_REFUSALS}. `values` reads what the
   * sentence names off the problem document (a bill's payment run reference).
   */
  refusals?: Record<
    string,
    {
      field: PaymentField | null
      key: string
      values?: (problem: Readonly<Record<string, unknown>>) => Record<string, unknown>
      /**
       * The sentence when the server names what is still owed beside the code (a bill's
       * `outstandingAmount` and `currency`). `{{amount}}` is that figure, with the rial sign and
       * three decimals. Without the figure, or with nothing left to pay, `key` is said.
       */
      keyWithOwed?: string
    }
  >
  /**
   * The amount and date labels, when the money goes the other way: on a self-billed document the
   * tenant pays its supplier, so "Amount paid" / "Paid on" rather than received.
   */
  labelKeys?: { amount: string; date: string }
  /**
   * What an amount above what is still owed reads as, when it is not an invoice that is owed (a
   * bill). `{{amount}}` is the outstanding amount the dialog holds, with the rial sign and three
   * decimals.
   */
  amountTooMuchKey?: string
}) {
  const { t, i18n } = useTranslation()
  const reference = useReferenceData()
  // One key for the life of the modal: a second click, or a retry after a lost response, is the
  // same payment and the server records it once.
  const [idempotencyKey] = useState(newPaymentKey)
  const [form, setForm] = useState<PaymentForm>({
    amount: outstanding === null ? '' : outstanding.toFixed(3),
    methodCode: '30',
    reference: '',
    paymentDate: today,
  })
  const [errors, setErrors] = useState<Partial<Record<PaymentField, string>>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // What the server said is still owed, when a refusal named it: the figure the page holds is
  // the stale one by then.
  const [owed, setOwed] = useState<{ amount: number; currency: string } | null>(null)

  const change = (field: PaymentField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const target = event.currentTarget
    const problems = paymentProblems(form, { outstanding, currency, issueDate, today })
    if (amountTooMuchKey && problems.amount === 'invoiceDetails.pay.error.amountTooMuch')
      problems.amount = amountTooMuchKey
    setErrors(problems)
    setFailure(null)
    setOwed(null)
    if (Object.values(problems).some(Boolean)) {
      focusFirstInvalidField(target, ORDER, problems)
      return
    }
    setBusy(true)
    try {
      const payment: RecordPaymentRequest = {
        amount: Number(form.amount.trim().replace(/,/g, '')),
        methodCode: form.methodCode,
        paymentReference: form.reference.trim() || null,
        paymentDate: form.paymentDate,
      }
      await (record
        ? record(idempotencyKey, payment)
        : recordPayment(invoiceId, idempotencyKey, payment))
      onRecorded()
    } catch (error) {
      const named = error instanceof ApiError && error.code && refusals && Object.hasOwn(refusals, error.code) ? refusals[error.code] : undefined
      const refusal =
        named ??
        (error instanceof ApiError && error.code && Object.hasOwn(PAYMENT_REFUSALS, error.code) ? PAYMENT_REFUSALS[error.code] : undefined)
      const namedOwed =
        named?.keyWithOwed && error instanceof ApiError ? owedIn(error.problem) : null
      if (refusal?.field && named?.keyWithOwed && namedOwed) {
        setOwed(namedOwed)
        setErrors({ [refusal.field]: named.keyWithOwed })
      } else if (refusal?.field) {
        setErrors({ [refusal.field]: refusal.key })
      } else if (refusal) {
        setFailure(
          t(refusal.key, error instanceof ApiError ? (named?.values?.(error.problem) ?? {}) : {}),
        )
      } else {
        const message = describeApiFailure(error)
        const body = t(message.key, message.values)
        setFailure(
          message.reference
            ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
            : body,
        )
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      width={640}
      onClose={onClose}
      title={t('invoiceDetails.pay.title')}
      // The code before the figure, so the rial sign drawn in its place stands before it.
      subtitle={withRial(
        t('invoiceDetails.pay.subtitle', {
          number: invoiceNumber ?? '—',
          amount:
            outstanding === null
              ? '—'
              : `${currency} ${formatAmount(outstanding, currency, i18n.language)}`,
        }),
      )}
      footer={
        <ModalFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitLabel={t('invoiceDetails.pay.submit')}
          disabled={busy}
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {failure ? <Notice body={failure} /> : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div data-field="amount">
            <Input
              bordered
              name="amount"
              label={t(labelKeys?.amount ?? 'invoiceDetails.pay.amount')}
              requiredMark
              inputMode="decimal"
              onFocus={selectAllOnFocus}
              autoComplete="off"
              leadingIcon={<Rial className="text-text-secondary" />}
              value={form.amount}
              onChange={(event) => change('amount', event.target.value)}
              error={
                errors.amount
                  ? withRial(
                      t(errors.amount, {
                        amount: owed
                          ? figureInSentence(owed.amount, owed.currency, i18n.language)
                          : outstanding === null
                            ? ''
                            : figureInSentence(outstanding, currency, i18n.language),
                      }),
                    )
                  : undefined
              }
              hint={t('invoiceDetails.pay.amountHint')}
            />
          </div>
          <Field
            name="methodCode"
            label={t('invoiceDetails.pay.method')}
            required
            error={errors.methodCode ? t(errors.methodCode) : undefined}
          >
            <Select
              value={form.methodCode}
              onChange={(value) => change('methodCode', value)}
              options={paymentMethodOptions(reference, t).map((option) => ({
                ...option,
                label: t(`invoiceDetails.pay.means.${option.value}`),
              }))}
              ariaLabel={t('invoiceDetails.pay.method')}
            />
          </Field>
          <Field
            name="paymentDate"
            label={t(labelKeys?.date ?? 'invoiceDetails.pay.date')}
            required
            error={errors.paymentDate ? t(errors.paymentDate) : undefined}
          >
            <DateField
              value={form.paymentDate}
              onChange={(value) => change('paymentDate', value)}
              min={issueDate ?? undefined}
              max={today}
              ariaLabel={t(labelKeys?.date ?? 'invoiceDetails.pay.date')}
            />
          </Field>
          <div data-field="reference">
            <Input
              bordered
              name="reference"
              label={t('invoiceDetails.pay.reference')}
              autoComplete="off"
              spellCheck={false}
              maxLength={200}
              value={form.reference}
              onChange={(event) => change('reference', event.target.value)}
            />
          </div>
        </div>
      </form>
    </Modal>
  )
}
