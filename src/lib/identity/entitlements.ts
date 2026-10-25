import { apiRequest } from '../../api'
import { handWritten } from '../erp/draft'
import { sessionSamples } from '../erp/sample'

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
  /**
   * The workspace's display name. Absent when the server could not read the tenant row, in which
   * case a caller keeps whatever it was showing -- it is a label, and nothing is decided from it.
   */
  tenantName?: string | null
  roles: AssignedRole[]
  permissions: string[]
  scopes: string[]
  featureFlags: Record<string, boolean>
  /** The caller is the company's stored Owner (Business Rules OW-1). Absent from older servers. */
  isOwner?: boolean
  /**
   * The caller sees every branch: the Owner, Administrators, and everyone while branch access is
   * not switched on (BA-2). Absent from older servers, which means every branch.
   */
  allBranches?: boolean
  /** The caller's own branches when `allBranches` is false; empty otherwise. */
  branchIds?: string[]
  /** Holds `branch.users.manage` without being an Administrator: manages their branches' people (LG-3). */
  branchAdministrator?: boolean
  /** The branches a branch administrator may give people; empty for everyone else. */
  manageableBranchIds?: string[]
  /**
   * Branch access is switched on for this server (`FAWTIR_IDENTITY_BRANCH_ACCESS_ENFORCED`), the
   * same for every caller. Absent from older servers, which means off.
   */
  branchAccessEnforced?: boolean
  /**
   * The caller can start paying the company's subscription bills: holds `tenant.plan.manage` after
   * their own grants and denials, and the company has not left Fawtir. When false, Pay and an open
   * card checkout's Continue are hidden. Absent from older servers: the screens stay as before.
   */
  payAvailable?: boolean
  /**
   * The server refuses what the company's plan has switched off (Business Rules PL-8,
   * `FAWTIR_BILLING_PLAN_FEATURES_ENABLED`), the same for every caller. Absent from older servers,
   * which means nothing is refused and nothing is hidden.
   */
  planFeaturesEnforced?: boolean
  /**
   * The company's plan's switches as Console › Plans sets them, feature key to on or off; a key
   * absent is off. Display only, read through `planIncludes` (lib/planAccess).
   */
  planFeatures?: Record<string, boolean>
  /**
   * ERP is enabled for the caller's company right now (backend #713: the same
   * `erp.tenant_entitlements` row every ERP route checks). A company fact, not a permission: every
   * signed-in user gets it, and the ERP actions still follow `permissions`. Optional only because
   * a server older than #713 omits it — see {@link erpSwitchedOff}.
   */
  erpEntitled?: boolean
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
  // The ERP samples and the hand-written expression are module memory, and sign-out and sign-in
  // are SPA navigations with no reload. Without this the next user in the tab — possibly another
  // tenant — saw the previous tenant's ERP payloads, and Advanced pre-filled its expression.
  sessionSamples.clear()
  handWritten.clear()
}

/** False only when the server says so; an older server without `payAvailable` changes nothing. */
export function payAvailable(entitlements: Entitlements | null): boolean {
  return entitlements?.payAvailable !== false
}

let warnedMissingErpEntitled = false

/**
 * True only when the server says ERP is off for the company (`erpEntitled: false`).
 *
 * A missing field is **not** read as off: a server older than backend #713 omits it, and reading
 * that as false would hide ERP from every company at once. Such a server keeps the screens as they
 * were before F3, where the ERP routes themselves refuse new work (403 erp-entitlement-required),
 * and a development build says so in the console, because #713 must be deployed before this. A
 * snapshot that could not be read (`null`) is not "off" either: the ERP screens already offer
 * nothing on it.
 */
export function erpSwitchedOff(entitlements: Entitlements | null): boolean {
  if (entitlements === null) return false
  if (entitlements.erpEntitled === undefined) {
    if (import.meta.env.DEV && !warnedMissingErpEntitled) {
      warnedMissingErpEntitled = true
      console.warn(
        '/me/entitlements has no erpEntitled: the backend predates #713, so ERP screens are not gated on the company switch.',
      )
    }
    return false
  }
  return entitlements.erpEntitled === false
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
