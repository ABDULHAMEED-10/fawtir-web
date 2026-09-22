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

export const ACTIVITY_TABS = [
  { id: 'all', filters: {} },
  { id: 'attention', filters: { attention: 'true' as const } },
  { id: 'rejected', filters: { tddAck: 'RE' as const } },
  { id: 'waiting', filters: { tddAck: 'NONE' as const } },
  { id: 'issued', filters: { direction: 'ISSUED' as const } },
  { id: 'received', filters: { direction: 'RECEIVED' as const } },
] as const

export type ActivityTabId = (typeof ACTIVITY_TABS)[number]['id']

export function isActivityTab(value: string | null): value is ActivityTabId {
  return ACTIVITY_TABS.some((tab) => tab.id === value)
}
