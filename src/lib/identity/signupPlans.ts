import { apiRequest } from '../../api'

/** One `features` entry: a `Feature` key from `lib/plans.ts`, switched on or off (contract §3). */
export type CatalogueFeature = { key: string; enabled: boolean }

/**
 * One plan of the published catalogue, as `GET /v1/auth/signup/plans` and its public alias
 * `GET /v1/public/plans` return it (catalogue contract §9): active and publicly visible plans
 * only, priced by the version current at the time of the read.
 *
 * Every amount is OMR as a string with three decimals, kept a string so no float ever rounds a
 * price. `null` keeps the V176 meanings: no extra person price, the people count is a ceiling;
 * no branches, unlimited; no overage, invoicing stops at the quota; no extra branch, not offered.
 */
export type SignupCataloguePlan = {
  code: string
  nameEn: string
  nameAr: string | null
  descriptionEn: string | null
  descriptionAr: string | null
  currency: string
  /** The price version the screen shows; sent back with the choice so a repricing is caught. */
  priceVersionId: string
  monthlyPrice: string
  /** The year's price, fixed when the version was published: monthly × (12 − annualFreeMonths). */
  annualPrice: string
  annualFreeMonths: number
  invoicesPerMonth: number
  peopleIncluded: number
  extraPersonPrice: string | null
  branchesIncluded: number | null
  extraBranchPrice: string | null
  overagePricePerInvoice: string | null
  apiAccess: boolean
  prioritySupport: boolean
  recommended: boolean
  /** `null`: the plan has no trial, and the first bill goes out on approval. */
  trialDays: number | null
  trialDocuments: number | null
  features: CatalogueFeature[]
  sortOrder: number
  /**
   * The subscription VAT rate as a fraction ("0.05000", "0.00000" for none), the same on every
   * plan; `null` while none is set. Absent from a server older than the field.
   */
  vatRate?: string | null
}

export const SIGNUP_PLANS_PATH = '/v1/auth/signup/plans'
/** SITE.md row 2.1: the same body, for the public site, outside the sign-up namespace. */
export const PUBLIC_PLANS_PATH = '/v1/public/plans'

export type CatalogueReader = (signal?: AbortSignal) => Promise<SignupCataloguePlan[]>

function readCatalogue(path: string, signal?: AbortSignal) {
  return apiRequest<SignupCataloguePlan[]>(path, {
    method: 'GET',
    signal,
    credentials: 'omit',
  }).then((body) => {
    // An unreadable body is not an empty catalogue: "no plans offered" would be a claim the
    // server never made, so it fails like any other bad answer and the screen offers a retry.
    if (!Array.isArray(body)) throw new TypeError('The plan catalogue was not a list')
    return [...body].sort((a, b) => a.sortOrder - b.sortOrder)
  })
}

/** The catalogue sign-up chooses from. Anonymous: reading it needs no onboarding token. */
export const readSignupPlans: CatalogueReader = (signal) => readCatalogue(SIGNUP_PLANS_PATH, signal)

/** The same catalogue for the marketing site's pricing page. */
export const readPublicPlans: CatalogueReader = (signal) => readCatalogue(PUBLIC_PLANS_PATH, signal)

/**
 * A three-decimal OMR string to baisa with no float on the way: `"80.000"` is 80000. `null` for
 * anything that is not such a figure, so a malformed amount is shown as unavailable, never guessed.
 */
export function baisaOf(amount: string | null | undefined): number | null {
  if (typeof amount !== 'string') return null
  const match = /^(\d{1,12})(?:\.(\d{1,3}))?$/.exec(amount.trim())
  if (!match) return null
  return Number(match[1]) * 1000 + Number((match[2] ?? '').padEnd(3, '0'))
}
