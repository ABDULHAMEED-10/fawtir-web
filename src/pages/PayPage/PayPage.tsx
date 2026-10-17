import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AuthLayout } from '../../components/auth/AuthLayout'
import { Button, OmAmount, SelectionCard } from '../../components/ui'
import { LoadingNotice, Notice } from '../../components/feedback/ApiNotice'
import {
  hostedCheckout,
  isTrustedCheckoutUrl,
  type CardCheckoutDto,
} from '../../api/settings/billing'
import { formatDate } from '../../lib/format'
import {
  PAY_ROUTE,
  cardIdempotencyKey,
  dropReturnQuery,
  forgetCardAttempt,
  keptCardPayment,
  keptPayLinkToken,
  loadPayLink,
  loadPayLinkCard,
  payLinkProblemOf,
  rememberCardPayment,
  requestPayLinkCash,
  startPayLinkCard,
  submitPayLinkBankTransfer,
  takePayLinkToken,
  type PayLinkProblem,
  type PayLinkView,
} from '../../lib/payLink'
import { BankTransferDetails, Note, type BankEvidence } from '../PaymentPage/PaymentForm'
import { PaymentHero } from '../PaymentPage/PaymentHero'
import cardIcon from '../../assets/payment/card.svg'
import bankIcon from '../../assets/payment/bank.svg'
import tickIcon from '../../assets/payment/tick-circle.svg'
import rialIcon from '../../assets/brand/omr.svg'

const K = 'payLink.'

type Method = 'card' | 'bankTransfer' | 'cash'
const ICON: Record<Method, string> = { card: cardIcon, bankTransfer: bankIcon, cash: rialIcon }

type Read =
  | { status: 'loading' }
  | { status: 'ready'; view: PayLinkView }
  | { status: 'failed'; problem: PayLinkProblem }

/**
 * The public pay page for one bill (P2-8 §3.11): no sign-in, outside the app shell, in the sign-up
 * Payment step's look and with its card, bank and cash panels. Every figure is the server's.
 * Security: see `lib/payLink.ts` (fragment token, `credentials: 'omit'`, untrusted card return).
 */
export function PayPage() {
  const { t } = useTranslation()
  // Taken once, before the first paint reads it: the fragment leaves the address bar at once.
  const [token] = useState(() => takePayLinkToken())
  const [read, setRead] = useState<Read>(() =>
    token ? { status: 'loading' } : { status: 'failed', problem: 'invalid' },
  )
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    if (!token) return
    const controller = new AbortController()
    setRead({ status: 'loading' })
    loadPayLink(token, controller.signal).then(
      (view) => setRead({ status: 'ready', view }),
      (error: unknown) => {
        if (!controller.signal.aborted)
          setRead({ status: 'failed', problem: payLinkProblemOf(error) })
      },
    )
    return () => controller.abort()
  }, [token, attempt])

  return (
    <PayFrame>
      {read.status === 'loading' ? (
        <LoadingNotice label={t(`${K}loading`)} />
      ) : read.status === 'failed' ? (
        <PageProblem problem={read.problem} retry={reload} />
      ) : (
        <Bill view={read.view} token={token!} onChanged={reload} />
      )}
    </PayFrame>
  )
}

/**
 * Where the card provider sends the payer back. The query it appends is dropped unread; the
 * result is the server's status for the payment this tab opened, read a few times while it is
 * still being confirmed.
 */
