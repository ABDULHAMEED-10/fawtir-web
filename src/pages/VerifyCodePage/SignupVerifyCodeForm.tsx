import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { commonFailureMessage, type FormMessage } from '../../lib/identity/errors'
import { saveOnboardingSession } from '../../lib/identity/onboardingSession'
import type { SignupVerificationState } from '../../lib/identity/signup'
import {
  EMAIL_CODE_RESEND_DELAY_MS,
  EMAIL_CODE_TTL_MS,
  VERIFICATION_CODE_LENGTH,
  describeVerificationFailure,
  formatCountdown,
  resendSignupCode,
  verifySignupEmail,
} from '../../lib/identity/verification'
import { VerifyCodeView } from './VerifyCodeView'

const emptyCode = () => Array<string>(VERIFICATION_CODE_LENGTH).fill('')

export function SignupVerifyCodeForm({ verification }: { verification: SignupVerificationState }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState<string[]>(emptyCode)
  const [error, setError] = useState<FormMessage | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [resending, setResending] = useState(false)
  // The first code's timing is the server's; after a resend it is re-derived — see verification.ts.
  const [deadlines, setDeadlines] = useState(() => ({
    codeExpiresAt: Date.parse(verification.emailVerificationExpiresAt),
    resendAvailableAt: Date.parse(verification.resendAvailableAt),
  }))
  const [now, setNow] = useState(() => Date.now())
  // Verify and resend share one guard: a resend landing mid-verify would replace the code being
  // checked, and each extra click is another request against a rate-limited endpoint.
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => () => inFlight.current?.abort(), [])

  const secondsUntilResend = Math.ceil((deadlines.resendAvailableAt - now) / 1000)
  const minutesLeft = Math.max(0, Math.ceil((deadlines.codeExpiresAt - now) / 60_000))
  const canResend = secondsUntilResend <= 0 && !resending && !verifying

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    if (code.some((digit) => digit === '')) {
      setError({ key: 'validation.codeIncomplete' })
      return
    }

    const controller = new AbortController()
    inFlight.current = controller
    setVerifying(true)
    setError(null)
    try {
      const session = await verifySignupEmail(verification, code.join(''), controller.signal)
      saveOnboardingSession(session)
      // Replace: the code is spent, so Back must not return to a screen that can only fail.
      navigate('/about-business', { replace: true })
    } catch (failure) {
      if (controller.signal.aborted) return
      setError(describeVerificationFailure(failure, Date.now() >= deadlines.codeExpiresAt))
    } finally {
      inFlight.current = null
      setVerifying(false)
    }
  }

  const handleResend = async () => {
    if (inFlight.current || Date.now() < deadlines.resendAvailableAt) return
    const controller = new AbortController()
    inFlight.current = controller
    setResending(true)
    setError(null)
    try {
      await resendSignupCode(verification, controller.signal)
      const sentAt = Date.now()
      setDeadlines({
        codeExpiresAt: sentAt + EMAIL_CODE_TTL_MS,
        resendAvailableAt: sentAt + EMAIL_CODE_RESEND_DELAY_MS,
      })
      setCode(emptyCode())
      setNow(sentAt)
    } catch (failure) {
      if (controller.signal.aborted) return
      setError(commonFailureMessage(failure))
    } finally {
      inFlight.current = null
      setResending(false)
    }
  }

  return (
    <VerifyCodeView
      description={t('verifyCode.descriptionEmail', {
        contact: verification.email,
        minutes: minutesLeft,
      })}
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
