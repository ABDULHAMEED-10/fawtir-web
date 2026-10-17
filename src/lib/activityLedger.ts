import type {
  ActivityItemDto,
  ActivitySummaryDto,
  AckCountsDto,
  MlsAckDto,
  RefusalKindDto,
} from '../api/compliance/activity'

/**
 * Reading of the compliance ledger, kept out of the page so the rules below can be tested.
 *
 * Three of them are not presentation choices. An acknowledgement is a **transport** fact and
 * never a tax verdict — the OTA has no channel back to the Service Provider. `NONE` is **silence
 * and not a failure**, so it is never styled as one and never justifies a resend on its own.
 * And the two legs are never merged into a single state, because they are different parties
 * acknowledging different things.
 */

export type AckTone = 'delivered' | 'delivered-unconfirmed' | 'rejected' | 'silent'

export const ACK_TONE: Record<MlsAckDto, AckTone> = {
  AP: 'delivered',
  AB: 'delivered-unconfirmed',
  RE: 'rejected',
  // Deliberately its own tone rather than a warning: silence is the state every document is in
  // until the other side speaks, and colouring it as a problem would invite a resend that
  // SPOG v1.0.0 §6.2 forbids.
  NONE: 'silent',
}

/** Whether an ack is a failure. Only RE is; silence is not. */
export function isFailure(ack: MlsAckDto): boolean {
  return ack === 'RE'
}

/**
 * Whether a resubmission may be offered for a row.
 *
 * The answer is entirely the server's: it supplies a href when it judges one possible. Deriving
 * it here from the ack would put the decision in two places, and the one place it must not be is
 * a screen that can see silence.
 */
export function canResubmit(item: ActivityItemDto): boolean {
  // A backend that reports holds also nulls the link; the flag is checked too so a row that
  // somehow carries both never offers a send that can only be held again.
  return item.links.resubmit !== null && !correctionHeld(item)
}

/**
 * Whether a RESUBMIT of this document is held for an authorised decision. Only the server's
 * `tdd_leg.correction_held` says so; absent (an older backend) means not held.
 */
export function correctionHeld(item: ActivityItemDto): boolean {
  return item.tdd_leg?.correction_held === true
}

export type SlaState = 'met' | 'missed' | 'pending' | 'none'

/**
 * Where a document stands against its PASR Annex A deadline.
 *
 * `sla_met` is null while nothing has been submitted and the deadline has not passed, which is
 * pending rather than missed — a document inside its window has broken no obligation.
 */
export function slaStateOf(item: ActivityItemDto, now: Date = new Date()): SlaState {
  const leg = item.tdd_leg
  if (!leg) return 'none'
  if (leg.sla_met === true) return 'met'
  if (leg.sla_met === false) return 'missed'
  if (leg.sla_deadline && new Date(leg.sla_deadline).getTime() < now.getTime()) return 'missed'
  return 'pending'
}

/**
 * A share as a whole percent, with zero staying zero.
 *
 * The wire carries no rates on purpose — "the screen divides, and zero stays zero" — so an empty
 * window reads as 0% rather than as NaN or as 100% of nothing.
 */
export function shareOf(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100)
}

/** Everything acknowledged one way or another, whether or not delivery was confirmed. */
export function deliveredCount(counts: AckCountsDto): number {
  return counts.ap + counts.ab
}

export type LedgerHeadline = {
  documents: number
  /** Reported and acknowledged by the tax authority endpoint — a transmission fact. */
  tddDelivered: number
  tddRejected: number
  /** Not a failure. Counted so the screen can say how much is simply outstanding. */
  tddSilent: number
  slaMet: number
  slaMissed: number
  slaPending: number
  attention: number
}

export function headlineOf(summary: ActivitySummaryDto): LedgerHeadline {
  return {
    documents: summary.documents,
    tddDelivered: deliveredCount(summary.tdd_ack),
    tddRejected: summary.tdd_ack.re,
    tddSilent: summary.tdd_ack.none,
    slaMet: summary.sla.met,
    slaMissed: summary.sla.missed,
    slaPending: summary.sla.pending,
    attention: summary.attention,
  }
}

/**
 * The frame's six tabs (Figma 154:109992), each asking the server for its rows rather than
 * filtering a page. "Superseded" filters on the TDD status the server writes when a corrected
 * report replaces one; see the backend asks doc, row 2.4.
 */
