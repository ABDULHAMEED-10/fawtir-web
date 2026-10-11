import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { formatAmount, formatDate, formatInstantDay } from '../../lib/format'
import { Button, FileDropzone, OmAmount } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { ApiError, NetworkError } from '../../api'
import {
  BILLING_PATH,
  SUPERSEDED_PREFIX,
  hostedCheckout,
  isTrustedCheckoutUrl,
  loadBillHistory,
  loadBillingOverview,
  loadCardCheckout,
  newPaymentKey,
  prepareNextBill,
  requestCash,
  startCardCheckout,
  submitBankTransfer,
  withdrawPayment,
  type BillWithPaymentsDto,
  type BillingOverviewDto,
  type CardCheckoutDto,
  type CardCheckoutStatus,
  type CardOptionDto,
  type SubscriptionBillDto,
  type SubscriptionPaymentDto,
} from '../../api/settings/billing'

const LIVE: SubscriptionPaymentDto['status'][] = ['SUBMITTED', 'RECEIPT_RECORDED', 'AWAITING_SECOND_APPROVAL']
const PROOF_ACCEPT = '.pdf,.png,.jpg,.jpeg'

type Method = 'BANK_TRANSFER' | 'CASH' | 'CARD'

const CARD_FINAL: CardCheckoutStatus[] = ['PAID', 'NOT_COMPLETED', 'UNDER_REVIEW', 'REVERSED']
// The provider's guidance (backend handoff §4): every 3 s for a minute, then every 15 s.
const CARD_POLL_FAST_MS = 3_000
const CARD_POLL_FAST_FOR_MS = 60_000
const CARD_POLL_SLOW_MS = 15_000

/**
 * What Paymob appends to the redirect back here. None of it is read: the redirect is not proof of
 * payment (anyone can type `success=true`), and it carries the hmac and a masked card number that
 * should not linger in the address bar, the history or a later Referer.
 */
const PAYMOB_RETURN_PARAMS = new Set([
  'id', 'pending', 'amount_cents', 'success', 'is_auth', 'is_capture', 'is_standalone_payment', 'is_voided',
  'is_refunded', 'is_3d_secure', 'integration_id', 'profile_id', 'has_parent_transaction', 'order', 'created_at',
  'currency', 'merchant_commission', 'discount_details', 'is_void', 'is_refund', 'error_occured',
  'refunded_amount_cents', 'captured_amount', 'updated_at', 'is_settled', 'bill_balanced', 'is_bill', 'owner',
  'merchant_order_id', 'acq_response_code', 'txn_response_code', 'hmac',
])

