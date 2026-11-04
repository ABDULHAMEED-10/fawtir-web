import { ApiError, NetworkError } from '../api'

/**
 * The till's refusals in our own words (handbook 3.3: never the server's `detail`). Every code
 * the till routes can answer that a cashier can act on has its sentence under `pos.refusal.*`;
 * anything else reads as the general failure.
 */
const WORDED = new Set([
  'SIMPLIFIED_INVOICE_LIMIT',
  'BUYER_IDENTIFIER_REQUIRED',
  'POS_PAYMENTS_DO_NOT_MATCH_TOTAL',
  'POS_CASH_TENDERED_TOO_LOW',
  'POS_PAYMENT_INVALID',
  'POS_ON_ACCOUNT_NEEDS_COMPANY',
  'POS_PRODUCT_NOT_SELLABLE',
  'POS_VARIANT_NOT_SELLABLE',
  'POS_PRICE_NOT_CATALOGUE',
  'POS_TILL_RETIRED',
  'POS_TILL_NOT_FOUND',
  'POS_TILL_NUMBER_GAP',
  'POS_TILL_NUMBER_REPEATED',
  'POS_SALE_KEY_REUSED',
  'POS_CONSUMER_CONTACT_INVALID',
  'POS_CARD_APPROVAL_REQUIRED',
  'POS_COUNT_REQUIRED',
  'POS_COUNT_INVALID',
  'SELLER_PARTICIPANT_NOT_VERIFIED',
  'SELLER_ADDRESS_INCOMPLETE',
  'SELLER_CONTACT_INCOMPLETE',
  'INDUSTRIAL_CLASSIFICATION_REQUIRED',
  'PERIOD_CLOSED',
  'BRANCH_NOT_ACTIVE',
  'POS_ZERO_PRICE',
  'POS_SOLD_AT_IN_FUTURE',
  'POS_SHIFT_NOT_OPEN',
  'POS_TILL_LIMIT',
  'POS_DENOMINATION_UNKNOWN',
  'POS_FLOAT_LEFT_INVALID',
  'POS_FLOAT_LEFT_EXCEEDS_COUNTED',
  'POS_CARD_TERMINAL_TOTAL_INVALID',
  'POS_OVER_SHORT_REASON_REQUIRED',
  'POS_CARD_DIFFERENCE_NOTE_REQUIRED',
  'POS_SHIFT_ALREADY_CLOSED',
  'POS_SHIFT_NOT_OWN',
  'POS_SHIFT_FLOAT_LOCKED',
  'POS_PAID_OUT_NOTE_REQUIRED',
  'POS_PAID_OUT_EXCEEDS_CASH',
  'POS_CASH_MOVEMENT_AMOUNT_INVALID',
  'POS_NOTE_TOO_LONG',
  // Batch 39 SEC W-6 (owner): a card number typed into a cash-movement, close, card-difference or
  // refund reason note. The problem names only `field`, never the value, and neither does this.
  'POS_NOTE_CARD_NUMBER',
  'POS_SALE_NOT_FOUND',
  'POS_REFUND_NOT_OWN_SALE',
  'POS_REFUND_LINE_INVALID',
  'POS_REFUND_MONEY_INVALID',
  'POS_REFUND_REASON_NOTE_REQUIRED',
  // DEC-30-05 (owner, 1 Nov 2026): cash back never takes the drawer below zero; the refusal names
  // `cashInDrawer` and `cashRequested`. A server before it sends neither.
  'POS_REFUND_CASH_EXCEEDS_DRAWER',
  // DEC-30-01: a line whose credit history cannot say whether goods came back is refunded from the
  // invoice, never at the till.
  'POS_REFUND_LINE_CREDIT_UNCLEAR',
  // The refund's credit note meets the sale's document ceiling (PosRestExceptionHandler sends both,
  // as 409). Read as "Try again" they were retried into the same refusal, typically after a credit
  // note from the invoice screen had used the sale up (PRV43-CMP F3-1, owner round 12). EXCEEDS
  // must not say the sale is fully credited: a smaller refund may still fit.
  'CREDIT_NOTE_NOTHING_CORRECTABLE',
  'CREDIT_NOTE_EXCEEDS_CORRECTABLE_AMOUNT',
  'POS_SALE_CANCELLED',
  'POS_REFUND_QUANTITY_EXCEEDS',
  'POS_REFUND_MONEY_DOES_NOT_MATCH',
  'POS_REFUND_MORE_THAN_PAID',
  'POS_REFUND_CARD_MORE_THAN_PAID',
  'POS_REFUND_MORE_THAN_OWED',
  'POS_REFUND_KEY_REUSED',
  'POS_REFUND_NOTHING_TO_PAY_BACK',
  'POS_SLIP_INVALID',
  'DISCOUNT_ABOVE_LIMIT',
  'HS_CODE_REQUIRED',
  // V530 offline binding (BINDING-DESIGN §13.1): the manager's hold review and key revocation.
  'POS_OFFLINE_KEY_ALREADY_REVOKED',
  'POS_OFFLINE_KEY_NOT_FOUND',
  'POS_OFFLINE_KEY_HUMAN_ONLY',
  'POS_ATTRIBUTION_HUMAN_ONLY',
  'POS_ATTRIBUTION_SELF',
  'POS_ATTRIBUTION_NOT_A_CANDIDATE',
  'POS_ATTRIBUTION_ALREADY_RESOLVED',
  'POS_ATTRIBUTION_HOLD_NOT_FOUND',
  'POS_ATTRIBUTION_REVIEWER_ONLY',
  'POS_LEGACY_RANGE_INVALID',
])

