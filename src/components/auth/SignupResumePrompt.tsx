import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button, ChevronRightIcon } from '../ui'
import { RESUME_ROUTE } from '../../lib/identity/signupResume'

/**
 * What a status screen shows when it cannot read a registration: no stage, and certainly no
 * "approved". The two ways forward are the only honest ones — sign in if the account is live, or
 * continue the registration with a fresh code by email.
 */
export function SignupResumePrompt({ titleKey, descriptionKey }: { titleKey: string; descriptionKey: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="flex w-full max-w-[660px] flex-col gap-7">
      <div className="flex flex-col gap-3">
        <h2 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t(titleKey)}</h2>
        <p className="text-base font-medium leading-[1.4] text-text-quaternary">
          {t(descriptionKey)}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="gap-1.5" onClick={() => navigate(RESUME_ROUTE)}>
          {t('signupResume.cta')}
          <ChevronRightIcon size={18} className="rtl:rotate-180" />
        </Button>
        <Button type="button" variant="secondary" onClick={() => navigate('/login')}>
          {t('signupPending.approved.signIn')}
        </Button>
      </div>
    </div>
  )
}
