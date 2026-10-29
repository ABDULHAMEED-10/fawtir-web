import type { ItemType } from './invoiceDraft'
import { addDays } from './dates'
import { ApiError } from '../api/errors'
import type {
  GoodsReceiptDto,
  PurchaseOrderLineRequest,
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
  return (Object.hasOwn(ACTION_FOR_STATE, state) ? ACTION_FOR_STATE[state] : undefined) ?? null
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

/**
 * One line of the composer (Suppliers › Detail › New purchase order, Figma 163:27317), on the
 * product owner's line rules: a free-text description, goods or service, the unit on the row
 * following that choice, the price excluding VAT to three decimals, the tax rate read as text.
 */
export type LineDraft = {
  /** Local key only; the server numbers lines 1..n in their order. */
  id?: string
  description: string
  /** Goods or service. Not an order field yet: it decides which unit list the row offers. */
  itemType?: ItemType
  quantity: string
  unit: string
  unitPrice: string
  vatRate: string
  /** The catalogue product picked for the line (S2); absent on a free-text line. */
  productId?: string | null
  /** The product's name as picked, shown on the pick button. */
  productName?: string
  /** The product's sizes and options; the line must name one when there are any. */
  variants?: { id: string; name: string; price: number }[]
  variantId?: string | null
  /** The product is counted (`keepCount`): the line then says how many units one ordered unit holds. */
  keepCount?: boolean
  /** The product's own unit, which the stock is counted in. */
  stockUnit?: string
  /** As typed; "1" by default. */
  stockUnitsPerOrderUnit?: string
}

let lineSeed = 0

export function emptyLine(vatRate = '5'): LineDraft {
  lineSeed += 1
  return {
    id: `po-line-${lineSeed}`,
    description: '',
    itemType: 'goods',
    quantity: '1',
    unit: 'EA',
    unitPrice: '0.000',
    vatRate,
  }
}

export type LineProblem =
  'description' | 'quantity' | 'unitPrice' | 'vatRate' | 'variant' | 'stockUnits'

/** What the server would refuse on a line, checked before a save is spent learning it. */
export function lineProblem(line: LineDraft): LineProblem | null {
  if (line.description.trim() === '' || line.description.trim().length > 500) return 'description'
  if (!positive(line.quantity)) return 'quantity'
  if (!nonNegative(line.unitPrice)) return 'unitPrice'
  if (line.vatRate.trim() !== '' && !nonNegative(line.vatRate)) return 'vatRate'
  // STOCK_VARIANT_REQUIRED: a product with sizes or options is bought one of them at a time.
  if (line.productId && (line.variants?.length ?? 0) > 0 && !line.variantId) return 'variant'
  if (line.productId && line.keepCount && !stockUnitsValid(line.stockUnitsPerOrderUnit ?? '1')) {
    return 'stockUnits'
  }
  return null
}

/** Above zero, at most three decimals, as `stockUnitsPerOrderUnit` is taken. */
export function stockUnitsValid(value: string): boolean {
  return positive(value) && /^\d+(\.\d{1,3})?$/.test(value.trim())
}

/**
 * A line's catalogue part of the request (S2): the product, its size or option and how many of
 * its own unit one ordered unit holds. Nothing for a free-text line, whose body stays as it was.
 */
export function lineProductFields(
  line: LineDraft,
): Pick<PurchaseOrderLineRequest, 'productId' | 'variantId' | 'stockUnitsPerOrderUnit'> {
  if (!line.productId) return {}
  return {
    productId: line.productId,
    ...(line.variantId ? { variantId: line.variantId } : {}),
    ...(line.keepCount
      ? { stockUnitsPerOrderUnit: Number(line.stockUnitsPerOrderUnit ?? '1') }
      : {}),
  }
}

/** The refusals a purchase order's catalogue lines and their receipt can meet, worded. */
const ORDER_STOCK_REFUSALS: Record<string, string> = {
  GOODS_RECEIPT_BRANCH_REQUIRED: 'purchaseOrder.stock.refused.branchRequired',
  PURCHASE_ORDER_PRODUCT_NOT_FOUND: 'purchaseOrder.stock.refused.productNotFound',
  STOCK_VARIANT_REQUIRED: 'purchaseOrder.stock.refused.variantRequired',
  STOCK_VARIANT_NOT_ON_PRODUCT: 'purchaseOrder.stock.refused.variantNotOnProduct',
}

/** The sentence for one of {@link ORDER_STOCK_REFUSALS}, else null for the shared wording. */
export function orderStockRefusalKey(error: unknown): string | null {
  if (!(error instanceof ApiError) || error.code === null) return null
  return ORDER_STOCK_REFUSALS[error.code] ?? null
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
      totals.set(
        line.purchaseOrderLineId,
        (totals.get(line.purchaseOrderLineId) ?? 0) + line.quantityReceived,
      )
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

/** When the supplier's bill would fall due if it arrived on the wanted date, on their terms. */
export function payableBy(wantedBy: string, netDays: number | null): string | null {
  if (!wantedBy || netDays === null) return null
  return addDays(wantedBy, netDays)
}

const normalise = (text: string) => text.trim().toLowerCase().replace(/s+/g, ' ')

export type Comparison = {
  /** How many of this order's lines the last order also carried, by description. */
  sameItems: { matched: number; total: number }
  /** The largest quantity move among the lines both orders carry, as a signed percentage. */
  quantity: { description: string; percent: number } | null
  /** The largest unit-price move among the lines both orders carry, as a signed percentage. */
  price: { description: string; percent: number } | null
}

/**
 * "Compared with the last one" (Figma 163:27317): the design's "Same items 2 of 3", "Quantity
 * +40% beans", "Sack price up 5.4%", worked out from this draft against the supplier's previous
 * order rather than typed.
 */
export function comparedWithLast(
  lines: LineDraft[],
  last: PurchaseOrderDto | null,
): Comparison | null {
  if (!last) return null
  const previous = new Map(last.lines.map((line) => [normalise(line.description), line]))
  const valid = lines.filter((line) => lineProblem(line) === null)
  let quantity: Comparison['quantity'] = null
  let price: Comparison['price'] = null
  let matched = 0
  for (const line of valid) {
    const before = previous.get(normalise(line.description))
    if (!before) continue
    matched += 1
    const move = (now: number, then: number) =>
      then > 0 ? Math.round(((now - then) / then) * 1000) / 10 : 0
    const q = move(Number(line.quantity), before.quantity)
    if (q !== 0 && (!quantity || Math.abs(q) > Math.abs(quantity.percent)))
      quantity = { description: line.description.trim(), percent: q }
    const p = move(Number(line.unitPrice), before.unitPrice)
    if (p !== 0 && (!price || Math.abs(p) > Math.abs(price.percent)))
      price = { description: line.description.trim(), percent: p }
  }
  return { sameItems: { matched, total: valid.length }, quantity, price }
}
