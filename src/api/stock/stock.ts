import { apiDownload, apiRequest, type ApiDownload } from '../client'
import { ApiError } from '../errors'
import { fromSpringPage, type Page, type SpringPage } from '../page'
import { withQuery } from '../query'

/**
 * Stock, branch by branch (`StockController`, catalogue guide section 8). Only items whose
 * product keeps a count are listed; every figure is a quantity in the product's own unit, or
 * OMR before VAT at three decimals.
 *
 * Reading needs `stock.read`; a count, a write-off and "Record what came in" need `stock.adjust`
 * and the plan's `stock` switch, and stay allowed while the subscription is read-only (ST-2);
 * reorder levels need `stock.manage`.
 */
export const STOCK_PATH = '/v1/stock'
export const STOCK_SUMMARY_PATH = `${STOCK_PATH}/summary`

export const STOCK_READ = 'stock.read'
export const STOCK_ADJUST = 'stock.adjust'
export const STOCK_MANAGE = 'stock.manage'

export type StockState = 'OK' | 'LOW' | 'OUT' | 'BELOW_ZERO' | 'NOT_COUNTED'

export type StockStatusFilter =
  | 'ALL'
  | 'NEEDS_ORDERING'
  | 'OUT'
  | 'BELOW_ZERO'
  | 'LOW'
  | 'SITTING_STILL'
  | 'NOT_COUNTED'
  | 'COUNTED'

export type StockSortDto = 'LOWEST_FIRST' | 'WORTH_MOST' | 'NAME' | 'DAYS_LEFT'

export type StockOnOrderDto = {
  purchaseOrderId: string
  number: string
  quantity: number
  wantedBy: string | null
}

/** `StockRow`: one counted item (a product without variants, or one variant) in one branch. */
export type StockRowDto = {
  productId: string
  variantId: string | null
  code: string
  name: string
  nameAr: string | null
  variantName: string | null
  /**
   * Backend #808 (INCOME.md P.19), absent from an older server: the size and option in Arabic,
   * and the product's kind and its group, read from the catalogue now.
   */
  variantNameAr?: string | null
  kindId?: string | null
  kindName?: string | null
  kindNameAr?: string | null
  groupId?: string | null
  groupName?: string | null
  groupNameAr?: string | null
  variantRetired: boolean
  productActive: boolean
  keepCount: boolean
  unitCode: string
  /** null = not counted yet (no movement). */
  onHand: number | null
  reorderLevel: number | null
  state: StockState
  perDay: number
  daysLeft: number | null
  /** The weighted average purchase cost per unit ("At what you paid"); null until a costed receipt. */
  averageCost: number | null
  lastCost: number | null
  worth: number | null
  sellingPrice: number | null
  onOrder: StockOnOrderDto[]
  supplier: { supplierId: string; name: string } | null
  lastMovementAt: string | null
  lastCountedAt: string | null
  /** 0 while the branch has no stock row; sent back as `expectedVersion`. */
  version: number
}

export type StockSummaryDto = {
  branchId: string
  counted: number
  notCounted: number
  worth: number
  runningLow: number
  nothingLeft: number
  belowZero: number
  needsOrdering: number
  sittingStill: number
  /** Today and the six days before it, in the company's time zone. */
  lastSevenDays: {
    from: string
    to: string
    sold: number
    received: number
    writtenOff: number
    corrected: number
    returned: number
  }
}

/**
 * `CANCEL_REVERSAL` (backend #845, source `CANCELLATION`): the opposite of a movement of an invoice
 * or credit note since cancelled, plus for a sale and minus for a return. An older server sends none.
 */
export type StockMovementType =
  | 'SALE'
  | 'RECEIPT'
  | 'WRITE_OFF'
  | 'COUNT_CORRECTION'
  | 'REFUND_RETURN'
  | 'CANCEL_REVERSAL'
  | 'OPENING'

export type StockSourceType =
  | 'POS_SALE'
  | 'INVOICE'
  | 'POS_REFUND'
  | 'CREDIT_NOTE'
  | 'GOODS_RECEIPT'
  | 'DELIVERY'
  | 'STOCK_COUNT'
  | 'WRITE_OFF'
  | 'CANCELLATION'
  | 'OPENING'

