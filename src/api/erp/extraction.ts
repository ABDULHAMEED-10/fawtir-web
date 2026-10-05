import { apiRequest } from '../client'

/**
 * MANAGED_PULL extraction: configuration, sample fetch, production enablement and status.
 *
 * Four endpoints under the connection resource, behind three permissions the backend already
 * defines — no new one exists for any of this:
 *
 * - `erp.connection.read` — {@link getExtractionSettings}, {@link getExtractionStatus}
 * - `erp.connection.manage` — {@link putExtractionSettings}, {@link putExtractionEnablement}
 * - `erp.connection.test` — {@link fetchExtractionSample}
 *
 * **The backend is authoritative for every rule here**, and this module re-implements none of them:
 * which pointers a cursor kind requires, whether a mapping is certified, whether a connection may be
 * activated, and above all the status precedence. A screen that recomputed status from these fields
 * would drift from the server the first time the order changed.
 *
 * **Nothing here contacts a tenant's ERP.** {@link fetchExtractionSample} asks Fawtir to do it, for
 * the reason the connections client states about Test Connection: a browser reaching the endpoint
 * itself would bypass the destination policy entirely and leak the tenant's network shape into a
 * developer console.
 *
 * **No credential field exists on any type in this file**, request or response. Credentials live
 * behind `PUT /connections/{id}/credential` and are write-only there.
 */

const BASE = '/v1/erp/connections'

const extractionPath = (connectionId: string, suffix = '') =>
  `${BASE}/${encodeURIComponent(connectionId)}/extraction${suffix}`

/* ------------------------------------------------------------------- enums */

/**
 * `ExtractionCursorKind`. TIMESTAMP and SEQUENCE are *derived* — the cursor advances to a value a
 * recorded document carried, so they require `documentCursorPointer`. CONTINUATION_TOKEN and
 * PAGE_TOKEN are *opaque* — only the page envelope knows how to continue, so they require
 * `nextCursorPointer` and forbid `documentCursorPointer`.
 *
 * The backend enforces that pairing; this type only names the four values.
 */
export type ExtractionCursorKind = 'TIMESTAMP' | 'SEQUENCE' | 'CONTINUATION_TOKEN' | 'PAGE_TOKEN'

export const EXTRACTION_CURSOR_KINDS: readonly ExtractionCursorKind[] = [
  'TIMESTAMP',
  'SEQUENCE',
  'CONTINUATION_TOKEN',
  'PAGE_TOKEN',
]

/** Cursor kinds that read their next value from a document rather than the page envelope. */
export function isDerivedCursorKind(kind: ExtractionCursorKind): boolean {
  return kind === 'TIMESTAMP' || kind === 'SEQUENCE'
}

/**
 * `ExtractionStatus`, in the backend's own precedence order.
 *
 * The order matters and is the server's: the first five say the channel will not do useful work and
 * name the one thing to fix, the last four describe a channel that is operating. Notably
 * DISABLED_BY_OPERATOR sits ABOVE MAPPING_NOT_CERTIFIED (somebody switched it off deliberately, so a
 * certification gap is not why it is idle) and MAPPING_NOT_CERTIFIED sits ABOVE RUNNING (a run whose
 * every document is being refused is true about the wrong thing).
 *
 * This list is for exhaustiveness checking only. **Nothing in the frontend recomputes it.**
 */
export type ExtractionStatusCode =
  | 'GLOBALLY_DISABLED'
  | 'NOT_CONFIGURED'
  | 'CONNECTION_NOT_READY'
  | 'DISABLED_BY_OPERATOR'
  | 'MAPPING_NOT_CERTIFIED'
  | 'RUNNING'
  | 'BACKOFF'
  | 'FAILED_LAST_RUN'
  | 'WAITING'

/** `ExtractionRunState`. */
export type ExtractionRunState =
  | 'CREATED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'COMPLETED_WITH_ERRORS'
  | 'FAILED'
  | 'CANCELLED'

