import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Button,
  ChevronRightIcon,
  Input,
  MailIcon,
  PhoneIcon,
  SegmentedControl,
} from '../../components/ui'
import { email as validateEmail, isClean, omanPhone, type FieldError } from '../../lib/validation'

type ResetMethod = 'email' | 'phone'

export function ForgotPasswordForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [method, setMethod] = useState<ResetMethod>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [errors, setErrors] = useState<Record<string, FieldError>>({})

  const clearError = () =>
    setErrors((current) => (current.contact ? { ...current, contact: undefined } : current))

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: Record<string, FieldError> = {
      contact: method === 'email' ? validateEmail(email) : omanPhone(phone),
    }
    setErrors(next)
    if (!isClean(next)) return
    navigate('/verify-code', {
      state: {
        from: 'forgot-password',
        method,
        // Validation guarantees both are real values by this point.
        contact: method === 'email' ? email : `+968 ${phone}`,
      },
    })
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-[400px] flex-col gap-11">
      <div className="flex flex-col gap-9">
        <div className="space-y-3">
          <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('forgotPassword.title')}
          </h2>
          <p className="text-sm font-medium leading-relaxed text-text-muted">
            {t('forgotPassword.description')}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <SegmentedControl
            ariaLabel={t('forgotPassword.methodLabel')}
            value={method}
            onChange={(next) => {
              setMethod(next)
              clearError()
            }}
            options={[
              { value: 'email', label: t('login.emailTab') },
              { value: 'phone', label: t('login.phoneTab') },
            ]}
          />

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
                clearError()
              }}
              error={errors.contact ? t(errors.contact) : undefined}
              leadingIcon={<MailIcon />}
            />
          ) : (
            <Input
              label={t('login.phoneLabel')}
              requiredMark
              type="tel"
              autoComplete="tel"
              placeholder={t('signup.phonePlaceholder')}
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value)
                clearError()
              }}
              error={errors.contact ? t(errors.contact) : undefined}
              leadingIcon={<PhoneIcon />}
            />
          )}
        </div>
      </div>

      <Button type="submit" fullWidth className="gap-1.5">
        {t('forgotPassword.submit')}
        <ChevronRightIcon size={18} className="rtl:rotate-180" />
      </Button>
    </form>
  )
}
