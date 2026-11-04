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

export type PosSeries = {
  series: string
  year: number
  nextValue: number
  /** The tenant zone `year` is counted in; an older server leaves it out. */
  timeZone?: string
}

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
  /** The server keeps open numbers (skip, set aside, the outstanding list); an older one leaves this out. */
  openNumbers?: boolean
  /**
   * The server takes `claimedMakerUnverified` (owner Round 13, L-2). An older one leaves this out and
   * refuses the unknown field, so the till sends it only where this is true.
   */
  takesMakerClaim?: boolean
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

/** Every active till the reader's branches can see, for a count per branch. */
export function loadAllPosTills(): Promise<PosTillDto[]> {
  return apiRequest<PosTillDto[]>(POS_TILLS_PATH)
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

/** `PosConsumerMatchRequest`: the facts a sale's `customer.consumer` carries. */
export type PosConsumerMatchRequest = {
  tillId: string
  name: string
  contact: string | null
  identifierScheme: string
  identifierValue: string
}

/**
 * `PosConsumerMatch`: the customer on file the sale would be filed against, by the sale's own
 * matching rule; `match: 'none'` when it would make a new customer. A civil ID or passport number
 * comes masked to a cashier.
 */
export type PosConsumerMatch = {
  match: 'none' | 'identifier' | 'contact' | 'name'
  customerId: string | null
  name: string | null
  sameName: boolean
  identifierScheme: string | null
  identifierValue: string | null
  identifierValueMasked: boolean
}

export const POS_CUSTOMER_MATCH_PATH = `${POS_CUSTOMERS_PATH}/match`

/** POST, so the buyer's ID never sits in a URL. Reads only: nothing is created. */
export function matchPosConsumer(
  body: PosConsumerMatchRequest,
  signal?: AbortSignal,
): Promise<PosConsumerMatch> {
  return apiRequest<PosConsumerMatch>(POS_CUSTOMER_MATCH_PATH, { method: 'POST', body, signal })
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
  /** Numbers before `invoiceNumber` this till printed and cannot file yet. */
  skippedNumbers?: string[]
  customer: { kind: PosCustomerKind; customerId?: string | null; consumer?: PosConsumer | null }
  draft: Omit<DraftRequest, 'customerId'> & { customerId?: string }
  lineRefs: PosLineRef[]
  payments: PosPaymentRequest[]
  tip: { amount: number; method: 'CASH' | 'CARD' } | null
  /**
   * Only on a queued sale signed with a key this server registered, and only with `printed`
   * (V530, BINDING-DESIGN §5.1). Both are outside the server's stored request hashes, so the same
   * sale sent with or without them replays.
   */
  offlineProof?: { keyId: string; signature: string }
  /** The totals the receipt printed, as JSON numbers; signed with the sale. */
  printed?: PosPrintedTotals
  /**
   * Who was signed in on this device when the sale was queued, as the device says (owner Round 13,
   * L-2). UNTRUSTED: the server records it in the audit as a claim and decides nothing on it. Only on
   * an unsigned queued sale, to a server with `takesMakerClaim`; outside the stored request hashes.
   */
  claimedMakerUnverified?: string
}

export type PosPrintedTotals = {
  taxable: number
  vat: number
  total: number
  vatBreakdown?: { category: string; rate: number; taxable: number; vat: number }[]
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
  /**
   * `GET /pos/sales` (batch 39 FIN-1): the company invoice's Peppol delivery, in the invoice list's
   * `deliveryState` words. Null when the server cannot read it; absent from a server before it.
   */
  peppolDelivery?: PeppolDeliveryState | null
}

export type PeppolDeliveryState =
  | 'NOT_SUBMITTED'
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'DELIVERED_UNCONFIRMED'
  | 'UNDELIVERABLE'

export type PosWarning = {
  code: string
  line: number | null
  message?: string
  /** `POS_PRINTED_NUMBER_DIFFERS`, added by the queue: what the receipt says, and the filed number. */
  printed?: string
  filed?: string
}

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
  /** Null while who sold it is unproven (V530 PENDING_REVIEW). */
  cashier: PosPerson | null
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
  /** The signed-in sender; absent before V530, null on a sale stored before it. */
  filedBy?: PosPerson | null
  /** Absent before V530. */
  attribution?: PosAttribution | null
}

export type PosAttribution = 'ONLINE' | 'VERIFIED' | 'PENDING_REVIEW' | 'LEGACY'

