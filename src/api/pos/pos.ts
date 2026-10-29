import { apiRequest } from '../client'
import { withQuery } from '../query'
import type { DraftRequest } from '../invoices/drafts'
import type { BuyerIdentifierScheme } from '../customers/customers'

/**
 * The till (`/v1/pos/*`, catalogue guide section 9, rows P.11 and P.12). Money is OMR at three
 * decimals, as the server sends it; the screens turn it into baisa (`src/lib/pos.ts`).
 */
export const POS_PATH = '/v1/pos'
export const POS_TILLS_PATH = `${POS_PATH}/tills`
export const POS_SALES_PATH = `${POS_PATH}/sales`
export const POS_TODAY_PATH = `${POS_PATH}/today`
export const POS_SHIFTS_PATH = `${POS_PATH}/shifts`
export const POS_CUSTOMERS_PATH = `${POS_PATH}/customers`
export const POS_SLIPS_PATH = `${POS_PATH}/slips`
export const POS_REFUND_LOOKUP_PATH = `${POS_PATH}/refund-lookup`

const id = (value: string) => encodeURIComponent(value)

export type PosPerson = { userId: string; name: string | null }

export type PosSeries = { series: string; year: number; nextValue: number }

/** `PosTill`. */
export type PosTillDto = {
  id: string
  branchId: string
  number: number
  code: string
  seriesBase: string
  name: string
  status: 'ACTIVE' | 'RETIRED'
  defaultFloat: number
  version: number
  openShift: { shiftId: string; cashier: PosPerson; openedAt: string } | null
  /** Keyed `INVOICE` and `CREDIT_NOTE`. */
  series: Record<string, PosSeries>
}

export type PosShiftDto = {
  shiftId: string
  tillId: string
  branchId: string
  cashier: PosPerson
  status: 'OPEN' | 'ENDED_UNCOUNTED' | 'CLOSED'
  businessDate: string
  openedAt: string
  openingFloat: number
  openingFloatSource: 'SET' | 'CLOSE' | 'HANDOVER' | 'DEFAULT'
  endedAt: string | null
  handedOverFrom: string | null
}

export function posTillsPath(branchId: string): string {
  return withQuery(POS_TILLS_PATH, { branchId })
}

export function loadPosTills(branchId: string): Promise<PosTillDto[]> {
  return apiRequest<PosTillDto[]>(posTillsPath(branchId))
}

export function loadPosTill(tillId: string): Promise<PosTillDto> {
  return apiRequest<PosTillDto>(`${POS_TILLS_PATH}/${id(tillId)}`)
}

/** Needs `pos.till.manage`. */
export function registerPosTill(branchId: string): Promise<PosTillDto> {
  return apiRequest<PosTillDto>(POS_TILLS_PATH, { method: 'POST', body: { branchId } })
}

/**
 * Opens the signed-in cashier's shift; another cashier's open shift ends uncounted (a handover).
 * The session's user is the cashier: no cashier id is ever sent (round 2, answer 11).
 */
export function openPosShift(tillId: string, openingFloat?: number | null): Promise<PosShiftDto> {
  return apiRequest<PosShiftDto>(`${POS_TILLS_PATH}/${id(tillId)}/shifts`, {
    method: 'POST',
    body: openingFloat == null ? {} : { openingFloat },
  })
}

/* ------------------------------------------------------------------ customers */

/** `PosCompanyCustomerRequest`: a company added at the till. */
export type PosCompanyCustomerRequest = {
  tillId: string
  name: string
  contactPerson: string
  vatNumber?: string | null
  email?: string | null
  identifierScheme?: BuyerIdentifierScheme | null
  identifierValue?: string | null
  /**
   * The invoice address (`CustomerAddress`): a full invoice needs its country, city and street
   * (`missingInvoiceFields`), so a company added without them can never be sold to (E2E F-1).
   */
  address?: { countryCode: string; cityName: string; streetName: string } | null
}

