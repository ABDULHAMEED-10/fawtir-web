import { useTranslation } from 'react-i18next'
import { readOnlyOffersPay, useReadOnlyReason } from '../../lib/subscriptionReadOnly'

/**
 * Buying extras while the subscription is read-only (ST-2, owner 23 Oct 2026): the purchase is
 * offered, but it does not lift read-only; only paying the subscription does. Shown only while the
 * server reports a restriction that is lifted by paying.
 */
export function StaysReadOnlyUntilPaidNote() {
  const { t } = useTranslation()
  const reason = useReadOnlyReason()
  if (reason === null || !readOnlyOffersPay(reason)) return null
  return (
    <p
      role="status"
      className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700"
    >
      {t('subscription.staysReadOnlyUntilPaid')}
    </p>
  )
}
