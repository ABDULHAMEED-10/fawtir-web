import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, OtpInput } from '../../components/ui'

type VerifyLocationState = {
  from?: 'signup' | 'forgot-password'
  contact?: string
  method?: 'email' | 'phone'
}

export function VerifyCodeForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const state = (location.state as VerifyLocationState | null) ?? {}
  const from = state.from ?? 'signup'
  const contact = state.contact ?? '+968 •••• 4567'

  const [otp, setOtp] = useState<string[]>(Array(6).fill(''))
  const [seconds, setSeconds] = useState(10)
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (seconds <= 0) return
    const timer = window.setInterval(() => {
      setSeconds((prev) => prev - 1)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [seconds])

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (otp.some((digit) => digit === '')) {
      setError('validation.codeIncomplete')
      return
    }
    if (from === 'forgot-password') {
      navigate('/new-password')
      return
    }
    navigate('/about-business')
  }

  const handleResend = () => {
    if (seconds > 0) return
    setSeconds(10)
    setOtp(Array(6).fill(''))
    setError(undefined)
  }

  const timeLabel = `0:${String(Math.max(seconds, 0)).padStart(2, '0')}`

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="flex flex-col gap-8">
        <div className="space-y-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('verifyCode.title')}
          </h2>
          <p className="text-sm font-medium leading-relaxed text-text-muted">
            {t('verifyCode.description', { contact, minutes: 10 })}
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <OtpInput
            value={otp}
            onChange={(next) => {
              setOtp(next)
              setError(undefined)
            }}
          />

          {error ? (
            <p className="text-xs font-medium text-text-danger" role="alert">
              {t(error)}
            </p>
          ) : null}

          <div className="flex items-center justify-between gap-3 text-xs font-medium">
            <span className="text-text-muted">{t('verifyCode.resendIn', { time: timeLabel })}</span>
            <button
              type="button"
              onClick={handleResend}
              disabled={seconds > 0}
              className="font-medium text-primary-700 transition-colors hover:text-primary-800 disabled:cursor-not-allowed disabled:text-text-disabled"
            >
              {t('verifyCode.resend')}
            </button>
          </div>
        </div>
      </div>

      <Button type="submit" fullWidth className="gap-1.5">
        {t('verifyCode.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
