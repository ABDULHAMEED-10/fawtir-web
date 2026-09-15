/**
 * The plan catalogue as launched — `Fawtir_Pricing_Model.pdf` §2, §4, §6 and
 * `Fawtir_Subscription_Defaults` (Sep 2026).
 *
 * Every figure here is a launch default, not a commitment: the backend holds the live catalogue
 * (`GET /platform/plans`, edited in the console's Plans and rates) and the tenant's own plan
 * screen will read it from there. Until those screens are integrated, every mock that prints a
 * price — Settings › Plan and Bills, the sign-up plans, the console's tenants — reads this one
 * file, so the app cannot show three different price lists again (it did: 19/49/89 in Settings
 * and the console, 12/35 at sign-up, against the pricing doc's 12/28/55).
 *
 * The client's ruling of 15 Sep 2026: align to the pricing doc now, the console makes it
 * configurable later. Point of sale has no separate plan and no terminal charge; a POS simplified
 * invoice counts against the plan allowance like any other document.
 */

export type PlanId = 'starter' | 'business' | 'businessPlus'

export type CataloguePlan = {
  id: PlanId
  /** The backend's plan code — `subscriptions.plan_code`. */
  code: 'STARTER' | 'BUSINESS' | 'BUSINESS_PLUS'
  labelKey: string
  /** Rial a month, billed monthly. Prices exclude VAT (5 %). */
  monthly: number
  /** Tax documents a month, sent and received — the band the plan is chosen by. */
  documents: number
  people: number
  /** Null: the plan does not cap branches. */
  branches: number | null
  /** What one more person costs a month. */
  extraPerson: number
  /** What one more branch costs a month; null means "move up a plan" instead. */
  extraBranch: number | null
  /** Per document past the allowance when overage is on. */
  overage: number
  api: boolean
  webhooks: boolean
  approvals: boolean
  recurring: boolean
  roleBasedAccess: boolean
  prioritySupport: boolean
  supportKey: string
}

export const CATALOGUE: readonly CataloguePlan[] = [
  {
    id: 'starter',
    code: 'STARTER',
    labelKey: 'plan.planName.starter',
    monthly: 12,
    documents: 200,
    people: 2,
    branches: 1,
    extraPerson: 3,
    extraBranch: null,
    overage: 0.09,
    api: false,
    webhooks: false,
    approvals: false,
    recurring: false,
    roleBasedAccess: false,
    prioritySupport: false,
    supportKey: 'plan.support.email',
  },
  {
    id: 'business',
    code: 'BUSINESS',
    labelKey: 'plan.planName.business',
    monthly: 28,
    documents: 1_000,
    people: 5,
    branches: 2,
    extraPerson: 2.5,
    extraBranch: 8,
    overage: 0.04,
    api: true,
    webhooks: false,
    approvals: false,
    recurring: true,
    roleBasedAccess: true,
    prioritySupport: false,
    supportKey: 'plan.support.email',
  },
  {
    id: 'businessPlus',
    code: 'BUSINESS_PLUS',
    labelKey: 'plan.planName.businessPlus',
    monthly: 55,
    documents: 3_000,
    people: 10,
    branches: 5,
    extraPerson: 2.5,
    extraBranch: 8,
    overage: 0.026,
    api: true,
    webhooks: true,
    approvals: true,
    recurring: true,
    roleBasedAccess: true,
    prioritySupport: true,
    supportKey: 'plan.support.emailAndChat',
  },
]

export const PLAN = Object.fromEntries(CATALOGUE.map((plan) => [plan.id, plan])) as Record<
  PlanId,
  CataloguePlan
>

/** Annual billing gives two months free — twelve months for the price of ten. */
export const ANNUAL_FREE_MONTHS = 2

/** The monthly-equivalent rate when billed annually: 12.000 → 10.000, 28.000 → 23.333. */
export const annualMonthly = (plan: CataloguePlan) =>
  Math.round(((plan.monthly * (12 - ANNUAL_FREE_MONTHS)) / 12) * 1000) / 1000

/** The whole year, paid at once. */
export const annualTotal = (plan: CataloguePlan) => plan.monthly * (12 - ANNUAL_FREE_MONTHS)

/** VAT on Fawtir's own subscription invoices; prices are shown exclusive. */
export const SUBSCRIPTION_VAT = 0.05

/**
 * Enterprise is configured per customer after a contract is signed — price, band, seats,
 * features and terms all set for that tenant alone. It is never priced publicly.
 */
export const ENTERPRISE = { labelKey: 'plan.planName.enterprise' } as const

/** The trial every new tenant starts on. */
export const TRIAL = {
  days: 15,
  documents: 25,
  /** The plan whose features the trial carries. */
  mirrors: 'business' as PlanId,
  autoConverts: false,
  paymentDetailsRequired: false,
} as const