/**
 * Settings › Billing: the subscription charge and how to pay it, from `GET /v1/settings/billing`.
 *
 * Nothing here ever shows a bill as paid until the server says PAID: sending proof or asking for
 * cash collection leaves it "waiting for Fawtir to check", and coming back from the card provider's
 * page proves nothing until the server's own status says PAID. Card is offered only when the server
 * reports it switched on and this bill eligible; a method the server reports unavailable is not drawn
 * as a working choice. A retry of the same submission reuses its Idempotency-Key, so a slow network or
 * a double click never creates a second payment.
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
  // Card payments whose final status was already shown. A reload that still lists one as live (the
  // overview read raced the settlement) must not report it again and reload again, in a loop.
  const [reportedCards, setReportedCards] = useState<ReadonlySet<string>>(new Set())
  const changed = (why?: string) => {
    setNotice(why ?? null)
    read.retry()
  }
  const cardFinished = (paymentId: string, why: string) => {
    setReportedCards((seen) => new Set(seen).add(paymentId))
    changed(why)
  }
  useDropProviderReturnParams()

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
          card={outstanding.card ?? null}
          overview={overview}
          canPay={canPay}
          reportedCards={reportedCards}
          onChanged={changed}
          onCardFinished={cardFinished}
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
  card,
  overview,
  canPay,
  reportedCards,
  onChanged,
  onCardFinished,
}: {
  bill: SubscriptionBillDto
  payments: SubscriptionPaymentDto[]
  card: CardOptionDto | null
  overview: BillingOverviewDto
  canPay: boolean
  reportedCards: ReadonlySet<string>
  onChanged: (why?: string) => void
  onCardFinished: (paymentId: string, why: string) => void
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

      {live?.method === 'CARD' ? (
        <CardPaymentStatus
          paymentId={live.id}
          alreadyReported={reportedCards.has(live.id)}
          onFinished={(why) => onCardFinished(live.id, why)}
        />
      ) : live ? (
        <LivePayment payment={live} canPay={canPay} onChanged={onChanged} />
      ) : card?.reason === 'CARD_PAYMENT_UNDER_REVIEW' ? (
        // Card money for this bill is with Finance; the server refuses every method until it is
        // resolved, and offering them would invite the customer to pay twice.
        <p role="status" className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700">
          {t('billing.card.underReviewBill')}
        </p>
      ) : (
        <>
          {lastRejected ? (
            <Alert>{t('billing.rejected', { reason: lastRejected.rejectionReason ?? '' })}</Alert>
          ) : null}
          {canPay ? <PayForm bill={bill} card={card} overview={overview} onSubmitted={onChanged} /> : null}
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
  card,
  overview,
  onSubmitted,
}: {
  bill: SubscriptionBillDto
  card: CardOptionDto | null
  overview: BillingOverviewDto
  onSubmitted: (why?: string) => void
}) {
  const { t, i18n } = useTranslation()
  // Set when a checkout attempt was refused for a reason that will not change on retry.
  const [cardRefused, setCardRefused] = useState(false)
  const cardOn = overview.methods.card === true
  const cardOffered = cardOn && card?.available === true && !cardRefused
  const available: Method[] = [
    ...(overview.methods.bankTransfer && overview.beneficiary ? (['BANK_TRANSFER'] as Method[]) : []),
    ...(overview.methods.cash ? (['CASH'] as Method[]) : []),
    ...(cardOffered ? (['CARD'] as Method[]) : []),
  ]
  // Only the server's reasons the customer can act on; card switched off says nothing at all.
  const cardExcluded =
    cardOn && (card?.reason === 'PAYMOB_AMOUNT_NOT_REPRESENTABLE' || card?.reason === 'CARD_PAYMENT_PURPOSE_NOT_ELIGIBLE')
  const [method, setMethod] = useState<Method | null>(available.length === 1 ? available[0] : null)
  const [proof, setProof] = useState<File | null>(null)
  const [proofProblem, setProofProblem] = useState<string | null>(null)
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  // One key per attempt: a retry after a timeout must land on the same payment, not a second one.
  const key = useRef<string>(newPaymentKey())
  // Card has its own key, replaced only after the server's definite "not completed": an uncertain
  // answer keeps it, so asking again returns the checkout already opened instead of a second one.
  const cardKey = useRef<string>(newPaymentKey())
  const [cardState, setCardState] = useState<'idle' | 'redirecting' | 'uncertain'>('idle')
  // Set synchronously, before any re-render can disable the button: two clicks in the same tick
  // must still make one request.
  const cardInFlight = useRef(false)
  const [cardFailure, setCardFailure] = useState<ReactNode>(null)

  // Why bank transfer is missing, from the server's own reason. NOT_OFFERED (switched off for this
  // deployment) gets no explanation: there is nothing the customer is waiting for.
  const storageDown = overview.methods.bankTransferStatus === 'STORAGE_UNAVAILABLE'
  const noAccount = overview.methods.bankTransferStatus === 'NO_ACCOUNT'
  const bankMissing = storageDown ? 'billing.bankUnavailable' : noAccount ? 'billing.bankNoAccount' : null
  if (available.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {cardFailure ? <Alert>{cardFailure}</Alert> : null}
        {cardExcluded && !cardFailure ? (
          <p className="text-sm font-medium text-text-secondary">{t('billing.card.notForThisBill')}</p>
        ) : null}
        {noAccount ? <p className="text-sm font-medium text-text-secondary">{t('billing.bankNoAccount')}</p> : null}
        <p className="text-sm font-medium text-text-secondary">
          {t(storageDown ? 'billing.bankUnavailable' : 'billing.noMethod')}
        </p>
      </div>
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
  const payByCard = async () => {
    if (cardInFlight.current) return
    cardInFlight.current = true
    try {
      await openCardCheckout()
    } finally {
      cardInFlight.current = false
    }
  }

  const openCardCheckout = async () => {
    setBusy(true)
    setFailure(null)
    setCardFailure(null)
    try {
      const checkout = await startCardCheckout(bill.id, cardKey.current)
      if (checkout.status === 'READY') {
        if (!isTrustedCheckoutUrl(checkout.checkoutUrl)) {
          setCardFailure(t('billing.card.untrustedPage'))
          setBusy(false)
          return
        }
        setCardState('redirecting')
        hostedCheckout.open(checkout.checkoutUrl)
        return
      }
      if (checkout.status === 'NOT_COMPLETED') {
        cardKey.current = newPaymentKey()
        setCardState('idle')
        setCardFailure(t('billing.card.notStarted'))
        setBusy(false)
        return
      }
      // PROCESSING (or a final state already reached): the overview now lists the card payment,
      // and its own status takes over from there.
      onSubmitted()
    } catch (error) {
      if (isStale(error)) {
        onSubmitted(t('billing.refusal.bill-stale'))
        return
      }
      if (isUncertain(error)) {
        setCardState('uncertain')
        setBusy(false)
        return
      }
      setCardState('idle')
      setBusy(false)
      const refusal = cardRefusal(error)
      if (refusal.kind === 'underReview') {
        onSubmitted(t('billing.card.underReviewBill'))
        return
      }
      if (refusal.kind === 'notRepresentable') {
        setCardRefused(true)
        setMethod(null)
        setCardFailure(
          refusal.billTotal ? (
            <>
              {t('billing.card.notRepresentable')}{' '}
              <OmAmount amount={formatAmount(refusal.billTotal, 'OMR', i18n.language)} size="xs" />
            </>
          ) : (
            t('billing.card.notForThisBill')
          ),
        )
        return
      }
      if (refusal.kind === 'notEligible' || refusal.kind === 'switchedOff') {
        setCardRefused(true)
        setMethod(null)
        setCardFailure(t(refusal.kind === 'notEligible' ? 'billing.card.notForThisBill' : 'billing.card.switchedOff'))
        return
      }
      if (refusal.kind === 'contactMissing') {
        setCardFailure(
          <>
            {t('billing.card.contactMissing')}{' '}
            <Link to="/settings/company" className="font-semibold underline">
              {t('billing.card.contactMissingLink')}
            </Link>
          </>,
        )
        return
      }
      setFailure(refusalMessage(t, error))
    }
  }

  const ready =
    method === 'CASH' ||
    method === 'CARD' ||
    (method === 'BANK_TRANSFER' && proof !== null && reference.trim().length > 0)

  return (
    <div className="flex flex-col gap-4">
      {bankMissing ? (
        <p role="status" className="text-sm font-medium text-text-secondary">
          {t(bankMissing)}
        </p>
      ) : null}
      {cardExcluded && !cardFailure ? (
        <p role="status" className="text-sm font-medium text-text-secondary">
          {t('billing.card.notForThisBill')}
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
              disabled={busy || cardState !== 'idle'}
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
            {/* The issued bill's total as the server computed it, never a plan price recomputed here. */}
            <Fact
              label={t('billing.bank.amount')}
              value={<OmAmount amount={formatAmount(bill.total, 'OMR', i18n.language)} size="xs" />}
            />
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

      {method === 'CARD' ? (
        <div className="flex flex-col gap-3">
          <dl className="grid gap-x-6 gap-y-2 rounded-sm bg-surface-background px-4 py-3">
            {/* The issued bill's total as the server computed it; the card is charged exactly this. */}
            <Fact
              label={t('billing.card.amount')}
              value={<OmAmount amount={formatAmount(bill.total, 'OMR', i18n.language)} size="xs" />}
            />
          </dl>
          <p className="text-sm font-medium leading-[1.6] text-text-secondary">{t('billing.card.instructions')}</p>
        </div>
      ) : null}

      {method && method !== 'CARD' ? (
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

      {method === 'CARD' && cardState === 'uncertain' ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700">
            {t('billing.card.uncertain')}
          </p>
          <div>
            <Button size="md" disabled={busy} onClick={payByCard}>
              {t('billing.card.checkAgain')}
            </Button>
          </div>
        </div>
      ) : method === 'CARD' ? (
        <div>
          <Button size="md" disabled={busy || cardState === 'redirecting'} aria-busy={busy} onClick={payByCard}>
            {t('billing.card.submit')}
          </Button>
        </div>
      ) : method ? (
        <div>
          <Button size="md" disabled={!ready || busy} onClick={submit}>
            {t(method === 'CASH' ? 'billing.cash.submit' : 'billing.bank.submit')}
          </Button>
        </div>
      ) : null}
      {cardState === 'redirecting' ? (
        <p role="status" className="text-sm font-medium text-text-secondary">
          {t('billing.card.redirecting')}
        </p>
      ) : null}
      {cardFailure ? <Alert>{cardFailure}</Alert> : null}
      {failure ? <Alert>{failure}</Alert> : null}
    </div>
  )
}

