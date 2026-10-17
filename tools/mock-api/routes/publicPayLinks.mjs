/**
 * Screenshot and development tooling only. Nothing under `src/` imports this file; only
 * `tools/mock-api/server.mjs` loads it.
 *
 * The public pay page (`/pay#<token>`), shapes from `src/lib/payLink.ts` (the backend's
 * `PayLinkBillView`, `CardCheckout` and `PayLinkPaymentReceipt`). The token in the
 * `X-Pay-Link-Token` header picks the state; each is 43 characters, as a real one:
 *
 *   /pay#payable<x…>   payable, bank account confirmed, card off (as at launch)
 *   /pay#card<x…>      payable with card on (checkout READY at a Paymob address)
 *   /pay#vat<x…>       payable with VAT charged
 *   /pay#noaccount<x…> payable, no confirmed bank account
 *   /pay#rejected<x…>  payable again after Fawtir rejected the last payment
 *   /pay#pending<x…>   a bank transfer being checked
 *   /pay#cash<x…>      a cash request waiting for Fawtir
 *   /pay#paid<x…>      paid
 *   /pay#expired<x…>   410 (expired, revoked, superseded)
 *   /pay#limited<x…>   429
 *   anything else      404 (also what every route answers while links are switched off)
 *
 * `token('payable')` below builds the full value. Writes answer as the server would.
 */
export const token = (name) => name.padEnd(43, 'x')

const view = (over = {}) => ({
  status: 'PAYABLE',
  sellerName: 'Thumb International LLC',
  companyName: 'Wadi Builders SPC',
  billNumber: 'FSB-2026-0050',
  planName: 'Business',
  billingCycle: 'MONTHLY',
  periodStartsOn: '2026-10-17',
  periodEndsOn: '2026-11-16',
  subtotal: '80.000',
  vatRate: '0.00000',
  vatAmount: '0.000',
  total: '80.000',
  currency: 'OMR',
  dueOn: '2026-10-24',
  expiresAt: '2026-10-24T06:00:00Z',
  tokenHint: 'x7Qa',
  paidAt: null,
  methods: {
    card: false,
    bankTransfer: {
      available: true,
      account: {
        beneficiary: 'Thumb International LLC',
        bank: 'Bank Muscat',
        iban: 'OM810180000001299123456',
      },
    },
    cash: true,
  },
  pendingPayment: null,
  lastPaymentNotConfirmed: false,
  ...over,
})

const VIEWS = {
  [token('payable')]: view(),
  [token('card')]: view({ methods: { ...view().methods, card: true } }),
  [token('vat')]: view({ vatRate: '0.05000', vatAmount: '4.000', total: '84.000' }),
  [token('rejected')]: view({ lastPaymentNotConfirmed: true }),
  [token('noaccount')]: view({
    methods: { card: false, bankTransfer: { available: true, account: null }, cash: true },
  }),
  [token('pending')]: view({
    status: 'PAYMENT_PENDING',
    pendingPayment: { method: 'BANK_TRANSFER', submittedAt: '2026-10-17T07:30:00Z' },
  }),
  [token('cash')]: view({
    status: 'PAYMENT_PENDING',
    pendingPayment: { method: 'CASH', submittedAt: '2026-10-17T07:30:00Z' },
  }),
  [token('paid')]: view({ status: 'PAID', paidAt: '2026-10-17T08:00:00Z' }),
}

const problem = (status, type) => ({
  status,
  body: {
    type: `https://api.fawtir.om/problems/${type}`,
    title: type,
    status,
    detail: 'Mock refusal.',
  },
})

function resolve(headers) {
  const value = headers['x-pay-link-token']
  if (value === token('expired')) return { refusal: problem(410, 'pay-link-expired') }
  if (value === token('limited')) return { refusal: problem(429, 'rate-limited') }
  const found = VIEWS[value]
  return found ? { view: found } : { refusal: problem(404, 'pay-link-not-found') }
}

const summary = (method) => ({
  status: 201,
  body: { paymentId: 'p-50', method, status: 'PAYMENT_PENDING', submittedAt: new Date().toISOString() },
})

const checkout = (status) => ({
  paymentId: 'p-card-50',
  billId: 'b-50',
  status,
  checkoutUrl: status === 'READY' ? 'https://oman.paymob.com/unifiedcheckout/?mock=1' : null,
  expiresAt: '2026-10-17T09:00:00Z',
  amount: '80.000',
  currency: 'OMR',
  publishableKey: null,
  clientSecret: null,
})

const guarded =
  (handle) =>
  ({ headers, body }) => {
    const { view: found, refusal } = resolve(headers)
    return refusal ?? handle(found, body)
  }

export default [
  { method: 'POST', match: '/api/v1/public/pay-links/view', reply: guarded((found) => found) },
  {
    method: 'POST',
    match: '/api/v1/public/pay-links/card-checkout',
    reply: guarded((found) =>
      found.methods.card
        ? { status: 201, body: checkout('READY') }
        : problem(409, 'payment-method-unavailable'),
    ),
  },
  {
    method: 'POST',
    match: '/api/v1/public/pay-links/card-checkout/status',
    reply: guarded(() => checkout('PAID')),
  },
  {
    method: 'POST',
    match: '/api/v1/public/pay-links/bank-transfer',
    reply: guarded((found) =>
      found.status === 'PAYABLE'
        ? summary('BANK_TRANSFER')
        : problem(409, 'payment-state-conflict'),
    ),
  },
  {
    method: 'POST',
    match: '/api/v1/public/pay-links/cash-request',
    reply: guarded((found) =>
      found.status === 'PAYABLE' ? summary('CASH') : problem(409, 'payment-state-conflict'),
    ),
  },
]
