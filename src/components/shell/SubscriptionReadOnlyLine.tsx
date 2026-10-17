import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  PAY_ROUTE,
  SUBSCRIPTION_PAY_PERMISSION,
  readOnlyOffersPay,
  useReadOnlyReason,
} from '../../lib/subscriptionReadOnly'
import { useCan } from '../../lib/session/session'

/**
 * The one line at the top of every signed-in screen while the subscription is read-only
 * (business rules ST-2, TR-4, CA-3): why, and a Pay button to the bills. Nothing at all while the
 * subscription is usable, while the server is not applying restrictions, or for someone who may
 * not read the subscription.
 *
 * Pay is for those who may pay (`tenant.plan.manage`); anyone else is told who can. It is not
 * repeated on the bills page itself, and Enterprise without terms has nothing to pay (SU-5).
 */
export function SubscriptionReadOnlyLine() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const reason = useReadOnlyReason()
  const mayPay = useCan(SUBSCRIPTION_PAY_PERMISSION)
  if (reason === null) return null
  const offersPay = readOnlyOffersPay(reason)
  return (
    <div
      role="status"
      className="mx-auto mb-3 flex w-full max-w-[1144px] flex-wrap items-center justify-between gap-3 rounded-sm bg-pending-100 px-4 py-3"
    >
      <p className="min-w-0 flex-1 text-sm font-medium leading-[1.6] text-pending-700">
        {t(`subscriptionReadOnly.reason.${reason}`)}
        {offersPay && !mayPay ? ` ${t('subscriptionReadOnly.askToPay')}` : null}
      </p>
      {offersPay && mayPay && pathname !== PAY_ROUTE ? (
        <Link
          to={PAY_ROUTE}
          className="inline-flex shrink-0 items-center rounded-sm bg-primary-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-800"
        >
          {t('subscriptionReadOnly.pay')}
        </Link>
      ) : null}
    </div>
  )
}
