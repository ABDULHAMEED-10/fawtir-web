import { useSyncExternalStore } from 'react'
import { useApiRead } from './useApiRead'
import { useEntitlements } from './useEntitlements'
import { hasPermission } from '../lib/identity/entitlements'
import { DISCONNECTION_PERMISSION, mustReconnectBeforePaying } from '../lib/fawtirDisconnection'
import {
  FAWTIR_DISCONNECTION_PATH,
  loadFawtirDisconnection,
  type CompanyDisconnectionDto,
} from '../api/settings/fawtirDisconnection'
import { BILLING_PATH, loadBillingOverview, type BillingOverviewDto } from '../api/settings/billing'
import { refusedAsLeftFawtir, subscribeLeftFawtirRefusal } from '../lib/leftFawtirRefusal'
import { fawtirConnectionSeen, subscribeFawtirConnection } from '../lib/fawtirConnection'

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
 *
 * Every role that reads Settings › Billing (`tenant.plan.read`) also reads `fawtirConnection` on
 * it, which says whether the company has left: the same check the server refuses payments on. A
 * server that sends it holds paying back up front for a role that cannot read the view. On an
 * older server, which does not send it, such a role learns it from the server's refusal of a
 * payment (`disconnected-from-fawtir`), and from then on the same actions are held back.
 */
export function usePayingHeldUntilReconnected(): boolean {
  return usePayingHold() !== 'none'
}

/** What Settings › Billing is read with, and so `fawtirConnection` too. */
const BILLING_READ_PERMISSION = 'tenant.plan.read'

/**
 * Why paying is held back: `view` when the disconnection view says so (or is still being read),
 * `refusal` when the server says the company has left but the view does not tell this role (its
 * `fawtirConnection` on Settings › Billing, or on an older server its `disconnected-from-fawtir`
 * refusal of a payment: the screen then says why in place of the action), `none` otherwise.
 */
export function usePayingHold(): 'none' | 'view' | 'refusal' {
  const { entitlements, ready } = useEntitlements()
  const mayRead = entitlements !== null && hasPermission(entitlements, DISCONNECTION_PERMISSION)
  const mayReadBilling =
    entitlements !== null && hasPermission(entitlements, BILLING_READ_PERMISSION)
  const { read } = useApiRead<CompanyDisconnectionDto>(
    mayRead ? FAWTIR_DISCONNECTION_PATH : null,
    loadFawtirDisconnection,
  )
  const connection = useSyncExternalStore(subscribeFawtirConnection, fawtirConnectionSeen)
  // Read the page only when no read of it has answered yet this session (its loader records it).
  const readBilling = mayReadBilling && connection === 'unknown'
  const { read: billing } = useApiRead<BillingOverviewDto>(
    readBilling ? BILLING_PATH : null,
    loadBillingOverview,
  )
  const refused = useSyncExternalStore(subscribeLeftFawtirRefusal, refusedAsLeftFawtir)
  if (!ready) return 'view'
  if (mayRead && read.status === 'loading') return 'view'
  if (mayRead && read.status === 'ready' && mustReconnectBeforePaying(read.data)) return 'view'
  if (readBilling && billing.status === 'loading') return 'view'
  const left = mayReadBilling && connection === true
  return left || refused ? 'refusal' : 'none'
}
