import { apiRequest } from '../client'
import { fromItemsPage, type ItemsPage, type Page } from '../page'
import { withQuery } from '../query'

/**
 * Purchase orders (`PurchaseOrderController`, E-13) — what the tenant has ordered from a supplier,
 * and what has arrived against it.
 *
 * **Nothing is transmitted.** The only dispatch channel is a log line: `send` records that the
 * buyer says they communicated the order and moves it to SENT, and `sent_at` is the durable fact.
 * Peppol Order is out of scope, so no screen may offer to send one.
 */

export const PURCHASE_ORDERS_PATH = '/v1/purchase-orders'

export type PurchaseOrderStateDto =
  | 'DRAFT'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'SENT'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CLOSED'
  | 'CANCELLED'

export type PurchaseOrderLineDto = {
  id: string
  lineNo: number
  description: string
  quantity: number
  unit: string | null
  unitPrice: number
  vatRate: number | null
  lineNet: number
  vatAmount: number
  /** The catalogue product the line buys (S2); null on a free-text line. Absent from older servers. */
  productId?: string | null
  /** Its size or option, when it has them. */
  variantId?: string | null
  /** How many of the product's own unit one ordered unit holds; 1 when there is no conversion. */
  stockUnitsPerOrderUnit?: number
  /**
   * Backend #844 (V519, DEC-30-08): the product's stock unit when the line was written. Null on a
   * free-text line and on a line written before V519. Absent from a server before #844, which
   * refuses an unknown `statedUnit` (fail-on-unknown-properties), so the receipt form reads the
   * key's presence to tell whether it may send one (`readsStockUnits`).
   */
  productStockUnit?: string | null
}

export type PurchaseOrderDto = {
  id: string
  supplierId: string
  number: string | null
  state: PurchaseOrderStateDto
  orderDate: string | null
  wantedBy: string | null
  deliverToBranchId: string | null
  yourReference: string | null
  supplierNote: string | null
  currency: string
  totalNet: number | null
  totalVat: number | null
  totalGross: number | null
  lines: PurchaseOrderLineDto[]
  submittedBy: string | null
  submittedAt: string | null
  approvedBy: string | null
  approvedAt: string | null
  sentAt: string | null
  cancelledAt: string | null
  createdBy: string | null
  version: number
}

export type PurchaseOrderLineRequest = {
  lineNo: number | null
  description: string
  quantity: number
  unit: string | null
  unitPrice: number
  vatRate: number | null
  /**
   * The catalogue product the line buys (S2). Goods received on a line whose product is counted
   * (`keepCount`) raise its stock in the order's `deliverToBranchId`. Sent only for a picked
   * product, so a free-text line's body is what it was.
   */
  productId?: string | null
  /** Required exactly when the product has sizes or options (STOCK_VARIANT_REQUIRED). */
  variantId?: string | null
  /** How many of the product's own unit one ordered unit holds (a carton of 24 is 24); default 1. */
  stockUnitsPerOrderUnit?: number
}

export type PurchaseOrderRequest = {
  supplierId: string
  orderDate: string | null
  wantedBy: string | null
  deliverToBranchId: string | null
  yourReference: string | null
  supplierNote: string | null
  currency: string
  /** At least one. The server refuses an order with no lines. */
  lines: PurchaseOrderLineRequest[]
}

export type GoodsReceiptLineDto = {
  id: string
  purchaseOrderLineId: string
  quantityReceived: number
}

export type GoodsReceiptDto = {
  id: string
  purchaseOrderId: string
  number: string | null
  receivedOn: string | null
  checkedInBy: string | null
  note: string | null
  lines: GoodsReceiptLineDto[]
}

export type GoodsReceiptLineRequest = {
  purchaseOrderLineId: string
  quantityReceived: number
  /**
   * Backend #844: the stock unit the person receiving the goods says they counted in, at most 20
   * characters. Read only on a product line written before V519; for a counted product the server
   * refuses such a line without it (409 GOODS_RECEIPT_STOCK_UNIT_REQUIRED) and refuses a unit other
   * than the product's (409 PRODUCT_STOCK_UNIT_MISMATCH), each for the whole receipt.
   */
  statedUnit?: string
}

export type GoodsReceiptRequest = {
  receivedOn: string | null
  note: string | null
  lines: GoodsReceiptLineRequest[]
}

export function purchaseOrderPath(id: string) {
  return `${PURCHASE_ORDERS_PATH}/${id}`
}

export function purchaseOrderListPath(query: {
  supplierId?: string | null
  state?: PurchaseOrderStateDto | null
  page?: number
  pageSize?: number
}) {
  return withQuery(PURCHASE_ORDERS_PATH, {
    supplierId: query.supplierId ?? null,
    state: query.state ?? null,
    page: query.page ?? 0,
    page_size: query.pageSize ?? 20,
  })
}

export async function loadPurchaseOrderPage(path: string): Promise<Page<PurchaseOrderDto>> {
  return fromItemsPage(await apiRequest<ItemsPage<PurchaseOrderDto>>(path))
}

export function loadPurchaseOrder(id: string): Promise<PurchaseOrderDto> {
  return apiRequest<PurchaseOrderDto>(purchaseOrderPath(id))
}

/** `purchase-order.manage`. */
export function createPurchaseOrder(body: PurchaseOrderRequest): Promise<PurchaseOrderDto> {
  return apiRequest<PurchaseOrderDto>(PURCHASE_ORDERS_PATH, { method: 'POST', body })
}

export function updatePurchaseOrder(
  id: string,
  body: PurchaseOrderRequest,
): Promise<PurchaseOrderDto> {
  return apiRequest<PurchaseOrderDto>(purchaseOrderPath(id), { method: 'PUT', body })
}

/** The transitions, each refused by the domain when the order is not in a state that allows it. */
export type PurchaseOrderAction = 'submit' | 'approve' | 'send' | 'cancel' | 'close'

export function actOnPurchaseOrder(
  id: string,
  action: PurchaseOrderAction,
): Promise<PurchaseOrderDto> {
  return apiRequest<PurchaseOrderDto>(`${purchaseOrderPath(id)}/${action}`, { method: 'POST' })
}

export function loadGoodsReceipts(id: string): Promise<GoodsReceiptDto[]> {
  return apiRequest<GoodsReceiptDto[]>(`${purchaseOrderPath(id)}/receipts`)
}

/** Books goods in. The order moves itself to PARTIALLY_RECEIVED or RECEIVED as a result. */
export function recordGoodsReceipt(
  id: string,
  body: GoodsReceiptRequest,
): Promise<GoodsReceiptDto> {
  return apiRequest<GoodsReceiptDto>(`${purchaseOrderPath(id)}/receipts`, { method: 'POST', body })
}