export type StockMovementDto = {
  id: string
  type: StockMovementType
  quantityChange: number
  onHandAfter: number
  countedQuantity: number | null
  unitCost: number | null
  averageCostAfter: number | null
  source: {
    type: StockSourceType
    id: string
    number: string | null
    lineRef?: string
    link: {
      kind: 'INVOICE' | 'CREDIT_NOTE' | 'PURCHASE_ORDER' | 'GOODS_RECEIPT' | 'ADJUSTMENT'
      id: string
    } | null
  }
  supplier: { supplierId: string; name: string } | null
  /**
   * Backend #815: the supplier's own reference typed on "Record what came in" (DELIVERY only);
   * null otherwise, absent from an older server.
   */
  supplierReference?: string | null
  reasonCode: string | null
  note: string | null
  occurredAt: string
  recordedAt: string
  by: { userId: string | null; name: string | null }
  customerKind: 'WALK_IN' | 'CONSUMER' | 'BUSINESS' | 'GOVERNMENT' | null
}

export type StockMovementPageDto = SpringPage<StockMovementDto>

export type StockDailyDto = {
  date: string
  onHandEnd: number | null
  sold: number
  received: number
  writtenOff: number
}

export type StockItemDetailDto = StockRowDto & {
  /** Thirty days, oldest first. */
  daily: StockDailyDto[]
  lastReceipt: {
    source: 'GOODS_RECEIPT' | 'DELIVERY'
    id: string
    number: string
    purchaseOrderId: string | null
    purchaseOrderNumber: string | null
    supplierId: string | null
    supplierName: string | null
    receivedOn: string
    quantity: number
    unitCost: number | null
  } | null
  leadDays: number | null
  usualOrderQuantity: number | null
  movements: StockMovementPageDto
  /** Bundles; always null for now. */
  dependsOnIt: unknown
}

export type StockLineRequest = {
  productId: string
  variantId?: string | null
  countedQuantity?: number
  quantity?: number
  unitCost?: number
}

export type StockCountRequest = {
  branchId: string
  countedAt?: string
  note?: string
  lines: StockLineRequest[]
}

export type WriteOffReason =
  | 'DAMAGED'
  | 'EXPIRED'
  | 'LOST'
  | 'STOLEN'
  | 'OWN_USE'
  | 'SAMPLE_OR_TASTING'
  | 'OTHER'

export const WRITE_OFF_REASONS: WriteOffReason[] = [
  'DAMAGED',
  'EXPIRED',
  'LOST',
  'STOLEN',
  'OWN_USE',
  'SAMPLE_OR_TASTING',
  'OTHER',
]

export type StockWriteOffRequest = {
  branchId: string
  reasonCode: WriteOffReason
  note?: string
  occurredAt?: string
  lines: StockLineRequest[]
}

export type StockDeliveryRequest = {
  branchId: string
  supplierId: string
  supplierReference?: string
  receivedOn?: string
  note?: string
  lines: StockLineRequest[]
}

export type StockAdjustmentResponse = {
  adjustmentId: string
  /** STK-… for counts and write-offs, DLV-… for deliveries, OPN-… for opening stock. */
  number: string
  kind: 'COUNT' | 'WRITE_OFF' | 'DELIVERY' | 'OPENING'
  supplierId?: string
  lines: {
    productId: string
    variantId: string | null
    onHandAfter: number
    movementId: string
    /** OPENING: the line's place in `items`, or its spreadsheet row (header = 1) on an import. */
    row?: number
    /** OPENING: the quantity before it (the previous opening, or 0). */
    previousQuantity?: number
    quantity?: number
    unitCost?: number | null
    value?: number | null
    averageCostAfter?: number | null
  }[]
}

export type StockListQuery = {
  branchId: string
  status?: StockStatusFilter
  q?: string
  sort?: StockSortDto
  page?: number
  size?: number
}