export function PayDonePage() {
  const { t } = useTranslation()
  const [token] = useState(() => {
    dropReturnQuery()
    return keptPayLinkToken()
  })
  const [paymentId] = useState(() => keptCardPayment())
  const [card, setCard] = useState<CardCheckoutDto | null>(null)
  const [problem, setProblem] = useState<PayLinkProblem | null>(null)
  const [polls, setPolls] = useState(0)

  useEffect(() => {
    if (!token || !paymentId) return
    const controller = new AbortController()
    loadPayLinkCard(token, paymentId, controller.signal).then(
      (answer) => {
        setCard(answer)
        setProblem(null)
        if (answer.status === 'PAID' || answer.status === 'NOT_COMPLETED') forgetCardAttempt()
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setProblem(payLinkProblemOf(error))
      },
    )
    return () => controller.abort()
  }, [token, paymentId, polls])

  // Still being confirmed: ask again every few seconds, for about a minute.
  const waiting = !card || card.status === 'PROCESSING' || card.status === 'READY'
  useEffect(() => {
    if (!token || !paymentId || problem || !waiting || polls >= 20) return
    const timer = window.setTimeout(() => setPolls((n) => n + 1), 3000)
    return () => window.clearTimeout(timer)
  }, [token, paymentId, problem, waiting, polls])

  let body: ReactNode
  if (!token || !paymentId) {
    // A new tab or another browser: nothing here says what was paid, so nothing invites paying again.
    body = <Notice body={t(`${K}done.noLink`)} />
  } else if (problem) {
    body = <PageProblem problem={problem} retry={() => setPolls((n) => n + 1)} />
  } else if (!card) {
    body = <LoadingNotice label={t(`${K}done.checking`)} />
  } else {
    const key =
      card.status === 'PAID'
        ? 'paid'
        : card.status === 'NOT_COMPLETED'
          ? 'notCompleted'
          : card.status === 'UNDER_REVIEW'
            ? 'underReview'
            : card.status === 'REVERSED'
              ? 'reversed'
              : 'processing'
    body = (
      <div className="flex flex-col gap-4">
        <Note icon={tickIcon} text={t(`${K}done.${key}`, { amount: card.amount })} />
        {key === 'processing' && polls >= 20 ? (
          <p className="text-sm font-medium text-text-quaternary">
            {t(`${K}done.stillProcessing`)}
          </p>
        ) : null}
        <Link to={PAY_ROUTE} className="text-sm font-semibold text-primary-700 underline">
          {t(`${K}done.back`)}
        </Link>
      </div>
    )
  }

  return (
    <PayFrame>
      <div className="flex w-full max-w-[700px] flex-col gap-6">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t(`${K}done.title`)}
        </h2>
        {body}
      </div>
    </PayFrame>
  )
}

function PayFrame({ children }: { children: ReactNode }) {
  return <AuthLayout hero={<PaymentHero />}>{children}</AuthLayout>
}

/** One fixed sentence per problem, with a retry only where trying again can help. */
function PageProblem({ problem, retry }: { problem: PayLinkProblem; retry: () => void }) {
  const { t } = useTranslation()
  const canRetry = problem === 'network' || problem === 'other' || problem === 'tooMany'
  return (
    <div className="w-full max-w-[700px]">
      <Notice
        body={t(`${K}problem.${problem}`)}
        action={canRetry ? { label: t(`${K}retry`), onClick: retry } : undefined}
      />
    </div>
  )
}

function Bill({
  view,
  token,
  onChanged,
}: {
  view: PayLinkView
  token: string
  onChanged: () => void
}) {
  const { t, i18n } = useTranslation()
  const day = (iso: string | null | undefined) =>
    iso ? formatDate(iso.slice(0, 10), i18n.language) : ''
  const offered: Method[] = [
    ...(view.methods.card ? (['card'] as const) : []),
    ...(view.methods.bankTransfer.available ? (['bankTransfer'] as const) : []),
    ...(view.methods.cash ? (['cash'] as const) : []),
  ]
  const [method, setMethod] = useState<Method | null>(null)

  let action: ReactNode = null
  if (view.status === 'PAID') {
    action = (
      <Note
        icon={tickIcon}
        text={view.paidAt ? t(`${K}paidOn`, { date: day(view.paidAt) }) : t(`${K}paid`)}
      />
    )
  } else if (view.status === 'PAYMENT_PENDING') {
    const pending = view.pendingPayment
    const how =
      pending?.method === 'CARD' ||
      pending?.method === 'BANK_TRANSFER' ||
      pending?.method === 'CASH'
        ? pending.method
        : 'OTHER'
    action = (
      <Note icon={tickIcon} text={t(`${K}pending.${how}`, { date: day(pending?.submittedAt) })} />
    )
  } else if (view.status === 'PAYABLE') {
    action = (
      <>
        {view.lastPaymentNotConfirmed ? (
          <p
            role="status"
            className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium text-pending-700"
          >
            {t(`${K}rejected`)}
          </p>
        ) : null}
        <h3 className="text-base font-semibold text-text-primary">{t(`${K}howToPay`)}</h3>
        {offered.length === 0 ? (
          <Notice body={t(`${K}noMethod`)} />
        ) : (
          <div
            role="group"
            aria-label={t(`${K}howToPay`)}
            className="grid w-full grid-cols-1 gap-[17px] sm:grid-cols-3"
          >
            {offered.map((id) => (
              <SelectionCard
                key={id}
                title={t(`${K}method.${id}.title`)}
                description={t(`${K}method.${id}.subtitle`)}
                selected={method === id}
                onSelect={() => setMethod(id)}
                icon={<img src={ICON[id]} alt="" className="size-6 object-contain" />}
              />
            ))}
          </div>
        )}
        {!view.methods.card ? (
          <p className="text-xs font-medium text-text-quaternary">{t(`${K}cardUnavailable`)}</p>
        ) : null}
      </>
    )
  } else {
    action = <Notice body={t(`${K}problem.other`)} />
  }

  return (
    <div className="my-auto flex w-full max-w-[700px] flex-col gap-6">
      <div className="flex flex-col gap-3">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t(`${K}title`, { number: view.billNumber })}
        </h2>
        <p className="text-base font-medium leading-[1.2] text-text-quaternary">
          {view.companyName}
        </p>
      </div>

      <div className="@container flex w-full flex-col gap-6">
        {action}
        <div className="flex w-full flex-col gap-6 @min-[700px]:flex-row @min-[700px]:items-start @min-[700px]:justify-between">
          <div className="w-full max-w-[351px] shrink-0">
            {view.status === 'PAYABLE' && method === 'card' ? (
              <CardPanel token={token} onChanged={onChanged} />
            ) : view.status === 'PAYABLE' && method === 'bankTransfer' ? (
              <BankPanel view={view} token={token} onChanged={onChanged} />
            ) : view.status === 'PAYABLE' && method === 'cash' ? (
              <CashPanel token={token} onChanged={onChanged} />
            ) : null}
          </div>
          <BillSummary view={view} day={day} />
        </div>
      </div>
    </div>
  )
}

