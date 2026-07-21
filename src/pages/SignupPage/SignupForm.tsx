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

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate('/verify-code', {
      state: {
        from: 'signup',
        contact: phone ? `+968 ${phone}` : email || '+968 •••• 4567',
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
              onChange={(e) => setFullName(e.target.value)}
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
              onChange={(e) => setEmail(e.target.value)}
              leadingIcon={<MailIcon />}
            />

            <PhoneInput
              label={t('signup.phoneLabel')}
              requiredMark
              autoComplete="tel-national"
              placeholder={t('signup.phonePlaceholder')}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />

            <div className="flex flex-col gap-2.5">
              <Input
                label={t('signup.passwordLabel')}
                requiredMark
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder={t('signup.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              onChange={(e) => setConfirmPassword(e.target.value)}
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
                onChange={(e) => setAgreed(e.target.checked)}
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
        </div>
      </div>

      <div className="flex flex-col gap-6">
        <Button type="submit" fullWidth className="gap-1.5">
          {t('signup.submit')}
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