/** The list's path, which is also the request's identity. */
export function stockListPath(query: StockListQuery): string {
  return withQuery(STOCK_PATH, {
    branchId: query.branchId,
    status: query.status && query.status !== 'ALL' ? query.status : undefined,
    q: query.q?.trim() || undefined,
    sort: query.sort && query.sort !== 'LOWEST_FIRST' ? query.sort : undefined,
    page: query.page && query.page > 0 ? query.page : undefined,
    size: query.size,
  })
}

export async function loadStockPage(path: string): Promise<Page<StockRowDto>> {
  return fromSpringPage(await apiRequest<SpringPage<StockRowDto>>(path))
}

export function stockSummaryPath(branchId: string): string {
  return withQuery(STOCK_SUMMARY_PATH, { branchId })
}

export function loadStockSummary(path: string): Promise<StockSummaryDto> {
  return apiRequest<StockSummaryDto>(path)
}

const itemBase = (productId: string) => `${STOCK_PATH}/items/${encodeURIComponent(productId)}`

export function stockItemPath(productId: string, branchId: string, variantId?: string | null) {
  return withQuery(itemBase(productId), { branchId, variantId: variantId || undefined })
}

export function loadStockItem(path: string): Promise<StockItemDetailDto> {
  return apiRequest<StockItemDetailDto>(path)
}

export function stockMovementsPath(query: {
  productId: string
  branchId: string
  variantId?: string | null
  page?: number
  size?: number
}): string {
  return withQuery(`${itemBase(query.productId)}/movements`, {
    branchId: query.branchId,
    variantId: query.variantId || undefined,
    page: query.page && query.page > 0 ? query.page : undefined,
    size: query.size,
  })
}

export async function loadStockMovements(path: string): Promise<Page<StockMovementDto>> {
  return fromSpringPage(await apiRequest<StockMovementPageDto>(path))
}

