import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { commonFailureMessage, type FormMessage } from '../../lib/identity/errors'
import {
  LOGIN_CODE_RESEND_DELAY_MS,
  LOGIN_FACTOR_TOTP,
  LOGIN_ROUTE,
  landingRoute,
  isChallengeSpent,
  requestLoginCode,
  verifyLoginCode,
  type LoginChallenge,
  type SignInAgainState,
} from '../../lib/identity/login'
import { returnPathFrom, withReturnPath } from '../../lib/identity/returnTo'
import { dropLoginChallenge, requestFirstLoginCode } from '../../lib/identity/loginChallenge'
import { VERIFICATION_CODE_LENGTH, formatCountdown } from '../../lib/identity/verification'
import { VerifyCodeView } from '../VerifyCodePage/VerifyCodeView'
import { TotpEnrollmentForm } from './TotpEnrollmentForm'
import { TotpVerifyForm } from './TotpVerifyForm'

const emptyCode = () => Array<string>(VERIFICATION_CODE_LENGTH).fill('')

/**
 * The second factor, whichever one the server asked for.
 *
 * <p>The branch is on the server's decision, not on anything this screen knows about the
 * account. An authenticator challenge never reaches the email flow below — which matters
 * because that flow's first act is to send a code, and the backend refuses to send one against
 * a TOTP challenge.
 */
export function LoginCodeForm({ challenge }: { challenge: LoginChallenge }) {
  if (challenge.factor === LOGIN_FACTOR_TOTP) {
    return challenge.state === 'ENROLLMENT_REQUIRED' ? (
      <TotpEnrollmentForm challenge={challenge} />
    ) : (
      <TotpVerifyForm challenge={challenge} />
    )
  }
  return <EmailCodeForm challenge={challenge} />
}

function EmailCodeForm({ challenge }: { challenge: LoginChallenge }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const next = returnPathFrom(useLocation().search)
  const [code, setCode] = useState<string[]>(emptyCode)
  const [error, setError] = useState<FormMessage | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  // Starts counting before the first code is confirmed sent; a failed first send opens Resend.
  const [resendAvailableAt, setResendAvailableAt] = useState(
    () => Date.now() + LOGIN_CODE_RESEND_DELAY_MS,
  )
  const [now, setNow] = useState(() => Date.now())
  // Verify and resend share one guard: a resend landing mid-verify would replace the code being
  // checked, and every verification attempt spends the challenge whatever its outcome.
  const inFlight = useRef<AbortController | null>(null)

  const signInAgain = useCallback(() => {
    dropLoginChallenge()
    // Replace: this screen can only fail from here, so Back must not return to it.
    navigate(withReturnPath(LOGIN_ROUTE, next), {
      replace: true,
      state: { signInAgain: true } satisfies SignInAgainState,
    })
  }, [navigate, next])

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => () => inFlight.current?.abort(), [])

  useEffect(() => {
    let active = true
    requestFirstLoginCode(challenge).then(
      (sentAt) => {
        if (!active) return
        setResendAvailableAt(sentAt + LOGIN_CODE_RESEND_DELAY_MS)
        setNow(Date.now())
      },
      (failure: unknown) => {
        if (!active) return
        if (isChallengeSpent(failure)) {
          signInAgain()
          return
        }
        setResendAvailableAt(0)
        setError(commonFailureMessage(failure))
      },
    )
    return () => {
      active = false
    }
  }, [challenge, signInAgain])

  // The server would refuse anything sent after this; saying so now beats a request that must fail.
  // Not while a request is out: leaving would abort a verification the server may already have
  // accepted, stranding a session the user was never shown.
  useEffect(() => {
    if (now >= challenge.expiresAt && !verifying && !resending) signInAgain()
  }, [now, challenge.expiresAt, verifying, resending, signInAgain])

  const secondsUntilResend = Math.ceil((resendAvailableAt - now) / 1000)
  const minutesLeft = Math.max(1, Math.ceil((challenge.expiresAt - now) / 60_000))
  const canResend = secondsUntilResend <= 0 && !resending && !verifying

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    if (code.some((digit) => digit === '')) {
      setError({ key: 'validation.codeIncomplete' })
      return
    }
    if (Date.now() >= challenge.expiresAt) {
      signInAgain()
      return
    }

    const controller = new AbortController()
    inFlight.current = controller
    setVerifying(true)
    setError(null)
    let signedIn = false
    try {
      await verifyLoginCode(challenge, code.join(''), controller.signal)
      signedIn = true
      dropLoginChallenge()
      // Replace: the challenge is spent, so Back must not return to a screen that can only fail.
      navigate(await landingRoute(next), { replace: true })
    } catch (failure) {
      if (controller.signal.aborted) return
      if (isChallengeSpent(failure)) {
        signInAgain()
        return
      }
      setError(commonFailureMessage(failure))
    } finally {
      inFlight.current = null
      // Left on after success: the router commits navigations as transitions, so resetting it
      // would first re-render this screen idle — and past the challenge's expiry, that render
      // would send a user who is already signed in back to Login.
      if (!signedIn) setVerifying(false)
    }
  }

  const handleResend = async () => {
    if (inFlight.current || Date.now() < resendAvailableAt) return
    if (Date.now() >= challenge.expiresAt) {
      signInAgain()
      return
    }
    const controller = new AbortController()
    inFlight.current = controller
    setResending(true)
    setError(null)
    try {
      await requestLoginCode(challenge, controller.signal)
      const sentAt = Date.now()
      setResendAvailableAt(sentAt + LOGIN_CODE_RESEND_DELAY_MS)
      setCode(emptyCode())
      setNow(sentAt)
    } catch (failure) {
      if (controller.signal.aborted) return
      if (isChallengeSpent(failure)) {
        signInAgain()
        return
      }
      setError(commonFailureMessage(failure))
    } finally {
      inFlight.current = null
      setResending(false)
    }
  }

  return (
    <VerifyCodeView
      description={t('loginCode.description', { minutes: minutesLeft })}
      code={code}
      onCodeChange={(next) => {
        setCode(next)
        setError(null)
      }}
      error={error ? t(error.key, error.values) : undefined}
      resendIn={formatCountdown(secondsUntilResend)}
      canResend={canResend}
      onResend={handleResend}
      submitting={verifying}
      onSubmit={handleSubmit}
    />
  )
}
