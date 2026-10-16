/**
 * Screenshot and development tooling only. Nothing under `src/` imports this file; only
 * `tools/mock-api/server.mjs` loads it.
 *
 * The console's billing settings page (`/console/billing/settings`): the platform billing
 * settings and the extra-document purchase limits, each a versioned record with its history.
 * Shapes follow `src/lib/console/billingSettings.ts`. A save answers the next version so the
 * page can be clicked through; nothing is kept between requests.
 */
const SETTINGS = {
  version: 3,
  graceDays: 7,
  dualApprovalThreshold: '50.000',
  currency: 'OMR',
  vatRate: '0.00000',
  renewalBillLeadDays: 7,
  reason: 'Launch values',
  createdBy: 'u-other',
  createdAt: '2026-10-14T05:00:00Z',
}

const LIMITS = [
  {
    id: '6b7d2f0e-0000-4000-8000-000000000002',
    version: 2,
    minPerPurchase: 10,
    maxPerPurchase: 5000,
    reason: 'Fewer tiny purchases',
    createdBy: 'u-other',
    createdAt: '2026-10-15T08:30:00Z',
  },
  {
    id: '6b7d2f0e-0000-4000-8000-000000000001',
    version: 1,
    minPerPurchase: 1,
    maxPerPurchase: 1000,
    reason: 'Initial limits',
    createdBy: null,
    createdAt: '2026-10-01T00:00:00Z',
  },
]

const now = () => new Date().toISOString()

export default [
  { match: '/api/v1/platform/billing/settings', reply: () => SETTINGS },
  {
    method: 'PUT',
    match: '/api/v1/platform/billing/settings',
    reply: ({ body }) => ({
      ...SETTINGS,
      ...body,
      version: SETTINGS.version + 1,
      createdAt: now(),
    }),
  },
  { match: '/api/v1/platform/billing/extra-documents/settings', reply: () => LIMITS[0] },
  {
    match: '/api/v1/platform/billing/extra-documents/settings/history',
    reply: ({ query }) => LIMITS.slice(0, Number(query.get('limit') ?? 50)),
  },
  {
    method: 'PUT',
    match: '/api/v1/platform/billing/extra-documents/settings',
    reply: ({ body }) => ({
      ...LIMITS[0],
      ...body,
      id: '6b7d2f0e-0000-4000-8000-000000000003',
      version: LIMITS[0].version + 1,
      createdBy: 'u-admin',
      createdAt: now(),
    }),
  },
]
