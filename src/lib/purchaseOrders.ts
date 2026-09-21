import type {
  GoodsReceiptDto,
  PurchaseOrderAction,
  PurchaseOrderDto,
  PurchaseOrderLineDto,
  PurchaseOrderStateDto,
} from '../api/expenditure/purchaseOrders'

/**
 * The purchase-order state machine as `PurchaseOrderState` draws it, so a screen offers only the
 * moves the domain will accept rather than sending one and reading the refusal.
 */

const NEXT: Record<PurchaseOrderStateDto, PurchaseOrderStateDto | null> = {
  DRAFT: 'AWAITING_APPROVAL',
  AWAITING_APPROVAL: 'APPROVED',
  APPROVED: 'SENT',
  // SENT and PARTIALLY_RECEIVED advance by booking goods in, not by a button.
  SENT: null,
  PARTIALLY_RECEIVED: null,
  RECEIVED: 'CLOSED',
  CLOSED: null,
  CANCELLED: null,
}

export const TERMINAL_STATES: PurchaseOrderStateDto[] = ['CLOSED', 'CANCELLED']

export function isTerminal(state: PurchaseOrderStateDto): boolean {
  return TERMINAL_STATES.includes(state)
}

/** Goods can only be booked in against an order the supplier has been told about. */
export function acceptsReceipts(state: PurchaseOrderStateDto): boolean {
  return state === 'SENT' || state === 'PARTIALLY_RECEIVED'
}

/**
 * The button this state offers, if any.
 *
 * `send` is deliberately worded as marking rather than sending: the only dispatch channel writes
 * a log line and transmits nothing, so a screen saying "send to the supplier" would describe
 * something that does not happen.
 */
export const ACTION_FOR_STATE: Partial<Record<PurchaseOrderStateDto, PurchaseOrderAction>> = {
  DRAFT: 'submit',
  AWAITING_APPROVAL: 'approve',
  APPROVED: 'send',
  RECEIVED: 'close',
}

export function nextAction(state: PurchaseOrderStateDto): PurchaseOrderAction | null {
  return ACTION_FOR_STATE[state] ?? null
}

export function nextState(state: PurchaseOrderStateDto): PurchaseOrderStateDto | null {
  return NEXT[state]
}

/** Anything that has not finished can be cancelled. */
export function canCancel(state: PurchaseOrderStateDto): boolean {
  return !isTerminal(state)
}

/** Only a draft can still be edited: every later state has been asserted to somebody. */
export function canEdit(state: PurchaseOrderStateDto): boolean {
  return state === 'DRAFT'
}

export type LineDraft = {
  description: string
  quantity: string
  unit: string
  unitPrice: string
  vatRate: string
}

export function emptyLine(): LineDraft {
  return { description: '', quantity: '1', unit: '', unitPrice: '', vatRate: '5' }
}

export type LineProblem = 'description' | 'quantity' | 'unitPrice' | 'vatRate'

/** What the server would refuse on a line, checked before a save is spent learning it. */
export function lineProblem(line: LineDraft): LineProblem | null {
  if (line.description.trim() === '' || line.description.trim().length > 500) return 'description'
  if (!positive(line.quantity)) return 'quantity'
  if (!nonNegative(line.unitPrice)) return 'unitPrice'
  if (line.vatRate.trim() !== '' && !nonNegative(line.vatRate)) return 'vatRate'
  return null
}

function positive(value: string): boolean {
  const number = Number(value.trim())
  return value.trim() !== '' && Number.isFinite(number) && number > 0
}

function nonNegative(value: string): boolean {
  const number = Number(value.trim())
  return value.trim() !== '' && Number.isFinite(number) && number >= 0
}

/**
 * What the order comes to, worked out the way the server does: each line's net, then VAT on that
 * net. Shown so the person sees the figure before they commit to it, never sent — the server
 * computes its own totals and they are what the order carries.
 */
export function draftTotals(lines: LineDraft[]): { net: number; vat: number; gross: number } {
  let net = 0
  let vat = 0
  for (const line of lines) {
    if (lineProblem(line)) continue
    const lineNet = Number(line.quantity) * Number(line.unitPrice)
    net += lineNet
    vat += lineNet * (Number(line.vatRate || '0') / 100)
  }
  return { net, vat, gross: net + vat }
}

/**
 * How much of each line has arrived across every receipt, so a second delivery is booked against
 * what is left rather than against the ordered quantity again.
 */
export function receivedByLine(receipts: GoodsReceiptDto[]): Map<string, number> {
  const totals = new Map<string, number>()
  for (const receipt of receipts) {
    for (const line of receipt.lines) {
      totals.set(line.purchaseOrderLineId, (totals.get(line.purchaseOrderLineId) ?? 0) + line.quantityReceived)
    }
  }
  return totals
}

export function outstandingOn(line: PurchaseOrderLineDto, received: Map<string, number>): number {
  return Math.max(0, line.quantity - (received.get(line.id) ?? 0))
}

/** Whether every line has arrived in full — what turns the order RECEIVED rather than partial. */
export function fullyReceived(order: PurchaseOrderDto, receipts: GoodsReceiptDto[]): boolean {
  const received = receivedByLine(receipts)
  return order.lines.length > 0 && order.lines.every((line) => outstandingOn(line, received) === 0)
}
