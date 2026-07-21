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

type ResetMethod = 'email' | 'phone'

export function ForgotPasswordForm() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [method, setMethod] = useState<ResetMethod>('email')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    navigate('/verify-code', {
      state: {
        from: 'forgot-password',
        method,
        contact:
          method === 'email'
            ? email || 'you@company.com'
            : `+968 ${phone || '•••• 4567'}`,
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
            onChange={setMethod}
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
              onChange={(e) => setEmail(e.target.value)}
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
              onChange={(e) => setPhone(e.target.value)}
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
