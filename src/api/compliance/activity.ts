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
  /**
   * TODO(backend): ACTIVITY.md 2.30. Which kind of error the refusal is: INVOICE when the invoice's
   * own content was refused (its totals, the buyer's Peppol ID, a tax category), REPORT when only
   * the TDD was at fault. The TDD carries a full copy of the invoice (TDT-012, IBR-TDD-57), so an
   * INVOICE error is put right with a credit note and a new invoice, never by resending a changed
   * report. Until it arrives the screens classify from the reason and the error code.
   */
  error_kind?: RefusalKindDto | null
  /**
   * True while a RESUBMIT of this document is held for an authorised decision; the server then
   * also leaves `links.resubmit` null, which is what the screens key on. Optional because older
   * backends do not send it. Not drawn: a visible "held" mark would be a design change.
   */
  correction_held?: boolean
}

/** Which kind of error caused a refusal (ACTIVITY.md 2.30). */
export type RefusalKindDto = 'INVOICE' | 'REPORT'

/** TODO(backend): ACTIVITY.md 2.31. The TDD type: S sent, R replacement, D deletion (cancellation). */
export type TddTypeDto = 'S' | 'R' | 'D'

/** TODO(backend): ACTIVITY.md 2.32. The TDD scope: D domestic, IP and INP the two export scopes. */
export type TddScopeDto = 'D' | 'IP' | 'INP'

/** `resubmit` is present only when the server judges one possible — never inferred here. */
export type ActivityLinksDto = {
  document: string | null
  tdd_xml: string | null
  resubmit: string | null
}

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
  /*
   * TODO(backend): the Activity frame (Figma 154:109992) draws these and the ledger does not carry
   * them yet. Optional so today's wire still reads; the row falls back where each is absent. See
   * docs/backend-guides/ACTIVITY.md, section 2.
   */
  /** The document's total including VAT, for "Customer - amount" under the number. */
  amount?: number | null
  currency_code?: string | null
  /** The live TDD's own UUID, printed in the reference column. */
  tdd_uuid?: string | null
  /** The reference Fawtara issues once it takes the report. */
  fawtara_reference?: string | null
  /** The TDD that replaced this one, when this submission was superseded. */
  superseded_by?: string | null
  /** The Peppol scenario: its flow number, and the stand-in ID used when the buyer is not on Peppol. */
  scenario?: { flow: number; stand_in_id: string | null } | null
  /**
   * TODO(backend): ACTIVITY.md 2.25. When a RECEIVED document reached our access point, the
   * receipt date and time the receiving side reports on its TDD (PINT-OM TDOM-04, TDOM-05).
   */
  received_at?: string | null
  /** TODO(backend): ACTIVITY.md 2.26. The other side's Peppol participant ID (`0248:<VAT>`). */
  counterparty_participant_id?: string | null
  /** TODO(backend): ACTIVITY.md 2.27. The document's CustomizationID (its PINT-OM profile). */
  customization_id?: string | null
  /** TODO(backend): ACTIVITY.md 2.31. The live TDD's type (S, or R/D when we replaced or cancelled). */
  tdd_type?: TddTypeDto | null
  /**
   * TODO(backend): ACTIVITY.md 2.32. Our role on the TDD (01 seller, 02 receiver; TDT-010) and the
   * TDD scope code. An export is reported under scope IP or INP, not with a stand-in ID.
   */
  reporter_role?: '01' | '02' | null
  tdd_scope?: TddScopeDto | null
  /** TODO(backend): ACTIVITY.md 2.34. The invoice total VAT amount (IBT-110). */
  tax_amount?: number | null
}

export type ActivityListDto = {
  items: ActivityItemDto[]
  page: number
  page_size: number
  has_more: boolean
}

export type AckCountsDto = { ap: number; ab: number; re: number; none: number }

