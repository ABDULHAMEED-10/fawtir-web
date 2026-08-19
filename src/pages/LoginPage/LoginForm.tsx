import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  Checkbox,
  EyeIcon,
  EyeOffIcon,
  Input,
  LockIcon,
  MailIcon,
  PhoneIcon,
  SegmentedControl,
} from '../../components/ui'
import { email as validateEmail, isClean, omanPhone, type FieldError } from '../../lib/validation'

type LoginMethod = 'email' | 'phone'

export function LoginForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [method, setMethod] = useState<LoginMethod>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, FieldError>>({})
  const [submitting, setSubmitting] = useState(false)

  /** Clear a field's error as soon as the user edits it — re-reporting on every keystroke nags. */
  const clearError = (field: string) =>
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Record<string, FieldError> = {
      identifier: method === 'email' ? validateEmail(email) : omanPhone(phone),
      // The password only needs to be present here; strength rules belong on signup.
      password: password ? undefined : 'validation.required',
    }
    setErrors(next)
    if (!isClean(next)) return

    setSubmitting(true)
    // Seam for the auth call: POST /api/v1/auth/login → { token, user }.
    await new Promise((resolve) => setTimeout(resolve, 400))
    setSubmitting(false)
    navigate('/')
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-[400px] flex-col gap-8">
      <div className="flex flex-col gap-7">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('login.title')}
        </h2>

        <div className="flex flex-col gap-3">
          <SegmentedControl
            ariaLabel={t('login.methodLabel')}
            value={method}
            onChange={(next) => {
              setMethod(next)
              clearError('identifier')
            }}
            options={[
              { value: 'email', label: t('login.emailTab') },
              { value: 'phone', label: t('login.phoneTab') },
            ]}
          />

          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-4">
              {method === 'email' ? (
                <Input
                  label={t('login.emailLabel')}
                  requiredMark
                  type="email"
                  autoComplete="email"
                  placeholder={t('login.emailPlaceholder')}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    clearError('identifier')
                  }}
                  error={errors.identifier ? t(errors.identifier) : undefined}
                  leadingIcon={<MailIcon />}
                />
              ) : (
                <Input
                  label={t('login.phoneLabel')}
                  requiredMark
                  type="tel"
                  autoComplete="tel"
                  placeholder={t('login.phonePlaceholder')}
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value)
                    clearError('identifier')
                  }}
                  error={errors.identifier ? t(errors.identifier) : undefined}
                  leadingIcon={<PhoneIcon />}
                />
              )}

              <Input
                label={t('login.passwordLabel')}
                requiredMark
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder={t('login.passwordPlaceholder')}
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
          </div>
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
