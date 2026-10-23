import { useTranslation } from 'react-i18next'
import { useExtrasHeldUntilPaid } from '../../lib/subscriptionReadOnly'

/** The one line shown where the Buy extras actions were. */
export function PayFirstForExtrasNote() {
  const { t } = useTranslation()
  if (!useExtrasHeldUntilPaid()) return null
  return (
    <p
      role="status"
      className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700"
    >
      {t('subscription.payFirstForExtras')}
    </p>
  )
}
