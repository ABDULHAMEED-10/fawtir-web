import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
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

export function NewPasswordForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate('/login')
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="flex flex-col gap-9">
        <div className="flex flex-col gap-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('newPassword.title')}
          </h2>
          <p className="text-base font-medium leading-[1.2] text-text-quaternary">
            {t('newPassword.description')}
          </p>
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
            label={t('newPassword.confirmPasswordLabel')}
            requiredMark
            type={showConfirm ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder={t('newPassword.confirmPasswordPlaceholder')}
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
      </div>

      <Button type="submit" fullWidth className="gap-1.5">
        {t('newPassword.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
