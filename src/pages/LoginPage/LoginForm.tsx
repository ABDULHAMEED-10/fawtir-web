import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Checkbox,
  EyeIcon,
  EyeOffIcon,
  Input,
  LockIcon,
  UserIcon,
} from '../../components/ui'
import { focusFirstInvalid } from '../../lib/forms'
import type { FormMessage } from '../../lib/identity/errors'
import {
  INITIAL_LOGIN_VALUES,
  LOGIN_CODE_ROUTE,
  LOGIN_FIELD_ORDER,
  SIGNED_IN_ROUTE,
  describeLoginFailure,
  isSignInAgainState,
  submitLogin,
  validateLoginForm,
  type LoginFieldErrors,
  type LoginFormValues,
} from '../../lib/identity/login'
import { holdLoginChallenge } from '../../lib/identity/loginChallenge'
import { isClean } from '../../lib/validation'

export function LoginForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [values, setValues] = useState<LoginFormValues>(INITIAL_LOGIN_VALUES)
  // Drawn as designed but never sent: the backend has no remember-me, and the portal session's
  // lifetime is the server's alone. Wiring it to anything would promise a behaviour that is absent.
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<LoginFieldErrors>({})
  const [formError, setFormError] = useState<FormMessage | null>(() =>
    isSignInAgainState(location.state) ? { key: 'login.signInAgain' } : null,
  )
  const [submitting, setSubmitting] = useState(false)
  // The disabled button alone cannot stop a second submit: a double click or a repeated Enter can
  // dispatch again before the re-render lands, and each is another attempt against the lockout.
  const inFlight = useRef<AbortController | null>(null)

  useEffect(() => () => inFlight.current?.abort(), [])

  // The notice explains one moment — the code step giving up — not this history entry; left in
  // place, a reload would tell someone who has done nothing wrong to sign in again.
  useEffect(() => {
    if (isSignInAgainState(location.state)) navigate(location.pathname, { replace: true, state: null })
  }, [location, navigate])

  const setField = (field: keyof LoginFormValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
    setFormError(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    // Kept before the await: React clears `currentTarget` once the handler yields.
    const form = event.currentTarget

    const next = validateLoginForm(values)
    setErrors(next)
    setFormError(null)
    if (!isClean(next)) {
      focusFirstInvalid(form, LOGIN_FIELD_ORDER, next)
      return
    }

    const controller = new AbortController()
    inFlight.current = controller
    setSubmitting(true)
    try {
      const outcome = await submitLogin(values, controller.signal)
      if (outcome.kind === 'signedIn') {
        navigate(SIGNED_IN_ROUTE, { replace: true })
        return
      }
      holdLoginChallenge(outcome.challenge)
      navigate(LOGIN_CODE_ROUTE)
    } catch (error) {
      if (controller.signal.aborted) return
      setFormError(describeLoginFailure(error))
    } finally {
      inFlight.current = null
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full max-w-[400px] flex-col gap-8">
      <div className="flex flex-col gap-7">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('login.title')}
        </h2>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-4">
            <Input
              label={t('login.usernameLabel')}
              requiredMark
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t('login.usernamePlaceholder')}
              value={values.username}
              onChange={(e) => setField('username', e.target.value)}
              error={errors.username ? t(errors.username) : undefined}
              leadingIcon={<UserIcon />}
            />

            <Input
              label={t('login.passwordLabel')}
              requiredMark
              type={showPassword ? 'text' : 'password'}
              name="password"
              autoComplete="current-password"
              placeholder={t('login.passwordPlaceholder')}
              value={values.password}
              onChange={(e) => setField('password', e.target.value)}
              error={errors.password ? t(errors.password) : undefined}
              leadingIcon={<LockIcon />}
              trailingIcon={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="inline-flex text-text-quaternary transition-colors hover:text-text-secondary"
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                >
                  {showPassword ? <EyeIcon /> : <EyeOffIcon />}
                </button>
              }
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            <Checkbox
              label={t('login.rememberMe')}
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-primary-700 transition-colors hover:text-primary-800"
            >
              {t('login.forgotPassword')}
            </Link>
          </div>

          {formError ? (
            <p className="mt-1 text-xs font-medium text-text-danger" role="alert">
              {t(formError.key, formError.values)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <Button type="submit" fullWidth disabled={submitting}>
          {submitting ? t('login.submitting') : t('login.submit')}
        </Button>

        <p className="text-center text-xs font-medium text-text-primary">
          {t('login.notMember')}{' '}
          <Link to="/signup" className="font-semibold text-primary-700 hover:text-primary-800">
            {t('login.signUp')}
          </Link>
        </p>
      </div>
    </form>
  )
}
