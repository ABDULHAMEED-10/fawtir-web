import { ApiError, NetworkError } from '../api'
import { PosTillLockUnavailable } from './posTillLock'

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
  // Backend cb9898ac3 (FIN-M3, V536): the paid-out's purpose, evidence, key and bill link, and the
  // split of access (paid-out pos.cash.pay_out, paid-in pos.close).
  'POS_PAID_OUT_FORBIDDEN',
  'POS_CASH_MOVEMENT_FORBIDDEN',
  'POS_PAID_OUT_DETAILS_REQUIRED',
  'POS_PAID_OUT_IDEMPOTENCY_KEY_REQUIRED',
  'POS_PAID_OUT_IDEMPOTENCY_KEY_REUSED',
  'POS_PAID_OUT_CATEGORY_REQUIRED',
  'POS_PAID_OUT_CLASS_REQUIRED',
  'POS_PAID_OUT_CLASS_INVALID',
  'POS_PAID_OUT_CURRENCY_REQUIRED',
  'POS_PAID_OUT_RECEIPT_REQUIRED',
  'POS_PAID_OUT_RECEIPT_NOT_FOUND',
  // Backend 9ce2bdcf4 (review F4): a receipt backs one paid-out, on the till it was uploaded at, and
  // the currency must be one cash is counted in.
  'POS_PAID_OUT_RECEIPT_OTHER_TILL',
  'POS_PAID_OUT_RECEIPT_ALREADY_USED',
  'POS_PAID_OUT_CURRENCY_INVALID',
  // Backend a2c9fcf0c (FIN-M3-CURRENCY-MIX 2a): a drawer total across currencies is withheld, and cash
  // in a currency the shift's records do not state is refused before anything is recorded.
  'POS_SHIFT_CURRENCY_MIXED',
  'POS_SHIFT_CURRENCY_UNRECORDED',
  'POS_PAID_OUT_CURRENCY_MISMATCH',
  'POS_CASH_MOVEMENT_CURRENCY_MISMATCH',
  'POS_REFUND_CURRENCY_MISMATCH',
  'POS_CASH_MOVEMENT_CURRENCY_INVALID',
  'POS_CASH_MOVEMENT_CURRENCY_REQUIRED',
  'POS_PAID_OUT_BILL_FORBIDDEN',
  'POS_PAID_OUT_BILL_LINK_INVALID',
  'POS_PAID_OUT_REFUND_REFERENCE',
  'POS_CASH_MOVEMENT_FIELDS_INVALID',
  'POS_CASH_RECEIPT_INVALID',
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
  // Backend 8f04050ab (IBR-078-OM): an online full invoice with a line stating neither goods nor
  // services is refused before its number is taken; `line` names it.
  'GOODS_OR_SERVICE_REQUIRED',
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
  // RC5 A2-b (598fd6715): the manager's acknowledgement of a sale kept above the discount limit.
  'POS_DISCOUNT_FLAG_HUMAN_ONLY',
  'POS_DISCOUNT_FLAG_NOT_FOUND',
  'POS_DISCOUNT_FLAG_SELF',
  'POS_DISCOUNT_FLAG_ALREADY_ACKNOWLEDGED',
  // Backend 3f483a01a (review FB-1): the sale's attribution hold is still open.
  'POS_DISCOUNT_FLAG_HOLD_OPEN',
  // Backend e19a99881 (review FB1-1): the hold resolved by attributing the sale, which judged it again.
  'POS_DISCOUNT_FLAG_SUPERSEDED',
  'POS_DISCOUNT_FLAG_RANGE_INVALID',
])

