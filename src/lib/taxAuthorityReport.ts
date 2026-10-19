import {
  activityListPath,
  loadActivityDetail,
  loadActivityList,
  type ActivityDetailDto,
  type ActivityItemDto,
  type TddLegDto,
} from '../api/compliance/activity'
import type { InvoiceDispatchDto } from '../api/invoices/detail'
import { canResubmit, correctionHeld } from './activityLedger'
import type { DispatchNote } from './invoiceDispatch'

/**
 * Where a document's newest TDD stands with C5, read from the compliance ledger's `tdd_leg`.
 *
 * Mirrors the backend's `TddReportState` (JdbcActivityReadAdapter, `flagged.tdd_state`, at
 * 69c878d73), which is computed for the ledger's filter but not sent on the row. Its precedence is
 * load-bearing: an MLS from C5 decides first; Fawtir's own stop comes next, but a DEAD_LETTERED
 * leg whose transport row is still trying is not stopped (the SLA watchdog parks the ledger and
 * leaves the transport retrying; inbound audit 2026-10-13 F4); and "delivered" is the transport
 * row's DELIVERED, never `submitted_at`, which is written when the TDD is only queued (F3).
 * NOT_RAISED is ours: the leg is null until the obligation exists.
 *
 * Nothing here is a tax verdict. C5 validates a TDD against the Schematron "and not for Tax
 * compliance" (SA v1.0.3 §7.1.2) and the OTA sends nothing back (OTA FAQ 2026-08-31 §3.3 Q1).
 */
export type TddReportState =
  | 'NOT_RAISED'
  | 'NEVER_SUBMITTED'
  | 'AWAITING_RESPONSE'
  | 'AUTHORITY_REJECTED'
  | 'INTERNALLY_STOPPED'
  | 'ANSWERED'

/** The transport states the backend treats as still trying (the SQL's NOT IN list). */
const TRANSPORT_STILL_TRYING: ReadonlySet<string> = new Set([
  'PENDING',
  'SENDING',
  'SENT_AWAITING_MDN',
  'MDN_FAILED',
  'RETRY_SCHEDULED',
])

export function tddReportStateOf(leg: TddLegDto | null): TddReportState {
  if (!leg) return 'NOT_RAISED'
  if (leg.ack === 'RE') return 'AUTHORITY_REJECTED'
  if (leg.ack === 'AP' || leg.ack === 'AB') return 'ANSWERED'
  if (leg.status === 'GENERATION_FAILED') return 'INTERNALLY_STOPPED'
  if (
    leg.status === 'DEAD_LETTERED' &&
    !TRANSPORT_STILL_TRYING.has(leg.transport_state ?? 'NONE')
  ) {
    return 'INTERNALLY_STOPPED'
  }
  if (!leg.delivered_at) return 'NEVER_SUBMITTED'
  return 'AWAITING_RESPONSE'
}

/**
 * Whether the server may still move the report on its own, so a screen keeps re-reading it.
 * AWAITING_RESPONSE stays pending although C5 may never answer: silence is never recorded as an
 * answer, so the re-read's own cap (usePendingRefresh) is what ends it, not a guess here.
 */
export function tddReportIsPending(leg: TddLegDto | null): boolean {
  const state = tddReportStateOf(leg)
  return state === 'NOT_RAISED' || state === 'NEVER_SUBMITTED' || state === 'AWAITING_RESPONSE'
}

/**
 * The sentences an issued invoice's page says about its report, in order: where it stands, then
 * what follows from that (a resubmission the server offers, a held correction, the deadline).
 * Words only: C5's own reason is peer text in English, so it stays on the compliance record.
 */
export function issuedReportNotes(item: ActivityItemDto): DispatchNote[] {
  const leg = item.tdd_leg
  const state = tddReportStateOf(leg)
  // A Disregard withdraws a report after the customer's access point turned the invoice down
  // (TO_DISREGARD, SA v1.0.3 §5.6); its leg is the newest, so "accepted" would describe the
  // withdrawal as an acceptance of the invoice's report.
  const withdrawal = leg?.variant === 'DISREGARD'
  const notes: DispatchNote[] = [{ key: REPORT_KEY + headlineOf(state, withdrawal, leg) }]
  if (state === 'AUTHORITY_REJECTED') {
    if (canResubmit(item)) notes.push({ key: `${REPORT_KEY}resubmitInActivity` })
    else if (correctionHeld(item)) notes.push({ key: `${REPORT_KEY}correctionHeld` })
  }
  if (leg?.sla_met === false && state !== 'INTERNALLY_STOPPED') {
    notes.push({ key: REPORT_KEY + (leg.delivered_at ? 'deliveredLate' : 'deadlinePassed') })
  }
  return notes
}

