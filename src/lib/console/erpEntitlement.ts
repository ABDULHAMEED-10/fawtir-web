import { ApiError, apiRequest } from '../../api'
import { commonFailureMessage, type FormMessage } from '../identity/errors'

/**
 * A tenant's ERP entitlement, as the platform holds it: whether ERP integration is enabled for
 * that customer, and who last changed it.
 *
 * `GET|PUT|DELETE /platform/tenants/{tenantId}/erp-entitlement`, behind `platform.tenants.manage`.
 * The writes add the fences every platform change to a customer's capability has: an MFA-verified
 * session, the production platform realm, never from impersonation. The backend enforces the
 * entitlement on every ERP operation; this screen only reads and changes the row, and shows what
 * the backend answered rather than what it asked for.
 *
 * Revoking is not destructive: connections, mappings, documents and reports are kept, and reads stay
 * available. New ERP work is refused (`erp-entitlement-required`) until it is granted again, and a
 * re-grant resumes collection schedules.
 */
export type ErpEntitlementStatus = {
  tenantId: string
  entitled: boolean
  grantedBy: string | null
  grantedAt: string | null
  revokedBy: string | null
  revokedAt: string | null
}

export const ERP_ENTITLEMENT_PERMISSION = 'platform.tenants.manage'

export function erpEntitlementPath(tenantId: string): string {
  return `/v1/platform/tenants/${encodeURIComponent(tenantId)}/erp-entitlement`
}

export function grantErpEntitlement(tenantId: string, reason: string): Promise<ErpEntitlementStatus> {
  return apiRequest<ErpEntitlementStatus>(erpEntitlementPath(tenantId), {
    method: 'PUT',
    body: { reason },
    credentials: 'same-origin',
  })
}

export function revokeErpEntitlement(tenantId: string, reason: string): Promise<ErpEntitlementStatus> {
  return apiRequest<ErpEntitlementStatus>(erpEntitlementPath(tenantId), {
    method: 'DELETE',
    body: { reason },
    credentials: 'same-origin',
  })
}

/**
 * Why a grant or revoke was refused. The realm and impersonation refusals have stable problem
 * types; any other 403 is the caller's access or an MFA session that has lapsed, which the screen
 * cannot tell apart and does not guess between.
 */
export function describeErpEntitlementFailure(error: unknown): FormMessage {
  if (error instanceof ApiError) {
    if (error.status === 403 && error.problemType === 'production-platform-realm-required') {
      return { key: 'console.erpEntitlement.error.realm' }
    }
    if (error.status === 403 && error.problemType === 'impersonation-not-allowed') {
      return { key: 'console.erpEntitlement.error.impersonation' }
    }
    if (error.status === 403) return { key: 'console.erpEntitlement.error.refused' }
    if (error.status === 404) return { key: 'console.erpEntitlement.error.gone' }
    if (error.status === 400) return { key: 'console.erpEntitlement.error.invalid' }
  }
  return commonFailureMessage(error)
}
