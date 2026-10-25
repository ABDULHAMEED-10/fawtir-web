import { useEntitlements } from './useEntitlements'
import { erpConnectionAccess, type ErpConnectionAccess } from '../lib/erp/connectionPolicy'
import { mappingAccess, type MappingAccess } from '../lib/erp/erpAccess'

/**
 * The four ERP connection permissions for the signed-in user.
 *
 * `ready` is false until the entitlement snapshot arrives, and `access` is all-false until then:
 * {@link erpConnectionAccess} fails closed on a missing snapshot, so a screen never draws a control
 * it has not yet confirmed the user holds. See {@link useEntitlements} for why a failed load is not
 * surfaced as an error.
 */
export function useErpAccess(): { access: ErpConnectionAccess; ready: boolean } {
  const { entitlements, ready } = useEntitlements()
  return { access: erpConnectionAccess(entitlements), ready }
}

/** The mapping writes the signed-in user holds; all-false until the snapshot arrives. */
export function useMappingAccess(): MappingAccess {
  const { entitlements } = useEntitlements()
  return mappingAccess(entitlements)
}
