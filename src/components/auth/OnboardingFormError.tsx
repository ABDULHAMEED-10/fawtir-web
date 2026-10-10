import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { FormMessage } from '../../lib/identity/errors'
import { RESUME_ROUTE } from '../../lib/identity/signupResume'

/**
 * A step's form-level error. An ended session is the one failure the registrant cannot fix on the
 * page, so it carries the way back in: a fresh code by email, never "sign up again" (the
 * registration exists).
 */
export function OnboardingFormError({ error }: { error: FormMessage | null }) {
  const { t } = useTranslation()
  if (!error) return null
  return (
    <p className="text-xs font-medium text-text-danger" role="alert">
      {t(error.key, error.values)}
      {error.key === 'onboarding.sessionExpired' ? (
        <>
          {' '}
          <Link to={RESUME_ROUTE} className="font-semibold text-primary-700 underline">
            {t('signupResume.cta')}
          </Link>
        </>
      ) : null}
    </p>
  )
}
