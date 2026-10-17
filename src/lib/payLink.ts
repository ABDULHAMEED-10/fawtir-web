import { ApiError, NetworkError, apiRequest } from '../api'
import type { CardCheckoutStatus } from '../api/settings/billing'

/**
 * The public pay page (`/pay`, P2-8 §3.11): someone without a Fawtir sign-in pays one bill through
 * a link the Fawtir team sent. The link is `https://<app>/pay#<token>`.
 *
 * - The token travels in the URL fragment, so it never reaches a server log or a Referer. The page
 *   reads it once, removes it from the address bar, and keeps it in `sessionStorage` (for the
 *   return from the card provider). It is sent only in the `X-Pay-Link-Token` header.
 * - Every call is `credentials: 'omit'`. A portal session cookie the reader may also hold (another
 *   company, or an expired one) is never sent, so it can neither refuse the page nor change whose
 *   bill is paid (security review M1). No CSRF header goes either.
 * - The return from the card provider (`/pay/done?...`) is never trusted: its query is dropped
 *   unread, and the result is the server's status read (M6).
 */
export const PAY_ROUTE = '/pay'
export const PAY_DONE_ROUTE = '/pay/done'

const BASE = '/v1/public/pay-links'
export const PAY_LINK_VIEW_PATH = `${BASE}/view`
export const PAY_LINK_CARD_PATH = `${BASE}/card-checkout`
export const PAY_LINK_CARD_STATUS_PATH = `${BASE}/card-checkout/status`
export const PAY_LINK_BANK_PATH = `${BASE}/bank-transfer`
export const PAY_LINK_CASH_PATH = `${BASE}/cash-request`
export const PAY_LINK_TOKEN_HEADER = 'X-Pay-Link-Token'

/** 32 random bytes, base64url without padding. Anything else is not a link, and is not sent. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/
const TOKEN_KEY = 'fawtir.payLink.token'
const PAYMENT_KEY = 'fawtir.payLink.cardPayment'
const CARD_KEY_KEY = 'fawtir.payLink.cardKey'

export function isPayLinkToken(value: string | null | undefined): value is string {
  return typeof value === 'string' && TOKEN.test(value)
}

/** Storage can be blocked (private mode, a strict browser): the page then works without it. */
function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) window.sessionStorage.removeItem(key)
    else window.sessionStorage.setItem(key, value)
  } catch {
    /* nothing to keep it in: the card return then asks for the link again */
  }
}

/**
 * Takes the token from the address bar's fragment, if there is one, and removes it from the
 * address and history at once. A new token replaces the kept one (and whatever card attempt
 * belonged to it). Returns the token to use, or null.
 */