export function createPosSale(body: PosSaleRequest, idempotencyKey: string): Promise<PosSaleDto> {
  return apiRequest<PosSaleDto>(POS_SALES_PATH, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
  })
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
  /**
   * Null while who sold it is unproven (fix/b39-fin-latecash 8f4518909); a server between V530 and
   * that change sends `{userId: null, name: null}` instead, read the same way.
   */
  cashier: PosPerson | { userId: null; name: null } | null
  /** The signed-in sender; absent on an older server. */
  filedBy?: PosPerson | null
  /** Absent on an older server, null before V530. */
  attribution?: PosAttribution | null
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
  /**
   * Cash of offline sales filed into the shift this one took over from after the handover
   * (fix/b39-fin-latecash, B39-SR-3). Information only: never part of `expectedCash`. Absent on an
   * older server, which reads as 0.
   */
  lateCashFromHandedOverShift?: number
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

/* --------------------------------------------------------------- open numbers */

/** A printed number no invoice carries yet. It stays listed until it is filed, set aside or not. */
export type PosOpenNumberDto = {
  tillId: string
  tillNumber: number
  invoiceNumber: string
  refusalCode: string | null
  reason: string | null
  soldAt: string | null
  amount: number | null
  firstRecordedAt: string
  passed: boolean
  setAsideAt: string | null
  setAsideBy: string | null
  setAsideReason: string | null
}

export function posOpenNumbersPath(branchId: string): string {
  return withQuery(`${POS_PATH}/open-numbers`, { branchId })
}

/** `pos.till.manage`. Lets the queue move on and closes nothing; only on a server with `openNumbers`. */
export function setAsideOpenNumber(
  tillId: string,
  invoiceNumber: string,
  reason: string,
): Promise<PosOpenNumberDto> {
  return apiRequest<PosOpenNumberDto>(`${POS_PATH}/open-numbers/set-aside`, {
    method: 'POST',
    body: { tillId, invoiceNumber, reason },
  })
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
  /**
   * The line credits 0.000, so it comes back as a stock return with no credit note. Absent from a
   * server that cannot take such a return yet, and the till then refunds as before.
   */
  givenFree?: boolean
  /**
   * DEC-30-01: an earlier credit note from the invoice screens does not say whether goods came back,
   * so the server marks the line not refundable here and refuses it (`POS_REFUND_LINE_CREDIT_UNCLEAR`).
   */
  creditUnclear?: boolean
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
  /** The original invoice's filing, read now (backend #808, INCOME.md P.31); absent before it. */
  filing?: PosFiling | null
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
  /**
   * Numbered by the sale line. `hsCode` only for a goods line of a full tax invoice that has none,
   * after the server asked for it (`HS_CODE_REQUIRED`, IBR-174-OM); the server checks it against
   * CL-08-OM-HS (`HS_CODE_UNKNOWN`).
   */
  lines: { lineNumber: number; quantity: number; backOnShelf: boolean; hsCode?: string }[]
  moneyBack: {
    method: PosRefundMoneyMethod
    amount: number
    /** On card, the machine's approval reference, optional as on a card sale. */
    reference?: string | null
  }[]
}

export type PosRefundMoneyMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'REDUCE_BALANCE'

/**
 * What a refund of these lines comes to, from the server's own figures, and how its money goes back
 * unless the cashier changes it (backend `POST .../refund-quote`). Issues nothing.
 */
export type PosRefundQuoteDto = {
  total: number
  lastRefund: boolean
  suggested: { method: PosRefundMoneyMethod; amount: number }[]
  /** What the card can still get back: paid by card, less earlier card refunds. */
  cardLimit: number
  /** The most that may go out in cash, card or transfer. */
  payOutLimit: number
  /** What must come off what the customer owes. */
  reduceBalance: number
  /**
   * Money no way the sale was paid can take back. It is never put in `suggested`, so the cashier
   * routes it: guessing cash is what paid card sales back from the drawer before the quote.
   */
  toChoose?: number
}

export type PosRefundDto = {
  refundId: string
  saleId: string
  /** Null when only given-away lines came back: nothing was issued. */
  creditNoteId: string | null
  creditNoteNumber: string | null
  stockOnly?: boolean
  totals: PosTotals
  warnings: PosWarning[]
  replayed?: boolean
  /** `lineNumber` is the credit note's line (1..n), `originalLineNumber` the sale's. */
  lines?: { lineNumber: number; originalLineNumber: number }[]
}

export function refundLookupPath(invoiceNumber: string): string {
  return withQuery(POS_REFUND_LOOKUP_PATH, { invoiceNumber: invoiceNumber.trim() })
}

export function quotePosRefund(
  saleId: string,
  body: Pick<PosRefundRequest, 'tillId' | 'lines'>,
): Promise<PosRefundQuoteDto> {
  return apiRequest<PosRefundQuoteDto>(`${POS_SALES_PATH}/${id(saleId)}/refund-quote`, {
    method: 'POST',
    body,
  })
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
