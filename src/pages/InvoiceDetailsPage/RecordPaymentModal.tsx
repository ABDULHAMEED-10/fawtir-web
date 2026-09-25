import { useState, type FormEvent } from 'react'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
import { useTranslation } from 'react-i18next'
import { paymentMethodOptions, useReferenceData } from '../../lib/reference/referenceData'
import { DateField, Input, Modal, Rial, Select } from '../../components/ui'
import { Notice } from '../../components/feedback/ApiNotice'
import {
  Field,
  ModalFooter,
  focusFirstInvalidField,
} from '../ConsolePage/subscriptions/modalFields'
import { ApiError } from '../../api'
import { newPaymentKey, recordPayment } from '../../api/invoices/detail'
import {
  PAYMENT_REFUSALS,
  paymentProblems,
  type PaymentField,
  type PaymentForm,
} from '../../lib/invoiceDetail'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatAmount } from '../../lib/format'

const FORM_ID = 'record-invoice-payment'
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

  const change = (field: PaymentField, value: string) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const target = event.currentTarget
    const problems = paymentProblems(form, { outstanding, currency, issueDate, today })
    setErrors(problems)
    setFailure(null)
    if (Object.values(problems).some(Boolean)) {
      focusFirstInvalidField(target, ORDER, problems)
      return
    }
    setBusy(true)
    try {
      await recordPayment(invoiceId, idempotencyKey, {
        amount: Number(form.amount.trim().replace(/,/g, '')),
        methodCode: form.methodCode,
        paymentReference: form.reference.trim() || null,
        paymentDate: form.paymentDate,
      })
      onRecorded()
    } catch (error) {
      const refusal =
        error instanceof ApiError && error.code ? PAYMENT_REFUSALS[error.code] : undefined
      if (refusal?.field) {
        setErrors({ [refusal.field]: refusal.key })
      } else if (refusal) {
        setFailure(t(refusal.key))
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
      subtitle={t('invoiceDetails.pay.subtitle', {
        number: invoiceNumber ?? '—',
        amount: outstanding === null ? '—' : formatAmount(outstanding, currency, i18n.language),
      })}
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
              label={t('invoiceDetails.pay.amount')}
              requiredMark
              inputMode="decimal"
              onFocus={selectAllOnFocus}
              autoComplete="off"
              leadingIcon={<Rial className="text-text-secondary" />}
              value={form.amount}
              onChange={(event) => change('amount', event.target.value)}
              error={errors.amount ? t(errors.amount) : undefined}
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
            label={t('invoiceDetails.pay.date')}
            required
            error={errors.paymentDate ? t(errors.paymentDate) : undefined}
          >
            <DateField
              value={form.paymentDate}
              onChange={(value) => change('paymentDate', value)}
              min={issueDate ?? undefined}
              max={today}
              ariaLabel={t('invoiceDetails.pay.date')}
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
