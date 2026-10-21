/**
 * Screenshot and development tooling only. Nothing under `src/` imports this file; only
 * `tools/mock-api/server.mjs` loads it.
 *
 * The refund cases under the console's "Bills and payment links" card (backend V412). Shapes follow
 * `src/lib/console/refundCases.ts`. Run the mock with `MOCK_CONSOLE_BILLING=1` so the session holds
 * `platform.billing.*`. Sur Marine (`/console/tenants/7a1c0b52-…`) left Fawtir on an annual
 * subscription with 7 whole months left, and has an older case Finance pays outside Fawtir.
 *
 * Writes answer as the server would; nothing is kept between requests.
 */
const BILLED = '7a1c0b52-4f0e-4b8e-9d3a-2f6c1e0a9b11'
const company = (id) => `/api/v1/platform/companies/${id}`

const LEAVE = {
  id: 'rc000000-0000-4000-8000-000000000412',
  tenantId: BILLED,
  paymentId: 'pa000000-0000-4000-8000-000000000041',
  amount: '700.000',
  method: 'CARD',
  reason: 'LEFT_FAWTIR_ANNUAL',
  status: 'OPEN',
  openedAt: '2026-10-21T09:30:00Z',
  openedBy: '00000000-0000-0000-0000-0000000000e7',
  disconnectionId: 'dc000000-0000-4000-8000-000000000001',
  suggestedAmount: '700.000',
  monthsRefunded: 7,
  amountReason: null,
  amountAdjustedAt: null,
  amountAdjustedBy: null,
  refundMethod: null,
  refundedAt: null,
  refundedBy: null,
  refundReference: null,
}

const PAID_AHEAD = {
  id: 'rc000000-0000-4000-8000-000000000407',
  tenantId: BILLED,
  paymentId: 'pa000000-0000-4000-8000-000000000038',
  amount: '84.000',
  method: 'BANK_TRANSFER',
  reason: 'CANCELLED_BY_CUSTOMER',
  status: 'OPEN',
  openedAt: '2026-06-01T20:20:00Z',
  openedBy: '00000000-0000-0000-0000-000000000000',
  disconnectionId: null,
  suggestedAmount: null,
  monthsRefunded: null,
  amountReason: null,
  amountAdjustedAt: null,
  amountAdjustedBy: null,
  refundMethod: null,
  refundedAt: null,
  refundedBy: null,
  refundReference: null,
}

export default [
  {
    match: `${company(BILLED)}/payments`,
    reply: () => ({ items: [], refundCases: [LEAVE, PAID_AHEAD], nextCursor: null }),
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/platform\/companies\/[^/]+\/subscription\/refund-cases\/[^/]+\/amount$/,
    reply: ({ body }) => ({
      ...LEAVE,
      amount: Number(body?.amount ?? 0).toFixed(3),
      amountReason: body?.reason ?? null,
      amountAdjustedAt: '2026-10-21T10:00:00Z',
      amountAdjustedBy: '00000000-0000-0000-0000-0000000000e7',
    }),
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/platform\/companies\/[^/]+\/subscription\/refund-cases\/[^/]+\/refund$/,
    reply: ({ body }) => ({
      ...LEAVE,
      status: 'REFUNDED',
      refundMethod: body?.method ?? 'CARD',
      refundedAt: '2026-10-21T10:05:00Z',
      refundedBy: '00000000-0000-0000-0000-0000000000e7',
      refundReference: body?.reference ?? null,
    }),
  },
]
