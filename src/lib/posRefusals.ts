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
  'POS_SALE_NOT_FOUND',
  'POS_REFUND_NOT_OWN_SALE',
  'POS_REFUND_LINE_INVALID',
  'POS_REFUND_MONEY_INVALID',
  'POS_REFUND_REASON_NOTE_REQUIRED',
  'POS_REFUND_QUANTITY_EXCEEDS',
  'POS_REFUND_MONEY_DOES_NOT_MATCH',
  'POS_REFUND_MORE_THAN_PAID',
  'POS_REFUND_MORE_THAN_OWED',
  'POS_REFUND_KEY_REUSED',
  'POS_SLIP_INVALID',
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

export function posRefusalKey(error: unknown): string {
  if (error instanceof NetworkError) return 'pos.refusal.offline'
  if (error instanceof ApiError) {
    if (error.code && WORDED.has(error.code)) return `pos.refusal.${error.code}`
    const slug = error.problemType ? SLUGS[error.problemType] : undefined
    if (slug) return slug
    if (error.status === 403) return 'pos.refusal.forbidden'
  }
  return 'pos.refusal.failed'
}

/** A figure a refusal carries (`expected`, `limit`, `maxMoneyBack`), as a number. */
export function problemNumber(error: unknown, name: string): number | null {
  if (!(error instanceof ApiError)) return null
  const value = error.problem[name]
  return typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : null
}

export function refusalCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null
}

/** The figures a refusal's sentence names, at three decimals. */
export function refusalValues(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {}
  const values: Record<string, string> = {}
  for (const name of [
    'expected',
    'received',
    'limit',
    'remaining',
    'maxMoneyBack',
    'owed',
    'expectedCash',
    'expectedPrice',
    'counted',
    'cardTerminalTotal',
    'fawtirCardTotal',
  ]) {
    const value = problemNumber(error, name)
    if (value != null && Number.isFinite(value)) values[name] = value.toFixed(3)
  }
  for (const name of ['expectedNumber', 'line']) {
    const value = error.problem[name]
    if (value != null) values[name] = String(value)
  }
  return values
}
