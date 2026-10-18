import { useTranslation } from 'react-i18next'
import { usePayingHold } from '../../hooks/usePayingHeldUntilReconnected'

/**
 * In place of a way to pay the server refused with `disconnected-from-fawtir` (LV-6), for a role
 * that cannot read the danger zone's view and so is not shown its note (A3.8). Nothing otherwise.
 */
export function LeftFawtirRefusal() {
  const { t } = useTranslation()
  if (usePayingHold() !== 'refusal') return null
  return (
    <p
      role="status"
      className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700"
    >
      {t('billing.refusal.disconnected-from-fawtir')}
    </p>
  )
}
