import { apiRequest } from '../client'
import { fromSnakePage, type Page, type SnakePage } from '../page'
import { withQuery } from '../query'

/**
 * The ERP reporting routes (`ExtractionRunReportController`, `SourceDocumentReportController`).
 *
 * **Every read needs `invoice.read`**, not the connection permissions: a run is a record of
 * documents entering the invoice ledger (backend Phase 3B decision D1). No route here writes
 * anything, and the backend exposes no replay or recovery action, so nothing in this file may
 * either.
 *
 * **No tenant parameter exists.** The tenant is the caller's, read from the session; a run or
 * record id of another tenant answers 404.
 *
 * **The dimensions are the ledgers' own.** `processing_state`, `reason_code`, `delivery_state`,
 * the route, the tax status and the recipient's answer are separate fields because they are
 * separate facts. `display_status` is one word the server derives from them for a badge; it is
 * never the only thing a screen shows and nothing here branches on it.
 */

const RUNS = '/v1/erp/extraction/runs'
const DOCUMENTS = '/v1/erp/source-documents'

/** `ReportPage`: no total, by design — a total over a filtered ledger is a second full query. */
export const REPORT_PAGE_SIZE = 20
/** `ReportPaging`: deeper pages are refused (400); older entries are reached by narrowing the window. */
export const REPORT_MAX_PAGE = 500
/** `SourceDocumentReportQuery.MAX_WINDOW`: a year and a day, so two dates a year apart pass. */
export const REPORT_MAX_WINDOW_DAYS = 367
/** `SourceValidationFinding.MAX_FINDINGS`. */
export const MAX_VALIDATION_FINDINGS = 50
/** `SourceDocumentTimeline.AUDIT_EVENT_LIMIT`: the newest audit events read for one document. */
export const TIMELINE_AUDIT_EVENT_LIMIT = 200

