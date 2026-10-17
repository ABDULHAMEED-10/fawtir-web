/**
 * Screenshot and development tooling only. Nothing under `src/` imports this file; only
 * `tools/mock-api/server.mjs` loads it.
 *
 * Enterprise terms (`src/lib/console/enterpriseTerms.ts`, backend V348): the console list, one
 * company with terms set and a change waiting for its renewal (the company of
 * `consoleCompanySubscription.mjs`), and one company still waiting for terms. The quote and the
 * save answer from what was sent; nothing is kept between requests.
 *
 * `MOCK_ENTERPRISE_CUSTOMER=preparing|agreed` also answers the customer's Settings › Plan and
 * usage as an Enterprise company without terms yet, or with terms and a change at the renewal.
 */
const SET = '7a1c0b52-4f0e-4b8e-9d3a-2f6c1e0a9b11'
const WAITING = '3e9d2c41-8b7a-4f10-a2c5-6d1e0f9b8a22'
const CODE = 'ENT_7A1C0B524F0E'
const ADMIN = 'b7f3e1c2-0d4a-4c55-8e21-6a9f0c3d2e10'

const terms = (extra) => ({
  id: 'v-2',
  planCode: CODE,
  versionNumber: 2,
  effectiveFrom: '2026-10-15T09:00:00Z',
  monthlyPrice: '450.000',
  annualPrice: '4200.000',
  invoicesPerMonth: 5000,
  peopleIncluded: 25,
  extraPersonPrice: '4.000',
  branchesIncluded: 10,
  extraBranchPrice: '8.000',
  overagePricePerInvoice: '0.040',
  erpAddonMonthlyPrice: '60.000',
  apiAccess: true,
  prioritySupport: true,
  reason: 'Renewal negotiated',
  createdBy: ADMIN,
  createdAt: '2026-10-15T09:00:00Z',
  ...extra,
})

const PLAN = {
  code: CODE,
  nameEn: 'Enterprise',
  nameAr: 'المؤسسات',
  descriptionEn: null,
  descriptionAr: null,
  currency: 'OMR',
  active: true,
  publicVisible: false,
  recommended: false,
  sortOrder: 10000,
  annualFreeMonths: 2,
  trialDays: null,
  trialDocuments: null,
  version: 2,
  currentVersion: terms(),
  features: [
    { key: 'peppol', enabled: true, compliance: true },
    { key: 'creditNotes', enabled: true },
    { key: 'erpMapping', enabled: true },
  ],
}

const quote = (body) => {
  const cycle = body?.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY'
  const monthly = Number(body?.monthlyPrice ?? 0)
  const annual = body?.annualPrice ? Number(body.annualPrice) : monthly * 10
  const net = cycle === 'ANNUAL' ? annual : monthly
  const vat = Math.round(net * 0.05 * 1000) / 1000
  return {
    billingCycle: cycle,
    amountExclVat: net.toFixed(3),
    vatRate: '0.05',
    vatAmount: vat.toFixed(3),
    amountInclVat: (net + vat).toFixed(3),
    currency: 'OMR',
  }
}

const TERMS_SET = {
  tenantId: SET,
  state: 'BILLING_STARTED',
  version: 2,
  plan: PLAN,
  inForce: { planCode: CODE, planVersionId: 'v-1', planVersionNumber: 1, billingCycle: 'MONTHLY' },
  pending: {
    planCode: CODE,
    planVersionId: 'v-2',
    planVersionNumber: 2,
    billingCycle: 'MONTHLY',
    effectiveOn: '2026-11-10',
  },
  nextBill: quote({ billingCycle: 'MONTHLY', monthlyPrice: '450.000' }),
  history: [
    {
      id: 'h-2',
      tenantId: SET,
      planCode: CODE,
      planVersionId: 'v-2',
      kind: 'CHANGED',
      applyFrom: 'NEXT_RENEWAL',
      effectiveOn: '2026-11-10',
      billingCycle: 'MONTHLY',
      contractReference: 'FWT-ENT-2026-014',
      reason: 'Renewal negotiated',
      createdBy: ADMIN,
      createdByName: 'Huda Al Balushi',
      createdAt: '2026-10-15T09:00:00Z',
    },
    {
      id: 'h-1',
      tenantId: SET,
      planCode: CODE,
      planVersionId: 'v-1',
      kind: 'SET',
      applyFrom: 'BEFORE_FIRST_BILL',
      effectiveOn: '2026-09-10',
      billingCycle: 'MONTHLY',
      contractReference: 'FWT-ENT-2026-014',
      reason: 'Contract signed',
      createdBy: 'u-nasser',
      createdByName: 'Nasser Al Habsi',
      createdAt: '2026-09-10T06:00:00Z',
    },
  ],
}

