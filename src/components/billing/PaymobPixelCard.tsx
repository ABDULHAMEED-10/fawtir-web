import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { loadPaymobPixel, pixelOptions, type PixelSession } from '../../lib/paymobPixel'

type Status = 'loading' | 'ready' | 'failed'

/**
 * Paymob's embedded card form for one payment. Renders only a container: the card fields are
 * Paymob's frames, mounted by the SDK into it. Mounted once per client secret, so a re-render (or
 * React's development double effect) never asks Paymob for a second form.
 */
export function PaymobPixelCard({
  session,
  onValidation,
  onPaymentComplete,
  payButton = false,
}: {
  session: PixelSession
  onValidation?: (valid: boolean) => void
  onPaymentComplete?: () => void
  /** Show Paymob's own Pay button inside its form. */
  payButton?: boolean
}) {
  const { t } = useTranslation()
  const elementId = `paymob-pixel-${useId().replace(/[^A-Za-z0-9_-]/g, '')}`
  const container = useRef<HTMLDivElement>(null)
  const mountedFor = useRef<string | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const validation = useRef(onValidation)
  validation.current = onValidation
  const completed = useRef(onPaymentComplete)
  completed.current = onPaymentComplete

  useEffect(() => {
    if (mountedFor.current === session.clientSecret) return
    let cancelled = false
    setStatus('loading')
    loadPaymobPixel()
      .then((Pixel) => {
        if (cancelled || mountedFor.current === session.clientSecret) return
        mountedFor.current = session.clientSecret
        new Pixel(
          pixelOptions(
            session,
            elementId,
            {
              onValidation: (valid) => validation.current?.(valid),
              onPaymentComplete: () => completed.current?.(),
            },
            payButton,
          ),
        )
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('failed')
      })
    return () => {
      cancelled = true
    }
  }, [session, elementId, payButton])

  useEffect(() => {
    const node = container.current
    return () => {
      // Paymob's frames hold the only copy of what was typed; leaving the screen removes them.
      if (node) node.replaceChildren()
      mountedFor.current = null
    }
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <div id={elementId} ref={container} data-testid="paymob-pixel" aria-busy={status === 'loading'} />
      {status === 'loading' ? (
        <p className="text-xs font-medium text-text-quaternary">{t('payment.card.pixelLoading')}</p>
      ) : null}
      {status === 'failed' ? (
        <p className="text-xs font-medium text-text-danger" role="alert">
          {t('payment.card.pixelFailed')}
        </p>
      ) : null}
    </div>
  )
}