/**
 * No rates on the wire: the screen divides, and zero stays zero.
 *
 * TODO(backend): ACTIVITY.md 2.33. `tdd_ack` must count the live TDD of each document only: a
 * report we replaced or cancelled (TDD type R or D) is not a rejection, and the Rejected figure
 * and the acceptance rate count only what is live.
 */
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
  /** TODO(backend): the "Superseded" tab's count. */
  superseded?: number
  /** TODO(backend): the same median over the window before, for "down from". */
  previous_median_minutes_to_tdd_ack?: number | null
  /**
   * TODO(backend): ACTIVITY.md 2.35. The period's invoiced total and the VAT reported (the sum of
   * IBT-110 over the reported invoices only), for the compliance report dialog.
   */
  invoiced_total?: number | null
  vat_reported?: number | null
  /**
   * Where each newest TDD stands with the OTA (backend N5b). `tdd_ack.none` only says no MLS came
   * back, which also covers reports never submitted, ones Fawtir stopped and documents owing no
   * report, so "still waiting" and "turned down" are read from here. Optional: an older server
   * does not send it.
   */
  tdd_state?: TddStateCountsDto
}

/** The newest TDD's state, as the summary counts it and the list filters on it. */
export type TddStateDto =
  'NEVER_SUBMITTED' | 'AWAITING_RESPONSE' | 'AUTHORITY_REJECTED' | 'INTERNALLY_STOPPED' | 'ANSWERED'

export type TddStateCountsDto = {
  never_submitted: number
  awaiting_response: number
  authority_rejected: number
  internally_stopped: number
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
  /** TODO(backend): the OTA's error code for a refusal (OTA-E-1122), drawn beside the reason. */
  error_code?: string | null
  /** TODO(backend): the reference Fawtara issued for this version, when it took it. */
  fawtara_reference?: string | null
  /** TODO(backend): ACTIVITY.md 2.30. Which kind of error the refusal is. */
  error_kind?: RefusalKindDto | null
  /** TODO(backend): ACTIVITY.md 2.31. This version's TDD type (S, R or D). */
  tdd_type?: TddTypeDto | null
}

export type MlsRecordDto = {
  channel: string
  ack: MlsAckDto
  received_at: string | null
  sender: string | null
  sbdh_instance_identifier: string | null
  reason: string | null
}

/**
 * One AS4 row from `peppol.message_history`. `state` is the transport machine's (PENDING, SENDING,
 * SENT_AWAITING_MDN, DELIVERED, MDN_FAILED, RETRY_SCHEDULED, DEAD_LETTERED). `attempts` also counts
 * attempts that failed before anything went on the wire, so it does not prove anything was sent.
 */
export type TransmissionDto = {
  id: string
  channel: string
  direction: string
  state: string
  attempts: number
  last_attempt_at: string | null
  last_failure_reason: string | null
  sbdh_instance_identifier: string | null
  last_mls_code: MlsAckDto | null
  created_at: string
}

export type ActivityDetailDto = {
  invoice_uuid: string
  summary: ActivityItemDto
  /** Oldest first, so the TDT-006 story reads top to bottom. */
  tdd_lineage: TddObligationDto[]
  mls: MlsRecordDto[]
  transmissions: TransmissionDto[]
}

export type ActivityFilters = {
  direction?: ActivityDirectionDto | ''
  attention?: 'true' | ''
  tddAck?: MlsAckDto | ''
  invoiceAck?: MlsAckDto | ''
  tddStatus?: string
  tddState?: TddStateDto | ''
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
    tdd_state: filters.tddState || null,
    document_kind: filters.documentKind || null,
    invoice_number: filters.invoiceNumber || null,
    from: filters.from || null,
    to: filters.to || null,
  })
}

export function activityListPath(
  filters: ActivityFilters,
  page: number,
  pageSize = ACTIVITY_PAGE_SIZE,
) {
  return withQuery(ACTIVITY_PATH, {
    direction: filters.direction || null,
    attention: filters.attention || null,
    tdd_ack: filters.tddAck || null,
    invoice_ack: filters.invoiceAck || null,
    tdd_status: filters.tddStatus || null,
    tdd_state: filters.tddState || null,
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

/**
 * The summary for a window. `direction` makes the figures follow the ledger's Direction filter.
 * TODO(backend): ACTIVITY.md 2.33. The summary does not take `direction` yet.
 */
export function activitySummaryPath(
  from?: string,
  to?: string,
  direction?: ActivityDirectionDto | '',
) {
  return withQuery(`${ACTIVITY_PATH}/summary`, {
    from: from || null,
    to: to || null,
    direction: direction || null,
  })
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
