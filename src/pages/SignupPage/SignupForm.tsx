import { useState, type FormEvent } from 'react'
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
import {
  confirmPassword as validateConfirm,
  email as validateEmail,
  isClean,
  omanPhone,
  password as validatePassword,
  required,
  type FieldError,
} from '../../lib/validation'

export function SignupForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [agreed, setAgreed] = useState(true)
  const [errors, setErrors] = useState<Record<string, FieldError>>({})
  const [submitting, setSubmitting] = useState(false)

  const clearError = (field: string) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Record<string, FieldError> = {
      fullName: required(fullName),
      email: validateEmail(email),
      phone: omanPhone(phone),
      password: validatePassword(password),
      confirmPassword: validateConfirm(confirmPassword, password),
      agreed: agreed ? undefined : 'validation.agreeRequired',
    }
    setErrors(next)
    if (!isClean(next)) return

    setSubmitting(true)
    // Seam for the account call: POST /api/v1/auth/register → sends the OTP.
    await new Promise((resolve) => setTimeout(resolve, 400))
    setSubmitting(false)
    navigate('/verify-code', {
      state: {
        from: 'signup',
        // The OTP goes to the phone, so that is the contact to echo on the next screen.
        contact: `+968 ${phone}`,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-[400px] flex-col gap-8">
      <div className="flex flex-col gap-7">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('signup.title')}
        </h2>

        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-4">
            <Input
              label={t('signup.fullNameLabel')}
              requiredMark
              autoComplete="name"
              placeholder={t('signup.fullNamePlaceholder')}
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value)
                clearError('fullName')
              }}
              error={errors.fullName ? t(errors.fullName) : undefined}
              leadingIcon={<UserIcon />}
              trailingIcon={
                fullName ? (
                  <button
                    type="button"
                    onClick={() => setFullName('')}
                    className="inline-flex text-text-quaternary hover:text-text-secondary"
                    aria-label={t('common.clear')}
                  >
                    <CloseIcon />
                  </button>
                ) : null
              }
            />

            <Input
              label={t('signup.emailLabel')}
              requiredMark
              type="email"
              autoComplete="email"
              placeholder={t('signup.emailPlaceholder')}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                clearError('email')
              }}
              error={errors.email ? t(errors.email) : undefined}
              leadingIcon={<MailIcon />}
            />

            <PhoneInput
              label={t('signup.phoneLabel')}
              requiredMark
              autoComplete="tel-national"
              placeholder={t('signup.phonePlaceholder')}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                clearError('phone')
              }}
              error={errors.phone ? t(errors.phone) : undefined}
            />

            <div className="flex flex-col gap-2.5">
              <Input
                label={t('signup.passwordLabel')}
                requiredMark
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('signup.passwordPlaceholder')}
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

            <Input
              label={t('signup.confirmPasswordLabel')}
              requiredMark
              type={showConfirm ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder={t('signup.confirmPasswordPlaceholder')}
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
          </div>

          <label className="mt-1 flex items-center gap-2 text-xs font-medium text-text-primary">
            <span className="relative inline-flex h-5 w-5 shrink-0">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked)
                  clearError('agreed')
                }}
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
          {errors.agreed ? (
            <p className="mt-1 text-xs font-medium text-text-danger" role="alert">
              {t(errors.agreed)}
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