/**
 * Where a card payment stands, from the server only. Polls while the page is open and stops at a
 * final state; the browser having come back from the provider's page decides nothing.
 */
function CardPaymentStatus({
  paymentId,
  alreadyReported,
  onFinished,
}: {
  paymentId: string
  alreadyReported: boolean
  onFinished: (why: string) => void
}) {
  const { t } = useTranslation()
  const [checkout, setCheckout] = useState<CardCheckoutDto | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const [nudge, setNudge] = useState(0)
  const finished = useRef(alreadyReported)
  const onFinishedRef = useRef(onFinished)
  useEffect(() => {
    onFinishedRef.current = onFinished
  })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let request: AbortController | null = null
    let parkedWhileHidden = false
    const startedAt = Date.now()
    const check = async () => {
      // A hidden tab is not polled: nobody is reading it, and the gateway's rate limit is shared
      // with everything else this company does. It resumes the moment the tab is shown again.
      if (document.visibilityState === 'hidden') {
        parkedWhileHidden = true
        return
      }
      let delay = Date.now() - startedAt < CARD_POLL_FAST_FOR_MS ? CARD_POLL_FAST_MS : CARD_POLL_SLOW_MS
      request = new AbortController()
      try {
        const current = await loadCardCheckout(paymentId, request.signal)
        if (cancelled) return
        setCheckout(current)
        setUnreachable(false)
        if (CARD_FINAL.includes(current.status)) {
          if (!finished.current) {
            finished.current = true
            onFinishedRef.current(t(`billing.card.status.${current.status}`))
          }
          return
        }
      } catch (error) {
        if (cancelled) return
        if (error instanceof ApiError && error.status === 429 && error.retryAfterSeconds) {
          delay = Math.max(delay, error.retryAfterSeconds * 1000)
        }
        setUnreachable(true)
      }
      timer = setTimeout(check, delay)
    }
    const resume = () => {
      if (cancelled || !parkedWhileHidden || document.visibilityState === 'hidden') return
      parkedWhileHidden = false
      void check()
    }
    document.addEventListener('visibilitychange', resume)
    void check()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      request?.abort()
      document.removeEventListener('visibilitychange', resume)
    }
  }, [paymentId, nudge, t])

  const status = checkout?.status ?? 'PROCESSING'
  const trustedUrl = status === 'READY' && isTrustedCheckoutUrl(checkout?.checkoutUrl) ? checkout?.checkoutUrl : null
  const final = CARD_FINAL.includes(status)
  return (
    <div className="flex flex-col gap-3">
      <p
        role="status"
        className={
          status === 'PAID'
            ? 'rounded-sm bg-success-100 px-4 py-3 text-sm font-medium leading-[1.6] text-success-700'
            : 'rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700'
        }
      >
        {t(`billing.card.status.${status}`)}
      </p>
      {status === 'READY' && trustedUrl ? (
        <div>
          <Button size="md" onClick={() => hostedCheckout.open(trustedUrl)}>
            {t('billing.card.continue')}
          </Button>
        </div>
      ) : null}
      {status === 'READY' && !trustedUrl ? <Alert>{t('billing.card.untrustedPage')}</Alert> : null}
      {unreachable ? <Alert>{t('billing.card.statusUnreachable')}</Alert> : null}
      {!final ? (
        <div>
          <Button variant="ghost" size="md" onClick={() => setNudge((n) => n + 1)}>
            {t('billing.card.checkAgain')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** Removes Paymob's redirect parameters from the address bar without reading any of them. */
function useDropProviderReturnParams() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const kept = new URLSearchParams()
    let dropped = false
    params.forEach((value, name) => {
      if (PAYMOB_RETURN_PARAMS.has(name) || name.startsWith('source_data.') || name.startsWith('data.')) {
        dropped = true
      } else {
        kept.append(name, value)
      }
    })
    if (!dropped) return
    const search = kept.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '', hash: location.hash }, { replace: true })
  }, [location.search, location.pathname, location.hash, navigate])
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

