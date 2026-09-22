import { apiRequest } from '../client'
import { withQuery } from '../query'

/**
 * The compliance ledger (`ComplianceActivityController`) — what happened to each document on the
 * two legs it travels.
 *
 * **Vocabulary is the server's and is load-bearing.** Snake case on the wire; the identifier is
 * `invoice_uuid` and never a "Fawtara reference"; and the two legs are never merged, because
 * they are acknowledgements from different parties about different things.
 *
 * **An ack is transport, not tax.** `MlsAck` states it outright: no value here is an OTA tax
 * verdict — C5 validates a TDD against the Schematron "and not for Tax compliance" (SA v1.0.3
 * §7.1.2), and the OTA has no channel back to the Service Provider (OTA FAQ 2026-08-31 §3.3 Q1).
 * Nothing built on this may report a tax authority's judgement, because none is received.
 *
 * **`NONE` is silence, not rejection.** SPOG v1.0.0 §6.2 forbids resending "solely because no MLS
 * has been received", so nothing may present NONE as a failure or offer to resend on the strength
 * of it. It is the state every document is in until C3 or C5 speaks.
 */

export const ACTIVITY_PATH = '/v1/compliance/activity'

/** As the Peppol MLS v1.1.0 code list has it, plus the honest absence. */
export type MlsAckDto =
  /** Delivered towards C4/C6 with confirmation. */
  | 'AP'
  /** Delivered without confirmation. */
  | 'AB'
  /** Rejected, or delivery failed. */
  | 'RE'
  /** No MLS has been recorded for this leg. Not a failure. */
  | 'NONE'

export type ActivityDirectionDto = 'ISSUED' | 'RECEIVED'

export type LegDto = { ack: MlsAckDto; ack_at: string | null; reason: string | null }

export type TddLegDto = {
  variant: string
  status: string
  validated_at: string | null
  /** When the PASR Annex A clock runs out for this document. */
  sla_deadline: string | null
  submitted_at: string | null
  /** Null while the deadline has not passed and nothing has been submitted. */
  sla_met: boolean | null
  ack: MlsAckDto
  ack_at: string | null
  reason: string | null
}

/** `resubmit` is present only when the server judges one possible — never inferred here. */
export type ActivityLinksDto = { document: string | null; tdd_xml: string | null; resubmit: string | null }

export type ActivityItemDto = {
  invoice_uuid: string
  direction: ActivityDirectionDto
  document_kind: string | null
  document_type_code: string | null
  invoice_number: string | null
  counterparty: string | null
  occurred_at: string
  validated_at: string | null
  b2c: boolean
  transport_state: string | null
  /** The receiving Access Point's acknowledgement (C3). */
  invoice_leg: LegDto
  /** The tax authority endpoint's acknowledgement of the TDD (C5). Null when none is owed. */
  tdd_leg: TddLegDto | null
  attention: boolean
  links: ActivityLinksDto
}

export type ActivityListDto = {
  items: ActivityItemDto[]
  page: number
  page_size: number
  has_more: boolean
}

export type AckCountsDto = { ap: number; ab: number; re: number; none: number }

/** No rates on the wire: the screen divides, and zero stays zero. */
export type ActivitySummaryDto = {
  from: string | null
  to: string | null
  documents: number
  tdd_ack: AckCountsDto
  invoice_ack: AckCountsDto
  dead_lettered: number
  attention: number
  sla: { met: number; missed: number; pending: number }
  median_minutes_to_tdd_ack: number | null
}

export type TddObligationDto = {
  id: string
  variant: string
  status: string
  validated_at: string | null
  sla_deadline: string | null
  submitted_at: string | null
  sla_met: boolean | null
  failure_reason: string | null
  transmission_id: string | null
  tdd_uuid: string | null
}

export type MlsRecordDto = {
  channel: string
  ack: MlsAckDto
  received_at: string | null
  sender: string | null
  sbdh_instance_identifier: string | null
  reason: string | null
}

export type ActivityDetailDto = {
  invoice_uuid: string
  summary: ActivityItemDto
  /** Oldest first, so the TDT-006 story reads top to bottom. */
  tdd_lineage: TddObligationDto[]
  mls: MlsRecordDto[]
  transmissions: unknown[]
}

export type ActivityFilters = {
  direction?: ActivityDirectionDto | ''
  attention?: 'true' | ''
  tddAck?: MlsAckDto | ''
  invoiceAck?: MlsAckDto | ''
  tddStatus?: string
  documentKind?: string
  invoiceNumber?: string
  from?: string
  to?: string
}

export const ACTIVITY_PAGE_SIZE = 25

/**
 * The ledger as a file — the compliance evidence a tenant is actually asked for.
 *
 * Deliberately NOT an export of `/reports/compliance`: that is four counts and a median, and a
 * download of it proves nothing about individual documents. This is one row per document, and it
 * carries the same filters the screen is showing so the file and the page cannot disagree.
 *
 * `reports.read`, not the activity permission — it lives under `/reports`, where the other exports
 * are. The server caps it at 10,000 rows and says so through `X-Fawtir-Export-Truncated`; a file
 * that stopped short without saying so would be worse evidence than none.
 */
export function ledgerExportPath(filters: ActivityFilters, format: 'csv' | 'xlsx') {
  return withQuery(`/v1/reports/ota.${format}`, {
    direction: filters.direction || null,
    attention: filters.attention || null,
    tdd_ack: filters.tddAck || null,
    invoice_ack: filters.invoiceAck || null,
    tdd_status: filters.tddStatus || null,
    document_kind: filters.documentKind || null,
    invoice_number: filters.invoiceNumber || null,
    from: filters.from || null,
    to: filters.to || null,
  })
}

export function activityListPath(filters: ActivityFilters, page: number, pageSize = ACTIVITY_PAGE_SIZE) {
  return withQuery(ACTIVITY_PATH, {
    direction: filters.direction || null,
    attention: filters.attention || null,
    tdd_ack: filters.tddAck || null,
    invoice_ack: filters.invoiceAck || null,
    tdd_status: filters.tddStatus || null,
    document_kind: filters.documentKind || null,
    invoice_number: filters.invoiceNumber || null,
    from: filters.from || null,
    to: filters.to || null,
    page,
    page_size: pageSize,
  })
}

export function loadActivityList(path: string): Promise<ActivityListDto> {
  return apiRequest<ActivityListDto>(path)
}

export function activitySummaryPath(from?: string, to?: string) {
  return withQuery(`${ACTIVITY_PATH}/summary`, { from: from || null, to: to || null })
}

export function loadActivitySummary(path: string): Promise<ActivitySummaryDto> {
  return apiRequest<ActivitySummaryDto>(path)
}

export function activityDetailPath(invoiceUuid: string) {
  return `${ACTIVITY_PATH}/${invoiceUuid}`
}

export function loadActivityDetail(invoiceUuid: string): Promise<ActivityDetailDto> {
  return apiRequest<ActivityDetailDto>(activityDetailPath(invoiceUuid))
}

/**
 * Resubmits a TDD, using the href the row carries.
 *
 * The link is only ever present when the server judged a resubmission possible — a rejected TDD
 * leg. Building the URL here instead would let a screen offer one on silence, which SPOG §6.2
 * forbids. Needs `invoice.submit`.
 */
export function resubmitTdd(href: string): Promise<unknown> {
  const path = href.startsWith('/api/') ? href.slice('/api'.length) : href
  return apiRequest<unknown>(path, { method: 'POST' })
}
