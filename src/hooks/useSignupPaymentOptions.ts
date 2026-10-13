import { useEffect, useState } from 'react'
import { readPaymentOptions, type SignupPaymentOptions } from '../lib/identity/onboarding'
import { readOnboardingSession } from '../lib/identity/onboardingSession'

export type PaymentOptionsRead =
  | { status: 'loading' }
  | { status: 'ready'; options: SignupPaymentOptions }
  /** Nothing is offered when the server cannot say what is available: no method is assumed. */
  | { status: 'failed' }

/**
 * The methods the registrant can choose, from `/signup/payment-options`. Bank transfer used to be
 * decided by a constant in the app (`bankBeneficiaryVerified`), so a confirmed account never
 * reached this screen and an unconfirmed one could have been offered (acceptance F-01).
 */
export function useSignupPaymentOptions(): PaymentOptionsRead {
  const [read, setRead] = useState<PaymentOptionsRead>({ status: 'loading' })

  useEffect(() => {
    const token = readOnboardingSession()?.onboardingToken
    if (!token) {
      setRead({ status: 'failed' })
      return
    }
    const controller = new AbortController()
    readPaymentOptions(token, controller.signal).then(
      // An empty answer (an older server without the route) offers nothing rather than guessing.
      (options) => setRead(options ? { status: 'ready', options } : { status: 'failed' }),
      () => {
        if (!controller.signal.aborted) setRead({ status: 'failed' })
      },
    )
    return () => controller.abort()
  }, [])

  return read
}
