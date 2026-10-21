/**
 * Screenshot and development tooling only. Nothing under `src/` imports this file; only
 * `tools/mock-api/server.mjs` loads it.
 *
 * The refund cases under the console's "Bills and payment links" card (backend V412). Shapes follow
 * `src/lib/console/refundCases.ts`. Run the mock with `MOCK_CONSOLE_BILLING=1` so the session holds
 * `platform.billing.*`. Sur Marine Supplies LLC (`/console/tenants/7a1c0b52-…`, the same company and
 * name as consoleCompanySubscription.mjs) left Fawtir on an annual subscription with 7 whole months
 * left, had an earlier yearly cancellation refunded by bank transfer, and has a case Finance pays
 * outside Fawtir. Every case below belongs to it; use that one name wherever a fixture names it.
 *
 * The console's refund queue (`/console/billing/refunds`, backend V423) lists those cases with a
 * final rejection from another company, filtered by `reason` and `status` as the server does.
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

const CANCELLED_YEAR = {
  ...LEAVE,
  id: 'rc000000-0000-4000-8000-000000000413',
  paymentId: 'pa000000-0000-4000-8000-000000000031',
  amount: '450.000',
  reason: 'CANCELLED_ANNUAL_REMAINING',
  status: 'REFUNDED',
  openedAt: '2026-03-01T20:25:00Z',
  disconnectionId: null,
  suggestedAmount: '500.000',
  monthsRefunded: 5,
  amountReason: 'Agreed with the owner: one month of extras kept',
  amountAdjustedAt: '2026-03-02T08:00:00Z',
  amountAdjustedBy: '00000000-0000-0000-0000-0000000000e7',
  refundMethod: 'BANK_TRANSFER',
  refundedAt: '2026-03-03T09:00:00Z',
  refundedBy: '00000000-0000-0000-0000-0000000000e7',
  refundReference: 'TRF-2026-0311',
  refundedOn: '2026-03-03',
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

const REJECTED = {
  ...PAID_AHEAD,
  id: 'rc000000-0000-4000-8000-000000000289',
  tenantId: '3b9e2c41-8d7a-4f60-a1e2-5c4d3b2a1f00',
  paymentId: 'pa000000-0000-4000-8000-000000000289',
  amount: '420.000',
  method: 'CARD',
  reason: 'FINAL_REJECTION',
  openedAt: '2026-10-19T07:15:00Z',
}

const QUEUE = [
  { refundCase: CANCELLED_YEAR, tenantName: 'Sur Marine Services LLC' },
  { refundCase: PAID_AHEAD, tenantName: 'Sur Marine Services LLC' },
  { refundCase: REJECTED, tenantName: 'Nizwa Date Traders SPC' },
  { refundCase: LEAVE, tenantName: 'Sur Marine Services LLC' },
]

export default [
  {
    match: '/api/v1/platform/billing/refund-cases',
    reply: ({ query }) => {
      const reasons = query.getAll('reason')
      const statuses = query.getAll('status').length ? query.getAll('status') : ['OPEN']
      return {
        items: QUEUE.filter(
          ({ refundCase }) =>
            (reasons.length === 0 || reasons.includes(refundCase.reason)) &&
            statuses.includes(refundCase.status),
        ),
        nextCursor: null,
      }
    },
  },
  {
    match: `${company(BILLED)}/payments`,
    reply: () => ({
      items: [],
      refundCases: [LEAVE, CANCELLED_YEAR, PAID_AHEAD],
      nextCursor: null,
    }),
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
      refundedOn: body?.refundedOn ?? '2026-10-21',
    }),
  },
  {
    method: 'POST',
    match: /^\/api\/v1\/platform\/companies\/[^/]+\/subscription\/refund-cases\/[^/]+\/waive$/,
    reply: ({ body }) => ({
      ...LEAVE,
      reason: 'LEFT_FAWTIR_MONTHLY',
      status: 'WAIVED',
      waivedAt: '2026-10-21T10:10:00Z',
      waivedBy: '00000000-0000-0000-0000-0000000000e7',
      waiveEvidence: body?.evidence ?? null,
      waiveReference: body?.reference ?? null,
    }),
  },
]
