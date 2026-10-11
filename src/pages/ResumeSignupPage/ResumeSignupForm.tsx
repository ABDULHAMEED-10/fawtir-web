import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ApiError } from '../../api'
import { Button, ChevronRightIcon, Input, MailIcon } from '../../components/ui'
import { commonFailureMessage, type FormMessage } from '../../lib/identity/errors'
import {
  ROUTE_FOR_STAGE,
  isSubmittedStage,
  readSignupStatus,
} from '../../lib/identity/onboarding'
import {
  markOnboardingSubmitted,
  saveOnboardingSession,
} from '../../lib/identity/onboardingSession'
import { onboardingStateFromStatus } from '../../lib/identity/signupDraft'
import { requestSignupResume, verifySignupResume } from '../../lib/identity/signupResume'
import {
  EMAIL_CODE_RESEND_DELAY_MS,
  EMAIL_CODE_TTL_MS,
  VERIFICATION_CODE_LENGTH,
  formatCountdown,
} from '../../lib/identity/verification'
import { email as validateEmail, type FieldError } from '../../lib/validation'
import { VerifyCodeView } from '../VerifyCodePage/VerifyCodeView'

const emptyCode = () => Array<string>(VERIFICATION_CODE_LENGTH).fill('')

/**
 * "Continue your registration" after the two-hour onboarding token has gone (Phase A contract
 * §6-§7): the registration's email, then a fresh code, then a new token in the same session store
 * the sign-up uses, and on to the step the server names.
 *
 * Every answer is the same whatever the email: the request always succeeds and says a code was
 * sent only "if" a registration is waiting, and a wrong code reads like any other refusal, so the
 * screen cannot be used to find out who has registered.
 */
export function ResumeSignupForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [address, setAddress] = useState('')
  const [addressError, setAddressError] = useState<FieldError>()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState<string[]>(emptyCode)
  const [formError, setFormError] = useState<FormMessage | null>(null)
  const [busy, setBusy] = useState(false)
  // Client-side only: `/signup/resume` answers 202 with no body, so there is no server timing to
  // read; these are the signup code's own limits, which resume shares (contract §6).
  const [deadlines, setDeadlines] = useState({ codeExpiresAt: 0, resendAvailableAt: 0 })
  const [now, setNow] = useState(() => Date.now())
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  useEffect(() => {
    if (sentTo === null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [sentTo])

  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    if (inFlight.current) return
    const controller = new AbortController()
    inFlight.current = controller
    setBusy(true)
    setFormError(null)
    try {
      await work(controller.signal)
    } catch (failure) {
      if (controller.signal.aborted) return
      setFormError(
        failure instanceof ApiError && failure.status === 401
          ? { key: 'signupResume.invalid' }
          : commonFailureMessage(failure),
      )
    } finally {
      inFlight.current = null
      setBusy(false)
    }
  }

  const sendCode = (to: string) =>
    run(async (signal) => {
      await requestSignupResume(to, signal)
      const sentAt = Date.now()
      setSentTo(to)
      setCode(emptyCode())
      setDeadlines({
        codeExpiresAt: sentAt + EMAIL_CODE_TTL_MS,
        resendAvailableAt: sentAt + EMAIL_CODE_RESEND_DELAY_MS,
      })
      setNow(sentAt)
    })

  const handleEmail = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = address.trim()
    const problem = validateEmail(trimmed)
    setAddressError(problem)
    if (problem) {
      event.currentTarget.querySelector<HTMLInputElement>('input[name="email"]')?.focus()
      return
    }
    void sendCode(trimmed)
  }

  const handleCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!sentTo) return
    if (code.some((digit) => digit === '')) {
      setFormError({ key: 'validation.codeIncomplete' })
      return
    }
    void run(async (signal) => {
      const session = await verifySignupResume(sentTo, code.join(''), signal)
      saveOnboardingSession({ ...session, submitted: false })
      // The step to land on is the server's. If the read fails, the first step's gate asks again.
      try {
        const status = await readSignupStatus(session.onboardingToken)
        const submitted = isSubmittedStage(status.stage)
        markOnboardingSubmitted(submitted)
        navigate(ROUTE_FOR_STAGE[status.stage], {
          replace: true,
          state: submitted ? undefined : onboardingStateFromStatus(status),
        })
      } catch {
        navigate('/about-business', { replace: true })
      }
    })
  }

  if (sentTo !== null) {
    const secondsUntilResend = Math.ceil((deadlines.resendAvailableAt - now) / 1000)
    const minutesLeft = Math.max(0, Math.ceil((deadlines.codeExpiresAt - now) / 60_000))
    return (
      <VerifyCodeView
        description={t('signupResume.codeSent', { contact: sentTo, minutes: minutesLeft, count: minutesLeft })}
        code={code}
        onCodeChange={(next) => {
          setCode(next)
          setFormError(null)
        }}
        error={formError ? t(formError.key, formError.values) : undefined}
        resendIn={formatCountdown(secondsUntilResend)}
        canResend={secondsUntilResend <= 0 && !busy}
        onResend={() => void sendCode(sentTo)}
        submitting={busy}
        onSubmit={handleCode}
      />
    )
  }

  return (
    <form onSubmit={handleEmail} noValidate className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="flex flex-col gap-9">
        <div className="space-y-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('signupResume.title')}
          </h2>
          <p className="text-sm font-medium leading-relaxed text-text-muted">
            {t('signupResume.description')}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Input
            name="email"
            type="email"
            label={t('signupResume.emailLabel')}
            requiredMark
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder={t('signupResume.emailPlaceholder')}
            value={address}
            onChange={(event) => {
              setAddress(event.target.value)
              setAddressError(undefined)
            }}
            error={addressError ? t(addressError) : undefined}
            leadingIcon={<MailIcon />}
          />
          {formError ? (
            <p className="text-xs font-medium text-text-danger" role="alert">
              {t(formError.key, formError.values)}
            </p>
          ) : null}
        </div>
      </div>

      <Button type="submit" fullWidth disabled={busy} className="gap-1.5">
        {busy ? t('signupResume.sending') : t('signupResume.submit')}
        {busy ? null : <ChevronRightIcon size={18} className="rtl:rotate-180" />}
      </Button>
    </form>
  )
}
