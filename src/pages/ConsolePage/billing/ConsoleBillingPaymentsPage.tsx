import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { OmAmount } from '../../../components/ui'
import { ApiError } from '../../../api'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill, type ConsolePillTone } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_CARD,
  CONSOLE_DANGER,
  CONSOLE_PAGE,
  CONSOLE_PRIMARY,
  CONSOLE_SECONDARY,
  CONSOLE_SMALL,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { hasPermission, peekEntitlements } from '../../../lib/identity/entitlements'
import { formatAmount, formatDate, formatInstant } from '../../../lib/format'
import { saveDownload } from '../../../lib/supplierRecord'
import {
  BILLING_CASH_PERMISSION,
  BILLING_EVIDENCE_PERMISSION,
  BILLING_READ_PERMISSION,
  BILLING_VERIFY_PERMISSION,
  PAYMENTS_PATH,
  approvePaymentSecond,
  downloadProof,
  paymentPath,
  recordCashReceipt,
  rejectPayment,
  verifyPayment,
  type PaymentDetailDto,
  type PlatformPaymentDto,
  type QueueItemDto,
} from '../../../lib/console/billingPayments'

const STATUS_TONE: Record<PlatformPaymentDto['status'], ConsolePillTone> = {
  SUBMITTED: 'pending',
  RECEIPT_RECORDED: 'pending',
  AWAITING_SECOND_APPROVAL: 'info',
  CONFIRMED: 'success',
  REJECTED: 'danger',
  WITHDRAWN: 'neutral',
}

/**
 * Platform finance: manual subscription payments waiting for a decision (backend V271).
 *
 * Each action is offered only to an operator holding its permission, and only in the state that
 * allows it; the server still enforces both, plus MFA and the four-eyes rule (nobody verifies a
 * payment they submitted or recorded, and above the threshold a third person approves). After a
 * decision the page reads the payment again rather than guessing its new state.
 */
export function ConsoleBillingPaymentsPage() {
  return (
    <ConsoleShell requires={BILLING_READ_PERMISSION}>
      <PaymentQueue />
    </ConsoleShell>
  )
}

