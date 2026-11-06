import type { PosSaleDto, PosTodaySaleRow } from '../api/pos/pos'
import { saleState } from './posToday'

/**
 * Which sales the day's list offers to reprint (QR E-5). Only a filed sale that stands as issued: a
 * credited sale would reprint as a clean receipt, and a failed, waiting or held one is not what the
 * customer can rely on (review QW2R-3). A queued sale is offered once filed (owner directive
 * 2026-11-06 item F); whether it prints is decided on the server's answer (`reprintReady`).
 */
export function reprintOffered(row: PosTodaySaleRow): boolean {
  const state = saleState(row)
  return (
    (state === 'filed' || state === 'peppol') &&
    row.credit.state === 'NONE' &&
    row.attribution !== 'PENDING_REVIEW'
  )
}

/**
 * Whether the server's answer carries what the original receipt printed: its lines and, on a full
 * invoice, its buyer. Without them a reprint would be a tax invoice with no items or addressee, and
 * whether a lineless copy is acceptable under the Oman rules is unconfirmed, so it is not printed at
 * all (coordinator ruling QW2R-1, backend QRW2-BE-1). No server answers with them yet.
 */
export function reprintReady(sale: PosSaleDto): boolean {
  const lines = sale.receipt.lines
  if (!Array.isArray(lines) || lines.length === 0) return false
  // Item F: a queued sale reprints only the QR the server serves for it, READY, which reads the
  // payload the till printed (frozen, then filed, then live); never one made from data here.
  if (sale.queuedOffline && sale.receipt.qr.status !== 'READY') return false
  if (sale.transactionType === 'FULL_TAX') {
    const buyer = sale.receipt.buyer
    if (!buyer || !buyer.name?.trim()) return false
  }
  return true
}
