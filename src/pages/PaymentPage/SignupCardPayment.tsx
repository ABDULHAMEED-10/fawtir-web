import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui'
import { PaymobPixelCard } from '../../components/billing/PaymobPixelCard'
import { usePendingRefresh } from '../../hooks'
import type { useOnboardingStep } from '../../hooks/useOnboardingStep'
import {
  readSignupCardCheckout,
  recordPaymentPreference,
  startSignupCardCheckout,
  type SignupCardCheckout,
  type SignupCardStatus,
  type SignupHeldPayment,
} from '../../lib/identity/onboarding'
import { readOnboardingSession } from '../../lib/identity/onboardingSession'

const FINAL: ReadonlySet<SignupCardStatus> = new Set(['VERIFIED', 'NOT_COMPLETED', 'UNDER_REVIEW', 'REVERSED'])

/**
 * The attempt Paymob's form reported as paid in this tab. Only a hint for what to draw: it hides the
 * form while the server catches up (a refresh before the callback lands would otherwise offer the
 * card form again under a customer who has just paid). It never counts as payment.
 */
const PAID_IN_FORM = 'fawtir.signupCard.paidInForm'

function paidInForm(paymentId: string): boolean {
  try {
    return window.sessionStorage.getItem(PAID_IN_FORM) === paymentId
  } catch {
    return false
  }
}

function rememberPaidInForm(paymentId: string | null) {
  try {
    if (paymentId) window.sessionStorage.setItem(PAID_IN_FORM, paymentId)
    else window.sessionStorage.removeItem(PAID_IN_FORM)
  } catch {
    // Storage refused (private window): the form simply stays hidden only until a reload.
  }
}

/**
 * Card at signup (owner, 13 Oct 2026): Paymob's own embedded form, on this screen, for the amount the
 * server quotes. Fawtir renders no card field. What the browser hears from Paymob is only a prompt:
 * the application counts as paid by card when Fawtir's server has verified the payment against
 * Paymob's own records, and even then the subscription starts only after the company is approved.
 */
