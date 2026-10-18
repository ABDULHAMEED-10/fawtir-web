/**
 * Screenshot and development tooling only. Nothing under `src/` imports this file; only
 * `tools/mock-api/server.mjs` loads it.
 *
 * The public pay page (`/pay#<token>`), shapes from `src/lib/payLink.ts` (the backend's
 * `PayLinkBillView` and `PayLinkCardCheckout`). Card only: there is no bank-transfer or cash
 * route. The token in the `X-Pay-Link-Token` header picks the state; each is 43 characters, as a
 * real one:
 *
 *   /pay#payable<x…>   payable by card (checkout READY at a Paymob address)
 *   /pay#cardoff<x…>   payable, card switched off
 *   /pay#vat<x…>       payable with VAT charged
 *   /pay#rejected<x…>  payable again after Fawtir rejected the last payment
 *   /pay#pending<x…>   a card payment being confirmed
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
  methods: { card: true },
  pendingPayment: null,
  lastPaymentNotConfirmed: false,
  ...over,
})

const VIEWS = {
  [token('payable')]: view(),
  [token('cardoff')]: view({ methods: { card: false } }),
  [token('vat')]: view({ vatRate: '0.05000', vatAmount: '4.000', total: '84.000' }),
  [token('rejected')]: view({ lastPaymentNotConfirmed: true }),
  [token('pending')]: view({
    status: 'PAYMENT_PENDING',
    pendingPayment: { method: 'CARD', submittedAt: '2026-10-17T07:30:00Z' },
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

const checkout = (status) => ({
  paymentId: 'p-card-50',
  status,
  checkoutUrl: status === 'READY' ? 'https://oman.paymob.com/unifiedcheckout/?mock=1' : null,
  expiresAt: '2026-10-17T09:00:00Z',
  amount: '80.000',
  currency: 'OMR',
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
]
