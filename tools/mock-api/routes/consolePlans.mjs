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
    versionOf('BUSINESS_PLUS', '150.000', 3000, 10, 5),
    { trialDays: null, trialDocuments: null },
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

export default [
  { match: '/api/v1/platform/plans', reply: () => PLANS },
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
