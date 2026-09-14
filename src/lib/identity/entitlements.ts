import { apiRequest } from '../../api'

export const ENTITLEMENTS_PATH = '/v1/me/entitlements'

/** `EntitlementsResponse.AssignedRole`. */
export type AssignedRole = {
  id: string
  code: string
  name: string
  systemRole: boolean
}

/**
 * `EntitlementsResponse`: display-only. The permissions are the ones `@RequiresPermission`
 * enforces, which makes them the right source for deciding what to offer — and only that; every
 * request is still authorised by the backend.
 */
export type Entitlements = {
  userId: string
  username: string
  tenantId: string
  roles: AssignedRole[]
  permissions: string[]
  scopes: string[]
  featureFlags: Record<string, boolean>
}

/**
 * Held in memory for as long as the session it describes, so moving between console pages — each
 * of which mounts its own shell — asks once rather than per page. Never persisted: it names the
 * user and what they may do. Shared while in flight so StrictMode's double effect cannot send a
 * second request, and forgotten on failure so a later visit tries again.
 */
let cached: Promise<Entitlements> | null = null
let settled: Entitlements | null = null

export function loadEntitlements(): Promise<Entitlements> {
  if (!cached) {
    const request = apiRequest<Entitlements>(ENTITLEMENTS_PATH).then(
      (entitlements) => {
        // Only if nobody forgot this request meanwhile: an answer for a session that has since
        // ended must not become the answer for the next one.
        if (cached === request) settled = entitlements
        return entitlements
      },
      (error: unknown) => {
        if (cached === request) cached = null
        throw error
      },
    )
    cached = request
  }
  return cached
}

/** The answer already in memory, so a page change can render without a loading flash. */
export function peekEntitlements(): Entitlements | null {
  return settled
}

/** Called whenever the session changes hands — sign-in, sign-out, or a session found dead. */
export function forgetEntitlements(): void {
  cached = null
  settled = null
}

export function hasPermission(entitlements: Entitlements, code: string): boolean {
  return entitlements.permissions.includes(code)
}

/**
 * Only a PLATFORM-kind tenant can hold `platform.*` codes — the backend refuses to grant them
 * anywhere else (`TenantManagedPermissionPolicy`, and a database trigger) — and the entitlements
 * carry no tenant kind, so holding one is how a Fawtir operator is recognised. UX only.
 */
export function isPlatformOperator(entitlements: Entitlements): boolean {
  return entitlements.permissions.some((code) => code.startsWith('platform.'))
}