export const ACTIVITY_TABS = [
  { id: 'all', filters: {} },
  { id: 'attention', filters: { attention: 'true' as const } },
  { id: 'accepted', filters: { tddAck: 'AP' as const } },
  { id: 'rejected', filters: { tddAck: 'RE' as const } },
  // Submitted and unanswered only (N5b). tdd_ack=NONE stays beside it so a server without the
  // tdd_state filter still lists silence rather than every document.
  {
    id: 'waiting',
    filters: { tddAck: 'NONE' as const, tddState: 'AWAITING_RESPONSE' as const },
  },
  { id: 'superseded', filters: { tddStatus: 'SUPERSEDED' } },
] as const

export type ActivityTabId = (typeof ACTIVITY_TABS)[number]['id']

export function isActivityTab(value: string | null): value is ActivityTabId {
  return ACTIVITY_TABS.some((tab) => tab.id === value)
}

/** Where the window's reports stand with the OTA, for every card, tab and report that says so. */
export type ReportStates = {
  /** Submitted and not answered: the only reports anyone at the OTA is being waited on for. */
  awaiting: number
  /** Built here and not submitted yet. */
  notSubmitted: number
  /** Stopped by Fawtir itself (SLA dead-letter, generation failure); never the OTA's doing. */
  stopped: number
  /** Turned down by the OTA (MLS RE). */
  rejected: number
}

/**
 * Reads the server's report states (N5b). A server that does not send them yet gets the counts
 * the screens used before, so an older backend can make nothing worse than it was.
 */
export function reportStatesOf(summary: ActivitySummaryDto): ReportStates {
  const state = summary.tdd_state
  if (!state) {
    return {
      awaiting: summary.tdd_ack.none,
      notSubmitted: 0,
      stopped: 0,
      rejected: summary.tdd_ack.re,
    }
  }
  return {
    awaiting: state.awaiting_response,
    notSubmitted: state.never_submitted,
    stopped: state.internally_stopped,
    rejected: state.authority_rejected,
  }
}

/** What each tab counts, from the summary, so the tabs and the cards above them agree. */
export function tabCount(summary: ActivitySummaryDto, tab: ActivityTabId): number {
  switch (tab) {
    case 'all':
      return summary.documents
    case 'attention':
      return summary.attention
    case 'accepted':
      // The tab lists `tdd_ack=AP`, so it counts AP only. "Delivered, unconfirmed" (AB) is its
      // own state: it shows under All with its own label and is not counted as accepted.
      return summary.tdd_ack.ap
    case 'rejected':
      return summary.tdd_ack.re
    case 'waiting':
      return reportStatesOf(summary).awaiting
    case 'superseded':
      // TODO(backend): not on the summary yet (asks row 2.4); zero until it is.
      return summary.superseded ?? 0
  }
}

/** The direction filter moved off the tabs into the toolbar's Filters menu. */
export const DIRECTION_FILTERS = ['all', 'ISSUED', 'RECEIVED'] as const
export type DirectionFilter = (typeof DIRECTION_FILTERS)[number]

export function isDirectionFilter(value: string | null): value is DirectionFilter {
  return DIRECTION_FILTERS.some((entry) => entry === value)
}

export type ActivitySortKey = 'newest' | 'oldest' | 'invoiceAsc'

export const ACTIVITY_SORTS: { value: ActivitySortKey; labelKey: string }[] = [
  { value: 'newest', labelKey: 'activity.sortOptions.newest' },
  { value: 'oldest', labelKey: 'activity.sortOptions.oldest' },
  { value: 'invoiceAsc', labelKey: 'activity.sortOptions.invoiceAsc' },
]

export function isActivitySort(value: string | null): value is ActivitySortKey {
  return ACTIVITY_SORTS.some((entry) => entry.value === value)
}

/**
 * Orders the page on screen.
 *
 * TODO(backend): the ledger takes no sort parameter (asks row 2.6), so this orders the page the
 * server sent rather than the whole book. The server's own order is newest first.
 */
export function sortItems(items: ActivityItemDto[], sort: ActivitySortKey): ActivityItemDto[] {
  if (sort === 'newest') return items
  const copy = [...items]
  if (sort === 'oldest') return copy.reverse()
  return copy.sort((a, b) =>
    (a.invoice_number ?? '').localeCompare(b.invoice_number ?? '', undefined, { numeric: true }),
  )
}

/* ------------------------------------------------------------ one row, as the frame reads it */