/** Problem slugs (no `code`) the till words too. */
const SLUGS: Record<string, string> = {
  'plan-feature-not-included': 'pos.refusal.planFeature',
  'subscription-restricted': 'pos.refusal.readOnly',
  'quota-exceeded': 'pos.refusal.quota',
  'branch-not-in-scope': 'pos.refusal.branch',
  'upload-infected': 'pos.refusal.infected',
  'upload-scan-unavailable': 'pos.refusal.scanUnavailable',
  // A support session acting as someone else (RefusalType.IMPERSONATION_NOT_ALLOWED, no code). Read
  // as 'forbidden' it suggested a missing permission, which no role grants back (review AW-1).
  'impersonation-not-allowed': 'pos.refusal.impersonation',
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

/*
 * Review WB2-2: i18next prints a missing value as "{{name}}", so a sentence that names a figure the
 * problem body did not carry (or carried in a form refusalValues will not take) falls back to one
 * that names none.
 */
const NEEDS: Record<string, readonly string[]> = {
  POS_SHIFT_CURRENCY_MIXED: ['currencies'],
  POS_SHIFT_CURRENCY_UNRECORDED: ['unrecordedMovements'],
  POS_PAID_OUT_CURRENCY_MISMATCH: ['shiftCurrency', 'sentCurrency'],
  POS_CASH_MOVEMENT_CURRENCY_MISMATCH: ['shiftCurrency', 'sentCurrency'],
  POS_REFUND_CURRENCY_MISMATCH: ['shiftCurrency', 'saleCurrency'],
}

function wordedKey(code: string, values: Record<string, string>): string {
  const needs = NEEDS[code]
  return needs && needs.some((name) => !values[name])
    ? `pos.refusal.withoutFigures.${code}`
    : `pos.refusal.${code}`
}

export function posRefusalKey(error: unknown): string {
  if (error instanceof NetworkError) return 'pos.refusal.offline'
  // Matched by name, not instanceof: posQueue imports this module, so importing its class back
  // would make the two a cycle. No number was printed for the sale (POS-MEMQ S8), so the
  // general failure is not enough: the cashier must know no receipt number exists.
  if (error instanceof Error && error.name === 'PosStorageUnavailable') {
    // After its own request went out the server may have filed the sale, so "nothing was sent"
    // would be untrue and could have it rung again (review XW-2).
    return (error as { requested?: unknown }).requested === true
      ? 'pos.refusal.storageUnavailableAfterSend'
      : 'pos.refusal.storageUnavailable'
  }
  // Same name match as above. Not storage wording: the company's zone, not this device, is at fault
  // (XT2-ZONE-UNREADABLE).
  if (error instanceof Error && error.name === 'PosTenantZoneUnavailable') {
    return 'pos.refusal.tenantZoneUnavailable'
  }
  // POS-TABLOCK refused the offline sale before it had a number: the cashier must know no receipt
  // number exists. posTillLock imports nothing of ours, so unlike posQueue it can be imported here.
  if (error instanceof PosTillLockUnavailable) {
    return 'pos.refusal.tabLockUnavailable'
  }
  if (error instanceof ApiError) {
    if (error.code && WORDED.has(error.code)) return wordedKey(error.code, refusalValues(error))
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
  // Backend 8f04050ab (HS Slice B): a line stating neither goods nor services, held the same way.
  'POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED',
  // Set by this device (posQueue BUYER_UNAVAILABLE), never by the server: nothing was sent.
  'POS_QUEUED_BUYER_UNAVAILABLE',
])

const QUEUE_SLUGS: Record<string, string> = {
  'subscription-restricted': 'pos.queue.reason.readOnly',
  'plan-feature-not-included': 'pos.queue.reason.planFeature',
  'quota-exceeded': 'pos.queue.reason.quota',
}

/** The sentence for a queued sale's stored refusal (handbook 3.3: never the server's `detail`). */
export function queueRefusalKey(
  code: string | null,
  slug: string | null,
  values: Record<string, string> = {},
): string {
  if (code?.startsWith('SUBSCRIPTION_')) return 'pos.queue.reason.readOnly'
  if (code && QUEUE_WORDED.has(code)) return `pos.queue.reason.${code}`
  if (slug && QUEUE_SLUGS[slug]) return QUEUE_SLUGS[slug]
  if (code && WORDED.has(code)) return wordedKey(code, values)
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
  // FIN-M3-CURRENCY-MIX: only three-letter codes are taken, so a body cannot put text in a sentence.
  for (const name of ['shiftCurrency', 'sentCurrency', 'saleCurrency']) {
    const value = error.problem[name]
    if (typeof value === 'string' && /^[A-Z]{3}$/.test(value)) values[name] = value
  }
  // All or nothing: a list with one entry dropped would name a mix that is not the shift's.
  const currencies = error.problem.currencies
  if (
    Array.isArray(currencies) &&
    currencies.length > 0 &&
    currencies.every((code) => typeof code === 'string' && /^[A-Z]{3}$/.test(code))
  ) {
    values.currencies = currencies.join(', ')
  }
  const unrecorded = error.problem.unrecordedMovements
  if (typeof unrecorded === 'number' && Number.isInteger(unrecorded) && unrecorded >= 0) {
    values.unrecordedMovements = String(unrecorded)
  }
  // POS_QUEUED_SALE_HS_CODE_REQUIRED and POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED name every line they
  // hold the sale for, not one `line`.
  const lines = error.problem.lines
  if (Array.isArray(lines) && lines.length > 0) values.lines = lines.map(String).join(', ')
  return values
}