export function SignupCardPayment({
  save,
  addon,
  held,
  onStatus,
}: {
  save: ReturnType<typeof useOnboardingStep>['save']
  addon: boolean
  held: SignupHeldPayment | null
  onStatus: (status: SignupCardStatus | null) => void
}) {
  const { t } = useTranslation()
  const heldVerified = held?.method === 'CARD' && held.status === 'FUNDS_VERIFIED'
  const [checkout, setCheckout] = useState<SignupCardCheckout | null>(null)
  // One key per attempt the registrant starts: a retried click returns the same attempt.
  const attemptKey = useRef<string | null>(null)
  const status: SignupCardStatus | null = heldVerified ? 'VERIFIED' : (checkout?.status ?? null)
  const [submitted, setSubmitted] = useState(false)
  const paidHere = submitted || (checkout !== null && paidInForm(checkout.paymentId))

  const reportStatus = useRef(onStatus)
  reportStatus.current = onStatus
  useEffect(() => {
    reportStatus.current(status)
  }, [status])

  // A ref, not state: a double click fires both handlers before React re-renders the disabled
  // button, and each would ask the server to open an attempt (the server would return the same
  // one, but the browser must not lean on that).
  const opening = useRef(false)
  const [busy, setBusy] = useState(false)
  // The form-level error renders above Continue, below the fold on this screen: a refused open
  // must also say so here, where the customer just clicked (local acceptance, 13 Oct 2026).
  const [openFailed, setOpenFailed] = useState(false)
  const open = async () => {
    if (opening.current) return
    opening.current = true
    setBusy(true)
    setOpenFailed(false)
    attemptKey.current ??= `signup-card-${crypto.randomUUID()}`
    const key = attemptKey.current
    try {
      const result = await save(async (token, signal) => {
        // The preference first: the server opens a card attempt only for a saved PAY_NOW + card choice.
        await recordPaymentPreference(token, { enrollment: 'payNow', method: 'cardLink' }, addon, signal)
        setCheckout(await startSignupCardCheckout(token, key, signal))
      })
      if (!result.saved) setOpenFailed(true)
    } finally {
      opening.current = false
      setBusy(false)
    }
  }

  // Back after a refresh, or from Paymob's 3-D Secure page: the application already has a card
  // attempt, and the server hands that same one back (one collection per application, V289), so it
  // is read again instead of waiting for a click that would only look like a new payment.
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current || held?.method !== 'CARD' || held.status !== 'SUBMITTED') return
    resumed.current = true
    void open()
    // Once per mount, for the attempt the server reported held when the screen loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held])

  const check = async (live: () => boolean = () => true) => {
    const session = readOnboardingSession()
    if (!session || !checkout) return null
    const next = await readSignupCardCheckout(session.onboardingToken, checkout.paymentId)
    if (live()) setCheckout(next)
    return next
  }

  // Re-read while the server still owes an answer: after the form reported a payment, while the
  // server is confirming one, and also while the form is merely open, so a payment whose browser
  // event never fired (a 3-D Secure frame, a closed popup) is still noticed once its callback lands.
  // Bounded and backed off by usePendingRefresh; a new spell starts when the form reports payment.
  const awaiting = checkout !== null && !FINAL.has(checkout.status)
  usePendingRefresh(
    checkout ? `${checkout.paymentId}:${paidHere ? 'paid' : 'open'}` : null,
    awaiting,
    (live) => check(live),
  )

  useEffect(() => {
    if (checkout && (checkout.status === 'NOT_COMPLETED' || checkout.status === 'VERIFIED')) {
      rememberPaidInForm(null)
    }
  }, [checkout])

  const paid = () => {
    if (!checkout) return
    rememberPaidInForm(checkout.paymentId)
    setSubmitted(true)
    void check().catch(() => undefined)
  }

  const retry = () => {
    if (opening.current) return
    attemptKey.current = null
    rememberPaidInForm(null)
    setSubmitted(false)
    setCheckout(null)
    void open()
  }

  if (status === 'VERIFIED') {
    return <Message tone="ok" text={t(heldVerified && checkout === null ? 'payment.card.verified' : 'payment.card.verifiedNow')} />
  }

  const verifying = checkout !== null && (checkout.status === 'PROCESSING' || (checkout.status === 'READY' && paidHere))

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-black/10 bg-surface-card p-4">
      <p className="text-xs font-medium text-text-quaternary">{t('payment.card.noteEmbedded')}</p>
      {checkout === null ? (
        <Button type="button" onClick={() => void open()} disabled={busy} aria-busy={busy} className="w-full">
          {t('payment.card.open')}
        </Button>
      ) : null}
      {checkout === null && openFailed ? <Message tone="alert" text={t('payment.card.openFailed')} /> : null}
      {checkout?.status === 'READY' && !paidHere && checkout.publishableKey && checkout.clientSecret ? (
        <PaymobPixelCard
          session={{ publicKey: checkout.publishableKey, clientSecret: checkout.clientSecret }}
          payButton
          onPaymentComplete={paid}
        />
      ) : null}
      {verifying ? <Message text={t('payment.card.processing')} /> : null}
      {checkout?.status === 'UNDER_REVIEW' ? <Message tone="alert" text={t('payment.card.underReview')} /> : null}
      {checkout?.status === 'REVERSED' ? <Message tone="alert" text={t('payment.card.reversed')} /> : null}
      {checkout?.status === 'NOT_COMPLETED' ? (
        <>
          <Message tone="alert" text={t('payment.card.notCompleted')} />
          <Button type="button" variant="secondary" onClick={retry} disabled={busy} className="w-full">
            {t('payment.card.tryAgain')}
          </Button>
        </>
      ) : null}
      {checkout && !FINAL.has(checkout.status) ? (
        <Button type="button" variant="secondary" onClick={() => void check().catch(() => undefined)} className="w-full">
          {t('payment.card.checkStatus')}
        </Button>
      ) : null}
    </div>
  )
}

function Message({ text, tone = 'info' }: { text: string; tone?: 'info' | 'ok' | 'alert' }) {
  const colour = tone === 'alert' ? 'text-text-danger' : tone === 'ok' ? 'text-text-primary' : 'text-text-quaternary'
  return (
    <p className={`text-xs font-medium ${colour}`} role={tone === 'alert' ? 'alert' : 'status'}>
      {text}
    </p>
  )
}
