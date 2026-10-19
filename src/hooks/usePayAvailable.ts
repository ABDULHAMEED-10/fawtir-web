import { useEntitlements } from './useEntitlements'
import { payAvailable } from '../lib/identity/entitlements'

/**
 * Whether this user may start paying a subscription bill, from `payAvailable` on
 * `GET /v1/me/entitlements`. When false, Pay, preparing the next bill and an open card checkout's
 * Continue are not offered: the server would refuse them. A server that does not send the field
 * leaves every screen as before. Works alongside the LV-6 hold (`usePayingHeldUntilReconnected`),
 * which still says why paying is held back once the company has left Fawtir.
 */
export function usePayAvailable(): boolean {
  const { entitlements } = useEntitlements()
  return payAvailable(entitlements)
}
