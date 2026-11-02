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
