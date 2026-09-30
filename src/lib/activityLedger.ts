import type {
  ActivityItemDto,
  ActivitySummaryDto,
  AckCountsDto,
  MlsAckDto,
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
  return item.links.resubmit !== null
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
  { id: 'waiting', filters: { tddAck: 'NONE' as const } },
  { id: 'superseded', filters: { tddStatus: 'SUPERSEDED' } },
] as const

export type ActivityTabId = (typeof ACTIVITY_TABS)[number]['id']

export function isActivityTab(value: string | null): value is ActivityTabId {
  return ACTIVITY_TABS.some((tab) => tab.id === value)
}

/** What each tab counts, from the summary, so the tabs and the cards above them agree. */
export function tabCount(summary: ActivitySummaryDto, tab: ActivityTabId): number {
  switch (tab) {
    case 'all':
      return summary.documents
    case 'attention':
      return summary.attention
    case 'accepted':
      return deliveredCount(summary.tdd_ack)
    case 'rejected':
      return summary.tdd_ack.re
    case 'waiting':
      return summary.tdd_ack.none
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
export type RowOutcome = 'accepted' | 'rejected' | 'waiting' | 'superseded' | 'notOwed'

/**
 * The frame's four outcomes, read off the TDD leg.
 *
 * Only the server decides a row is superseded (its status); a rejection is an RE, an
 * acknowledgement AP or AB. Silence stays "Still waiting": it is not a failure and never offers a
 * resend on its own (SPOG v1.0.0 §6.2); the resend is the server's link, as before.
 */
export function outcomeOf(item: ActivityItemDto): RowOutcome {
  const leg = item.tdd_leg
  if (!leg) return 'notOwed'
  if (leg.status === 'SUPERSEDED' || item.superseded_by) return 'superseded'
  if (leg.ack === 'RE') return 'rejected'
  if (leg.ack === 'AP' || leg.ack === 'AB') return 'accepted'
  return 'waiting'
}

/** The chip in "Which flow". */
export type RowFlow = 'b2bDomestic' | 'b2c' | 'export'

export function flowOf(item: ActivityItemDto): RowFlow {
  if (item.b2c) return 'b2c'
  const variant = (item.tdd_leg?.variant ?? '').toUpperCase()
  if (variant.includes('EXPORT') || item.scenario?.flow === 11) return 'export'
  return 'b2bDomestic'
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
  if (item.scenario?.stand_in_id) return 'notOnPeppol'
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
