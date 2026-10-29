import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { commonFailureMessage, type FormMessage } from '../../lib/identity/errors'
import {
  LOGIN_ROUTE,
  landingRoute,
  isChallengeSpent,
  verifyLoginCode,
  type LoginChallenge,
  type SignInAgainState,
} from '../../lib/identity/login'
import { returnPathFrom, withReturnPath } from '../../lib/identity/returnTo'
import { dropLoginChallenge } from '../../lib/identity/loginChallenge'
import { VERIFICATION_CODE_LENGTH } from '../../lib/identity/verification'

/**
 * The authenticator step of a login the server has fixed to TOTP.
 *
 * <p>Nothing is sent to reach this screen and nothing can be resent: the code is generated on
 * the reader's own device. That is why there is no resend control and no mention of email here —
 * offering either would describe something that is not happening.
 */
export function TotpVerifyForm({ challenge }: { challenge: LoginChallenge }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const next = returnPathFrom(useLocation().search)
  const [code, setCode] = useState('')
  const [error, setError] = useState<FormMessage | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  // One attempt at a time: every verification spends the challenge whatever its outcome, so a
  // second in flight would be answered by a challenge the first already burned.
  const inFlight = useRef<AbortController | null>(null)

  const signInAgain = useCallback(() => {
    dropLoginChallenge()
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
    if (now >= challenge.expiresAt && !verifying) signInAgain()
  }, [now, challenge.expiresAt, verifying, signInAgain])

  const digits = code.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH)
  const complete = digits.length === VERIFICATION_CODE_LENGTH

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (verifying || !complete) return
    if (Date.now() >= challenge.expiresAt) {
      signInAgain()
      return
    }
    const controller = new AbortController()
    inFlight.current = controller
    setVerifying(true)
    setError(null)
    try {
      await verifyLoginCode(challenge, digits, controller.signal)
      dropLoginChallenge()
      navigate(await landingRoute(next), { replace: true })
    } catch (failure) {
      if (controller.signal.aborted) return
      // A spent challenge cannot be retried on this screen, so it goes back to sign-in rather
      // than leaving the reader typing codes into something that can only refuse them.
      if (isChallengeSpent(failure)) {
        signInAgain()
        return
      }
      setError(commonFailureMessage(failure))
      setCode('')
    } finally {
      if (!controller.signal.aborted) setVerifying(false)
      inFlight.current = null
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex w-full flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold leading-[1.2] text-text-primary">
          {t('login.totp.title')}
        </h1>
        <p className="mt-2 text-sm font-medium leading-[1.5] text-text-quaternary">
          {t('login.totp.instruction')}
        </p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">{t('login.totp.label')}</span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          value={digits}
          onChange={(event) => setCode(event.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'totp-error' : undefined}
          className="h-12 rounded-sm border border-border-subtle bg-white px-4 text-base font-medium tracking-[0.3em] text-text-primary outline-none focus:border-primary-500"
        />
      </label>

      {error ? (
        <p id="totp-error" role="alert" className="text-sm font-medium text-danger-700">
          {t(error.key, error.values)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!complete || verifying}
        className="inline-flex h-[46px] items-center justify-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
      >
        {t(verifying ? 'login.totp.verifying' : 'login.totp.verify')}
      </button>

      <button
        type="button"
        onClick={signInAgain}
        className="text-sm font-semibold text-primary-800 hover:text-primary-700"
      >
        {t('login.totp.startOver')}
      </button>
    </form>
  )
}
