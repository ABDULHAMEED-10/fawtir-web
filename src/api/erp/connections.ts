import { apiRequest } from '../client'
import { withQuery } from '../query'

/**
 * ERP connections (`ErpConnectionController`; Phase 2 Steps 6–9).
 *
 * A connection names an external system Fawtir will read tax-document source data from, and holds
 * the credential it authenticates with. Nine endpoints behind four separate permissions:
 *
 * - `erp.connection.read` — {@link listErpConnections}, {@link getErpConnection}
 * - `erp.connection.manage` — {@link createErpConnection}, {@link updateErpConnection}, and the
 *   three lifecycle actions
 * - `erp.credential.replace` — {@link storeErpCredential}
 * - `erp.connection.test` — {@link testErpConnection}
 *
 * All four are human-only: the backend refuses them to any API key at issue and at rotation, so
 * there is no machine caller to design for here.
 *
 * **The backend is authoritative for everything this module does not compute.** Validation, the
 * state machine, optimistic concurrency, credential encryption, readiness and — above all — the
 * SSRF destination policy are the server's. Nothing here re-implements any of them, and in
 * particular nothing here ever contacts a tenant's ERP: {@link testErpConnection} asks Fawtir to
 * do it. A browser reaching the endpoint itself would bypass the whole address policy and leak
 * the tenant's network shape to whoever is looking at the developer console.
 *
 * **Secrets are write-only.** {@link storeErpCredential} sends one, and no response type in this
 * file has a field that could carry one back. There is no read endpoint for credential material
 * and there will not be.
 */

const BASE = '/v1/erp/connections'

/* ------------------------------------------------------------------- enums */

/** `ErpConnectionState`. There is deliberately no ACTIVE; see the backend enum. */
export type ErpConnectionState = 'DRAFT' | 'READY' | 'DISABLED' | 'ARCHIVED'

/** `ErpConnectionMode`. Fixed at creation and never editable. */
export type ErpConnectionMode = 'MANAGED_PULL' | 'BRIDGE_UPLOAD' | 'API_PUSH'

/**
 * `ErpTransportType`. Three values, and the backend accepts no others.
 *
 * This previously read `REST | JDBC | FILE | SOAP`, which was wrong in both directions: FILE and SOAP
 * are not on the backend enum, so the create and edit forms offered two choices the server answers
 * 400 to, and SFTP was missing, so a connection carrying it had no label to render.
 */
export type ErpTransportType = 'REST' | 'JDBC' | 'SFTP'

/**
 * The transports a tenant may CHOOSE — deliberately narrower than the contract.
 *
 * Only REST has an adapter. `ExtractionSourcePort.supports` answers false for the other two, and
 * extraction settings address responses with JSON Pointers, which no other transport can satisfy, so
 * the extraction endpoints refuse them outright with EXTRACTION_TRANSPORT_UNSUPPORTED. Offering JDBC
 * or SFTP would let a tenant build a connection that reads as fully configured and can never run.
 *
 * The full enum stays in the type because a stored connection may hold any of the three and must
 * still display. {@link ErpTransportType} is the contract; this is the offer.
 */
export const SELECTABLE_TRANSPORTS: readonly ErpTransportType[] = ['REST']

/** `ErpCredentialType`, all four values the database admits. */
export type ErpCredentialType =
  | 'BASIC_AUTH'
  | 'API_TOKEN'
  | 'OAUTH2_CLIENT_CREDENTIALS'
  | 'SSH_PRIVATE_KEY'

/**
 * The credential kinds the Test Connection probe can actually exercise.
 *
 * The other two are storable but not probeable — the backend answers
 * `INVALID_CONFIGURATION` rather than sending an SSH key as a bearer token. A screen offering
 * "Test" against one of those would be promising something the platform refuses, so it says so
 * instead.
 */
export const PROBEABLE_CREDENTIAL_TYPES: readonly ErpCredentialType[] = ['BASIC_AUTH', 'API_TOKEN']

/** `ConnectionTestOutcome`, the two values `ck_erp_connection_test_outcome` admits. */
export type ErpConnectionTestOutcome = 'SUCCESS' | 'FAILURE'

/**
 * `ErpConnectionTestReason`. A closed vocabulary defined by the backend, never a remote message.
 *
 * Typed as the known set *or* a bare string on purpose: the column carries no CHECK constraint,
 * so a future backend release can add a code without a migration, and a screen that narrowed this
 * to a union would fail to render the new one rather than falling back. See
 * `describeTestReason` for the fallback.
 */
