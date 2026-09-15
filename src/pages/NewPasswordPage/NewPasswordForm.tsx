import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  ChevronRightIcon,
  EyeIcon,
  EyeOffIcon,
  Input,
  LockIcon,
  PasswordStrength,
} from '../../components/ui'
import {
  confirmPassword as validateConfirm,
  isClean,
  password as validatePassword,
  type FieldError,
} from '../../lib/validation'
import type { FormMessage } from '../../lib/identity/errors'
import {
  FORGOT_PASSWORD_ROUTE,
  RESET_LINK_MINUTES,
  describeResetFailure,
  isResetLinkSpent,
  readResetToken,
  resetPassword,
} from '../../lib/identity/recovery'
import { LOGIN_ROUTE } from '../../lib/identity/login'

/**
 * The page the reset mail links to: `/new-password#token=<token>`.
 *
 * The token is read once, on arrival, and the fragment is then dropped from the address bar and
 * from history. That keeps it out of a screenshot, a shared screen, or a Back press to a page that
 * can no longer use it.
 */
export function NewPasswordForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { hash, pathname } = useLocation()
  const [token] = useState(() => readResetToken(hash))
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState<Record<string, FieldError>>({})
  const [formError, setFormError] = useState<FormMessage | null>(null)
  const [linkSpent, setLinkSpent] = useState(false)
  const [done, setDone] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  useEffect(() => {
    if (hash) navigate(pathname, { replace: true })
  }, [hash, pathname, navigate])

  const clearError = (field: string) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current || !token) return
    const next: Record<string, FieldError> = {
      password: validatePassword(password),
      confirmPassword: validateConfirm(confirmPassword, password),
    }
    setErrors(next)
    setFormError(null)
    if (!isClean(next)) return

    const controller = new AbortController()
    inFlight.current = controller
    setSubmitting(true)
    try {
      await resetPassword(token, password, controller.signal)
      setDone(true)
    } catch (error) {
      if (controller.signal.aborted) return
      setLinkSpent(isResetLinkSpent(error))
      setFormError(describeResetFailure(error))
    } finally {
      inFlight.current = null
      setSubmitting(false)
    }
  }

  if (done) {
    return (
      <Outcome
        title={t('newPassword.doneTitle')}
        body={t('newPassword.doneBody')}
        action={
          <Button type="button" fullWidth onClick={() => navigate(LOGIN_ROUTE, { replace: true })}>
            {t('newPassword.signIn')}
          </Button>
        }
      />
    )
  }

  if (!token || linkSpent) {
    return (
      <Outcome
        title={t(linkSpent ? 'newPassword.linkInvalidTitle' : 'newPassword.missingTitle')}
        body={t(linkSpent ? 'newPassword.linkInvalid' : 'newPassword.missingBody', { minutes: RESET_LINK_MINUTES })}
        alert={linkSpent}
        action={
          <Button type="button" fullWidth onClick={() => navigate(FORGOT_PASSWORD_ROUTE)}>
            {t('newPassword.requestNew')}
          </Button>
        }
      />
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('newPassword.title')}</h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">{t('newPassword.description')}</p>
        </div>

        <div className="flex flex-col gap-10">
          <div className="flex flex-col gap-2.5">
            <Input
              label={t('newPassword.passwordLabel')}
              requiredMark
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={t('newPassword.passwordPlaceholder')}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value)
                clearError('password')
              }}
              error={errors.password ? t(errors.password) : undefined}
              leadingIcon={<LockIcon />}
              trailingIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="inline-flex text-text-quaternary hover:text-text-secondary"
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                >
                  {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                </button>
              }
            />
            <PasswordStrength password={password} />
          </div>

          <div className="flex flex-col gap-2">
            <Input
              label={t('newPassword.confirmPasswordLabel')}
              requiredMark
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={t('newPassword.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                clearError('confirmPassword')
              }}
              error={errors.confirmPassword ? t(errors.confirmPassword) : undefined}
              leadingIcon={<LockIcon />}
              trailingIcon={
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="inline-flex text-text-quaternary hover:text-text-secondary"
                  aria-label={showConfirm ? t('login.hidePassword') : t('login.showPassword')}
                >
                  {showConfirm ? <EyeIcon /> : <EyeOffIcon />}
                </button>
              }
            />
            {formError ? (
              <p className="text-xs font-medium text-text-danger" role="alert">
                {t(formError.key, formError.values)}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Button type="submit" fullWidth disabled={submitting} className="gap-1.5">
          {submitting ? t('newPassword.saving') : t('newPassword.submit')}
          {submitting ? null : <ChevronRightIcon size={18} className="rtl:rotate-180" />}
        </Button>
        <Link
          to={FORGOT_PASSWORD_ROUTE}
          className="text-center text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
        >
          {t('newPassword.requestNew')}
        </Link>
      </div>
    </form>
  )
}

function Outcome({
  title,
  body,
  action,
  alert = false,
}: {
  title: string
  body: string
  action: ReactNode
  alert?: boolean
}) {
  return (
    <div className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="space-y-3">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">{title}</h2>
        <p
          className="text-sm font-medium leading-relaxed text-text-muted"
          role={alert ? 'alert' : 'status'}
        >
          {body}
        </p>
      </div>
      {action}
    </div>
  )
}
