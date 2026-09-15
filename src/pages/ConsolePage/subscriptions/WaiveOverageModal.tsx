import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Modal, Rial, Select, withRial } from '../../../components/ui'
import { invoicesOf, subscriptionsStore } from '../../../lib/consoleSubscriptions'
import { omr } from '../../../lib/superAdmin'
import {
  Field,
  ModalFooter,
  TextArea,
  focusFirstInvalidField,
  parseAmount,
  useInvoiceOptions,
  type ActionModalProps,
  type Errors,
} from './modalFields'

const FORM_ID = 'waive-overage'

type FieldName = 'invoice' | 'amount' | 'reason'
const ORDER: FieldName[] = ['invoice', 'amount', 'reason']

/** Takes an overage charge off a subscription invoice, before VAT — the §4.3 operation, recorded. */
export function WaiveOverageModal({
  tenantId,
  ledger,
  invoiceId,
  onClose,
  onDone,
}: ActionModalProps) {
  const { t } = useTranslation()
  const candidates = invoicesOf(ledger, tenantId).filter(
    (invoice) => invoice.status !== 'waived' && invoice.amount > 0,
  )
  const initial =
    candidates.find((invoice) => invoice.id === invoiceId) ??
    candidates.find((invoice) => invoice.status === 'unpaid' || invoice.status === 'overdue') ??
    candidates[0]
  const [invoice, setInvoice] = useState(initial?.id ?? '')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [errors, setErrors] = useState<Errors<FieldName>>({})

  const clear = (field: FieldName) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const chosen = candidates.find((entry) => entry.id === invoice)
  const invoiceOptions = useInvoiceOptions(candidates)

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Errors<FieldName> = {}
    if (!chosen) next.invoice = t('validation.required')
    const value = parseAmount(amount)
    if (!amount.trim()) next.amount = t('validation.required')
    else if (!Number.isFinite(value) || value <= 0)
      next.amount = t('console.subscriptionActions.error.amount')
    else if (chosen && value > chosen.amount)
      next.amount = t('console.subscriptionActions.error.amountOver')
    if (!reason.trim()) next.reason = t('validation.required')
    setErrors(next)
    if (Object.values(next).some(Boolean) || !chosen) {
      focusFirstInvalidField(event.currentTarget, ORDER, next)
      return
    }
    subscriptionsStore.waiveOverage(tenantId, chosen.id, value, reason.trim())
    onDone(
      t('console.tenantDetail.done.overageWaived', { amount: omr(value), invoice: chosen.number }),
    )
  }

  return (
    <Modal
      open
      width={560}
      onClose={onClose}
      title={t('console.subscriptionActions.waiveOverage.title')}
      subtitle={t('console.subscriptionActions.waiveOverage.subtitle')}
      footer={
        <ModalFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitLabel={t('console.subscriptionActions.waiveOverage.submit')}
          disabled={candidates.length === 0}
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field
          name="invoice"
          label={t('console.subscriptionActions.common.invoice')}
          required
          error={errors.invoice}
          hint={
            chosen
              ? withRial(
                  t('console.subscriptionActions.waiveOverage.onInvoice', {
                    amount: omr(chosen.amount),
                  }),
                )
              : undefined
          }
        >
          <Select
            value={invoice}
            onChange={(value) => {
              setInvoice(value)
              clear('invoice')
              clear('amount')
            }}
            options={invoiceOptions}
            disabled={candidates.length === 0}
            ariaLabel={t('console.subscriptionActions.common.invoice')}
          />
        </Field>
        <div data-field="amount">
          <Input
            bordered
            name="amount"
            label={t('console.subscriptionActions.waiveOverage.amount')}
            requiredMark
            inputMode="decimal"
            autoComplete="off"
            leadingIcon={<Rial className="text-text-secondary" />}
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value)
              clear('amount')
            }}
            error={errors.amount}
          />
        </div>
        <TextArea
          name="reason"
          label={t('console.subscriptionActions.common.reason')}
          required
          placeholder={t('console.subscriptionActions.common.reasonPlaceholder')}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value)
            clear('reason')
          }}
          error={errors.reason}
        />
      </form>
    </Modal>
  )
}