const REPORT_KEY = 'invoiceDispatch.taxReport.'

function headlineOf(state: TddReportState, withdrawal: boolean, leg: TddLegDto | null): string {
  switch (state) {
    case 'NOT_RAISED':
      return 'notRaised'
    case 'NEVER_SUBMITTED':
      return withdrawal ? 'withdrawing' : 'notDelivered'
    case 'AWAITING_RESPONSE':
      return withdrawal ? 'withdrawing' : 'awaiting'
    case 'ANSWERED':
      if (withdrawal) return 'withdrawn'
      return leg?.ack === 'AP' ? 'accepted' : 'deliveredUnconfirmed'
    case 'AUTHORITY_REJECTED':
      return withdrawal ? 'withdrawalRejected' : 'rejected'
    case 'INTERNALLY_STOPPED':
      return 'stopped'
  }
}

/** Said when the report cannot be tied to this invoice, or the ledger cannot be read. */
export const REPORT_UNAVAILABLE: DispatchNote = { key: `${REPORT_KEY}unavailable` }

/* ------------------------------------------------------------ finding the record */

/**
 * The compliance record proven to be this document's, or none.
 *
 * No route keyed by the authored invoice id carries the report (backend contract gap, recorded in
 * agent6-backend-contract.md), so the record is looked up by invoice number. A number alone is not
 * an identity: the ledger is unique on number AND issue year, and the list filter does not take a
 * year. The record is accepted only when one of the transport rows the dispatch names for this
 * invoice (`transport.*.messageId`) is among the record's own transmissions, which the server
 * selects by the record's Invoice UUID. Anything less is "not available", never a best guess.
 */
export type ReportLookup =
  { kind: 'found'; invoiceUuid: string; item: ActivityItemDto } | { kind: 'unproven' }

/** Rows asked for by number. More than one is a number reused across years. */
export const REPORT_CANDIDATES = 5

/** The AS4 rows the dispatch read names for this invoice; empty before any was queued. */
export function transportMessageIds(dispatch: InvoiceDispatchDto | null): string[] {
  const legs = [dispatch?.transport?.buyer, dispatch?.transport?.taxAuthority]
  return legs.flatMap((leg) => (leg?.messageId ? [leg.messageId] : []))
}

export function provesIssued(detail: ActivityDetailDto, messageIds: readonly string[]): boolean {
  return (
    detail.summary.direction === 'ISSUED' &&
    detail.transmissions.some((transmission) => messageIds.includes(transmission.id))
  )
}

function found(detail: ActivityDetailDto): ReportLookup {
  return { kind: 'found', invoiceUuid: detail.invoice_uuid, item: detail.summary }
}

/**
 * Finds an issued invoice's record: one list read, then one detail read per candidate until one
 * is proven (normally one of each). Errors are left to the caller's read, which sends a 401 to
 * sign-in and shows anything else, a 403 for a person limited to some branches included, as not
 * available.
 */
export async function findIssuedReport(
  invoiceNumber: string,
  messageIds: readonly string[],
): Promise<ReportLookup> {
  const list = await loadActivityList(
    activityListPath({ direction: 'ISSUED', invoiceNumber }, 0, REPORT_CANDIDATES),
  )
  for (const candidate of list.items) {
    if (candidate.direction !== 'ISSUED' || candidate.invoice_number !== invoiceNumber) continue
    const detail = await loadActivityDetail(candidate.invoice_uuid)
    if (provesIssued(detail, messageIds)) return found(detail)
  }
  return { kind: 'unproven' }
}

/** A re-read of a record already found, proven again against the dispatch as it stands now. */
export async function refreshIssuedReport(
  invoiceUuid: string,
  messageIds: readonly string[],
): Promise<ReportLookup> {
  const detail = await loadActivityDetail(invoiceUuid)
  return provesIssued(detail, messageIds) ? found(detail) : { kind: 'unproven' }
}

/**
 * Whether a record is the one a received document's delivery links to. The record is read by the
 * delivery's own Invoice UUID, but a company that also issued a document under that UUID would be
 * answered with its issued row; the link names the delivery itself.
 */
export function provesReceived(detail: ActivityDetailDto, deliveryId: string): boolean {
  return (
    detail.summary.direction === 'RECEIVED' &&
    detail.summary.links.document === `/api/v1/inbound-invoices/${deliveryId}`
  )
}