/**
 * The checkout may or may not have been opened: no answer, a server failure, or the provider not
 * reached. The customer is told to check before paying another way, and nothing retries by itself.
 */
function isUncertain(error: unknown): boolean {
  if (error instanceof NetworkError) return true
  return error instanceof ApiError && (error.status >= 500 || error.problemType === 'card-provider-unavailable')
}

type CardRefusal =
  | { kind: 'underReview' }
  | { kind: 'notRepresentable'; billTotal: string | null }
  | { kind: 'notEligible' }
  | { kind: 'switchedOff' }
  | { kind: 'contactMissing' }
  | { kind: 'other' }

function cardRefusal(error: unknown): CardRefusal {
  if (!(error instanceof ApiError)) return { kind: 'other' }
  if (error.code === 'CARD_PAYMENT_UNDER_REVIEW') return { kind: 'underReview' }
  if (error.problemType === 'paymob-amount-not-representable' || error.code === 'PAYMOB_AMOUNT_NOT_REPRESENTABLE') {
    const total = error.problem.billTotal
    return { kind: 'notRepresentable', billTotal: typeof total === 'string' && /^\d+(\.\d+)?$/.test(total) ? total : null }
  }
  if (error.problemType === 'card-payment-not-eligible' || error.code === 'CARD_PAYMENT_PURPOSE_NOT_ELIGIBLE') {
    return { kind: 'notEligible' }
  }
  if (error.problemType === 'payment-method-unavailable') return { kind: 'switchedOff' }
  // The only 400 this endpoint gives a well-formed request: the company has no contact to pay as.
  if (error.status === 400) return { kind: 'contactMissing' }
  return { kind: 'other' }
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
