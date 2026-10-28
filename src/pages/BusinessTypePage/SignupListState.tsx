import { useTranslation } from 'react-i18next'
import type { ApiRead } from '../../hooks/useApiRead'

/**
 * What the two sign-up type screens show while their list is not there: loading, a failed read
 * with a retry, or an empty list. Drawn as the plan step draws its catalogue states.
 */
export function SignupListState({
  read,
  retry,
}: {
  read: ApiRead<readonly unknown[]>
  retry: () => void
}) {
  const { t } = useTranslation()
  if (read.status === 'loading') {
    return (
      <p role="status" className="text-center text-sm font-medium text-text-quaternary">
        {t('businessType.loading')}
      </p>
    )
  }
  if (read.status === 'failed') {
    return (
      <div role="alert" className="flex flex-col items-center gap-2 text-center">
        <p className="text-sm font-medium text-text-danger">{t('businessType.loadFailed')}</p>
        <button
          type="button"
          onClick={retry}
          className="rounded-sm text-sm font-semibold text-primary-700 hover:text-primary-800 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-500"
        >
          {t('businessType.retry')}
        </button>
      </div>
    )
  }
  return (
    <p role="status" className="text-center text-sm font-medium text-text-quaternary">
      {t('businessType.noneOpen')}
    </p>
  )
}