/** `ExtractionRejectionStage` — where a failed run broke. */
export type ExtractionFailureStage = 'SOURCE' | 'MAPPING' | 'INVOICE_VALIDATION' | 'SUBMISSION'

/* ---------------------------------------------------------------- responses */

/**
 * `ExtractionResponse`, returned by the settings GET and PUT and by the enablement PUT.
 *
 * `configured` false is the ordinary state of a new connection — the backend answers 200 with a flag
 * rather than 404, because the connection itself exists.
 *
 * Two cadence fields, and the difference is the point: `configuredInterval` is what the tenant asked
 * for, `effectiveCadence` is what the scheduler will use after clamping into its permitted band. A
 * screen that showed only the first would confirm something untrue.
 *
 * `version` is the CONNECTION's version, to be sent back as `expectedVersion`. There is no separate
 * version for this sub-resource.
 */
export type ExtractionSettingsDto = {
  configured: boolean
  enabled: boolean
  configuredInterval: string | null
  effectiveCadence: string | null
  documentsPointer: string | null
  documentIdPointer: string | null
  documentVersionPointer: string | null
  cursorKind: ExtractionCursorKind | null
  cursorParameter: string | null
  nextCursorPointer: string | null
  documentCursorPointer: string | null
  pageSizeParameter: string | null
  initialCursor: string | null
  transactionType: string | null
  /**
   * Where each document carries its issue time (IBT-168). Null on a connection saved before the field
   * existed: the server refuses to enable such a channel and reports it NOT_CONFIGURED while it stays
   * enabled from earlier. Never defaulted by the server, so never defaulted here.
   */
  documentIssueTimePointer: string | null
  /** Derived, not authored: false means the channel re-reads the same window and never advances. */
  supportsResume: boolean
  version: number
}

/**
 * `ExtractionStatusResponse`. Entirely derived server-side from the scheduler property, the
 * connection, the mapping certification, the schedule row and the newest run.
 *
 * `schedulerGloballyEnabled` is reported beside `status` rather than folded into it, so a channel
 * reading GLOBALLY_DISABLED can still be seen to be otherwise ready.
 *
 * `nextRunAt` is null when no schedule row exists yet — reconciliation creates it on a later tick.
 * `backoffUntil` is not stored: while the channel is penalised it IS `nextRunAt`, and null otherwise.
 * `lastFailureReason` is a closed enum name, never free text.
 */
export type ExtractionStatusDto = {
  status: ExtractionStatusCode
  schedulerGloballyEnabled: boolean
  configured: boolean
  enabled: boolean
  connectionState: 'DRAFT' | 'READY' | 'DISABLED' | 'ARCHIVED'
  effectiveCadence: string | null
  nextRunAt: string | null
  consecutiveFailures: number
  backoffUntil: string | null
  lastRunId: string | null
  lastRunState: ExtractionRunState | null
  lastRunStartedAt: string | null
  lastRunCompletedAt: string | null
  lastRunDiscovered: number
  lastRunAccepted: number
  lastRunRejected: number
  lastRunDuplicates: number
  lastFailureReason: string | null
  lastFailureStage: ExtractionFailureStage | null
  lastFailureRetryable: boolean | null
}

/**
 * `ExtractionSampleResponse` — one document as the source handed it over.
 *
 * `payload` is the source's own bytes as text, **unparsed and unreformatted**. The backend returns it
 * that way deliberately: the tenant's mapping is the only thing that should interpret it, and a
 * preview built from a reformatted copy could disagree with what production feeds the mapping. So a
 * caller may render it prettily, but must pass THIS value to the mapping preview.
 */
export type ExtractionSampleDto = {
  externalDocumentId: string | null
  externalVersion: string | null
  mediaType: string | null
  cursorCandidate: string | null
  payload: string
  payloadBytes: number
  latencyMs: number
  fetchedAt: string
}

/* ---------------------------------------------------------------- requests */