export type ErpConnectionTestReason =
  | 'SUCCESS'
  | 'ENDPOINT_NOT_ALLOWED'
  | 'DNS_FAILURE'
  | 'CONNECTION_TIMEOUT'
  | 'TLS_FAILURE'
  | 'AUTHENTICATION_REJECTED'
  | 'REMOTE_UNAVAILABLE'
  | 'UNSUPPORTED_RESPONSE'
  | 'INVALID_CONFIGURATION'
  | 'CREDENTIAL_UNAVAILABLE'
  | (string & {})

/* --------------------------------------------------------------- responses */

/**
 * `ErpConnectionResponses.ConnectionResponse`.
 *
 * `credentialType`, `credentialHint` and `credentialRotatedAt` are null on the list surface and
 * populated only on a single-connection read — the server does one metadata query for a detail and
 * none for a list, deliberately, so a list of connections is one query rather than one per row.
 * A screen must therefore not expect them from {@link listErpConnections}.
 *
 * There is no ciphertext, no envelope and no secret here, and not because a mapper skips them:
 * the server's own response record has no component that could carry one.
 */
export type ErpConnectionDto = {
  id: string
  name: string
  sourceSystem: string
  sourceVersion: string | null
  connectionMode: ErpConnectionMode
  transportType: ErpTransportType | null
  endpoint: string | null
  configuration: string | null
  state: ErpConnectionState
  credentialConfigured: boolean
  /** Detail read only. */
  credentialType: ErpCredentialType | null
  /** Detail read only. Caller-supplied non-secret label, never derived from the secret. */
  credentialHint: string | null
  /** Detail read only. Null on a first configuration, set when one replaced another. */
  credentialRotatedAt: string | null
  lastTestedAt: string | null
  lastTestOutcome: ErpConnectionTestOutcome | null
  lastTestReasonCode: ErpConnectionTestReason | null
  /** What a mutation must echo back as `expectedVersion`. */
  version: number
  createdAt: string
  updatedAt: string
  /**
   * List read only (backend Phase 6): the row's health, read for every row in a fixed number of
   * server statements, so a screen never asks for one status per connection. Absent on a detail
   * read and from a server that predates it.
   */
  health?: ConnectionHealthDto
}

/**
 * `ErpConnectionResponses.ConnectionHealthResponse`. `extractionStatus` is the headline the
 * channel's own status endpoint gives, decided by the same server code; null for a connection
 * that is not MANAGED_PULL and when `extractionReadable` is false. `lastCompletedRunAt` and
 * `lastFailedRunAt` are looked for among the newest 1000 runs: null means "not among them".
 */
export type ConnectionHealthDto = {
  connectionMode: ErpConnectionMode
  extractionStatus: string | null
  extractionReadable: boolean
  extractionConfigured: boolean
  extractionEnabled: boolean
  nextRunAt: string | null
  consecutiveFailures: number
  backoffUntil: string | null
  lastRunId: string | null
  lastRunState: string | null
  lastRunStartedAt: string | null
  lastRunCompletedAt: string | null
  lastFailureReason: string | null
  lastCompletedRunAt: string | null
  lastFailedRunAt: string | null
  lastTestedAt: string | null
  lastTestOutcome: string | null
}

/** `ErpConnectionResponses.ConnectionListResponse`. Whole, not paged: a tenant has a handful. */
export type ErpConnectionListDto = {
  connections: ErpConnectionDto[]
  total: number
  includesArchived: boolean
}

