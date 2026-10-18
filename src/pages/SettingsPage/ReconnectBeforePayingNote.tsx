import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import {
  FAWTIR_DISCONNECTION_PATH,
  loadFawtirDisconnection,
  type CompanyDisconnectionDto,
} from '../../api/settings/fawtirDisconnection'
import { canSeeDisconnection, mustReconnectBeforePaying } from '../../lib/fawtirDisconnection'

/** Settings › Company profile, opened at the danger zone where "Coming back to Fawtir" is. */
export const RECONNECT_ROUTE = '/settings/company#danger-zone'

/**
 * Plan v4 A3.8: on the bills and pay screens, a company that has left Fawtir is told to reconnect
 * before paying, with a link to the danger zone. Shown only when the server reports a completed
 * disconnection with no reconnection in effect (`mustReconnectBeforePaying`); the danger zone is
 * the owner's and Administrators' (LV-1), so nobody else reads it or sees this. Anything that
 * cannot be read shows nothing.
 */
export function ReconnectBeforePayingNote() {
  const { entitlements } = useEntitlements()
  if (!canSeeDisconnection(entitlements)) return null
  return <Note />
}

function Note() {
  const { t } = useTranslation()
  const { read } = useApiRead<CompanyDisconnectionDto>(
    FAWTIR_DISCONNECTION_PATH,
    loadFawtirDisconnection,
  )
  if (read.status !== 'ready' || !mustReconnectBeforePaying(read.data)) return null
  return (
    <p
      role="status"
      className="rounded-sm bg-pending-100 px-4 py-3 text-sm font-medium leading-[1.6] text-pending-700"
    >
      {t('fawtirReconnection.beforePaying.note')}{' '}
      <Link to={RECONNECT_ROUTE} className="font-semibold underline">
        {t('fawtirReconnection.beforePaying.link')}
      </Link>
    </p>
  )
}
