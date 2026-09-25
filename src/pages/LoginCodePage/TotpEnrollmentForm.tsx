import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { commonFailureMessage, type FormMessage } from '../../lib/identity/errors'
import {
  LOGIN_ROUTE,
  beginTotpEnrollment,
  confirmTotpEnrollment,
  type LoginChallenge,
  type SignInAgainState,
  type TotpEnrollment,
} from '../../lib/identity/login'
import { dropLoginChallenge } from '../../lib/identity/loginChallenge'
import { VERIFICATION_CODE_LENGTH } from '../../lib/identity/verification'
import { TotpVerifyForm } from './TotpVerifyForm'

/**
 * Setting up an authenticator during a login that demands one.
 *
 * <p>The staged secret lives in component state and nowhere else. It is not written to
 * localStorage or sessionStorage and is not logged: a reload therefore restarts enrolment with a
 * fresh secret rather than resuming one, which is the behaviour to want — the abandoned secret
 * was never confirmed, so nothing is lost by dropping it.
 *
 * <p>Confirming enrolment does not sign anyone in. The original challenge still has to be
 * completed with a code from the authenticator that was just configured, so this screen hands
 * over to {@link TotpVerifyForm} rather than navigating anywhere.
 */
export function TotpEnrollmentForm({ challenge }: { challenge: LoginChallenge }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null)
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null)
  const [enrolled, setEnrolled] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState<FormMessage | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  const signInAgain = useCallback(() => {
    dropLoginChallenge()
    navigate(LOGIN_ROUTE, { replace: true, state: { signInAgain: true } satisfies SignInAgainState })
  }, [navigate])

  useEffect(() => () => inFlight.current?.abort(), [])

  // Staged once, when the screen opens. Asking again would mint a second secret and invalidate
  // the one the reader may already have scanned.
  useEffect(() => {
    const controller = new AbortController()
    let active = true
    beginTotpEnrollment(challenge, controller.signal).then(
      (staged) => {
        if (active) setEnrollment(staged)
      },
      (failure: unknown) => {
        if (active && !controller.signal.aborted) setError(commonFailureMessage(failure))
      },
    )
    return () => {
      active = false
      controller.abort()
    }
  }, [challenge])

  const digits = code.replace(/\D/g, '').slice(0, VERIFICATION_CODE_LENGTH)
  const complete = digits.length === VERIFICATION_CODE_LENGTH

  const confirm = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !complete || !enrollment) return
    const controller = new AbortController()
    inFlight.current = controller
    setBusy(true)
    setError(null)
    try {
      const result = await confirmTotpEnrollment(
        challenge,
        enrollment.enrollmentChallenge,
        digits,
        controller.signal,
      )
      // Shown once, here, and never stored. The reader writes them down or loses them.
      setRecoveryCodes(result.backupCodes ?? [])
      setEnrolled(true)
    } catch (failure) {
      if (controller.signal.aborted) return
      setError(commonFailureMessage(failure))
      setCode('')
    } finally {
      if (!controller.signal.aborted) setBusy(false)
      inFlight.current = null
    }
  }

  // Enrolment is done; the login itself still is not.
  if (enrolled && !recoveryCodes?.length) {
    return <TotpVerifyForm challenge={challenge} />
  }

  if (enrolled) {
    return (
      <div className="flex w-full flex-col gap-5">
        <div>
          <h1 className="text-2xl font-semibold leading-[1.2] text-text-primary">
            {t('login.totpSetup.recoveryTitle')}
          </h1>
          <p className="mt-2 text-sm font-medium leading-[1.5] text-text-quaternary">
            {t('login.totpSetup.recoveryHint')}
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-2 rounded-sm bg-surface-background p-4">
          {recoveryCodes?.map((recoveryCode) => (
            <li
              key={recoveryCode}
              className="font-mono text-sm font-medium tracking-wide text-text-primary"
            >
              {recoveryCode}
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setRecoveryCodes([])}
          className="inline-flex h-[46px] items-center justify-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800"
        >
          {t('login.totpSetup.recoverySaved')}
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={confirm} noValidate className="flex w-full flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold leading-[1.2] text-text-primary">
          {t('login.totpSetup.title')}
        </h1>
        <p className="mt-2 text-sm font-medium leading-[1.5] text-text-quaternary">
          {t('login.totpSetup.instruction')}
        </p>
      </div>

      {enrollment ? (
        <div className="flex flex-col gap-2 rounded-sm bg-surface-background p-4">
          <span className="text-xs font-semibold uppercase leading-[1.5] text-text-quaternary">
            {t('login.totpSetup.manualKey')}
          </span>
          {/*
            The key itself, for an authenticator that cannot scan. It is rendered and nothing
            more: not copied to the clipboard automatically, not stored, not logged.
          */}
          <code className="break-all font-mono text-sm font-medium text-text-primary">
            {enrollment.secret}
          </code>
        </div>
      ) : (
        <p className="text-sm font-medium text-text-quaternary" role="status">
          {t('login.totpSetup.preparing')}
        </p>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">
          {t('login.totpSetup.label')}
        </span>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={digits}
          onChange={(event) => setCode(event.target.value)}
          disabled={!enrollment}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'totp-setup-error' : undefined}
          className="h-12 rounded-sm border border-border-subtle bg-white px-4 text-base font-medium tracking-[0.3em] text-text-primary outline-none focus:border-primary-500 disabled:opacity-50"
        />
      </label>

      {error ? (
        <p id="totp-setup-error" role="alert" className="text-sm font-medium text-danger-700">
          {t(error.key, error.values)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={!complete || busy || !enrollment}
        className="inline-flex h-[46px] items-center justify-center rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
      >
        {t(busy ? 'login.totpSetup.confirming' : 'login.totpSetup.confirm')}
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
