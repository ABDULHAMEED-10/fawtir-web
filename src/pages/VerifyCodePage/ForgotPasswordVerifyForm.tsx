import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatCountdown } from '../../lib/identity/verification'
import { VerifyCodeView } from './VerifyCodeView'

const PROTOTYPE_RESEND_SECONDS = 10

/**
 * The password-reset half of the code screen, still the prototype: no request is made and the
 * timer is local. Recovery is integrated separately; this keeps its current behaviour intact.
 */
export function ForgotPasswordVerifyForm({ contact }: { contact: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [code, setCode] = useState<string[]>(Array(6).fill(''))
  const [seconds, setSeconds] = useState(PROTOTYPE_RESEND_SECONDS)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (seconds <= 0) return
    const timer = window.setInterval(() => setSeconds((prev) => prev - 1), 1000)
    return () => window.clearInterval(timer)
  }, [seconds])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (code.some((digit) => digit === '')) {
      setError('validation.codeIncomplete')
      return
    }
    navigate('/new-password')
  }

  const handleResend = () => {
    if (seconds > 0) return
    setSeconds(PROTOTYPE_RESEND_SECONDS)
    setCode(Array(6).fill(''))
    setError(undefined)
  }

  return (
    <VerifyCodeView
      description={t('verifyCode.descriptionEmail', { contact, minutes: 10 })}
      code={code}
      onCodeChange={(next) => {
        setCode(next)
        setError(undefined)
      }}
      error={error ? t(error) : undefined}
      resendIn={formatCountdown(seconds)}
      canResend={seconds <= 0}
      onResend={handleResend}
      onSubmit={handleSubmit}
    />
  )
}
