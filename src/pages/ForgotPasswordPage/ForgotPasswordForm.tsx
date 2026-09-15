import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon, Input, UserIcon } from '../../components/ui'
import { required, type FieldError } from '../../lib/validation'
import { commonFailureMessage, type FormMessage } from '../../lib/identity/errors'
import { formatCountdown } from '../../lib/identity/verification'
import {
  RECOVERY_USERNAME_MAX_LENGTH,
  RESEND_DELAY_MS,
  RESET_LINK_MINUTES,
  requestPasswordReset,
} from '../../lib/identity/recovery'
import { LOGIN_ROUTE } from '../../lib/identity/login'

/**
 * Password recovery asks for the username, not the email.
 *
 * An email address is unique only within a company, so one mailbox can hold accounts in several,
 * and an address cannot say which account to reset. The username is unique across Fawtir. The
 * reset mail still goes to the address on that account, and names the account it resets.
 *
 * The answer is the same whether or not the account exists, so the screen that follows never says
 * a link was sent; it says one was sent if the account exists.
 */
export function ForgotPasswordForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [error, setError] = useState<FieldError>()
  const [formError, setFormError] = useState<FormMessage | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [resendAt, setResendAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  // The disabled button alone cannot stop a second submit: a double click or a repeated Enter can
  // land before React re-renders.
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  useEffect(() => {
    if (resendAt <= now) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [resendAt, now])

  const send = async (value: string) => {
    if (inFlight.current) return
    const controller = new AbortController()
    inFlight.current = controller
    setSubmitting(true)
    setFormError(null)
    try {
      await requestPasswordReset(value, controller.signal)
      setSentTo(value.trim())
      setResendAt(Date.now() + RESEND_DELAY_MS)
      setNow(Date.now())
    } catch (failure) {
      if (controller.signal.aborted) return
      setFormError(commonFailureMessage(failure))
    } finally {
      inFlight.current = null
      setSubmitting(false)
    }
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = username.trim()
    const next = required(trimmed) ?? (trimmed.length > RECOVERY_USERNAME_MAX_LENGTH ? 'validation.tooLong' : undefined)
    setError(next)
    if (next) {
      event.currentTarget.querySelector<HTMLInputElement>('input[name="username"]')?.focus()
      return
    }
    void send(trimmed)
  }

  if (sentTo !== null) {
    const waitSeconds = Math.ceil(Math.max(0, resendAt - now) / 1000)
    return (
      <div className="flex w-full max-w-[400px] flex-col gap-11">
        <div className="space-y-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('forgotPassword.sentTitle')}</h2>
          <p className="text-sm font-medium leading-relaxed text-text-muted" role="status">
            {t('forgotPassword.sentBody', { username: sentTo, minutes: RESET_LINK_MINUTES })}
          </p>
          {formError ? (
            <p className="text-xs font-medium text-text-danger" role="alert">
              {t(formError.key, formError.values)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-4">
          <Button type="button" fullWidth onClick={() => navigate(LOGIN_ROUTE)}>
            {t('forgotPassword.backToLogin')}
          </Button>
          <button
            type="button"
            disabled={waitSeconds > 0 || submitting}
            onClick={() => void send(sentTo)}
            className="text-sm font-medium text-primary-700 transition-colors hover:text-primary-800 disabled:text-text-quaternary"
          >
            {waitSeconds > 0
              ? t('forgotPassword.resendIn', { time: formatCountdown(waitSeconds) })
              : t('forgotPassword.resend')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="flex flex-col gap-9">
        <div className="space-y-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('forgotPassword.title')}</h2>
          <p className="text-sm font-medium leading-relaxed text-text-muted">{t('forgotPassword.description')}</p>
        </div>

        <div className="flex flex-col gap-2">
          <Input
            name="username"
            label={t('login.usernameLabel')}
            requiredMark
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={RECOVERY_USERNAME_MAX_LENGTH}
            placeholder={t('login.usernamePlaceholder')}
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              setError(undefined)
            }}
            error={error ? t(error) : undefined}
            leadingIcon={<UserIcon />}
          />
          {formError ? (
            <p className="text-xs font-medium text-text-danger" role="alert">
              {t(formError.key, formError.values)}
            </p>
          ) : null}
        </div>
      </div>

      <Button type="submit" fullWidth disabled={submitting} className="gap-1.5">
        {submitting ? t('forgotPassword.sending') : t('forgotPassword.submit')}
        {submitting ? null : <ChevronRightIcon size={18} className="rtl:rotate-180" />}
      </Button>
    </form>
  )
}
