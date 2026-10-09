import { useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { formatAmount, formatDate, formatInstantDay } from '../../lib/format'
import { Button, FileDropzone, OmAmount } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { ApiError } from '../../api'
import {
  BILLING_PATH,
  SUPERSEDED_PREFIX,
  loadBillHistory,
  loadBillingOverview,
  newPaymentKey,
  prepareNextBill,
  requestCash,
  submitBankTransfer,
  withdrawPayment,
  type BillWithPaymentsDto,
  type BillingOverviewDto,
  type SubscriptionBillDto,
  type SubscriptionPaymentDto,
} from '../../api/settings/billing'

const LIVE: SubscriptionPaymentDto['status'][] = ['SUBMITTED', 'RECEIPT_RECORDED', 'AWAITING_SECOND_APPROVAL']
const PROOF_ACCEPT = '.pdf,.png,.jpg,.jpeg'

type Method = 'BANK_TRANSFER' | 'CASH'

/**
 * Settings › Billing: the subscription charge and how to pay it, from `GET /v1/settings/billing`.
 *
 * Nothing here ever shows a bill as paid until the server says PAID: sending proof or asking for
 * cash collection leaves it "waiting for Fawtir to check". Card payment is not offered at all yet
 * (the gateway is a later phase), and a method the server reports unavailable is not drawn as a
 * working choice. A retry of the same submission reuses its Idempotency-Key, so a slow network or a
 * double click never creates a second payment.
 *
 * A bill the server superseded after a plan change is refused as `bill-stale`; the screen then
 * reloads and says why, rather than leaving the customer on a bill that can no longer be paid.
 */
export function SubscriptionBillingSection() {
  const { t } = useTranslation()
  const read = useApiRead<BillingOverviewDto>(BILLING_PATH, loadBillingOverview)
  const { entitlements } = useEntitlements()
  const canPay = entitlements !== null && hasPermission(entitlements, 'tenant.plan.manage')
  const [notice, setNotice] = useState<string | null>(null)
  const changed = (why?: string) => {
    setNotice(why ?? null)
    read.retry()
  }

  if (read.read.status === 'loading') return <LoadingNotice />
  if (read.read.status === 'failed') return <ApiReadFailure error={read.read.error} retry={read.retry} />
  const overview = read.read.data
  const outstanding = overview.bills.find(
    (entry) => entry.bill.status === 'OPEN' || entry.bill.status === 'PENDING_VERIFICATION',
  )

  return (
    <section aria-labelledby="subscription-charges" className="flex flex-col gap-4 rounded-md bg-surface-card p-5">
      <h3 id="subscription-charges" className="text-lg font-semibold text-text-primary">
        {t('billing.title')}
      </h3>
      {notice ? (
        <p role="status" className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium text-pending-700">
          {notice}
        </p>
      ) : null}
      {outstanding ? (
        <OutstandingBill
          key={outstanding.bill.id + outstanding.bill.status}
          bill={outstanding.bill}
          payments={outstanding.payments}
          overview={overview}
          canPay={canPay}
          onChanged={changed}
        />
      ) : (
        <NoOutstandingBill canPay={canPay} onPrepared={() => changed()} />
      )}
      <History key={overview.nextBillsCursor ?? 'all'} bills={overview.bills} nextCursor={overview.nextBillsCursor} />
    </section>
  )
}

function NoOutstandingBill({ canPay, onPrepared }: { canPay: boolean; onPrepared: () => void }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const prepare = async () => {
    setBusy(true)
    setFailure(null)
    try {
      await prepareNextBill()
      onPrepared()
    } catch (error) {
      setFailure(refusalMessage(t, error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium text-text-secondary">{t('billing.nothingDue')}</p>
      {canPay ? (
        <div>
          <Button variant="secondary" size="md" disabled={busy} onClick={prepare}>
            {t('billing.prepare')}
          </Button>
        </div>
      ) : null}
      {failure ? <Alert>{failure}</Alert> : null}
    </div>
  )
}

function OutstandingBill({
  bill,
  payments,
  overview,
  canPay,
  onChanged,
}: {
  bill: SubscriptionBillDto
  payments: SubscriptionPaymentDto[]
  overview: BillingOverviewDto
  canPay: boolean
  onChanged: (why?: string) => void
}) {
  const { t, i18n } = useTranslation()
  const live = payments.find((payment) => LIVE.includes(payment.status))
  const lastRejected = payments.find((payment) => payment.status === 'REJECTED')
  const money = (value: string) => <OmAmount amount={formatAmount(value, 'OMR', i18n.language)} size="xs" />

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
        <Fact label={t('billing.bill.number')} value={bill.number} />
        <Fact
          label={t('billing.bill.period')}
          value={t('billing.bill.periodRange', {
            start: formatDate(bill.periodStartsOn, i18n.language),
            end: formatDate(bill.periodEndsOn, i18n.language),
          })}
          note={`${bill.planName} · ${t(`subscription.cycle.${bill.billingCycle}`)}`}
        />
        <Fact label={t('billing.bill.dueOn')} value={formatDate(bill.dueOn, i18n.language)} />
        <Fact label={t('billing.bill.status')} value={t(`billing.billStatus.${bill.status}`)} />
      </dl>
      <dl className="flex flex-col gap-2 rounded-sm bg-surface-background px-4 py-3 text-sm">
        <Line label={t('billing.bill.subtotal')} value={money(bill.subtotal)} />
        <Line
          label={t('billing.bill.vat', { rate: formatRate(bill.vatRate, i18n.language) })}
          value={money(bill.vatAmount)}
        />
        <Line label={t('billing.bill.total')} value={money(bill.total)} strong />
      </dl>
      <p className="text-xs font-medium text-text-tertiary">{t('billing.bill.notTaxInvoice')}</p>

      {live ? (
        <LivePayment payment={live} canPay={canPay} onChanged={onChanged} />
      ) : (
        <>
          {lastRejected ? (
            <Alert>{t('billing.rejected', { reason: lastRejected.rejectionReason ?? '' })}</Alert>
          ) : null}
          {canPay ? <PayForm bill={bill} overview={overview} onSubmitted={onChanged} /> : null}
        </>
      )}
    </div>
  )
}

function LivePayment({
  payment,
  canPay,
  onChanged,
}: {
  payment: SubscriptionPaymentDto
  canPay: boolean
  onChanged: (why?: string) => void
}) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const withdraw = async () => {
    setBusy(true)
    setFailure(null)
    try {
      await withdrawPayment(payment.id)
      onChanged()
    } catch (error) {
      setFailure(refusalMessage(t, error))
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <p role="status" className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700">
        {t(`billing.waiting.${payment.method}.${payment.status}`)}
      </p>
      {canPay && payment.status === 'SUBMITTED' ? (
        <div>
          <Button variant="ghost" size="md" disabled={busy} onClick={withdraw}>
            {t('billing.withdraw')}
          </Button>
        </div>
      ) : null}
      {failure ? <Alert>{failure}</Alert> : null}
    </div>
  )
}

function PayForm({
  bill,
  overview,
  onSubmitted,
}: {
  bill: SubscriptionBillDto
  overview: BillingOverviewDto
  onSubmitted: (why?: string) => void
}) {
  const { t } = useTranslation()
  const available: Method[] = [
    ...(overview.methods.bankTransfer && overview.beneficiary ? (['BANK_TRANSFER'] as Method[]) : []),
    ...(overview.methods.cash ? (['CASH'] as Method[]) : []),
  ]
  const [method, setMethod] = useState<Method | null>(available.length === 1 ? available[0] : null)
  const [proof, setProof] = useState<File | null>(null)
  const [proofProblem, setProofProblem] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // One key per attempt: a retry after a timeout must land on the same payment, not a second one.
  const key = useRef<string>(newPaymentKey())

  const storageDown = overview.methods.bankTransferStatus === 'STORAGE_UNAVAILABLE'
  if (available.length === 0) {
    return (
      <p className="text-sm font-medium text-text-secondary">
        {t(storageDown ? 'billing.bankUnavailable' : 'billing.noMethod')}
      </p>
    )
  }

  const submit = async () => {
    setBusy(true)
    setFailure(null)
    try {
      if (method === 'BANK_TRANSFER' && proof) {
        await submitBankTransfer(bill.id, proof, reference.trim(), note, key.current)
      } else if (method === 'CASH') {
        await requestCash(bill.id, note, key.current)
      }
      onSubmitted()
    } catch (error) {
      if (isStale(error)) {
        onSubmitted(t('billing.refusal.bill-stale'))
        return
      }
      setFailure(refusalMessage(t, error))
      setBusy(false)
    }
  }
  const ready =
    method === 'CASH' || (method === 'BANK_TRANSFER' && proof !== null && reference.trim().length > 0)

  return (
    <div className="flex flex-col gap-4">
      {storageDown ? (
        <p role="status" className="text-sm font-medium text-text-secondary">
          {t('billing.bankUnavailable')}
        </p>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-text-primary">{t('billing.howToPay')}</legend>
        {available.map((option) => (
          <label key={option} className="flex items-start gap-3 rounded-sm border border-border-subtle bg-white p-3">
            <input
              type="radio"
              name="subscription-payment-method"
              className="mt-1"
              checked={method === option}
              onChange={() => setMethod(option)}
            />
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-text-primary">{t(`billing.method.${option}.title`)}</span>
              <span className="text-xs font-medium text-text-tertiary">{t(`billing.method.${option}.body`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {method === 'BANK_TRANSFER' && overview.beneficiary ? (
        <div className="flex flex-col gap-3">
          <dl className="grid gap-x-6 gap-y-2 rounded-sm bg-surface-background px-4 py-3 md:grid-cols-2">
            <Fact label={t('billing.bank.holder')} value={overview.beneficiary.legalName} />
            <Fact label={t('billing.bank.bank')} value={overview.beneficiary.bankName} />
            <Fact label={t('billing.bank.iban')} value={<span dir="ltr">{overview.beneficiary.iban}</span>} />
            {overview.beneficiary.swiftCode ? (
              <Fact label={t('billing.bank.swift')} value={<span dir="ltr">{overview.beneficiary.swiftCode}</span>} />
            ) : null}
          </dl>
          <span id="proof-label" className="text-sm font-semibold text-text-primary">
            {t('billing.bank.proof')}
          </span>
          <FileDropzone
            accept={PROOF_ACCEPT}
            maxBytes={overview.proofMaximumBytes}
            labelledBy="proof-label"
            describedBy="proof-limits"
            onFiles={(files) => {
              setProof(files[0] ?? null)
              setProofProblem(null)
            }}
            onReject={(reason) => setProofProblem(t(`billing.bank.proofRejected.${reason}`))}
          >
            {() => (
              <span className="flex min-h-16 items-center justify-center rounded-sm border border-dashed border-border-default bg-white px-4 py-3 text-sm font-medium text-text-secondary">
                {proof ? proof.name : t('billing.bank.proofPick')}
              </span>
            )}
          </FileDropzone>
          <p id="proof-limits" className="text-xs font-medium text-text-tertiary">
            {proofProblem ??
              t('billing.bank.proofLimits', { size: Math.floor(overview.proofMaximumBytes / 1000).toString() })}
          </p>
          <label className="flex flex-col gap-1 text-sm font-semibold text-text-primary">
            {t('billing.bank.reference')}
            <input
              className="h-11 rounded-sm border border-border-default bg-white px-3 text-sm font-medium"
              value={reference}
              maxLength={120}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
        </div>
      ) : null}

      {method === 'CASH' ? (
        <p className="text-sm font-medium leading-[1.6] text-text-secondary">{t('billing.cash.instructions')}</p>
      ) : null}

      {method ? (
        <label className="flex flex-col gap-1 text-sm font-semibold text-text-primary">
          {t('billing.note')}
          <textarea
            className="min-h-20 rounded-sm border border-border-default bg-white px-3 py-2 text-sm font-medium"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
      ) : null}

      {method ? (
        <div>
          <Button size="md" disabled={!ready || busy} onClick={submit}>
            {t(method === 'CASH' ? 'billing.cash.submit' : 'billing.bank.submit')}
          </Button>
        </div>
      ) : null}
      {failure ? <Alert>{failure}</Alert> : null}
    </div>
  )
}

function History({ bills, nextCursor }: { bills: BillWithPaymentsDto[]; nextCursor: string | null }) {
  const { t, i18n } = useTranslation()
  const [older, setOlder] = useState<BillWithPaymentsDto[]>([])
  const [cursor, setCursor] = useState(nextCursor)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const loadOlder = async () => {
    if (!cursor) return
    setLoading(true)
    setFailed(false)
    try {
      const page = await loadBillHistory(cursor)
      setOlder((shown) => [...shown, ...page.bills])
      setCursor(page.nextCursor)
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }
  const settled = [...bills, ...older].filter(
    (entry) => entry.bill.status === 'PAID' || entry.bill.status === 'VOID',
  )
  if (settled.length === 0 && !cursor) return null
  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-base font-semibold text-text-primary">{t('billing.history')}</h4>
      <ul className="flex flex-col divide-y divide-border-subtle">
        {settled.map(({ bill, payments }) => {
          const confirmed = payments.find((payment) => payment.status === 'CONFIRMED')
          return (
            <li key={bill.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="font-medium text-text-primary">
                {bill.number} ·{' '}
                {t('billing.bill.periodRange', {
                  start: formatDate(bill.periodStartsOn, i18n.language),
                  end: formatDate(bill.periodEndsOn, i18n.language),
                })}
              </span>
              <span className="flex items-center gap-3 text-text-secondary">
                <OmAmount amount={formatAmount(bill.total, 'OMR', i18n.language)} size="xs" />
                <span>
                  {bill.status === 'PAID' && bill.paidAt
                    ? t('billing.paidOn', {
                        date: formatInstantDay(bill.paidAt, i18n.language),
                        method: confirmed ? t(`billing.method.${confirmed.method}.title`) : '',
                      })
                    : bill.status === 'VOID' && bill.voidReason?.startsWith(SUPERSEDED_PREFIX)
                      ? t('billing.superseded')
                      : t(`billing.billStatus.${bill.status}`)}
                </span>
              </span>
            </li>
          )
        })}
      </ul>
      {cursor ? (
        <div>
          <Button variant="ghost" size="md" disabled={loading} onClick={loadOlder}>
            {t('billing.olderBills')}
          </Button>
        </div>
      ) : null}
      {failed ? <Alert>{t('billing.refusal.other')}</Alert> : null}
    </div>
  )
}

function Fact({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm font-medium text-text-quaternary">{label}</dt>
      <dd className="text-base font-semibold text-text-primary">{value}</dd>
      {note ? <dd className="text-xs font-medium text-text-tertiary">{note}</dd> : null}
    </div>
  )
}

function Line({ label, value, strong = false }: { label: string; value: ReactNode; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? 'font-semibold text-text-primary' : 'font-medium text-text-secondary'}>{label}</dt>
      <dd className={strong ? 'font-semibold text-text-primary' : 'font-medium text-text-primary'}>{value}</dd>
    </div>
  )
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700">
      {children}
    </p>
  )
}

/** "0.05000" as "5%", with Latin digits in Arabic too. */
function formatRate(rate: string, language: string): string {
  const percent = Number(rate) * 100
  return `${new Intl.NumberFormat(language.startsWith('ar') ? 'ar-u-nu-latn' : 'en-US', {
    maximumFractionDigits: 3,
  }).format(percent)}%`
}

function isStale(error: unknown): boolean {
  return error instanceof ApiError && error.problemType === 'bill-stale'
}

const KNOWN_REFUSALS = [
  'bill-stale',
  'bill-not-payable',
  'payment-method-unavailable',
  'payment-state-conflict',
  'billing-not-configured',
  'subscription-not-tracked',
  'idempotency-key-reused',
]

function refusalMessage(t: (key: string) => string, error: unknown): string {
  if (error instanceof ApiError && error.problemType && KNOWN_REFUSALS.includes(error.problemType)) {
    return t(`billing.refusal.${error.problemType}`)
  }
  return t('billing.refusal.other')
}