const TERMS_WAITING = {
  tenantId: WAITING,
  state: 'TERMS_NOT_SET',
  version: 0,
  plan: null,
  inForce: { planCode: 'BUSINESS', planVersionId: 'b-1', planVersionNumber: 1, billingCycle: null },
  pending: null,
  nextBill: null,
  history: [],
}

const COMPANIES = [
  {
    tenantId: WAITING,
    legalName: 'Nizwa Date Traders SAOC',
    state: 'TERMS_NOT_SET',
    since: '2026-10-16T07:20:00Z',
  },
  {
    tenantId: SET,
    legalName: 'Sur Marine Supplies LLC',
    state: 'BILLING_STARTED',
    since: '2026-09-10T06:00:00Z',
  },
]

const base = (id) => `/api/v1/platform/companies/${id}/enterprise-terms`
const LIST = /^\/api\/v1\/platform\/enterprise-terms$/

const routes = [
  {
    match: LIST,
    reply: ({ query }) => {
      const state = query?.get?.('state') ?? query?.state ?? null
      return state ? COMPANIES.filter((row) => row.state === state) : COMPANIES
    },
  },
  { match: base(SET), reply: () => TERMS_SET },
  { match: base(WAITING), reply: () => TERMS_WAITING },
  {
    // Not on Enterprise terms yet: the counting card stays hidden, as the server answers.
    match: `/api/v1/platform/companies/${WAITING}/received-document-counting`,
    reply: () => ({
      tenantId: WAITING,
      enterprise: false,
      planCode: 'BUSINESS',
      version: 0,
      monthStartedOn: '2026-10-01',
      countsReceivedNow: true,
      nextSubscriptionOn: '2026-11-01',
      countsReceivedFromNext: true,
      history: [],
    }),
  },
  { method: 'POST', match: `${base(SET)}/quote`, reply: ({ body }) => quote(body) },
  { method: 'POST', match: `${base(WAITING)}/quote`, reply: ({ body }) => quote(body) },
  { method: 'PUT', match: base(SET), reply: () => TERMS_SET },
  {
    method: 'PUT',
    match: base(WAITING),
    reply: () => ({ ...TERMS_SET, tenantId: WAITING, state: 'TERMS_SET' }),
  },
]

// The customer's side, only when asked for: every other screenshot keeps its own company.
const customer = process.env.MOCK_ENTERPRISE_CUSTOMER
if (customer === 'preparing' || customer === 'agreed') {
  const agreed = customer === 'agreed'
  const status = {
    tracked: agreed,
    access: agreed ? 'ACTIVE' : 'NOT_TRACKED',
    restrictionsEnforced: false,
    today: '2026-10-16',
    planCode: agreed ? CODE : 'ENTERPRISE',
    planName: 'Enterprise',
    billingCycle: agreed ? 'MONTHLY' : null,
    periodPrice: agreed ? '400.000' : null,
    trialStartsOn: null,
    trialEndsOn: null,
    trialDay: null,
    trialDaysLeft: null,
    paidThrough: agreed ? '2026-11-09' : null,
    renewsOn: agreed ? '2026-11-10' : null,
    graceDays: 7,
    graceUntil: null,
    autoRenew: false,
    autoRenewAvailable: false,
    autoRenewChangedAt: null,
    cancelAtPeriodEnd: false,
    accessEndsOn: null,
    scheduledChange: agreed
      ? {
          planCode: CODE,
          planName: 'Enterprise',
          billingCycle: 'MONTHLY',
          periodPrice: '450.000',
          effectiveOn: '2026-11-10',
        }
      : null,
    restriction: null,
    enterprise: { termsSet: agreed },
  }
  const overview = {
    plan: {
      code: agreed ? CODE : 'BUSINESS',
      name: agreed ? 'Enterprise' : 'Business',
      invoicesPerMonth: agreed ? 4000 : 1000,
      peopleIncluded: agreed ? 20 : 5,
      branchesIncluded: agreed ? 8 : 2,
      monthlyPrice: agreed ? '400.000' : '80.000',
      overagePricePerInvoice: agreed ? '0.040' : '0.060',
    },
    usage: {
      period: { start: '2026-10-10', end: '2026-11-09', today: '2026-10-16' },
      used: 1210,
      resubmissions: 4,
      quota: agreed ? 4000 : 1000,
      raisedToday: 61,
    },
    activePeople: 14,
    openInvitations: 1,
    activeBranches: 6,
    allowance: null,
    enterprise: { termsSet: agreed },
  }
  routes.push(
    { match: '/api/v1/settings/subscription', reply: () => status },
    { match: '/api/v1/settings/plan', reply: () => overview },
  )
}

export default routes
