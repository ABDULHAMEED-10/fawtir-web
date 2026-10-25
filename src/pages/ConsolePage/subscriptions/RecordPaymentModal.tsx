import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Checkbox,
  DateField,
  FileDropzone,
  Input,
  Modal,
  Rial,
  Select,
} from '../../../components/ui'
import {
  METHODS,
  OPERATOR,
  invoicesOf,
  subscriptionOf,
  subscriptionsStore,
  tenantIdentity,
  type PaymentMethod,
} from '../../../lib/consoleSubscriptions'
import { PLATFORM_SETTINGS } from '../../../lib/platformSettings'
import {
  Field,
  ModalFooter,
  TODAY_KEY,
  TextArea,
  dateOf,
  dayLabel,
  focusFirstInvalidField,
  parseAmount,
  useInvoiceOptions,
  type ActionModalProps,
  type Errors,
} from './modalFields'

const FORM_ID = 'record-payment'

type FieldName = 'invoice' | 'method' | 'amount' | 'receivedOn' | 'reference' | 'note'
const ORDER: FieldName[] = ['invoice', 'method', 'amount', 'receivedOn', 'reference', 'note']

/**
 * Money arrived — by transfer, cash, cheque, or a card link Paymob confirmed — and someone at
 * Insight is recording it. The invoice goes to Paid and, unless the box is unticked, the account
 * is activated for the period the invoice covers (§7.1: activation always happens here).
 */
