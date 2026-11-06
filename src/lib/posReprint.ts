import type { PosReceiptLineDto, PosSaleDto, PosTodaySaleRow } from '../api/pos/pos'
import { saleState } from './posToday'
import { REPRINT_LINES_SETTLED } from './posReprintGate'

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

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * A row the till could have printed. One row that is not makes the whole answer unusable (FU2R-1):
 * a missing amount must never print as a zero row, and a partial list is not the receipt the customer
 * was handed. The amount is checked against unit price times quantity, which the server's own
 * definition makes equal, so a row whose figures disagree is not trusted either.
 */
function printableRow(line: PosReceiptLineDto | null | undefined): boolean {
  if (!line || typeof line.description !== 'string' || !line.description.trim()) return false
  if (!finite(line.quantity) || line.quantity <= 0) return false
  if (!finite(line.unitPrice) || line.unitPrice < 0) return false
  if (!finite(line.amount) || line.amount < 0) return false
  return Math.abs(line.unitPrice * line.quantity - line.amount) < 0.0005
}

/** A company or government receipt carries no QR (QR E-3); every other one is a consumer tax invoice. */
const toCompany = (sale: PosSaleDto) => sale.customerKind === 'BUSINESS' || sale.customerKind === 'GOVERNMENT'

/**
 * Whether the server's answer carries what the original receipt printed: its lines and, on a full
 * invoice, its buyer. Without them a reprint would be a tax invoice with no items or addressee, and
 * whether a lineless copy is acceptable under the Oman rules is unconfirmed, so it is not printed at
 * all (coordinator ruling QW2R-1, backend QRW2-BE-1).
 */
/**
 * RECEIPT_NOT_KEPT (backend f598aa39b): a replay of this queued sale presented a different printed
 * QR, so the server stands by no receipt for it. Never reprinted, gate or no gate, and said so.
 */
export const receiptNotKept = (sale: PosSaleDto) => sale.receipt.qr.status === 'RECEIPT_NOT_KEPT'

export function reprintReady(sale: PosSaleDto): boolean {
  if (!REPRINT_LINES_SETTLED || receiptNotKept(sale)) return false
  const lines = sale.receipt.lines
  if (!Array.isArray(lines) || lines.length === 0 || !lines.every(printableRow)) return false
  // QW4R-2 and FU2R item 4: a consumer receipt prints only with the server's READY QR, online or
  // queued; for a queued sale that QR reads the payload the till printed (item F), never one made
  // here. NOT_APPLICABLE stands only on a company or government receipt, which carries none.
  const qr = sale.receipt.qr.status
  if (qr !== 'READY' && !(qr === 'NOT_APPLICABLE' && toCompany(sale))) return false
  if (sale.queuedOffline && qr !== 'READY') return false
  if (sale.transactionType === 'FULL_TAX') {
    const buyer = sale.receipt.buyer
    if (!buyer || !buyer.name?.trim()) return false
  }
  return true
}