function PaymentQueue() {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<QueueItemDto[]>(PAYMENTS_PATH)
  const [selected, setSelected] = useState<string | null>(null)

  let body: ReactNode
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.billing.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (read.data.length === 0) {
    body = (
      <p className="rounded-sm bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t('console.billing.empty')}
      </p>
    )
  } else {
    body = (
      <div className={`${CONSOLE_CARD} overflow-x-auto`}>
        <table className="w-full min-w-[720px] text-start text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.6px] text-text-muted">
              <th className="px-4 py-3 text-start">{t('console.billing.col.company')}</th>
              <th className="px-4 py-3 text-start">{t('console.billing.col.bill')}</th>
              <th className="px-4 py-3 text-start">{t('console.billing.col.method')}</th>
              <th className="px-4 py-3 text-end">{t('console.billing.col.amount')}</th>
              <th className="px-4 py-3 text-start">{t('console.billing.col.status')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {read.data.map(({ payment, bill, tenantName }) => (
              <tr key={payment.id}>
                <td className="px-4 py-3 font-medium text-text-primary">{tenantName ?? payment.tenantId}</td>
                <td className="px-4 py-3 text-text-secondary">
                  {bill.number}
                  <span className="block text-xs text-text-tertiary">
                    {formatInstant(payment.submittedAt, i18n.language)}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">{t(`billing.method.${payment.method}.title`)}</td>
                <td className="px-4 py-3 text-end">
                  <OmAmount amount={formatAmount(payment.amount, 'OMR', i18n.language)} size="xs" />
                </td>
                <td className="px-4 py-3">
                  <ConsoleStatusPill tone={STATUS_TONE[payment.status]} label={t(`console.billing.status.${payment.status}`)} />
                </td>
                <td className="px-4 py-3 text-end">
                  <button type="button" className={CONSOLE_SMALL} onClick={() => setSelected(payment.id)}>
                    {t('console.billing.open')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.payments' }]} />
      <ConsolePageHeader title={t('console.billing.title')} subtitle={t('console.billing.subtitle')} />
      {body}
      {selected ? (
        <PaymentPanel
          key={selected}
          paymentId={selected}
          onDecided={retry}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </div>
  )
}

function PaymentPanel({
  paymentId,
  onDecided,
  onClose,
}: {
  paymentId: string
  onDecided: () => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<PaymentDetailDto>(paymentPath(paymentId))
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const entitlements = peekEntitlements()
  const can = (code: string) => (entitlements ? hasPermission(entitlements, code) : false)

  if (read.status === 'loading') return <ConsoleNotice busy body={t('console.billing.loading')} />
  if (read.status === 'failed') return <ConsoleReadFailure error={read.error} retry={retry} />
  const { payment, bill, tenantName, history } = read.data

  const act = async (work: () => Promise<unknown>, doneKey: string) => {
    setBusy(true)
    setFailure(null)
    setDone(null)
    try {
      await work()
      setDone(t(doneKey))
      onDecided()
      retry()
    } catch (error) {
      setFailure(decisionMessage(t, error))
    } finally {
      setBusy(false)
    }
  }

  const readyForVerification =
    payment.method === 'BANK_TRANSFER' ? payment.status === 'SUBMITTED' : payment.status === 'RECEIPT_RECORDED'
  const live = ['SUBMITTED', 'RECEIPT_RECORDED', 'AWAITING_SECOND_APPROVAL'].includes(payment.status)
  const money = (value: string) => <OmAmount amount={formatAmount(value, 'OMR', i18n.language)} size="xs" />

  return (
    <section aria-labelledby="payment-panel" className={`${CONSOLE_CARD} flex flex-col gap-4 p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="payment-panel" className="text-lg font-semibold text-text-primary">
          {tenantName ?? payment.tenantId} · {bill.number}
        </h2>
        <div className="flex items-center gap-3">
          <ConsoleStatusPill tone={STATUS_TONE[payment.status]} label={t(`console.billing.status.${payment.status}`)} />
          <button type="button" className={CONSOLE_SMALL} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>

      <dl className="grid gap-x-6 gap-y-3 md:grid-cols-3">
        <Fact label={t('console.billing.col.method')} value={t(`billing.method.${payment.method}.title`)} />
        <Fact label={t('billing.bill.total')} value={money(bill.total)} />
        <Fact
          label={t('billing.bill.period')}
          value={t('billing.bill.periodRange', {
            start: formatDate(bill.periodStartsOn, i18n.language),
            end: formatDate(bill.periodEndsOn, i18n.language),
          })}
        />
        {payment.reference ? <Fact label={t('billing.bank.reference')} value={payment.reference} /> : null}
        {payment.customerNote ? <Fact label={t('billing.note')} value={payment.customerNote} /> : null}
        {payment.receiptNumber ? (
          <Fact
            label={t('console.billing.receipt')}
            value={`${payment.receiptNumber} · ${payment.collectorName ?? ''}`}
            note={payment.receivedAt ? formatInstant(payment.receivedAt, i18n.language) : undefined}
          />
        ) : null}
        {payment.requiresSecondApproval !== null ? (
          <Fact
            label={t('console.billing.threshold')}
            value={payment.thresholdApplied ? money(payment.thresholdApplied) : t('subscription.none')}
            note={t(payment.requiresSecondApproval ? 'console.billing.secondNeeded' : 'console.billing.secondNotNeeded')}
          />
        ) : null}
        {payment.rejectionReason ? <Fact label={t('console.billing.rejection')} value={payment.rejectionReason} /> : null}
      </dl>

      <div className="flex flex-wrap gap-3">
        {payment.method === 'BANK_TRANSFER' && can(BILLING_EVIDENCE_PERMISSION) ? (
          <button
            type="button"
            className={CONSOLE_SECONDARY}
            disabled={busy}
            onClick={() =>
              act(async () => saveDownload(await downloadProof(payment.id), `payment-proof-${payment.id}`), 'console.billing.done.proof')
            }
          >
            {t('console.billing.proof')}
          </button>
        ) : null}
        {readyForVerification && can(BILLING_VERIFY_PERMISSION) ? (
          <button
            type="button"
            className={CONSOLE_PRIMARY}
            disabled={busy}
            onClick={() => act(() => verifyPayment(payment.id, payment.version), 'console.billing.done.verified')}
          >
            {t('console.billing.verify')}
          </button>
        ) : null}
        {payment.status === 'AWAITING_SECOND_APPROVAL' && can(BILLING_VERIFY_PERMISSION) ? (
          <button
            type="button"
            className={CONSOLE_PRIMARY}
            disabled={busy}
            onClick={() => act(() => approvePaymentSecond(payment.id, payment.version), 'console.billing.done.approved')}
          >
            {t('console.billing.approveSecond')}
          </button>
        ) : null}
      </div>

      {payment.method === 'CASH' && payment.status === 'SUBMITTED' && can(BILLING_CASH_PERMISSION) ? (
        <CashReceiptForm
          total={bill.total}
          busy={busy}
          onRecord={(receipt) =>
            act(() => recordCashReceipt(payment.id, payment.version, receipt), 'console.billing.done.recorded')
          }
        />
      ) : null}

      {live && can(BILLING_VERIFY_PERMISSION) ? (
        <RejectForm busy={busy} onReject={(reason) => act(() => rejectPayment(payment.id, payment.version, reason), 'console.billing.done.rejected')} />
      ) : null}

      {done ? (
        <p role="status" className="rounded-sm bg-success-100 px-4 py-3 text-sm font-medium text-success-700">
          {done}
        </p>
      ) : null}
      {failure ? (
        <p role="alert" className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700">
          {failure}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-text-primary">{t('console.billing.history')}</h3>
        <ol className="flex flex-col gap-1 text-sm text-text-secondary">
          {history.map((event) => (
            <li key={event.id}>
              <span dir="ltr">{formatInstant(event.occurredAt, i18n.language)}</span> ·{' '}
              {t(`console.billing.event.${event.kind}`)}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function CashReceiptForm({
  total,
  busy,
  onRecord,
}: {
  total: string
  busy: boolean
  onRecord: (receipt: { receiptNumber: string; receivedAmount: string; receivedAt: string; collectorName: string }) => void
}) {
  const { t } = useTranslation()
  const [receiptNumber, setReceiptNumber] = useState('')
  const [receivedAmount, setReceivedAmount] = useState(total)
  const [receivedAt, setReceivedAt] = useState('')
  const [collectorName, setCollectorName] = useState('')
  const ready = receiptNumber.trim() && receivedAmount.trim() && receivedAt && collectorName.trim()
  return (
    <fieldset className="flex flex-col gap-3 rounded-sm border border-border-subtle p-4">
      <legend className="px-1 text-sm font-semibold text-text-primary">{t('console.billing.cash.title')}</legend>
      <div className="grid gap-3 md:grid-cols-2">
        <Field label={t('console.billing.cash.number')} value={receiptNumber} onChange={setReceiptNumber} />
        <Field label={t('console.billing.cash.amount')} value={receivedAmount} onChange={setReceivedAmount} ltr />
        <label className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
          {t('console.billing.cash.at')}
          <input
            type="datetime-local"
            className="h-10 rounded-sm border border-border-default bg-white px-3"
            value={receivedAt}
            onChange={(event) => setReceivedAt(event.target.value)}
          />
        </label>
        <Field label={t('console.billing.cash.collector')} value={collectorName} onChange={setCollectorName} />
      </div>
      <p className="text-xs font-medium text-text-tertiary">{t('console.billing.cash.note')}</p>
      <div>
        <button
          type="button"
          className={CONSOLE_PRIMARY}
          disabled={!ready || busy}
          onClick={() =>
            onRecord({
              receiptNumber: receiptNumber.trim(),
              receivedAmount: receivedAmount.trim(),
              receivedAt: new Date(receivedAt).toISOString(),
              collectorName: collectorName.trim(),
            })
          }
        >
          {t('console.billing.cash.record')}
        </button>
      </div>
    </fieldset>
  )
}

function RejectForm({ busy, onReject }: { busy: boolean; onReject: (reason: string) => void }) {
  const { t } = useTranslation()
  const [reason, setReason] = useState('')
  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
        {t('console.billing.rejectReason')}
        <textarea
          className="min-h-16 rounded-sm border border-border-default bg-white px-3 py-2"
          value={reason}
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div>
        <button type="button" className={CONSOLE_DANGER} disabled={!reason.trim() || busy} onClick={() => onReject(reason.trim())}>
          {t('console.billing.reject')}
        </button>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  ltr = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  ltr?: boolean
}) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
      {label}
      <input
        className="h-10 rounded-sm border border-border-default bg-white px-3"
        dir={ltr ? 'ltr' : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function Fact({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-[0.6px] text-text-muted">{label}</dt>
      <dd className="text-sm font-semibold text-text-primary">{value}</dd>
      {note ? <dd className="text-xs font-medium text-text-tertiary">{note}</dd> : null}
    </div>
  )
}

const DECISION_REFUSALS = [
  'payment-approver-not-independent',
  'payment-version-conflict',
  'payment-state-conflict',
  'cash-amount-mismatch',
  'production-platform-realm-required',
  'impersonation-not-allowed',
]

function decisionMessage(t: (key: string) => string, error: unknown): string {
  if (error instanceof ApiError && error.problemType && DECISION_REFUSALS.includes(error.problemType)) {
    return t(`console.billing.refusal.${error.problemType}`)
  }
  if (error instanceof ApiError && error.status === 403) return t('console.billing.refusal.forbidden')
  return t('console.billing.refusal.other')
}