export function RecordPaymentModal({
  tenantId,
  ledger,
  invoiceId,
  onClose,
  onDone,
}: ActionModalProps) {
  const { t, i18n } = useTranslation()
  const tenant = tenantIdentity(tenantId)
  const subscription = subscriptionOf(ledger, tenantId)
  const open = invoicesOf(ledger, tenantId).filter(
    (invoice) => invoice.status === 'unpaid' || invoice.status === 'overdue',
  )
  const enabledMethods = METHODS.filter((method) => PLATFORM_SETTINGS.payments.methods[method])
  const alreadyActive = subscription?.state === 'active'

  const initialInvoice = open.find((invoice) => invoice.id === invoiceId) ?? open[0]
  const [invoice, setInvoice] = useState(initialInvoice?.id ?? '')
  const [method, setMethod] = useState<PaymentMethod | ''>(() => {
    const preferred = subscription?.preferredMethod
    return preferred && enabledMethods.includes(preferred) ? preferred : (enabledMethods[0] ?? '')
  })
  const [amount, setAmount] = useState(initialInvoice?.total != null ? initialInvoice.total.toFixed(3) : '')
  const [receivedOn, setReceivedOn] = useState(TODAY_KEY)
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [proof, setProof] = useState<File | null>(null)
  const [activate, setActivate] = useState(true)
  const [errors, setErrors] = useState<Errors<FieldName>>({})

  const clear = (field: FieldName) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const chosen = open.find((entry) => entry.id === invoice)
  const invoiceOptions = useInvoiceOptions(open)
  const methodOptions = enabledMethods.map((entry) => ({
    value: entry,
    label: t(`console.subscriptions.method.${entry}`),
  }))

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Errors<FieldName> = {}
    if (!chosen) next.invoice = t('validation.required')
    if (!method) next.method = t('validation.required')
    const value = parseAmount(amount)
    if (!amount.trim()) next.amount = t('validation.required')
    else if (!Number.isFinite(value) || value <= 0)
      next.amount = t('console.subscriptionActions.error.amount')
    const received = dateOf(receivedOn)
    if (!received) next.receivedOn = t('validation.required')
    else if (receivedOn > TODAY_KEY) next.receivedOn = t('console.subscriptionActions.error.future')
    if (method !== 'cash' && !reference.trim()) next.reference = t('validation.required')
    setErrors(next)
    if (Object.values(next).some(Boolean)) {
      focusFirstInvalidField(event.currentTarget, ORDER, next)
      return
    }
    if (!chosen || !method || !received) return
    subscriptionsStore.recordPayment({
      tenantId,
      invoiceId: chosen.id,
      method,
      amount: value,
      receivedOn: received,
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
      activate: alreadyActive ? false : activate,
    })
    onDone(
      !alreadyActive && activate
        ? t('console.tenantDetail.done.recorded', {
            tenant: tenant.name,
            date: dayLabel(chosen.periodEnd, i18n.language),
          })
        : t('console.tenantDetail.done.recordedOnly', { tenant: tenant.name }),
    )
  }

  return (
    <Modal
      open
      width={640}
      onClose={onClose}
      title={t('console.subscriptionActions.recordPayment.title')}
      subtitle={t('console.subscriptionActions.recordPayment.subtitle', {
        tenant: tenant.name,
        operator: OPERATOR,
      })}
      footer={
        <ModalFooter
          formId={FORM_ID}
          onCancel={onClose}
          submitLabel={t('console.subscriptionActions.recordPayment.submit')}
          disabled={open.length === 0}
        />
      }
    >
      <form id={FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-4">
        {open.length === 0 ? (
          <p className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium leading-[1.5] text-text-tertiary">
            {t('console.subscriptionActions.common.noOpenInvoice')}
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field
                name="invoice"
                label={t('console.subscriptionActions.common.invoice')}
                required
                error={errors.invoice}
              >
                <Select
                  value={invoice}
                  onChange={(value) => {
                    setInvoice(value)
                    const picked = open.find((entry) => entry.id === value)
                    if (picked) setAmount(picked.total === null ? '' : picked.total.toFixed(3))
                    clear('invoice')
                  }}
                  options={invoiceOptions}
                  placeholder={t('console.subscriptionActions.common.invoicePlaceholder')}
                  disabled={open.length === 0}
                  ariaLabel={t('console.subscriptionActions.common.invoice')}
                />
              </Field>
              <Field
                name="method"
                label={t('console.subscriptionActions.recordPayment.method')}
                required
                error={errors.method}
              >
                <Select
                  value={method}
                  onChange={(value) => {
                    setMethod(value as PaymentMethod)
                    clear('method')
                    clear('reference')
                  }}
                  options={methodOptions}
                  ariaLabel={t('console.subscriptionActions.recordPayment.method')}
                />
              </Field>
              <div data-field="amount">
                <Input
                  bordered
                  name="amount"
                  label={t('console.subscriptionActions.recordPayment.amount')}
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
                  hint={
                    chosen
                      ? `${chosen.number} · ${t('console.subscriptionActions.common.includingVat')}`
                      : undefined
                  }
                />
              </div>
              <Field
                name="receivedOn"
                label={t('console.subscriptionActions.recordPayment.receivedOn')}
                required
                error={errors.receivedOn}
              >
                <DateField
                  value={receivedOn}
                  onChange={(value) => {
                    setReceivedOn(value)
                    clear('receivedOn')
                  }}
                  max={TODAY_KEY}
                  ariaLabel={t('console.subscriptionActions.recordPayment.receivedOn')}
                />
              </Field>
            </div>

            <div data-field="reference">
              <Input
                bordered
                name="reference"
                label={t(`console.subscriptionActions.recordPayment.reference.${method || 'cash'}`)}
                requiredMark={method !== 'cash'}
                autoComplete="off"
                spellCheck={false}
                value={reference}
                onChange={(event) => {
                  setReference(event.target.value)
                  clear('reference')
                }}
                error={errors.reference}
              />
            </div>

            <TextArea
              name="note"
              label={t('console.subscriptionActions.common.note')}
              placeholder={t('console.subscriptionActions.common.notePlaceholder')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />

            <Field
              name="proof"
              label={t('console.subscriptionActions.recordPayment.proof')}
              hint={t('console.subscriptionActions.recordPayment.proofHint')}
            >
              {proof ? (
                <div className="flex items-center justify-between gap-3 rounded-sm border border-primary-300 bg-primary-25 px-4 py-3">
                  <span
                    dir="ltr"
                    className="min-w-0 truncate text-sm font-medium text-text-secondary"
                  >
                    {proof.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => setProof(null)}
                    className="shrink-0 text-sm font-semibold text-primary-700 hover:text-primary-800"
                  >
                    {t('console.subscriptionActions.recordPayment.proofRemove')}
                  </button>
                </div>
              ) : (
                <FileDropzone
                  accept=".pdf,.jpg,.jpeg,.png"
                  maxBytes={5 * 1024 * 1024}
                  onFiles={(files) => setProof(files[0] ?? null)}
                >
                  {({ dragging }) => (
                    <span
                      className={[
                        'flex min-h-[72px] items-center justify-center rounded-sm border border-dashed px-4 py-3 text-center text-sm font-medium transition-colors',
                        dragging
                          ? 'border-primary-500 bg-primary-25 text-primary-800'
                          : 'border-primary-300 bg-surface-tab-bar text-text-tertiary hover:border-primary-500',
                      ].join(' ')}
                    >
                      {t('console.subscriptionActions.recordPayment.proofDrop')}
                    </span>
                  )}
                </FileDropzone>
              )}
            </Field>

            {alreadyActive ? null : (
              <Checkbox
                label={t('console.subscriptionActions.recordPayment.activate')}
                checked={activate}
                onChange={(event) => setActivate(event.target.checked)}
                className="!text-sm"
              />
            )}
          </>
        )}
      </form>
    </Modal>
  )
}