/**
 * `UpdateExtractionRequest`. Every field is one the extraction runtime reads, and there are no
 * others — there is deliberately no page size, because page size is a platform bound and
 * `pageSizeParameter` only names the query parameter it travels in.
 *
 * `enabled` exists for backward compatibility. **Use {@link putExtractionEnablement} to activate**:
 * this request carries the whole settings document, so using it as the production toggle risks
 * reverting a configuration edit somebody made a moment earlier.
 */
export type UpdateExtractionSettingsRequest = {
  enabled: boolean
  interval?: string | null
  documentsPointer: string
  documentIdPointer: string
  documentVersionPointer?: string | null
  cursorKind: ExtractionCursorKind
  cursorParameter?: string | null
  nextCursorPointer?: string | null
  documentCursorPointer?: string | null
  pageSizeParameter?: string | null
  initialCursor?: string | null
  transactionType: string
  /**
   * Omitted keeps the stored pointer and an empty string clears it — the server's rule, so that a
   * client written before the field existed cannot erase it by saving.
   */
  documentIssueTimePointer?: string
  expectedVersion: number
}

/** `UpdateExtractionEnablementRequest`. The flag and the connection's version, and nothing else. */
export type UpdateExtractionEnablementRequest = {
  enabled: boolean
  expectedVersion: number
}

/* --------------------------------------------------------------- operations */

/** Requires `erp.connection.read`. 200 with `configured: false` when nothing is configured yet. */
export function getExtractionSettings(connectionId: string): Promise<ExtractionSettingsDto> {
  return apiRequest<ExtractionSettingsDto>(extractionPath(connectionId))
}

/**
 * Requires `erp.connection.manage`. Replaces the extraction settings and nothing else — every
 * unrelated key in the connection's configuration document survives.
 *
 * 400 carries a stable code for the rule that refused it; 409 CONNECTION_VERSION_CONFLICT means the
 * connection moved since `expectedVersion` was read.
 */
export function putExtractionSettings(
  connectionId: string,
  request: UpdateExtractionSettingsRequest,
): Promise<ExtractionSettingsDto> {
  return apiRequest<ExtractionSettingsDto>(extractionPath(connectionId), {
    method: 'PUT',
    body: request,
  })
}

/** Requires `erp.connection.read`. Read-only: it starts nothing and writes nothing. */
export function getExtractionStatus(connectionId: string): Promise<ExtractionStatusDto> {
  return apiRequest<ExtractionStatusDto>(extractionPath(connectionId, '/status'))
}

/**
 * Requires `erp.connection.test` — the same grant as Test Connection, because this is the other
 * operation that makes the platform open an outbound connection to a host the tenant supplied.
 *
 * Fetches ONE document through the production path and writes nothing: no run, no record, no
 * checkpoint, no schedule row, no invoice. Usable before production activation — it needs neither
 * `enabled`, nor the global scheduler, nor a certified mapping, nor a READY connection.
 *
 * Only ever on an explicit operator action: it costs the tenant's ERP a real request.
 */
export function fetchExtractionSample(connectionId: string): Promise<ExtractionSampleDto> {
  return apiRequest<ExtractionSampleDto>(extractionPath(connectionId, '/sample'), {
    method: 'POST',
  })
}

/**
 * Requires `erp.connection.manage`. Turns production extraction on or off, changing nothing else.
 *
 * Enabling requires the connection to be READY and the tenant's mapping to be certified for exactly
 * what this channel submits — 400 EXTRACTION_CONNECTION_NOT_READY or
 * EXTRACTION_MAPPING_NOT_CERTIFIED otherwise. Disabling requires neither, so a channel whose
 * certification was retired can always be switched off.
 *
 * The global scheduler flag is not a gate: enabling with automation off is stored, and the status
 * endpoint then reports GLOBALLY_DISABLED.
 */
export function putExtractionEnablement(
  connectionId: string,
  request: UpdateExtractionEnablementRequest,
): Promise<ExtractionSettingsDto> {
  return apiRequest<ExtractionSettingsDto>(extractionPath(connectionId, '/enablement'), {
    method: 'PUT',
    body: request,
  })
}