/** The pill in "What the OTA said". */
export type RowOutcome =
  | 'accepted'
  | 'deliveredUnconfirmed'
  | 'rejected'
  | 'waiting'
  | 'notSent'
  | 'stopped'
  | 'superseded'
  | 'notOwed'

/**
 * Fawtir stopped the report itself: GENERATION_FAILED parks it before sending (FR-201) and
 * DEAD_LETTERED is our own SLA watchdog or exhausted transport retries (FR-203/204). Neither is
 * the OTA's doing, and neither is waiting on the OTA (Phase 13 findings N1, N5).
 */
export const TDD_STOPPED_AT_FAWTIR: ReadonlySet<string> = new Set([
  'GENERATION_FAILED',
  'DEAD_LETTERED',
])

/**
 * The frame's four outcomes, read off the TDD leg, plus "Delivered, unconfirmed".
 *
 * Only the server decides a row is superseded (its status): it is a report WE replaced or
 * cancelled by sending a TDD of type R or D, not something the OTA did. A rejection is an RE, an
 * acceptance an AP. AB (delivered without confirmation) is neither: it gets its own label and is
 * never counted as accepted. Silence stays "Still waiting": it is not a failure and never offers a
 * resend on its own (SPOG v1.0.0 §6.2); the resend is the server's link, as before.
 *
 * Silence counts as waiting only once the report was submitted: a report Fawtir stopped, or one
 * with no `submitted_at`, never reached the OTA, so nobody there is being waited on (N5).
 */
export function outcomeOf(item: ActivityItemDto): RowOutcome {
  const leg = item.tdd_leg
  if (!leg) return 'notOwed'
  if (leg.status === 'SUPERSEDED' || item.superseded_by) return 'superseded'
  if (leg.ack === 'RE') return 'rejected'
  if (leg.ack === 'AP') return 'accepted'
  if (leg.ack === 'AB') return 'deliveredUnconfirmed'
  if (TDD_STOPPED_AT_FAWTIR.has(leg.status)) return 'stopped'
  if (!leg.submitted_at) return 'notSent'
  return 'waiting'
}

/**
 * Whether a row belongs in a tab that lists one acknowledgement. A report we replaced keeps the
 * ack it had, but only the live report counts: it is listed under Superseded, never under
 * Accepted, Rejected or Still waiting.
 */
export function belongsInTab(item: ActivityItemDto, tab: ActivityTabId): boolean {
  if (tab === 'accepted' || tab === 'rejected' || tab === 'waiting') {
    return outcomeOf(item) !== 'superseded'
  }
  return true
}

/* ------------------------------------------------------------ why a report was refused */

/**
 * What a refusal is about, and so how it is put right.
 *
 * The TDD carries a full copy of the invoice (TDT-012, IBR-TDD-57). When the refusal is about the
 * invoice's own content (its totals, the buyer's Peppol ID, a tax category), a changed report
 * would no longer match the invoice the buyer holds: the fix is a credit note and a new invoice.
 * Only an error in the TDD itself is put right by sending the report again.
 */
export type RefusalKind = 'invoice' | 'report' | 'unknown'

/** The causes the screens know how to explain. */
export type RefusalCause =
  | 'buyerPeppolId'
  | 'totals'
  | 'taxCategory'
  | 'otherInvoice'
  | 'report'
  | 'unknown'

/**
 * The refusal codes seen so far. TODO(backend): ACTIVITY.md 2.30. Stand-in until the server says
 * which kind each refusal is (`error_kind`); unknown codes fall through to the reason text.
 */
const CODE_CAUSE: Record<string, RefusalCause> = {
  'OTA-E-2041': 'buyerPeppolId',
  'OTA-E-1122': 'taxCategory',
  MISSING_BUYER_ENDPOINT_ID: 'buyerPeppolId',
  TAX_CATEGORY_MISMATCH: 'taxCategory',
}

const CAUSE_PATTERNS: [RegExp, RefusalCause][] = [
  [/peppol id|participant id|endpoint ?id|buyer endpoint/i, 'buyerPeppolId'],
  [/tax category|category and the rate|vat categor/i, 'taxCategory'],
  [/total|added up|line amount|rounding|sum of/i, 'totals'],
  [/signature|certificate|duplicate|tdd uuid|schema|envelope|sbdh|xml/i, 'report'],
  [
    /buyer|seller|customer|vat number|address|currency|issue date|invoice (number|line)/i,
    'otherInvoice',
  ],
]