export function addPosCustomer<T>(
  body: PosCompanyCustomerRequest,
  idempotencyKey: string,
): Promise<T> {
  return apiRequest<T>(POS_CUSTOMERS_PATH, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/* ---------------------------------------------------------------------- sales */

export type PosCustomerKind = 'WALK_IN' | 'CONSUMER' | 'BUSINESS' | 'GOVERNMENT'
export type PosMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'ON_ACCOUNT'

export type PosSlipFields = {
  authCode?: string | null
  rrn?: string | null
  cardLast4?: string | null
  cardType?: string | null
  amount?: number | null
}

export type PosPaymentRequest = {
  method: PosMethod
  amount: number
  tendered?: number | null
  cardApprovalCode?: string | null
  reference?: string | null
  slipFileId?: string | null
  slipFields?: PosSlipFields | null
}

export type PosLineRef = {
  lineNumber: number
  role: 'ITEM' | 'ADD_ON'
  productId: string
  variantId?: string | null
  addOnId?: string | null
  /** The price rule the till applied (`GET /price-rules/active`), at most one. */
  priceRuleIds?: string[]
}

export type PosConsumer = {
  name: string
  contact?: string | null
  identifierScheme?: BuyerIdentifierScheme | null
  identifierValue?: string | null
}

/** `PosSaleRequest`. The draft is the invoice composer's own request (`posInvoiceRequest`). */
export type PosSaleRequest = {
  tillId: string
  soldAt: string
  queuedOffline: boolean
  invoiceNumber: string | null
  customer: { kind: PosCustomerKind; customerId?: string | null; consumer?: PosConsumer | null }
  draft: Omit<DraftRequest, 'customerId'> & { customerId?: string }
  lineRefs: PosLineRef[]
  payments: PosPaymentRequest[]
  tip: { amount: number; method: 'CASH' | 'CARD' } | null
}

export type PosPaymentSlip = {
  fileId: string | null
  authCode: string | null
  rrn: string | null
  cardLast4: string | null
  cardType: string | null
  amount: number | null
  amountDiffers: boolean
}

export type PosSalePayment = {
  method: PosMethod
  amount: number
  cardApprovalCode: string | null
  cardLast4?: string | null
  reference: string | null
  tendered: number | null
  change: number | null
  position?: number
  slip?: PosPaymentSlip | null
}

export type PosFiling = {
  dispatchState: 'QUEUED' | 'DISPATCHED' | 'DEAD_LETTERED' | 'CANCELLED'
  tddStatus: string | null
  acceptedAt: string | null
  channel: 'TAX_AUTHORITY' | 'PEPPOL'
}

export type PosWarning = { code: string; line: number | null; message?: string }

export type PosTotals = {
  subtotal: number
  itemDiscount: number
  headerDiscount: number
  taxable: number
  vat: number
  total: number
}

/** `PosSale`: the answer to a sale, a replay and `GET /pos/sales/{saleId}`. */
export type PosSaleDto = {
  saleId: string
  replayed?: boolean
  tillId: string
  tillNumber: number
  branchId: string
  shiftId: string
  cashier: PosPerson
  invoiceId: string
  invoiceNumber: string
  transactionType: 'SIMPLIFIED' | 'FULL_TAX'
  customerKind: PosCustomerKind
  customerId: string
  issueDate: string
  soldAt: string
  receivedAt: string
  queuedOffline: boolean
  totals: PosTotals
  payments: PosSalePayment[]
  onAccount: number
  tip: number
  tipMethod: 'CASH' | 'CARD' | null
  receipt: {
    invoiceTotal: number
    tip: number
    totalPaid: number
    onAccount: number
    qr: {
      status: 'PENDING' | 'READY' | 'NOT_APPLICABLE'
      payload: string | null
      pngUrl: string | null
    }
  }
  filing: PosFiling
  warnings: PosWarning[]
}

type SaleFiledListener = (sale: PosSaleDto, body: PosSaleRequest) => void
const saleFiledListeners = new Set<SaleFiledListener>()

/**
 * Called with every sale the server takes, online or sent from the offline queue, so a screen can
 * show a warning that only arrives when a queued sale is sent (`POS_PRICE_RULE_STALE_ACCEPTED`).
 */
export function onPosSaleFiled(listener: SaleFiledListener): () => void {
  saleFiledListeners.add(listener)
  return () => saleFiledListeners.delete(listener)
}

export async function createPosSale(
  body: PosSaleRequest,
  idempotencyKey: string,
): Promise<PosSaleDto> {
  const sale = await apiRequest<PosSaleDto>(POS_SALES_PATH, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
  saleFiledListeners.forEach((listener) => listener(sale, body))
  return sale
}

/** `wait` (0 to 15 s) answers as soon as the QR or the filing changes: the receipt's last steps. */
export function loadPosSale(saleId: string, wait = 0): Promise<PosSaleDto> {
  return apiRequest<PosSaleDto>(withQuery(`${POS_SALES_PATH}/${id(saleId)}`, { wait }), {
    timeoutMs: (wait + 15) * 1000,
  })
}

/** The QR image, served by the API (the session cookie authorises an `<img>`). */
export function posSaleQrPath(saleId: string): string {
  return `${POS_SALES_PATH}/${id(saleId)}/qr`
}

/* ---------------------------------------------------------------------- today */

export type PosTodayTab =
  'ALL' | 'CASH' | 'CARD' | 'TRANSFER' | 'ON_ACCOUNT' | 'COMPANY' | 'REFUNDED' | 'MINE'

export type PosTodaySaleRow = {
  saleId: string
  invoiceId: string
  invoiceNumber: string
  soldAt: string
  time: string
  tillId: string
  tillNumber: number
  shiftId: string
  cashier: PosPerson
  summary: string
  items: number
  customer: { kind: PosCustomerKind; customerId: string; name: string | null }
  transactionType: 'SIMPLIFIED' | 'FULL_TAX'
  paymentTerms: string
  payMethod: PosMethod | 'MIXED'
  payments: PosSalePayment[]
  total: number
  tip: number
  onAccount: number
  changeGiven: number
  credit: { state: 'NONE' | 'PARTLY' | 'FULLY'; credited: number; creditNoteNumbers: string[] }
  /**
   * The badge. `waiting` (not accepted yet) and `failed` (never sent, or ended without acceptance)
   * come from backend #810; an older server says `filed` for both, so the till also reads `filing`.
   */
  displayState: 'filed' | 'peppol' | 'credited' | 'waiting' | 'failed'
  /** Where the sale stands with the Authority. */
  filing?: PosFiling | null
  refundable: boolean
  queuedOffline: boolean
}

export type PosTodaySalesPage = {
  branchId: string
  businessDate: string
  page: number
  size: number
  totalElements: number
  content: PosTodaySaleRow[]
}

export type PosTodayQuery = {
  branchId: string
  date?: string | null
  tillId?: string | null
  shiftId?: string | null
  tab?: PosTodayTab
  q?: string
  page?: number
  size?: number
}

export function posSalesPath(query: PosTodayQuery): string {
  return withQuery(POS_SALES_PATH, {
    branchId: query.branchId,
    date: query.date,
    tillId: query.tillId,
    shiftId: query.shiftId,
    tab: query.tab && query.tab !== 'ALL' ? query.tab : undefined,
    q: query.q?.trim(),
    page: query.page,
    size: query.size,
  })
}

export type PosMethodFigure = { method: PosMethod; count: number; amount: number }

export type PosTodayDto = {
  branchId: string
  businessDate: string
  sales: { count: number; amount: number; average: number }
  byMethod: PosMethodFigure[]
  companyInvoices: number
  refunds: { count: number; amount: number }
  tips: number
  discounts: number
  vat: number
  busiestHour: { from: string; to: string; sales: number; amount: number } | null
  bestSeller: { productId: string; name: string; quantity: number; takings: number } | null
  tabs: {
    all: number
    cash: number
    card: number
    transfer: number
    onAccount: number
    company: number
    refunded: number
    mine: number
  }
  notYetAccepted: number
  lastSaleTime: string | null
}

export function posTodayPath(query: Pick<PosTodayQuery, 'branchId' | 'date' | 'tillId'>): string {
  return withQuery(POS_TODAY_PATH, {
    branchId: query.branchId,
    date: query.date,
    tillId: query.tillId,
  })
}

/* ---------------------------------------------------------------------- close */

export type PosShiftMethodFigures = {
  method: PosMethod
  sales: number
  taken: number
  refunded: number
  tips: number
}

export type PosLooseEnds = {
  onAccountOpen: { count: number; amount: number }
  notYetAccepted: number
  cardSalesForTerminalCheck: { count: number; amount: number }
}

export type PosCashMovementDto = {
  movementId: string
  shiftId: string
  type: 'FLOAT_SET' | 'PAID_OUT' | 'PAID_IN'
  amount: number
  note: string | null
  recordedAt: string
}

export type PosClosePreviewDto = {
  shiftId: string
  tillId: string
  tillNumber: number
  branchId: string
  cashier: PosPerson
  status: 'OPEN' | 'ENDED_UNCOUNTED' | 'CLOSED'
  businessDate: string
  openedAt: string
  endedAt: string | null
  openingFloat: number
  openingFloatSource: 'SET' | 'CLOSE' | 'HANDOVER' | 'DEFAULT'
  salesCount: number
  salesAmount: number
  byMethod: PosShiftMethodFigures[]
  companyInvoices: number
  vatWithin: number
  discounts: number
  tips: number
  paidOut: number
  paidIn: number
  cashRefunded: number
  expectedCash: number
  looseEnds: PosLooseEnds
  movements: PosCashMovementDto[]
  at: string
}

export type OverShortReason = 'CHANGE_WRONG' | 'PAYOUT_MISSED' | 'MISCOUNTED' | 'DONT_KNOW'

export type PosShiftCloseRequest = {
  counting: {
    mode: 'DENOMINATIONS' | 'TOTAL'
    denominations?: { value: number; count: number }[]
    total?: number
  } | null
  floatLeft: number | null
  cardTerminalTotal: number | null
  cardDifferenceNote: string | null
  overShortReason: OverShortReason | null
  note: string | null
}

export type PosShiftCloseDto = {
  shiftId: string
  closedAt: string
  countedCash: number
  expectedCash: number
  overShort: number
  floatLeft: number
  toBank: number
  cardTerminalTotal: number | null
  cardTerminalDifference: number | null
  cardDifferenceNote: string | null
  replayed?: boolean
}

export function closePreviewPath(shiftId: string): string {
  return `${POS_SHIFTS_PATH}/${id(shiftId)}/close-preview`
}

export function setShiftFloat(shiftId: string, amount: number): Promise<PosShiftDto> {
  return apiRequest<PosShiftDto>(`${POS_SHIFTS_PATH}/${id(shiftId)}/float`, {
    method: 'PUT',
    body: { amount },
  })
}

export function addCashMovement(
  shiftId: string,
  body: { type: 'PAID_OUT' | 'PAID_IN'; amount: number; note: string | null },
): Promise<PosCashMovementDto> {
  return apiRequest<PosCashMovementDto>(`${POS_SHIFTS_PATH}/${id(shiftId)}/cash-movements`, {
    method: 'POST',
    body,
  })
}

export function closePosShift(
  shiftId: string,
  body: PosShiftCloseRequest,
  idempotencyKey: string,
): Promise<PosShiftCloseDto> {
  return apiRequest<PosShiftCloseDto>(`${POS_SHIFTS_PATH}/${id(shiftId)}/close`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/* ------------------------------------------------------------- the daily summary */

export type PosShiftSummaryDto = {
  shiftId: string
  tillId: string
  tillNumber: number
  cashier: PosPerson
  status: 'OPEN' | 'ENDED_UNCOUNTED' | 'CLOSED'
  openedAt: string
  closedAt: string | null
  salesCount: number
  cashExpected: number | null
  cashCounted: number | null
  overShort: number | null
  uncountedHandover: boolean
  cardTerminalDifference: number | null
}

export type PosDaySummaryDto = {
  businessDate: string
  branchId: string
  totals: {
    sales: { count: number; amount: number; average: number }
    byMethod: PosMethodFigure[]
    companyInvoices: number
    refunds: { count: number; amount: number }
    tips: number
    discounts: number
    vat: number
    paidOut: number
    paidIn: number
    notYetAccepted: number
    onAccountOpen: { count: number; amount: number }
  }
  shifts: PosShiftSummaryDto[]
  openShifts: number
  uncountedHandovers: number
  lateOfflineSales: { saleId: string; invoiceNumber: string; amount: number }[]
  filedPastRestriction: number
  overShortTotal: number
  cardDifferenceTotal: number
}

export function posDayPath(date: string, branchId: string): string {
  return withQuery(`${POS_PATH}/days/${id(date)}`, { branchId })
}

/* -------------------------------------------------------------------- refunds */

export type PosRefundLookupLine = {
  lineNumber: number
  role: 'ITEM' | 'ADD_ON' | 'TYPED'
  productId: string | null
  description: string
  quantitySold: number
  quantityRefunded: number
  unitPrice: number
  discount: { type: 'PERCENTAGE' | 'FIXED_AMOUNT'; value: number } | null
  vatRate: number | null
  vatCategory: string | null
  refundable: boolean
}

export type PosRefundLookupDto = {
  saleId: string
  invoiceId: string
  invoiceNumber: string
  soldAt: string
  transactionType: 'SIMPLIFIED' | 'FULL_TAX'
  branch: { id: string; name: string | null }
  customer: { kind: PosCustomerKind; customerId: string; name: string | null }
  headerDiscount: { type: 'PERCENTAGE' | 'FIXED_AMOUNT'; value: number } | null
  lines: PosRefundLookupLine[]
  paid: { byMethod: { method: PosMethod; amount: number }[]; total: number; paidBack: number }
  total: number
  /** The tip paid on top, never refunded (backend #810); absent from an older server. */
  tip?: number
  tipMethod?: 'CASH' | 'CARD' | null
  credited: number
  owed: number
  creditNoteNumbers: string[]
}

export type PosRefundReason =
  'MADE_WRONG' | 'RUNG_UP_WRONG' | 'CHANGED_MIND' | 'SOMETHING_OFF' | 'WAITED_TOO_LONG' | 'OTHER'

export type PosRefundRequest = {
  tillId: string
  reason: PosRefundReason
  reasonNote: string | null
  lines: { lineNumber: number; quantity: number; backOnShelf: boolean }[]
  moneyBack: { method: 'CASH' | 'CARD' | 'TRANSFER' | 'REDUCE_BALANCE'; amount: number }[]
}

export type PosRefundDto = {
  refundId: string
  saleId: string
  creditNoteId: string
  creditNoteNumber: string
  totals: PosTotals
  warnings: PosWarning[]
  replayed?: boolean
}

export function refundLookupPath(invoiceNumber: string): string {
  return withQuery(POS_REFUND_LOOKUP_PATH, { invoiceNumber: invoiceNumber.trim() })
}

export function createPosRefund(
  saleId: string,
  body: PosRefundRequest,
  idempotencyKey: string,
): Promise<PosRefundDto> {
  return apiRequest<PosRefundDto>(`${POS_SALES_PATH}/${id(saleId)}/refunds`, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/* ---------------------------------------------------------------------- slips */

export type PosSlipFileDto = { fileId: string; tillId: string; contentType: string }

export type PosSlipField = { value: string | null; confidence: number }

export type PosSlipReadingDto = {
  fileId: string
  reason: 'READING_UNAVAILABLE' | 'READ_FAILED' | null
  authCode: PosSlipField
  rrn: PosSlipField
  cardLast4: PosSlipField
  cardType: PosSlipField
  amount: PosSlipField
}

/** Needs the plan's `pos` and `slipScan` switches. Never needed to sell. */
export function uploadPosSlip(tillId: string, file: Blob, name: string): Promise<PosSlipFileDto> {
  const body = new FormData()
  body.append('file', file, name)
  return apiRequest<PosSlipFileDto>(withQuery(POS_SLIPS_PATH, { tillId }), {
    method: 'POST',
    body,
    timeoutMs: 60_000,
  })
}

export function readPosSlip(fileId: string): Promise<PosSlipReadingDto> {
  return apiRequest<PosSlipReadingDto>(`${POS_SLIPS_PATH}/read`, {
    method: 'POST',
    body: { fileId },
  })
}

export type PosSlipAttachedDto = {
  saleId: string
  position: number
  slip: PosPaymentSlip
  replayed: boolean
  warnings: PosWarning[]
}

/**
 * The slip of a card payment made earlier: a sale queued offline whose photo is uploaded once it
 * is filed. The same slip again answers 200 `replayed`; a slip's warnings never refuse.
 */
export function attachPosSlip(
  saleId: string,
  position: number,
  body: { slipFileId?: string | null; slipFields?: PosSlipFields | null },
): Promise<PosSlipAttachedDto> {
  return apiRequest<PosSlipAttachedDto>(
    `${POS_SALES_PATH}/${encodeURIComponent(saleId)}/payments/${position}/slip`,
    { method: 'PUT', body },
  )
}

/** A key for one write, 16 to 128 of `[A-Za-z0-9._:-]`. */
export function newPosKey(kind: string): string {
  return `pos-${kind}-${crypto.randomUUID()}`
}
