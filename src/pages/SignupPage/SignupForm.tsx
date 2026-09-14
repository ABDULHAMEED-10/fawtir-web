import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  ChevronRightIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  Input,
  LockIcon,
  MailIcon,
  PasswordStrength,
  PhoneInput,
  UserIcon,
} from '../../components/ui'
import { isClean } from '../../lib/validation'
import { focusFirstInvalid } from '../../lib/forms'
import type { FormMessage } from '../../lib/identity/errors'
import {
  INITIAL_SIGNUP_VALUES,
  SIGNUP_FIELD_ORDER,
  buildSignupRequest,
  describeSignupFailure,
  submitSignup,
  toVerificationState,
  validateSignupForm,
  type SignupFieldErrors,
  type SignupFormValues,
} from '../../lib/identity/signup'

export function SignupForm() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const [values, setValues] = useState<SignupFormValues>(INITIAL_SIGNUP_VALUES)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [errors, setErrors] = useState<SignupFieldErrors>({})
  const [formError, setFormError] = useState<FormMessage | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // The disabled button alone cannot stop a second submit: a double click or a repeated Enter
  // can dispatch again before the re-render lands, and each one would create an account.
  const inFlight = useRef<AbortController | null>(null)
  const consentErrorId = useId()

  // Leaving mid-request must not let the late response navigate away from wherever the user went.
  useEffect(() => () => inFlight.current?.abort(), [])

  const setField = <F extends keyof SignupFormValues>(field: F, value: SignupFormValues[F]) => {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    // Kept before the await: React clears `currentTarget` once the handler yields.
    const form = event.currentTarget

    const next = validateSignupForm(values)
    setErrors(next)
    setFormError(null)
    if (!isClean(next)) {
      focusFirstInvalid(form, SIGNUP_FIELD_ORDER, next)
      return
    }

    const controller = new AbortController()
    inFlight.current = controller
    setSubmitting(true)
    try {
      const response = await submitSignup(buildSignupRequest(values, i18n.language), controller.signal)
      navigate('/verify-code', { state: toVerificationState(response) })
    } catch (error) {
      if (controller.signal.aborted) return
      const failure = describeSignupFailure(error)
      setErrors(failure.fieldErrors)
      setFormError(failure.formError)
      focusFirstInvalid(form, SIGNUP_FIELD_ORDER, failure.fieldErrors)
    } finally {
      inFlight.current = null
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex w-full max-w-[400px] flex-col gap-8">
      <div className="flex flex-col gap-7">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('signup.title')}
        </h2>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-4">
            <Input
              label={t('signup.fullNameLabel')}
              requiredMark
              name="fullName"
              autoComplete="name"
              placeholder={t('signup.fullNamePlaceholder')}
              value={values.fullName}
              onChange={(e) => setField('fullName', e.target.value)}
              error={errors.fullName ? t(errors.fullName) : undefined}
              leadingIcon={<UserIcon />}
              trailingIcon={
                values.fullName ? (
                  <button
                    type="button"
                    onClick={() => setField('fullName', '')}
                    className="inline-flex text-text-quaternary hover:text-text-secondary"
                    aria-label={t('common.clear')}
                  >
                    <CloseIcon />
                  </button>
                ) : null
              }
            />

            <Input
              label={t('login.usernameLabel')}
              requiredMark
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder={t('signup.usernamePlaceholder')}
              value={values.username}
              onChange={(e) => setField('username', e.target.value)}
              error={errors.username ? t(errors.username) : undefined}
              leadingIcon={<UserIcon />}
            />

            <Input
              label={t('signup.emailLabel')}
              requiredMark
              type="email"
              name="email"
              autoComplete="email"
              placeholder={t('signup.emailPlaceholder')}
              value={values.email}
              onChange={(e) => setField('email', e.target.value)}
              error={errors.email ? t(errors.email) : undefined}
              leadingIcon={<MailIcon />}
            />

            <PhoneInput
              label={t('signup.phoneLabel')}
              requiredMark
              name="phone"
              autoComplete="tel-national"
              placeholder={t('signup.phonePlaceholder')}
              value={values.phone}
              onChange={(e) => setField('phone', e.target.value)}
              error={errors.phone ? t(errors.phone) : undefined}
            />

            <div className="flex flex-col gap-2.5">
              <Input
                label={t('signup.passwordLabel')}
                requiredMark
                type={showPassword ? 'text' : 'password'}
                name="password"
                autoComplete="new-password"
                placeholder={t('signup.passwordPlaceholder')}
                value={values.password}
                onChange={(e) => setField('password', e.target.value)}
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
              <PasswordStrength password={values.password} />
            </div>

            <Input
              label={t('signup.confirmPasswordLabel')}
              requiredMark
              type={showConfirm ? 'text' : 'password'}
              name="confirmPassword"
              autoComplete="new-password"
              placeholder={t('signup.confirmPasswordPlaceholder')}
              value={values.confirmPassword}
              onChange={(e) => setField('confirmPassword', e.target.value)}
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
          </div>

          <label className="mt-1 flex items-center gap-2 text-xs font-medium text-text-primary">
            <span className="relative inline-flex h-5 w-5 shrink-0">
              <input
                type="checkbox"
                name="consent"
                aria-invalid={errors.consent ? true : undefined}
                aria-describedby={errors.consent ? consentErrorId : undefined}
                checked={values.consent}
                onChange={(e) => setField('consent', e.target.checked)}
                className="peer absolute inset-0 z-10 cursor-pointer opacity-0"
              />
              <span className="flex h-5 w-5 items-center justify-center rounded-sm border border-border-default bg-surface-card peer-checked:border-primary-700 peer-checked:bg-primary-700 peer-checked:[&_svg]:opacity-100">
                <svg width="12" height="10" viewBox="0 0 12 10" fill="none" className="opacity-0">
                  <path
                    d="M1 5.2L4.2 8.5L11 1.5"
                    stroke="white"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </span>
            <span>
              {t('signup.agreePrefix')}{' '}
              <button type="button" className="font-semibold text-primary-700">
                {t('signup.terms')}
              </button>{' '}
              {t('signup.and')}{' '}
              <button type="button" className="font-semibold text-primary-700">
                {t('signup.privacy')}
              </button>
              .
            </span>
          </label>
          {errors.consent ? (
            <p id={consentErrorId} className="mt-1 text-xs font-medium text-text-danger" role="alert">
              {t(errors.consent)}
            </p>
          ) : null}
          {formError ? (
            <p className="mt-1 text-xs font-medium text-text-danger" role="alert">
              {t(formError.key, formError.values)}
            </p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <Button type="submit" fullWidth disabled={submitting} className="gap-1.5">
          {submitting ? t('signup.submitting') : t('signup.submit')}
          <ChevronRightIcon size={18} className="rtl:rotate-180" />
        </Button>

        <p className="text-center text-xs font-medium text-text-primary">
          {t('signup.alreadyMember')}{' '}
          <Link to="/login" className="font-semibold text-primary-700 hover:text-primary-800">
            {t('signup.loginHere')}
          </Link>
        </p>
      </div>
    </form>
  )
}
