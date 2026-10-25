/**
 * The console plan catalogue (`/v1/platform/plans`) in the admin shape `CatalogueAdminPlan`, and
 * each plan's "Count received documents" switch with its history. The server's static PLANS list
 * is the older public shape; this module answers first, so the console renders real cards.
 */
const versionOf = (code, monthlyPrice, invoicesPerMonth, peopleIncluded, branchesIncluded) => ({
  id: `v-${code}-1`,
  planCode: code,
  versionNumber: 1,
  effectiveFrom: '2026-10-01T00:00:00Z',
  monthlyPrice,
  annualPrice: (Number(monthlyPrice) * 10).toFixed(3),
  invoicesPerMonth,
  peopleIncluded,
  extraPersonPrice: '2.500',
  branchesIncluded,
  extraBranchPrice: '8.000',
  overagePricePerInvoice: '0.060',
  apiAccess: code !== 'STARTER',
  prioritySupport: code === 'BUSINESS_PLUS',
  reason: 'Launch prices',
  createdBy: 'u-nasser',
  createdAt: '2026-10-01T00:00:00Z',
})

const planOf = (code, nameEn, nameAr, sortOrder, terms, extra = {}) => ({
  code,
  nameEn,
  nameAr,
  descriptionEn: null,
  descriptionAr: null,
  currency: 'OMR',
  active: true,
  publicVisible: true,
  recommended: code === 'BUSINESS',
  sortOrder,
  annualFreeMonths: 2,
  trialDays: 14,
  trialDocuments: 25,
  version: 1,
  currentVersion: terms,
  features: [{ key: 'peppol', enabled: true, compliance: true }],
  ...extra,
})

const PLANS = [
  planOf('STARTER', 'Starter', 'المبتدئة', 10, versionOf('STARTER', '35.000', 200, 2, 1)),
  planOf('BUSINESS', 'Business', 'الأعمال', 20, versionOf('BUSINESS', '80.000', 1000, 5, 2)),
  planOf(
    'BUSINESS_PLUS',
    'Business Plus',
    'الأعمال بلس',
    30,
    // The ERP and API add-on on the plan that has ERP field mapping (ER-1, backend #656).
    { ...versionOf('BUSINESS_PLUS', '150.000', 3000, 10, 5), erpAddonMonthlyPrice: '20.000' },
    {
      trialDays: null,
      trialDocuments: null,
      features: [
        { key: 'peppol', enabled: true, compliance: true },
        { key: 'erpMapping', enabled: true },
      ],
    },
  ),
]

/** Per plan: the switch and its versions, newest first. Starter was switched off once. */
const counting = new Map(
  PLANS.map((plan) => [
    plan.code,
    plan.code === 'STARTER'
      ? {
          planCode: plan.code,
          version: 1,
          countsReceived: false,
          history: [
            {
              id: 'rc-starter-1',
              planCode: plan.code,
              version: 1,
              countsReceived: false,
              reason: 'Starter counts issued documents only (owner, 15 Oct)',
              createdBy: 'u-nasser',
              createdAt: '2026-10-15T09:30:00Z',
            },
          ],
        }
      : { planCode: plan.code, version: 0, countsReceived: true, history: [] },
  ]),
)

const COUNTING = /^\/api\/v1\/platform\/plans\/([^/]+)\/received-document-counting$/
const QUOTE = /^\/api\/v1\/platform\/plans\/([^/]+)\/quote$/

/** The mock's VAT on Fawtir's own bills, as a percent; the real figure is the billing setting. */
const QUOTE_VAT_PERCENT = 5

/** Rial strings to baisa and back, so the mock's figures carry no float drift. */
const baisa = (rial) => Math.round(Number(rial) * 1000)
const rial = (value) => (value / 1000).toFixed(3)

/**
 * `GET /v1/platform/plans/{code}/quote?billingCycle=MONTHLY|ANNUAL[&erpAddon=true]`: the first
 * invoice the console's onboarding shows. The web prints these figures as they come; the server
 * works them out from the plan's current version, so the mock does the same here.
 */
function quoteOf(plan, billingCycle, erpAddon) {
  const version = plan.currentVersion
  const months = billingCycle === 'ANNUAL' ? 12 : 1
  const lines = [
    {
      kind: 'PLAN',
      description: `${plan.nameEn}, ${billingCycle === 'ANNUAL' ? '12 months' : '1 month'}`,
      net: billingCycle === 'ANNUAL' ? version.annualPrice : version.monthlyPrice,
    },
  ]
  if (erpAddon && version.erpAddonMonthlyPrice) {
    lines.push({
      kind: 'ERP_ADDON',
      description: `ERP add-on, ${months === 12 ? '12 months' : '1 month'}`,
      net: rial(baisa(version.erpAddonMonthlyPrice) * months),
    })
  }
  const net = lines.reduce((sum, line) => sum + baisa(line.net), 0)
  const vat = Math.floor((net * QUOTE_VAT_PERCENT + 50) / 100)
  return {
    planCode: plan.code,
    planVersion: version.versionNumber,
    billingCycle,
    currency: plan.currency,
    months,
    lines,
    net: rial(net),
    vatRate: QUOTE_VAT_PERCENT.toFixed(2),
    vat: rial(vat),
    total: rial(net + vat),
  }
}

export default [
  { match: '/api/v1/platform/plans', reply: () => PLANS },
  {
    match: QUOTE,
    reply: ({ params, query }) => {
      const plan = PLANS.find((entry) => entry.code === decodeURIComponent(params[0]))
      if (!plan) return { status: 404, body: { code: 'PLAN_NOT_FOUND' } }
      const billingCycle = query.get('billingCycle')
      if (billingCycle !== 'MONTHLY' && billingCycle !== 'ANNUAL') {
        return { status: 400, body: { code: 'BILLING_CYCLE_INVALID' } }
      }
      const erpAddon = query.get('erpAddon') === 'true'
      if (erpAddon && !plan.currentVersion.erpAddonMonthlyPrice) {
        return { status: 400, body: { code: 'ERP_ADDON_NOT_OFFERED' } }
      }
      return quoteOf(plan, billingCycle, erpAddon)
    },
  },
  {
    match: COUNTING,
    reply: ({ params }) => {
      const found = counting.get(decodeURIComponent(params[0]))
      return found ? found : { status: 404 }
    },
  },
  {
    method: 'PUT',
    match: COUNTING,
    reply: ({ params, body }) => {
      const code = decodeURIComponent(params[0])
      const current = counting.get(code)
      if (!current) return { status: 404 }
      if (!body?.reason?.trim()) return { status: 400, body: { type: 'validation-failed' } }
      const version = current.version + 1
      const next = {
        planCode: code,
        version,
        countsReceived: Boolean(body.countsReceived),
        history: [
          {
            id: `rc-${code}-${version}`,
            planCode: code,
            version,
            countsReceived: Boolean(body.countsReceived),
            reason: body.reason.trim(),
            createdBy: 'u-nasser',
            createdAt: new Date().toISOString(),
          },
          ...current.history,
        ],
      }
      counting.set(code, next)
      return next
    },
  },
]
