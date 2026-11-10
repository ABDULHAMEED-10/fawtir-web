import type { RejectedDocumentDto } from '../api/expenditure/rejectedDocuments'

/**
 * Whether our rejection reached the supplier, worded from the RE's own transport row. The
 * decision (RE) is not the delivery: a decided RE still sending, or one that failed, is not
 * "the supplier was told" (inbound audit 2026-10-13 F3, EXP batch 39 wording).
 */
export type RejectionDelivery = { key: string; date: string | null }

const SENDING: ReadonlySet<string> = new Set(['PENDING', 'SENDING', 'RETRY_SCHEDULED'])
// MDN_FAILED is terminal in practice: nothing claims that row again (backend MessageState, BC-6).
const FAILED: ReadonlySet<string> = new Set(['MDN_FAILED', 'DEAD_LETTERED'])

export function rejectionDelivery(
  item: Pick<RejectedDocumentDto, 'mlsTransportState' | 'mlsDeliveredAt'>,
): RejectionDelivery {
  const state = item.mlsTransportState
  const word = (key: string, date: string | null = null): RejectionDelivery => ({
    key: `rejectedDocuments.delivery.${key}`,
    date,
  })
  if (state === null) return word('notQueued')
  if (state === 'DELIVERED') {
    return item.mlsDeliveredAt ? word('delivered', item.mlsDeliveredAt) : word('deliveredUndated')
  }
  if (state === 'SENT_AWAITING_MDN') return word('awaitingReceipt')
  if (SENDING.has(state)) return word('sending')
  if (FAILED.has(state)) return word('failed')
  // INBOUND_RECEIVED, or a state added later: not a claim either way.
  return word('unknown')
}

export function rejectedTypeKey(item: Pick<RejectedDocumentDto, 'documentType' | 'selfBilling'>): string {
  return `rejectedDocuments.type.${item.selfBilling ? 'selfBilled' : 'plain'}.${item.documentType}`
}

/**
 * The Bills banner counts every RE ever recorded (the server has no "since" filter), so without
 * this it would never go away after a company's first rejection (PRV-b39 W-L4). Each viewer may
 * dismiss it; it comes back only when the total grows past what they dismissed, that is, when a
 * new document is rejected. Kept per viewer in this browser only: a convenience, not a record.
 */
export function rejectedSeenKey(tenantId: string, userId: string): string {
  return `fawtir.rejectedDocuments.seen.${tenantId}.${userId}`
}

export function readRejectedSeen(key: string): number {
  try {
    const value = Number.parseInt(window.localStorage.getItem(key) ?? '', 10)
    return Number.isFinite(value) && value > 0 ? value : 0
  } catch {
    return 0
  }
}

export function writeRejectedSeen(key: string, total: number): void {
  try {
    window.localStorage.setItem(key, String(total))
  } catch {
    // Storage blocked: the banner still hides for this visit, through component state.
  }
}

export function rejectedBannerShows(total: number, seen: number): boolean {
  return total > 0 && total > seen
}
