import { useApiRead } from './useApiRead'
import { useEntitlements } from './useEntitlements'
import { hasPermission } from '../lib/identity/entitlements'
import { DISCONNECTION_PERMISSION, mustReconnectBeforePaying } from '../lib/fawtirDisconnection'
import {
  FAWTIR_DISCONNECTION_PATH,
  loadFawtirDisconnection,
  type CompanyDisconnectionDto,
} from '../api/settings/fawtirDisconnection'

/**
 * Plan v4 A3.8 with Business Rules LV-6: whether to hold back every way to start a payment (prepare
 * a bill, pay it by card, bank transfer or cash, order extra documents, users or branches), which
 * the server refuses once the company has left Fawtir. The same condition as the note
 * (`mustReconnectBeforePaying`), but for every role that can read it, not only the danger zone's:
 * the read needs `admin.settings.manage` alone, so a custom role holding it is covered too.
 *
 * Nothing is held back on a server that does not report it: a role that cannot read the view, a
 * failed read, reconnecting switched off or a server older than it all leave the screen as it was.
 * While the answer is on its way the actions wait, so none is offered and then taken away.
 */
export function usePayingHeldUntilReconnected(): boolean {
  const { entitlements, ready } = useEntitlements()
  const mayRead = entitlements !== null && hasPermission(entitlements, DISCONNECTION_PERMISSION)
  const { read } = useApiRead<CompanyDisconnectionDto>(
    mayRead ? FAWTIR_DISCONNECTION_PATH : null,
    loadFawtirDisconnection,
  )
  if (!ready) return true
  if (!mayRead) return false
  if (read.status === 'loading') return true
  return read.status === 'ready' && mustReconnectBeforePaying(read.data)
}