export const SOURCE_KINDS = ['MANAGED_PULL', 'BRIDGE_UPLOAD', 'API_PUSH'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

export const RUN_STATES = [
  'CREATED',
  'RUNNING',
  'COMPLETED',
  'COMPLETED_WITH_ERRORS',
  'FAILED',
  'CANCELLED',
] as const
export type RunState = (typeof RUN_STATES)[number]

export const PROCESSING_STATES = [
  'DISCOVERED',
  'CLAIMED',
  'ACCEPTED',
  'REJECTED',
  'DUPLICATE',
  'FAILED',
] as const
export type ProcessingState = (typeof PROCESSING_STATES)[number]

/** `SubmissionState`, unrenamed. Read with the route: off the network it is not a delivery fact. */
export const DELIVERY_STATES = [
  'QUEUED',
  'SENDING',
  'SENT',
  'DELIVERED',
  'DELIVERED_UNCONFIRMED',
  'UNDELIVERABLE',
  'C4_UNREACHABLE',
] as const
export type DeliveryState = (typeof DELIVERY_STATES)[number]

export const FAILURE_REASONS = [
  'SOURCE_UNAVAILABLE',
  'SOURCE_TIMEOUT',
  'SOURCE_AUTHENTICATION_REJECTED',
  'INFRASTRUCTURE_ERROR',
  'ATTEMPTS_EXHAUSTED',
  'SOURCE_PAYLOAD_UNREADABLE',
  'DUPLICATE_SOURCE_RECORD',
  'MAPPING_PROFILE_ABSENT',
  'MAPPING_FAILED',
  'MAPPING_NOT_CERTIFIED',
  'INVOICE_VALIDATION_FAILED',
] as const
export type FailureReason = (typeof FAILURE_REASONS)[number]

export type RejectionStage = 'SOURCE' | 'MAPPING' | 'INVOICE_VALIDATION' | 'SUBMISSION'
export type FailureClass = 'DOCUMENT' | 'READINESS' | 'PLATFORM'

export const DISPLAY_STATUSES = [
  'REJECTED',
  'DUPLICATE',
  'WAITING_FOR_MAPPING',
  'RETRYABLE_FAILURE',
  'PROCESSING',
  'ACCEPTED',
  'SUBMITTED',
  'SENT',
  'DELIVERED_UNCONFIRMED',
  'DELIVERED',
  'OFF_NETWORK',
  'DELIVERY_FAILED',
] as const
export type DisplayStatus = (typeof DISPLAY_STATUSES)[number]

export const RECONCILIATION_LABELS = [
  'RECOVERY_PENDING',
  'WAITING_FOR_MAPPING',
  'RETRYABLE_FAILURE',
  'ACCEPTED_WITHOUT_INVOICE',
  'TRANSPORT_PENDING',
  'RESPONSE_PENDING',
  'DELIVERY_FAILED',
  'TAX_REPORT_ATTENTION',
] as const
export type ReconciliationLabel = (typeof RECONCILIATION_LABELS)[number]

export type DeliveryRoute = 'PEPPOL_NETWORK' | 'OUTSIDE_PEPPOL'
/** `MlsAck`. `NONE` is silence, never a refusal. */
export type RecipientAck = 'AP' | 'AB' | 'RE' | 'NONE'

export const TIMELINE_TYPES = [
  'SOURCE_RECEIVED',
  'SOURCE_CLAIMED',
  'SOURCE_DEFERRED',
  'RECOVERY',
  'SOURCE_REJECTED',
  'SOURCE_DUPLICATE',
  'SOURCE_ACCEPTED',
  'REPLAY',
  'CONFLICT',
  'INVOICE_SUBMITTED',
  'DELIVERY_STATE',
  'RECIPIENT_RESPONSE',
  'TAX_REPORT',
] as const
export type TimelineType = (typeof TIMELINE_TYPES)[number]
export type TimelineOrigin = 'SOURCE_LEDGER' | 'AUDIT_TRAIL' | 'INVOICE_LEDGER'
export type TimelineActor = 'USER' | 'API_KEY' | 'SYSTEM' | 'SUPPORT_USER'

/* --------------------------------------------------------------------- runs */

export type RunCountersDto = {
  discovered: number
  accepted: number
  rejected: number
  duplicate: number
  unsettled: number
}

export type RunDto = {
  run_id: string
  source_kind: SourceKind
  /** `null` for a push or a Bridge upload: they have no connection. */
  connection_id: string | null
  state: RunState
  created_by: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  failure_reason: FailureReason | null
  counters: RunCountersDto
}

/**
 * Where a run's accepted documents stand now, beside the run's own historical counters.
 *
 * `undeliverable` is the ledger's raw count and includes off-network invoices that never failed;
 * `delivery_failed` counts only network invoices that ended undelivered or refused.
 */
export type DownstreamDto = {
  queued: number
  sending: number
  sent: number
  delivered: number
  delivered_unconfirmed: number
  undeliverable: number
  c4_unreachable: number
  without_invoice: number
  total: number
  delivery_failed: number
  off_network: number
}

export type RunDetailDto = { run: RunDto; downstream: DownstreamDto }

export type RunFilters = {
  sourceKind?: SourceKind | ''
  connectionId?: string
  state?: RunState | ''
  /** Inclusive instant. */
  from?: string
  /** Exclusive instant. */
  to?: string
}

export function runListPath(filters: RunFilters, page: number): string {
  return withQuery(RUNS, {
    source_kind: filters.sourceKind,
    connection_id: filters.connectionId,
    state: filters.state,
    from: filters.from,
    to: filters.to,
    page: page > 0 ? page : null,
    page_size: REPORT_PAGE_SIZE,
  })
}

export async function loadRunList(path: string): Promise<Page<RunDto>> {
  return fromSnakePage(await apiRequest<SnakePage<RunDto>>(path))
}

export function runDetailPath(runId: string): string {
  return `${RUNS}/${encodeURIComponent(runId)}`
}

/* ---------------------------------------------------------------- documents */

export type InvoiceLinkDto = {
  submission_id: string | null
  invoice_uuid: string | null
  invoice_number: string | null
  /** The ledger names an invoice whose row is not there. An anomaly, reported and not repaired. */
  missing: boolean
}

export type SourceDocumentDto = {
  record_id: string
  source_kind: SourceKind
  connection_id: string | null
  /** The run that holds the document now, not necessarily the one that first saw it. */
  run_id: string | null
  external_document_id: string
  external_version: string | null
  processing_state: ProcessingState
  reason_code: FailureReason | null
  stage: RejectionStage | null
  failure_class: FailureClass | null
  retryable: boolean
  attempt_count: number
  invoice: InvoiceLinkDto | null
  delivery_state: DeliveryState | null
  display_status: DisplayStatus
  received_at: string
  settled_at: string | null
  updated_at: string
}

export type DeliveryDto = {
  route: DeliveryRoute
  state: DeliveryState
  failure_reason: string | null
  received_at: string | null
  validated_at: string | null
  sent_at: string | null
  delivered_at: string | null
}

export type TaxReportDto = {
  variant: string
  status: string
  validated_at: string | null
  sla_deadline: string | null
  submitted_at: string | null
  sla_met: boolean | null
  obligations: number
}

export type RecipientResponseDto = {
  /** False when no answer can come: the invoice did not go over the network. */
  applicable: boolean
  code: RecipientAck
  received_at: string | null
  responses: number
}

export type TimelineItemDto = {
  at: string
  type: TimelineType
  origin: TimelineOrigin
  /** A closed-vocabulary refinement of `type`, never free text; `null` where the type says all. */
  code: string | null
  actor_type: TimelineActor | null
}

export type ValidationFindingDto = {
  layer: string | null
  rule_id: string | null
  field_path: string | null
  /** A sentence chosen per layer by Fawtir — never the validator's own text. */
  explanation: string | null
}

export type SourceDocumentDetailDto = {
  document: SourceDocumentDto
  max_attempts: number
  delivery: DeliveryDto | null
  tax_report: TaxReportDto | null
  recipient_response: RecipientResponseDto | null
  timeline: { items: TimelineItemDto[]; truncated: boolean }
  validation_findings: { items: ValidationFindingDto[]; truncated: boolean }
}

export type DocumentSort = 'RECEIVED_NEWEST' | 'RECEIVED_OLDEST'

export type DocumentFilters = {
  sourceKind?: SourceKind | ''
  runId?: string
  connectionId?: string
  externalDocumentId?: string
  invoiceNumber?: string
  processingState?: ProcessingState | ''
  reasonCode?: FailureReason | ''
  retryable?: 'true' | 'false' | ''
  deliveryState?: DeliveryState | ''
  from?: string
  to?: string
  sort?: DocumentSort
}

export function documentListPath(filters: DocumentFilters, page: number): string {
  return withQuery(DOCUMENTS, {
    source_kind: filters.sourceKind,
    run_id: filters.runId,
    connection_id: filters.connectionId,
    external_document_id: filters.externalDocumentId,
    invoice_number: filters.invoiceNumber,
    processing_state: filters.processingState,
    reason_code: filters.reasonCode,
    retryable: filters.retryable,
    delivery_state: filters.deliveryState,
    from: filters.from,
    to: filters.to,
    sort: filters.sort === 'RECEIVED_OLDEST' ? filters.sort : null,
    page: page > 0 ? page : null,
    page_size: REPORT_PAGE_SIZE,
  })
}

export async function loadDocumentList(path: string): Promise<Page<SourceDocumentDto>> {
  return fromSnakePage(await apiRequest<SnakePage<SourceDocumentDto>>(path))
}

export function documentDetailPath(recordId: string): string {
  return `${DOCUMENTS}/${encodeURIComponent(recordId)}`
}

/**
 * A window's documents by headline. The six buckets after `received` are mutually exclusive and
 * sum to it; `downstream` breaks down `accepted`, and `events` counts sends, not documents.
 */
export type DocumentSummaryDto = {
  received: number
  accepted: number
  rejected: number
  duplicate: number
  waiting_for_mapping: number
  retryable: number
  processing: number
  downstream: DownstreamDto
  /** From the audit trail, which can miss an event and has none for a managed pull: a floor. */
  events: { replays: number; conflicts: number; completeness: string }
}

/** The summary reads only the window, the channel and the connection — not the list's other filters. */
export function documentSummaryPath(
  filters: Pick<DocumentFilters, 'sourceKind' | 'connectionId' | 'from' | 'to'>,
): string {
  return withQuery(`${DOCUMENTS}/summary`, {
    source_kind: filters.sourceKind,
    connection_id: filters.connectionId,
    from: filters.from,
    to: filters.to,
  })
}

/* ----------------------------------------------------------- reconciliation */

export type ReconciliationFindingDto = { label: ReconciliationLabel; since: string | null }

export type ReconciliationItemDto = {
  record_id: string
  source_kind: SourceKind
  connection_id: string | null
  run_id: string | null
  external_document_id: string
  processing_state: ProcessingState
  reason_code: FailureReason | null
  display_status: DisplayStatus
  invoice: InvoiceLinkDto | null
  delivery_route: DeliveryRoute | null
  delivery_state: DeliveryState | null
  tax_report_status: string | null
  recipient_response_code: RecipientAck | null
  findings: ReconciliationFindingDto[]
  received_at: string
  updated_at: string
}

export type ReconciliationPage = Page<ReconciliationItemDto> & {
  /** Labels the server did not evaluate at all — today `RESPONSE_PENDING`, while no wait is approved. */
  unevaluatedLabels: ReconciliationLabel[]
}

export type ReconciliationFilters = {
  label?: ReconciliationLabel | ''
  sourceKind?: SourceKind | ''
  connectionId?: string
  from: string
  to: string
}

export function reconciliationPath(filters: ReconciliationFilters, page: number): string {
  return withQuery(`${DOCUMENTS}/reconciliation`, {
    label: filters.label,
    source_kind: filters.sourceKind,
    connection_id: filters.connectionId,
    from: filters.from,
    to: filters.to,
    page: page > 0 ? page : null,
    page_size: REPORT_PAGE_SIZE,
  })
}

export async function loadReconciliation(path: string): Promise<ReconciliationPage> {
  const body = await apiRequest<
    SnakePage<ReconciliationItemDto> & { unevaluated_labels?: ReconciliationLabel[] | null }
  >(path)
  return { ...fromSnakePage(body), unevaluatedLabels: body.unevaluated_labels ?? [] }
}
