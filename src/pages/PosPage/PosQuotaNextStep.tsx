import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { EXTRA_DOCUMENTS_ROUTE } from '../../api/settings/extraDocuments'
import { loadPlanChanges } from '../../api/settings/planChanges'
import { useCan } from '../../lib/session/session'
import { useExtrasHeldUntilPaid } from '../../lib/subscriptionReadOnly'

/**
 * The way on when the till is refused at 0 documents left, as the invoice screen's Issue dialog
 * offers it (EX-1): buy extra documents ahead, or a larger plan, for those who may. Read-only, no
 * extras are sold until it is paid (ST-2). Anyone else is told who can do it. The open sale is kept
 * (`useOpenSale`), so it is still there on the way back.
 */
export function PosQuotaNextStep() {
  const { t } = useTranslation()
  const mayManagePlan = useCan('tenant.plan.manage')
  const extrasHeld = useExtrasHeldUntilPaid()
  const [offerUpgrade, setOfferUpgrade] = useState(false)
  useEffect(() => {
    if (!mayManagePlan) return
    let live = true
    loadPlanChanges().then(
      (changes) => {
        if (live) setOfferUpgrade(changes.available)
      },
      () => {
        if (live) setOfferUpgrade(false)
      },
    )
    return () => {
      live = false
    }
  }, [mayManagePlan])

  if (!mayManagePlan) return <> {t('pos.refusal.quotaAskManager')}</>
  return (
    <>
      {extrasHeld ? null : (
        <>
          {' '}
          <Link to={EXTRA_DOCUMENTS_ROUTE} className="font-semibold underline">
            {t('extraDocuments.entry')}
          </Link>
        </>
      )}
      {offerUpgrade ? (
        <>
          {' '}
          <Link to="/settings/plan" className="font-semibold underline">
            {t('planGate.seePlans')}
          </Link>
        </>
      ) : null}
    </>
  )
}