/** Problem slugs (no `code`) the till words too. */
const SLUGS: Record<string, string> = {
  'plan-feature-not-included': 'pos.refusal.planFeature',
  'subscription-restricted': 'pos.refusal.readOnly',
  'quota-exceeded': 'pos.refusal.quota',
  'branch-not-in-scope': 'pos.refusal.branch',
  'upload-infected': 'pos.refusal.infected',
  'upload-scan-unavailable': 'pos.refusal.scanUnavailable',
}

/** A server before the refusal had a code says the figures only in its sentence. */
function roleLimitInDetail(error: ApiError): { requested: string; limit: string } | null {
  if (error.status !== 403 || error.code) return null
  const detail = error.problem.detail
  const found =
    typeof detail === 'string'
      ? /of ([\d.]+)% exceeds the ([\d.]+)% your role allows/.exec(detail)
      : null
  return found ? { requested: found[1], limit: found[2] } : null
}

const percent = (value: number) => String(Math.round(value * 100) / 100)

export function posRefusalKey(error: unknown): string {
  if (error instanceof NetworkError) return 'pos.refusal.offline'
  if (error instanceof ApiError) {
    if (error.code && WORDED.has(error.code)) return `pos.refusal.${error.code}`
    const slug = error.problemType ? SLUGS[error.problemType] : undefined
    if (slug) return slug
    if (roleLimitInDetail(error)) return 'pos.refusal.DISCOUNT_ABOVE_LIMIT'
    if (error.status === 403) return 'pos.refusal.forbidden'
  }
  return 'pos.refusal.failed'
}

/** Causes the till words only for a queued sale, where the cashier needs what clears them. */
const QUEUE_WORDED = new Set([
  'PERIOD_CLOSED',
  'POS_SOLD_AT_IN_FUTURE',
  'SELLER_PARTICIPANT_NOT_VERIFIED',
  'INDUSTRIAL_CLASSIFICATION_REQUIRED',
  'POS_QUEUED_SALE_HS_CODE_REQUIRED',
  // Set by this device (posQueue BUYER_UNAVAILABLE), never by the server: nothing was sent.
  'POS_QUEUED_BUYER_UNAVAILABLE',
])

const QUEUE_SLUGS: Record<string, string> = {
  'subscription-restricted': 'pos.queue.reason.readOnly',
  'plan-feature-not-included': 'pos.queue.reason.planFeature',
  'quota-exceeded': 'pos.queue.reason.quota',
}

/** The sentence for a queued sale's stored refusal (handbook 3.3: never the server's `detail`). */
export function queueRefusalKey(code: string | null, slug: string | null): string {
  if (code?.startsWith('SUBSCRIPTION_')) return 'pos.queue.reason.readOnly'
  if (code && QUEUE_WORDED.has(code)) return `pos.queue.reason.${code}`
  if (slug && QUEUE_SLUGS[slug]) return QUEUE_SLUGS[slug]
  if (code && WORDED.has(code)) return `pos.refusal.${code}`
  const general = slug ? SLUGS[slug] : undefined
  if (general) return general
  if (code === 'HTTP_403') return 'pos.refusal.forbidden'
  return 'pos.queue.reason.other'
}

/** A figure a refusal carries (`expected`, `limit`, `maxMoneyBack`), as a number. */
export function problemNumber(error: unknown, name: string): number | null {
  if (!(error instanceof ApiError)) return null
  const value = error.problem[name]
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : null
}

/**
 * The quote route is missing or failing (a server before it, or a fault), as opposed to a refusal of
 * these lines. The till then refunds nothing rather than send a split the screen guessed (A-03).
 */
export function quoteUnavailable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return false
  if (error.status >= 500) return true
  return (error.status === 404 || error.status === 405) && error.code === null
}

export function refusalCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null
}

/** The figures a refusal's sentence names, at three decimals. */
export function refusalValues(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  const values: Record<string, string> = {}
  const requestedPercent = problemNumber(error, 'requestedPercent')
  const limitPercent = problemNumber(error, 'limitPercent')
  if (requestedPercent != null && limitPercent != null) {
    values.requestedPercent = percent(requestedPercent)
    values.limitPercent = percent(limitPercent)
  } else {
    const worded = roleLimitInDetail(error)
    if (worded) {
      values.requestedPercent = percent(Number(worded.requested))
      values.limitPercent = percent(Number(worded.limit))
    }
  }
  for (const name of [
    'expected',
    'received',
    'limit',
    'remaining',
    'maxMoneyBack',
    'maxCard',
    'owed',
    'expectedCash',
    'expectedPrice',
    'counted',
    'cardTerminalTotal',
    'fawtirCardTotal',
    'cashInDrawer',
    'cashRequested',
  ]) {
    const value = problemNumber(error, name)
    if (value != null && Number.isFinite(value)) values[name] = value.toFixed(3)
  }
  for (const name of ['expectedNumber', 'line']) {
    const value = error.problem[name]
    if (value != null) values[name] = String(value)
  }
  // POS_QUEUED_SALE_HS_CODE_REQUIRED names every goods line it holds the sale for, not one `line`.
  const lines = error.problem.lines
  if (Array.isArray(lines) && lines.length > 0) values.lines = lines.map(String).join(', ')
  return values
}
