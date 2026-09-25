import { ApiError } from '../../api'
import type {
  ErpConnectionDto,
  ErpConnectionState,
  ErpConnectionTestReason,
  ErpCredentialType,
} from '../../api/erp/connections'
import { PROBEABLE_CREDENTIAL_TYPES } from '../../api/erp/connections'
import { hasPermission, type Entitlements } from '../identity/entitlements'

/**
 * What the ERP connection screens are allowed to offer, and why.
 *
 * Pure functions over the server's own data, kept out of the components so the rules are testable
 * without rendering anything. **None of this authorises anything** — every request is still
 * decided by the backend, and a screen whose permission snapshot has gone stale gets a 403 it must
 * render safely. This module decides what to *show*, which is a different question with a
 * different failure mode: offering a control that will be refused is a bad experience, hiding one
 * the user holds is a bug, and neither is a security boundary.
 */

/* ----------------------------------------------------------- permissions */

export const ERP_READ = 'erp.connection.read'
export const ERP_MANAGE = 'erp.connection.manage'
export const ERP_CREDENTIAL = 'erp.credential.replace'
export const ERP_TEST = 'erp.connection.test'

/**
 * The four capabilities, resolved from the real entitlements.
 *
 * Four separate booleans rather than a single "canAdminister", because the backend draws them
 * separately and a UI that collapsed them would show a credential form to someone holding only
 * `erp.connection.manage`. Manage does not imply credential replacement and neither implies
 * testing — the server is explicit about that, and so is this.
 */
export type ErpConnectionAccess = {
  read: boolean
  manage: boolean
  credential: boolean
  test: boolean
}

export function erpConnectionAccess(entitlements: Entitlements | null): ErpConnectionAccess {
  if (entitlements === null) {
    // Fail closed while the snapshot is still loading or could not be fetched. Showing controls
    // optimistically would mean a screen that flickers from enabled to disabled, and a user who
    // clicked in between gets a 403 for a button we should not have drawn.
    return { read: false, manage: false, credential: false, test: false }
  }
  return {
    read: hasPermission(entitlements, ERP_READ),
    manage: hasPermission(entitlements, ERP_MANAGE),
    credential: hasPermission(entitlements, ERP_CREDENTIAL),
    test: hasPermission(entitlements, ERP_TEST),
  }
}

/* --------------------------------------------------------- state machine */

/**
 * The transitions the backend's `ErpConnectionState.canTransitionTo` actually draws.
 *
 * Mirrored rather than guessed, and deliberately narrow: `DRAFT → DISABLED` is **not** an arrow,
 * so a Disable button on a draft would be refused with a 400 the user cannot act on. ARCHIVED is
 * reachable from every non-terminal state and leads nowhere.
 */
const ARROWS: Record<ErpConnectionState, readonly ErpConnectionState[]> = {
  DRAFT: ['READY', 'ARCHIVED'],
  READY: ['DISABLED', 'ARCHIVED'],
  DISABLED: ['READY', 'ARCHIVED'],
  ARCHIVED: [],
}

export function canTransitionTo(from: ErpConnectionState, to: ErpConnectionState): boolean {
  return ARROWS[from].includes(to)
}

export function isTerminal(state: ErpConnectionState): boolean {
  return state === 'ARCHIVED'
}

/** Whether the connection still accepts configuration changes at all. */
export function acceptsChanges(state: ErpConnectionState): boolean {
  return !isTerminal(state)
}

/**
 * Which controls a detail screen should render for one connection and one user.
 *
 * Every field is the conjunction of a permission and a state, because both have to hold and
 * neither implies the other: an administrator with every ERP permission still cannot edit an
 * archived connection, and a reader cannot edit a draft.
 */
export type ErpConnectionControls = {
  canEdit: boolean
  canConfigureCredential: boolean
  canMarkReady: boolean
  canDisable: boolean
  canArchive: boolean
  canTest: boolean
  /** Why Test is unavailable even though the user holds the permission, or null when it is fine. */
  testBlockedReason: 'ARCHIVED' | 'NO_CREDENTIAL' | 'CREDENTIAL_NOT_PROBEABLE' | null
}

export function erpConnectionControls(
  connection: ErpConnectionDto,
  access: ErpConnectionAccess,
): ErpConnectionControls {
  const mutable = acceptsChanges(connection.state)
  return {
    canEdit: access.manage && mutable,
    canConfigureCredential: access.credential && mutable,
    canMarkReady: access.manage && canTransitionTo(connection.state, 'READY'),
    canDisable: access.manage && canTransitionTo(connection.state, 'DISABLED'),
    canArchive: access.manage && canTransitionTo(connection.state, 'ARCHIVED'),
    canTest: access.test && testBlockedReason(connection) === null,
    testBlockedReason: access.test ? testBlockedReason(connection) : null,
  }
}

/**
 * Why a probe would be pointless, from data the server already gave us.
 *
 * Not a re-implementation of the backend's refusal — it still decides, and it still records the
 * verdict. This exists so the screen can say "configure a credential first" instead of offering a
 * button whose only possible answer is `CREDENTIAL_UNAVAILABLE`. The backend's answer is the same
 * either way; the difference is whether the user learns it before or after clicking.
 */