/** The bill as the server priced it, in the sign-up order summary's look. */
function BillSummary({
  view,
  day,
}: {
  view: PayLinkView
  day: (iso: string | null | undefined) => string
}) {
  const { t } = useTranslation()
  const vat = Number(view.vatAmount) > 0
  return (
    <div className="flex w-full max-w-[332px] flex-col overflow-hidden rounded-sm border border-[#f3f3f3] bg-surface-card @min-[700px]:shrink-0">
      <div className="px-[18px] pb-3 pt-5">
        <p className="text-base font-medium text-text-primary">{t(`${K}summary.title`)}</p>
      </div>
      <div className="border-t border-dashed border-[#e8e8e8]" />
      <div className="flex flex-col gap-1.5 px-[18px] py-3">
        {view.planName ? (
          <p className="text-2xl font-semibold text-text-primary">{view.planName}</p>
        ) : null}
        {view.billingCycle === 'MONTHLY' || view.billingCycle === 'ANNUAL' ? (
          <p className="text-sm font-medium text-text-primary/70">
            {t(`${K}summary.cycle.${view.billingCycle}`)}
          </p>
        ) : null}
        {view.periodStartsOn && view.periodEndsOn ? (
          <p className="text-sm font-medium text-text-primary/70">
            {t(`${K}summary.period`, {
              from: day(view.periodStartsOn),
              to: day(view.periodEndsOn),
            })}
          </p>
        ) : null}
        {view.sellerName ? (
          <p className="text-sm font-medium text-text-primary/70">
            {t(`${K}summary.seller`, { name: view.sellerName })}
          </p>
        ) : null}
      </div>
      <div className="border-t border-dashed border-[#e8e8e8]" />
      <div className="flex flex-col gap-3 px-3 py-4">
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium text-text-primary/70">{t(`${K}summary.subtotal`)}</span>
          <OmAmount
            size="xs"
            amount={view.subtotal}
            amountClassName="font-semibold text-text-primary/80"
          />
        </div>
        {/* No VAT line at all while none is charged. */}
        {vat ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium text-text-primary/70">{t(`${K}summary.vat`)}</span>
            <OmAmount
              size="xs"
              amount={view.vatAmount}
              amountClassName="font-semibold text-text-primary/80"
            />
          </div>
        ) : null}
      </div>
      <div className="border-t border-dashed border-[#e8e8e8]" />
      <div className="flex items-center justify-between gap-2 px-3 py-4">
        <span className="text-base font-medium text-text-primary/90">{t(`${K}summary.total`)}</span>
        <OmAmount
          size="sm"
          amount={view.total}
          amountClassName="text-[22px] font-semibold text-text-primary/90"
        />
      </div>
      <div className="border-t border-dashed border-[#e8e8e8]" />
      <div className="flex flex-col gap-1 px-[18px] py-4 text-xs font-medium text-text-primary/70">
        {view.dueOn ? <p>{t(`${K}summary.due`, { date: day(view.dueOn) })}</p> : null}
        <p>{t(`${K}summary.validUntil`, { date: day(view.expiresAt) })}</p>
        {view.tokenHint ? (
          <p>
            {t(`${K}summary.tokenHint`)} <span dir="ltr">{view.tokenHint}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** Opens the provider's hosted checkout with one key per attempt; a retry reuses it. */
function CardPanel({ token, onChanged }: { token: string; onChanged: () => void }) {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<PayLinkProblem | 'notReady' | null>(null)
  const inFlight = useRef(false)

  const open = async () => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setProblem(null)
    try {
      const checkout = await startPayLinkCard(token, cardIdempotencyKey())
      rememberCardPayment(checkout.paymentId)
      if (checkout.status === 'READY' && isTrustedCheckoutUrl(checkout.checkoutUrl)) {
        hostedCheckout.open(checkout.checkoutUrl)
        return
      }
      if (checkout.status === 'PAID') {
        forgetCardAttempt()
        onChanged()
        return
      }
      // A finished attempt replayed by its key: the next click starts a new one.
      if (checkout.status === 'NOT_COMPLETED' || checkout.status === 'REVERSED') forgetCardAttempt()
      // Never navigate to an address that is not the provider's.
      setProblem('notReady')
    } catch (error) {
      const found = payLinkProblemOf(error)
      setProblem(found)
      if (found === 'expired' || found === 'notPayable' || found === 'slotTaken') onChanged()
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Note icon={tickIcon} text={t(`${K}card.note`)} />
      <Button type="button" disabled={busy} onClick={() => void open()} className="w-full">
        {busy ? t(`${K}card.opening`) : t(`${K}card.open`)}
      </Button>
      {problem ? <PanelProblem problem={problem} /> : null}
    </div>
  )
}

function BankPanel({
  view,
  token,
  onChanged,
}: {
  view: PayLinkView
  token: string
  onChanged: () => void
}) {
  const { t } = useTranslation()
  const [evidence, setEvidence] = useState<BankEvidence>({ proof: null, reference: '', note: '' })
  const [missing, setMissing] = useState<'receipt' | 'reference' | null>(null)
  const [problem, setProblem] = useState<PayLinkProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const key = useRef<string | null>(null)
  const account = view.methods.bankTransfer.account

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (busy) return
    if (!evidence.proof) return setMissing('receipt')
    if (!evidence.reference.trim()) return setMissing('reference')
    key.current ??= crypto.randomUUID()
    setBusy(true)
    setProblem(null)
    try {
      await submitPayLinkBankTransfer(
        token,
        { proof: evidence.proof, reference: evidence.reference.trim(), note: evidence.note },
        key.current,
      )
      onChanged()
    } catch (error) {
      const found = payLinkProblemOf(error)
      setProblem(found)
      if (found === 'expired' || found === 'notPayable' || found === 'slotTaken') onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
      <BankTransferDetails
        beneficiary={
          account
            ? {
                legalName: account.beneficiary,
                bankName: account.bank,
                iban: account.iban,
                swiftCode: null,
              }
            : null
        }
        // The view names no size limit: the server checks it and a 413 gets its own sentence.
        maxBytes={undefined}
        held={null}
        evidence={evidence}
        problem={missing}
        refused={problem === 'receiptRefused'}
        transferNote={t(`${K}bank.transferNow`)}
        noAccountNote={t(`${K}bank.noAccount`)}
        onChange={(next) => {
          key.current = null
          setMissing(null)
          setProblem(null)
          setEvidence((current) => ({ ...current, ...next }))
        }}
      />
      {problem && problem !== 'receiptRefused' ? <PanelProblem problem={problem} /> : null}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? t(`${K}sending`) : t(`${K}bank.submit`)}
      </Button>
    </form>
  )
}

function CashPanel({ token, onChanged }: { token: string; onChanged: () => void }) {
  const { t } = useTranslation()
  const [problem, setProblem] = useState<PayLinkProblem | null>(null)
  const [busy, setBusy] = useState(false)
  const key = useRef<string | null>(null)
  const request = async () => {
    if (busy) return
    key.current ??= crypto.randomUUID()
    setBusy(true)
    setProblem(null)
    try {
      await requestPayLinkCash(token, '', key.current)
      onChanged()
    } catch (error) {
      const found = payLinkProblemOf(error)
      setProblem(found)
      if (found === 'expired' || found === 'notPayable' || found === 'slotTaken') onChanged()
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <Note icon={tickIcon} text={t(`${K}cash.note`)} />
      <Button type="button" disabled={busy} onClick={() => void request()} className="w-full">
        {busy ? t(`${K}sending`) : t(`${K}cash.submit`)}
      </Button>
      {problem ? <PanelProblem problem={problem} /> : null}
    </div>
  )
}

function PanelProblem({ problem }: { problem: PayLinkProblem | 'notReady' }) {
  const { t } = useTranslation()
  return (
    <p role="alert" className="text-sm font-medium text-danger-700">
      {t(`${K}problem.${problem}`)}
    </p>
  )
}