export function takePayLinkToken(): string | null {
  const fragment = window.location.hash.replace(/^#/, '')
  if (fragment) {
    window.history.replaceState(window.history.state, '', window.location.pathname)
    if (!isPayLinkToken(fragment)) return null
    if (read(TOKEN_KEY) !== fragment) {
      write(PAYMENT_KEY, null)
      write(CARD_KEY_KEY, null)
    }
    write(TOKEN_KEY, fragment)
    return fragment
  }
  const kept = read(TOKEN_KEY)
  return isPayLinkToken(kept) ? kept : null
}

/** The return from the card provider: its query is dropped unread, never trusted. */
export function dropReturnQuery() {
  if (window.location.search || window.location.hash) {
    window.history.replaceState(window.history.state, '', window.location.pathname)
  }
}

export const keptPayLinkToken = (): string | null => {
  const kept = read(TOKEN_KEY)
  return isPayLinkToken(kept) ? kept : null
}
export const keptCardPayment = () => read(PAYMENT_KEY)

/** One key per card attempt on this link, kept so a retried click (or reload) reuses it. */
export function cardIdempotencyKey(): string {
  const kept = read(CARD_KEY_KEY)
  if (kept) return kept
  const key = crypto.randomUUID()
  write(CARD_KEY_KEY, key)
  return key
}

export function rememberCardPayment(paymentId: string) {
  write(PAYMENT_KEY, paymentId)
}

/** A finished or abandoned attempt: the next click opens a new checkout with a new key. */
export function forgetCardAttempt() {
  write(PAYMENT_KEY, null)
  write(CARD_KEY_KEY, null)
}

export type PayLinkStatus = 'PAYABLE' | 'PAYMENT_PENDING' | 'PAID'
export type PayLinkMethod = 'CARD' | 'BANK_TRANSFER' | 'CASH'

/**
 * `PayLinkBillView`: what the page may show (security review §3.2). Amounts are OMR strings with
 * three decimals. An expired, revoked or superseded link is a 410, never a status here.
 */
export type PayLinkView = {
  status: PayLinkStatus | (string & {})
  sellerName: string | null
  companyName: string
  billNumber: string
  planName: string | null
  billingCycle: 'MONTHLY' | 'ANNUAL' | (string & {}) | null
  periodStartsOn: string | null
  periodEndsOn: string | null
  subtotal: string
  vatRate: string | null
  vatAmount: string
  total: string
  currency: string
  dueOn: string | null
  expiresAt: string
  /** The link's last four characters, so support can confirm a genuine link by phone (R2). */
  tokenHint?: string | null
  paidAt?: string | null
  methods: {
    card: boolean
    bankTransfer: {
      available: boolean
      account: { beneficiary: string; bank: string; iban: string } | null
    }
    cash: boolean
  }
  pendingPayment?: { method: PayLinkMethod | (string & {}); submittedAt: string } | null
  /** Fawtir rejected the last payment; the page says so in a fixed sentence (R7), never the reason. */
  lastPaymentNotConfirmed?: boolean
}

/**
 * `PayLinkCardCheckout`: the in-app card checkout without the bill id or the provider's SDK keys
 * (security review M12). PAID only once the provider-confirmed payment settled the bill.
 */
export type PayLinkCardCheckout = {
  paymentId: string
  status: CardCheckoutStatus
  /** The provider's hosted checkout, only while READY. It carries the checkout's secret: never log it. */
  checkoutUrl: string | null
  /** Only while READY. */
  expiresAt: string | null
  amount: string
  currency: 'OMR'
}

/** `PayLinkPaymentReceipt`: a card payment never answers with one. */
export type PayLinkPaymentSummary = {
  paymentId: string
  method: 'BANK_TRANSFER' | 'CASH' | (string & {})
  status: 'PAYMENT_PENDING' | (string & {})
  submittedAt: string
}

const publicCall = <T>(
  path: string,
  token: string,
  options: { body?: unknown; idempotencyKey?: string; signal?: AbortSignal } = {},
) =>
  apiRequest<T>(path, {
    method: 'POST',
    credentials: 'omit',
    body: options.body,
    signal: options.signal,
    headers: {
      [PAY_LINK_TOKEN_HEADER]: token,
      ...(options.idempotencyKey ? { 'Idempotency-Key': options.idempotencyKey } : {}),
    },
  })

export function loadPayLink(token: string, signal?: AbortSignal): Promise<PayLinkView> {
  return publicCall(PAY_LINK_VIEW_PATH, token, { signal })
}

export function startPayLinkCard(token: string, idempotencyKey: string): Promise<PayLinkCardCheckout> {
  return publicCall(PAY_LINK_CARD_PATH, token, { idempotencyKey })
}

export function loadPayLinkCard(
  token: string,
  paymentId: string,
  signal?: AbortSignal,
): Promise<PayLinkCardCheckout> {
  return publicCall(PAY_LINK_CARD_STATUS_PATH, token, { body: { paymentId }, signal })
}

export type PayLinkBankTransfer = { proof: File; reference: string; note: string }

export function submitPayLinkBankTransfer(
  token: string,
  transfer: PayLinkBankTransfer,
  idempotencyKey: string,
): Promise<PayLinkPaymentSummary> {
  const form = new FormData()
  form.append('proof', transfer.proof)
  form.append('reference', transfer.reference)
  if (transfer.note.trim()) form.append('note', transfer.note.trim())
  return publicCall(PAY_LINK_BANK_PATH, token, { body: form, idempotencyKey })
}

export function requestPayLinkCash(
  token: string,
  note: string,
  idempotencyKey: string,
): Promise<PayLinkPaymentSummary> {
  return publicCall(PAY_LINK_CASH_PATH, token, {
    body: note.trim() ? { note: note.trim() } : {},
    idempotencyKey,
  })
}

/** Why the page cannot go on, as one closed set; each has its own fixed sentence. */
export type PayLinkProblem =
  | 'invalid'
  | 'expired'
  | 'tooMany'
  | 'notPayable'
  | 'slotTaken'
  | 'cardUnavailable'
  | 'payerMissing'
  | 'receiptRefused'
  | 'receiptTooLarge'
  | 'network'
  | 'other'

/** The server's refusal as one of the page's own sentences; its `detail` is never shown. */
export function payLinkProblemOf(error: unknown): PayLinkProblem {
  if (error instanceof NetworkError) return 'network'
  if (!(error instanceof ApiError)) return 'other'
  switch (error.problemType) {
    case 'pay-link-not-found':
      return 'invalid'
    case 'pay-link-expired':
      return 'expired'
    case 'bill-not-payable':
    case 'bill-stale':
      return 'notPayable'
    case 'payment-state-conflict':
      return 'slotTaken'
    case 'payment-method-unavailable':
    case 'card-payment-not-eligible':
      return 'cardUnavailable'
    case 'payer-details-missing':
      return 'payerMissing'
    case 'rate-limited':
      return 'tooMany'
  }
  if (error.status === 404) return 'invalid'
  if (error.status === 410) return 'expired'
  if (error.status === 429) return 'tooMany'
  if (error.status === 413) return 'receiptTooLarge'
  if (error.status === 400) return 'receiptRefused'
  if (error.status === 409) return 'slotTaken'
  if (error.status === 503) return 'cardUnavailable'
  return 'other'
}