function testBlockedReason(connection: ErpConnectionDto): ErpConnectionControls['testBlockedReason'] {
  if (isTerminal(connection.state)) return 'ARCHIVED'
  if (!connection.credentialConfigured) return 'NO_CREDENTIAL'
  if (
    connection.credentialType !== null &&
    !PROBEABLE_CREDENTIAL_TYPES.includes(connection.credentialType)
  ) {
    // OAUTH2_CLIENT_CREDENTIALS and SSH_PRIVATE_KEY are storable but not probeable: the server
    // refuses them as INVALID_CONFIGURATION rather than sending them as bearer tokens. Note the
    // null check above -- a LIST row carries no credentialType, and absence must not read as
    // "not probeable" or every list row would show the wrong reason.
    return 'CREDENTIAL_NOT_PROBEABLE'
  }
  return null
}

/**
 * Whether a credential of this type can be exercised by the probe.
 *
 * Exported for the credential form, which warns before storing one it knows cannot be tested —
 * better than letting a tenant configure OAuth and then discover Test does nothing for them.
 */
export function isProbeableCredentialType(type: ErpCredentialType): boolean {
  return PROBEABLE_CREDENTIAL_TYPES.includes(type)
}

/* ------------------------------------------------------- test verdicts */

/**
 * The i18n key for a test reason code, with a fallback for codes we have never heard of.
 *
 * The backend's `last_test_reason_code` column carries no CHECK constraint, so a future release
 * can add a code without a migration. A screen that switched exhaustively over today's ten would
 * render blank for the eleventh; this returns a generic key and lets the caller show the raw code
 * beside it, which is safe because the vocabulary is the server's own closed set and never a
 * remote message.
 */
export function testReasonKey(reason: ErpConnectionTestReason | null): string {
  if (reason === null) return 'erp.connections.test.reason.unknown'
  return KNOWN_REASONS.has(reason)
    ? `erp.connections.test.reason.${reason}`
    : 'erp.connections.test.reason.unknown'
}

export function isKnownTestReason(reason: string): boolean {
  return KNOWN_REASONS.has(reason)
}

const KNOWN_REASONS = new Set<string>([
  'SUCCESS',
  'ENDPOINT_NOT_ALLOWED',
  'DNS_FAILURE',
  'CONNECTION_TIMEOUT',
  'TLS_FAILURE',
  'AUTHENTICATION_REJECTED',
  'REMOTE_UNAVAILABLE',
  'UNSUPPORTED_RESPONSE',
  'INVALID_CONFIGURATION',
  'CREDENTIAL_UNAVAILABLE',
])

/* ------------------------------------------------------------- refusals */

/**
 * The backend's ERP refusal codes, which arrive as the problem document's `code`.
 *
 * Distinguished rather than collapsed into one "conflict" toast, because they call for three
 * different actions: a version conflict needs a reload, a duplicate name needs a different name,
 * and an invalid transition means the screen is showing a state the connection has left.
 */
export type ErpRefusal =
  | 'VERSION_CONFLICT'
  | 'NAME_DUPLICATE'
  | 'TRANSITION_INVALID'
  | 'NOT_READY_COMPLETE'
  | 'VALUE_INVALID'
  | 'ENDPOINT_INVALID'
  | 'CONFIGURATION_INVALID'
  | 'CREDENTIAL_ENCRYPTION_UNAVAILABLE'
  | 'NOT_FOUND'

const REFUSAL_BY_CODE: Record<string, ErpRefusal> = {
  CONNECTION_VERSION_CONFLICT: 'VERSION_CONFLICT',
  CONNECTION_NAME_DUPLICATE: 'NAME_DUPLICATE',
  CONNECTION_TRANSITION_INVALID: 'TRANSITION_INVALID',
  CONNECTION_NOT_READY_COMPLETE: 'NOT_READY_COMPLETE',
  CONNECTION_VALUE_INVALID: 'VALUE_INVALID',
  // Split from CONFIGURATION_INVALID: one code for the address and the transport-settings
  // document meant a URL carrying a password was answered with a sentence about JSON settings,
  // pointing the reader at the wrong field (browser gate, 24 September 2026).
  CONNECTION_ENDPOINT_INVALID: 'ENDPOINT_INVALID',
  CONNECTION_CONFIGURATION_INVALID: 'CONFIGURATION_INVALID',
  CREDENTIAL_ENCRYPTION_UNAVAILABLE: 'CREDENTIAL_ENCRYPTION_UNAVAILABLE',
  CONNECTION_NOT_FOUND: 'NOT_FOUND',
}

export function erpRefusalOf(error: unknown): ErpRefusal | null {
  if (!(error instanceof ApiError)) return null
  if (error.code !== null && REFUSAL_BY_CODE[error.code] !== undefined) {
    return REFUSAL_BY_CODE[error.code]
  }
  // No recognised code. A bare 409 is still a concurrency problem in this module's contract --
  // the only three conflicts the server raises are version, name and transition -- so reload is
  // the right advice rather than a generic failure.
  if (error.status === 409) return 'VERSION_CONFLICT'
  return null
}

/** The i18n key for an ERP refusal, or null when the caller should fall back to the generic one. */
export function erpRefusalKey(error: unknown): string | null {
  const refusal = erpRefusalOf(error)
  return refusal === null ? null : `erp.connections.refusal.${refusal}`
}

/**
 * Whether a refusal means the screen's copy of the connection is out of date.
 *
 * Both of these leave the user looking at something that has moved: a version conflict by
 * definition, and an invalid transition because the only way to ask for an impossible move from a
 * UI that renders the real arrows is to be looking at a stale state.
 */
export function needsReload(error: unknown): boolean {
  const refusal = erpRefusalOf(error)
  return refusal === 'VERSION_CONFLICT' || refusal === 'TRANSITION_INVALID'
}
