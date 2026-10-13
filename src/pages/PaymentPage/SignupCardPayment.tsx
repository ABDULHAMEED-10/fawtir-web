import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../../components/ui'
import { PaymobPixelCard } from '../../components/billing/PaymobPixelCard'
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

/** After Paymob reports completion: how often, and how long, the screen asks Fawtir's server. */
export const CARD_POLL_INTERVAL_MS = 3_000
export const CARD_POLL_ATTEMPTS = 40

const FINAL: ReadonlySet<SignupCardStatus> = new Set(['VERIFIED', 'NOT_COMPLETED', 'UNDER_REVIEW', 'REVERSED'])

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
  const [polling, setPolling] = useState(false)
  // One key per attempt the registrant starts: a retried click returns the same attempt.
  const attemptKey = useRef<string | null>(null)
  const status: SignupCardStatus | null = heldVerified ? 'VERIFIED' : (checkout?.status ?? null)

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

  const check = async (signal?: AbortSignal) => {
    const session = readOnboardingSession()
    if (!session || !checkout) return null
    const next = await readSignupCardCheckout(session.onboardingToken, checkout.paymentId, signal)
    setCheckout(next)
    return next
  }

  useEffect(() => {
    if (!polling || !checkout) return
    const controller = new AbortController()
    let attempts = 0
    const timer = setInterval(() => {
      attempts += 1
      check(controller.signal)
        .then((next) => {
          if (!next || FINAL.has(next.status) || attempts >= CARD_POLL_ATTEMPTS) {
            clearInterval(timer)
            setPolling(false)
          }
        })
        .catch(() => {
          if (attempts >= CARD_POLL_ATTEMPTS) {
            clearInterval(timer)
            setPolling(false)
          }
        })
    }, CARD_POLL_INTERVAL_MS)
    return () => {
      clearInterval(timer)
      controller.abort()
    }
    // Restarted only when polling is switched on, not on every status it reads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling])

  const retry = () => {
    if (opening.current) return
    attemptKey.current = null
    setCheckout(null)
    void open()
  }

  if (status === 'VERIFIED') {
    return <Message tone="ok" text={t('payment.card.verified')} />
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-black/10 bg-surface-card p-4">
      <p className="text-xs font-medium text-text-quaternary">{t('payment.card.noteEmbedded')}</p>
      {checkout === null ? (
        <Button type="button" onClick={() => void open()} disabled={busy} aria-busy={busy} className="w-full">
          {t('payment.card.open')}
        </Button>
      ) : null}
      {checkout === null && openFailed ? <Message tone="alert" text={t('payment.card.openFailed')} /> : null}
      {checkout?.status === 'READY' && checkout.publishableKey && checkout.clientSecret ? (
        <PaymobPixelCard
          session={{ publicKey: checkout.publishableKey, clientSecret: checkout.clientSecret }}
          payButton
          onPaymentComplete={() => setPolling(true)}
        />
      ) : null}
      {checkout?.status === 'PROCESSING' || polling ? <Message text={t('payment.card.processing')} /> : null}
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
      {checkout && !polling && !FINAL.has(checkout.status) ? (
        <Button type="button" variant="secondary" onClick={() => void check()} className="w-full">
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