export function refusalCauseOf(
  code: string | null | undefined,
  reason: string | null | undefined,
): RefusalCause {
  const known = code ? CODE_CAUSE[code.trim().toUpperCase()] : undefined
  if (known) return known
  const text = `${code ?? ''} ${reason ?? ''}`
  for (const [pattern, cause] of CAUSE_PATTERNS) if (pattern.test(text)) return cause
  return 'unknown'
}

export function refusalKindOf(
  cause: RefusalCause,
  fromServer?: RefusalKindDto | null,
): RefusalKind {
  if (fromServer === 'INVOICE') return 'invoice'
  if (fromServer === 'REPORT') return 'report'
  if (cause === 'report') return 'report'
  if (cause === 'unknown') return 'unknown'
  return 'invoice'
}

/** A ledger row's refusal kind, from its TDD leg. Null when the row was not refused. */
export function rowRefusalKind(item: ActivityItemDto): RefusalKind | null {
  const leg = item.tdd_leg
  if (!leg || leg.ack !== 'RE') return null
  return refusalKindOf(refusalCauseOf(null, leg.reason), leg.error_kind)
}

/** The chip in "Which flow". */
export type RowFlow = 'b2bDomestic' | 'b2c' | 'export'

export function flowOf(item: ActivityItemDto): RowFlow {
  if (item.b2c) return 'b2c'
  // An export is reported under TDD scope IP or INP (ACTIVITY.md 2.32).
  if (item.tdd_scope === 'IP' || item.tdd_scope === 'INP') return 'export'
  const variant = (item.tdd_leg?.variant ?? '').toUpperCase()
  if (variant.includes('EXPORT') || item.scenario?.flow === 11) return 'export'
  return 'b2bDomestic'
}

/**
 * The line under the flow chip. A received document is reported by us as the receiver
 * (TDT-010 = 02), so it never reads as a flow we sent. An export names its TDD scope (IP or INP);
 * the only stand-in participant ID PINT-OM publishes is 997770000099.
 */
export function routeOf(item: ActivityItemDto): {
  key: string
  values?: Record<string, string | number>
} {
  if (item.direction === 'RECEIVED' || item.reporter_role === '02') {
    return { key: 'activity.route.received' }
  }
  const flow = flowOf(item)
  if (flow === 'export') {
    return item.tdd_scope
      ? { key: 'activity.route.exportScope', values: { scope: item.tdd_scope } }
      : { key: 'activity.route.exportNoScope' }
  }
  if (item.scenario) {
    return item.scenario.stand_in_id
      ? {
          key: 'activity.route.standIn',
          values: { id: item.scenario.stand_in_id, flow: item.scenario.flow },
        }
      : { key: 'activity.route.bothOnPeppol', values: { flow: item.scenario.flow } }
  }
  return { key: `activity.route.${flow}` }
}

/**
 * The glyph and word in "Customer": did their Access Point acknowledge the invoice? On a document
 * a supplier sent us the customer is us, so the cell says we received it.
 */
export type CustomerAck =
  | 'received'
  | 'youReceived'
  | 'notOnPeppol'
  | 'noCustomer'
  | 'waiting'
  | 'refused'

export function customerAckOf(item: ActivityItemDto): CustomerAck {
  if (item.direction === 'RECEIVED') return 'youReceived'
  if (item.b2c) return 'noCustomer'
  if (item.scenario?.stand_in_id || item.tdd_scope === 'INP') return 'notOnPeppol'
  const ack = item.invoice_leg.ack
  if (ack === 'AP' || ack === 'AB') return 'received'
  if (ack === 'RE') return 'refused'
  return 'waiting'
}

/** Whole seconds between two instants, or null when either is missing. */
export function secondsBetween(from: string | null, to: string | null): number | null {
  if (!from || !to) return null
  const span = (new Date(to).getTime() - new Date(from).getTime()) / 1000
  return Number.isFinite(span) && span >= 0 ? Math.round(span) : null
}

/** `47` → `47s`, `134` → `2m 14s`, `13200` → `3h 40m`, past a day `2d 5h`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  if (s < 60) return `${s}s`
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
  if (s < 86400)
    return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}m`
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`
}

/** A share to one decimal, zero staying zero: the card prints 97.1%, not 97%. */
export function shareOf1(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 1000) / 10
}