/** `ErpConnectionResponses.CredentialResponse`. Metadata only — there is no field for the secret. */
export type ErpCredentialDto = {
  id: string
  credentialType: ErpCredentialType
  hint: string | null
  rotatedAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * `ErpConnectionResponses.ConnectionTestResponse`.
 *
 * Nothing that came off the wire: no body, status line, headers, challenge, certificate,
 * exception text or resolved address, and no indication of which destination rule refused an
 * endpoint. `verdictPersisted` is false when the connection was edited while the probe was in
 * flight, so the result describes a configuration that is no longer current and was not written
 * to the row.
 */
export type ErpConnectionTestDto = {
  success: boolean
  outcome: ErpConnectionTestOutcome
  reasonCode: ErpConnectionTestReason
  latencyMs: number
  verdictPersisted: boolean
}

/* ---------------------------------------------------------------- requests */

/** `CreateConnectionRequest`. Always produces a DRAFT; the state cannot be asked for. */
export type CreateErpConnectionRequest = {
  name: string
  sourceSystem: string
  sourceVersion?: string | null
  connectionMode: ErpConnectionMode
  transportType?: ErpTransportType | null
  endpoint?: string | null
  configuration?: string | null
}

/**
 * `UpdateConnectionRequest`.
 *
 * `sourceSystem` and `connectionMode` are absent because the server does not accept them: changing
 * either does not modify a connection so much as describe a different one, and repurposing the row
 * would carry its test history and audit trail onto a system that never produced them. Archive and
 * create instead.
 *
 * `expectedVersion` is required, not optional. An update that omits it is an update that has not
 * read the row.
 */
export type UpdateErpConnectionRequest = {
  name: string
  sourceVersion?: string | null
  transportType?: ErpTransportType | null
  endpoint?: string | null
  configuration?: string | null
  expectedVersion: number
}

/** `StoreCredentialRequest`. **Secret-bearing**; see {@link storeErpCredential}. */
export type StoreErpCredentialRequest = {
  credentialType: ErpCredentialType
  secret: string
  hint?: string | null
  expectedVersion: number
}

/* --------------------------------------------------------------- endpoints */

/** Requires `erp.connection.read`. ARCHIVED is excluded unless asked for. */
export function listErpConnections(includeArchived = false): Promise<ErpConnectionListDto> {
  return apiRequest<ErpConnectionListDto>(withQuery(BASE, { includeArchived }))
}

/** Requires `erp.connection.read`. Another tenant's id answers 404, as an unknown one does. */
export function getErpConnection(connectionId: string): Promise<ErpConnectionDto> {
  return apiRequest<ErpConnectionDto>(`${BASE}/${encodeURIComponent(connectionId)}`)
}

/** Requires `erp.connection.manage`. Answers 201 with the new DRAFT. */
export function createErpConnection(
  request: CreateErpConnectionRequest,
): Promise<ErpConnectionDto> {
  return apiRequest<ErpConnectionDto>(BASE, { method: 'POST', body: request })
}

/** Requires `erp.connection.manage`. 409 on a stale `expectedVersion` or a duplicate name. */
export function updateErpConnection(
  connectionId: string,
  request: UpdateErpConnectionRequest,
): Promise<ErpConnectionDto> {
  return apiRequest<ErpConnectionDto>(`${BASE}/${encodeURIComponent(connectionId)}`, {
    method: 'PUT',
    body: request,
  })
}

/** The three lifecycle moves. Each requires `erp.connection.manage` and the current version. */
export type ErpLifecycleAction = 'ready' | 'disable' | 'archive'

export function transitionErpConnection(
  connectionId: string,
  action: ErpLifecycleAction,
  expectedVersion: number,
): Promise<ErpConnectionDto> {
  return apiRequest<ErpConnectionDto>(
    `${BASE}/${encodeURIComponent(connectionId)}/${action}`,
    { method: 'POST', body: { expectedVersion } },
  )
}

/**
 * Requires `erp.credential.replace`. **Write-only.**
 *
 * The same call serves the first configuration and every replacement — the caller should not have
 * to know which, and getting it wrong is how a superseded secret is left behind. The server stores
 * the new envelope, repoints the connection and deletes the old row in one transaction.
 *
 * The `secret` travels in the request body over TLS and is returned by nothing. A caller must not
 * keep it after this resolves: see `ConnectionCredentialForm`, which clears the field on success.
 */
export function storeErpCredential(
  connectionId: string,
  request: StoreErpCredentialRequest,
): Promise<ErpCredentialDto> {
  return apiRequest<ErpCredentialDto>(
    `${BASE}/${encodeURIComponent(connectionId)}/credential`,
    { method: 'PUT', body: request },
  )
}

/**
 * Requires `erp.connection.test`. Asks **Fawtir** to probe the endpoint.
 *
 * No request body and no `expectedVersion`: testing changes no configuration, so there is nothing
 * for a caller to assert it has read. The server re-checks the version it loaded before writing the
 * verdict, which is what `verdictPersisted` reports.
 *
 * Answers 200 with a verdict even when the probe failed or the destination was refused — those are
 * answers about the connection, not faults in the request. 404 still means no such connection in
 * this tenant and 403 means the caller lacks the permission.
 *
 * **The browser must never contact the tenant's ERP itself.** The destination policy, the address
 * pinning, the redirect refusal and the bounded timeouts all live server-side; a browser-side
 * "quick check" would have none of them and would run from the operator's own network.
 */
export function testErpConnection(connectionId: string): Promise<ErpConnectionTestDto> {
  return apiRequest<ErpConnectionTestDto>(
    `${BASE}/${encodeURIComponent(connectionId)}/test`,
    { method: 'POST' },
  )
}