/** `stock.adjust`. The key is the form's, so a second click or a retry counts once. */
export function postStockCount(
  idempotencyKey: string,
  body: StockCountRequest,
): Promise<StockAdjustmentResponse> {
  return apiRequest<StockAdjustmentResponse>(`${STOCK_PATH}/counts`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** `stock.adjust`. */
export function postStockWriteOff(
  idempotencyKey: string,
  body: StockWriteOffRequest,
): Promise<StockAdjustmentResponse> {
  return apiRequest<StockAdjustmentResponse>(`${STOCK_PATH}/write-offs`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** `stock.adjust`: goods in without a purchase order. Raises no bill. */
export function postStockDelivery(
  idempotencyKey: string,
  body: StockDeliveryRequest,
): Promise<StockAdjustmentResponse> {
  return apiRequest<StockAdjustmentResponse>(`${STOCK_PATH}/deliveries`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** `stock.manage`. `null` clears the level. */
export function putReorderLevel(
  productId: string,
  branchId: string,
  variantId: string | null,
  body: { reorderLevel: number | null; expectedVersion: number },
): Promise<StockRowDto> {
  return apiRequest<StockRowDto>(
    withQuery(`${itemBase(productId)}/reorder-level`, {
      branchId,
      variantId: variantId || undefined,
    }),
    { method: 'PUT', body },
  )
}

/** `stock.manage`: up to 500 items at once, no version check. */
export function putReorderLevels(body: {
  branchId: string
  items: { productId: string; variantId: string | null; reorderLevel: number | null }[]
}): Promise<{ branchId: string; content: StockRowDto[] }> {
  return apiRequest(`${STOCK_PATH}/reorder-levels`, { method: 'PUT', body })
}

/* -------------------------------------------------------------- opening stock */

/**
 * Opening stock (Abdul Hameed, 29 Oct 2026): per item and branch, the quantity on hand when the
 * company starts and, optionally, what one unit cost before VAT, so the stock value starts right.
 * Its own movement, typed or imported; locked once anything else moves the item (a sale, a
 * delivery, a count, a write-off, a return), after which it is changed with a count.
 *
 * Reading the list and the import format needs `stock.read` and is open whatever the plan; the
 * writes need `stock.adjust` and the plan's `stock` switch, and stay allowed while the
 * subscription is read-only. All lines or none: a refusal lists every line's problem.
 */
export const STOCK_OPENING_PATH = `${STOCK_PATH}/opening`
export const STOCK_OPENING_IMPORT_PATH = `${STOCK_OPENING_PATH}/import`
export const STOCK_OPENING_FORMAT_PATH = `${STOCK_OPENING_PATH}/import-format`

/** The server's own size limit for the import file. */
export const STOCK_OPENING_IMPORT_MAX_BYTES = 5 * 1024 * 1024
/** Items one save may carry. */
export const STOCK_OPENING_MAX_ITEMS = 500

export type StockOpeningState = 'NOT_SET' | 'SET' | 'LOCKED'

export type StockOpeningRowDto = {
  productId: string
  variantId: string | null
  code: string
  variantCode: string | null
  name: string
  nameAr: string | null
  variantName: string | null
  variantRetired?: boolean
  productActive?: boolean
  keepCount: boolean
  unitCode: string
  state: StockOpeningState
  opening: {
    quantity: number
    unitCost: number | null
    value: number | null
    adjustmentId?: string
    number: string
    movementId?: string
    setAt: string
    setBy: { userId?: string | null; name: string | null }
  } | null
  /** null = not counted yet. */
  onHand: number | null
  /** The first movement that is not an opening. */
  lockedBy: Exclude<StockMovementType, 'OPENING'> | null
  lockedAt: string | null
}

export type StockOpeningPageDto = SpringPage<StockOpeningRowDto> & { branchId: string }

export type StockOpeningItem = {
  productId: string
  variantId?: string
  quantity: number
  unitCost?: number
}

export type StockOpeningRequest = { branchId: string; items: StockOpeningItem[] }

/** One line's problem in a refused opening: `row` is the 1-based line, or the file's row. */
export type StockOpeningProblem = {
  row: number | null
  column: string | null
  productId: string | null
  variantId: string | null
  code: string | null
  message: string | null
}

export function stockOpeningPath(query: {
  branchId: string
  state?: StockOpeningState
  page?: number
  size?: number
}): string {
  return withQuery(STOCK_OPENING_PATH, {
    branchId: query.branchId,
    state: query.state,
    page: query.page && query.page > 0 ? query.page : undefined,
    size: query.size,
  })
}

export async function loadStockOpeningPage(path: string): Promise<Page<StockOpeningRowDto>> {
  return fromSpringPage(await apiRequest<StockOpeningPageDto>(path))
}

/** `stock.adjust` and the plan's `stock` switch. The key is the save's, so a retry counts once. */
export function postStockOpening(
  idempotencyKey: string,
  body: StockOpeningRequest,
): Promise<StockAdjustmentResponse> {
  return apiRequest<StockAdjustmentResponse>(STOCK_OPENING_PATH, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** The same rules from a UTF-8 CSV: the catalogue spreadsheet's columns may stay. */
export function postStockOpeningImport(
  idempotencyKey: string,
  branchId: string,
  file: File,
): Promise<StockAdjustmentResponse> {
  const form = new FormData()
  form.append('file', file)
  return apiRequest<StockAdjustmentResponse>(withQuery(STOCK_OPENING_IMPORT_PATH, { branchId }), {
    method: 'POST',
    body: form,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** A CSV header with two example rows. */
export function downloadStockOpeningFormat(): Promise<ApiDownload> {
  return apiDownload(STOCK_OPENING_FORMAT_PATH)
}

const textOrNull = (value: unknown) => (typeof value === 'string' && value !== '' ? value : null)

/** Every line's problem a refused opening listed; empty for any other failure. */
export function stockOpeningProblems(error: unknown): StockOpeningProblem[] {
  if (!(error instanceof ApiError)) return []
  const errors = error.problem.errors
  if (!Array.isArray(errors)) return []
  return errors.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return []
    const e = entry as Record<string, unknown>
    return [
      {
        row: typeof e.row === 'number' ? e.row : null,
        column: textOrNull(e.column),
        productId: textOrNull(e.productId),
        variantId: textOrNull(e.variantId),
        code: textOrNull(e.code),
        message: textOrNull(e.message),
      },
    ]
  })
}

/** A key the server accepts (16 to 128 of `[A-Za-z0-9._:-]`). */
export function newStockKey(): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `stock-${random}`
}
