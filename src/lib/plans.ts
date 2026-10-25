/**
 * The plan catalogue as launched: `Fawtir_Pricing_Model.pdf` §2, §4, §6,
 * `Fawtir_Subscription_Defaults` (Sep 2026) and the client's plan ruling of 19–20 Sep 2026
 * (docs/erp-and-console-plan.md §9.5).
 *
 * NOT A PRICE SOURCE FOR SIGN-UP OR THE SITE. Since the catalogue contract (owner decision,
 * 9 Oct 2026) the database is the catalogue: `/plans` and `/pricing` read
 * `GET /v1/auth/signup/plans` and `GET /v1/public/plans`, payment and review show the amounts
 * `/signup/status` computes from the pinned price version, and the console edits it through
 * `/v1/platform/plans`. Those screens fail closed (retry, never these figures) when the read
 * fails, because a price shown there is the price a registrant chooses. The owner published
 * the figures below as the catalogue's current version, so they match it today, but nothing
 * keeps them in step.
 *
 * What stays here: the `Feature` keys and their groups (the catalogue's `features[].key` values,
 * and the backend copies `COMPLIANCE_FEATURES`), the i18n label keys, fixtures for tests, the
 * launch record, and the prototype screens that have no server yet (Settings › Plan and Bills,
 * plan gating, the console's sample tenants), which still read `PLAN` under the sample-data
 * policy (docs/MOCK_DATA_POLICY.md) until they are integrated.
 *
 * The model (20 Sep 2026): plans differ by **features** and by **limits**; both are set from the
 * console. Starter is for a shop with no system of its own — invoices, notes, POS, bill tracking.
 * Business is every Fawtir feature except the ways in for another system (API, webhooks, ERP).
 * Business Plus is everything. Enterprise is Business Plus with limits agreed on a call. Every
 * plan can issue every compliance document (invoice, credit note, debit note) and send and
 * receive over Peppol — compliance is never gated. Automatic ERP extraction stays a separate
 * add-on; which plans may buy it, and which get it free, is a console setting.
 */

export type PlanId = 'starter' | 'business' | 'businessPlus'
/** A plan the sign-up flow and the compare table can name, Enterprise included. */
export type AnyPlanId = PlanId | 'enterprise'
export const ANY_PLAN_IDS: AnyPlanId[] = ['starter', 'business', 'businessPlus', 'enterprise']

/**
 * Everything a plan can switch on or off. Compliance documents are here so the compare table can
 * show them, but they are on for every plan and the console cannot switch them off.
 */
export type Feature =
  | 'peppol'
  | 'validation'
  | 'otaReporting'
  | 'signingQr'
  | 'bilingual'
  | 'archive'
  | 'complianceLog'
  | 'invoices'
  | 'creditNotes'
  | 'debitNotes'
  | 'bulkUpload'
  | 'incomeReminders'
  | 'recurringInvoices'
  | 'selfBilling'
  | 'tradeDocuments'
  | 'billTracking'
  | 'billReminders'
  | 'supplierNotes'
  | 'recurringBills'
  | 'purchaseOrders'
  | 'approvals'
  | 'pos'
  | 'catalogue'
  | 'stock'
  | 'reports'
  | 'notices'
  | 'rolesAndPermissions'
  | 'multiBranch'
  | 'api'
  | 'webhooks'
  | 'erpMapping'

/** The order the compare table and the plan editor list features in, grouped by area. */
export const FEATURE_GROUPS: { id: string; features: Feature[] }[] = [
  {
    id: 'compliance',
    features: [
      'peppol',
      'validation',
      'otaReporting',
      'signingQr',
      'bilingual',
      'archive',
      'complianceLog',
    ],
  },
  {
    id: 'income',
    features: [
      'invoices',
      'creditNotes',
      'debitNotes',
      'bulkUpload',
      'incomeReminders',
      'recurringInvoices',
      'selfBilling',
      'tradeDocuments',
    ],
  },
  {
    id: 'expenditure',
    features: [
      'billTracking',
      'billReminders',
      'supplierNotes',
      'recurringBills',
      'purchaseOrders',
      'approvals',
    ],
  },
  { id: 'operations', features: ['pos', 'catalogue', 'stock'] },
  {
    id: 'reports',
    features: ['reports', 'notices'],
  },
  { id: 'people', features: ['rolesAndPermissions', 'multiBranch'] },
  { id: 'integration', features: ['api', 'webhooks', 'erpMapping'] },
]
export const FEATURE_LIST: Feature[] = FEATURE_GROUPS.flatMap((g) => g.features)

/** Compliance never gated: on for every plan, locked in the console. */
export const COMPLIANCE_FEATURES: Feature[] = [
  'peppol',
  'validation',
  'otaReporting',
  'signingQr',
  'bilingual',
  'archive',
  'complianceLog',
  'invoices',
  'creditNotes',
  'debitNotes',
]

const STARTER_FEATURES: Feature[] = [
  ...COMPLIANCE_FEATURES,
  'creditNotes',
  'debitNotes',
  'bulkUpload',
  'incomeReminders',
  'billTracking',
  'billReminders',
  'pos',
  'catalogue',
  'stock',
  'reports',
  'notices',
  'rolesAndPermissions',
  'multiBranch',
]
const INTEGRATION_FEATURES: Feature[] = ['api', 'webhooks', 'erpMapping']

const matrix = (on: Feature[]): Record<Feature, boolean> =>
  Object.fromEntries(FEATURE_LIST.map((f) => [f, on.includes(f)])) as Record<Feature, boolean>

/** Which plan has which feature. Enterprise is Business Plus. */
export const FEATURES: Record<AnyPlanId, Record<Feature, boolean>> = {
  starter: matrix(STARTER_FEATURES),
  business: matrix(FEATURE_LIST.filter((f) => !INTEGRATION_FEATURES.includes(f))),
  businessPlus: matrix(FEATURE_LIST),
  enterprise: matrix(FEATURE_LIST),
}

export const hasFeature = (plan: AnyPlanId, feature: Feature) => FEATURES[plan][feature]

/** The lowest plan that carries a feature — what an upgrade nudge names. */
export function lowestPlanWith(feature: Feature): AnyPlanId {
  return ANY_PLAN_IDS.find((id) => FEATURES[id][feature]) ?? 'enterprise'
}

/** How a plan may have automatic ERP extraction — the console's Add-ons setting, per plan. */
export type ExtractionAvailability = 'notOffered' | 'priced' | 'included'
export const EXTRACTION_AVAILABILITY_DEFAULT: Record<AnyPlanId, ExtractionAvailability> = {
  starter: 'notOffered',
  business: 'notOffered',
  businessPlus: 'priced',
  enterprise: 'included',
}

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
  /** What one more branch costs a month — on every plan since 20 Sep 2026; null would mean "move up a plan". */
  extraBranch: number | null
  /**
   * Per extra invoice past the allowance when overage is on — quoted per invoice the way Omani
   * ASPs do, set a little above the market because the platform is more than an ASP, and always
   * below the plan's own average price per document so moving up a plan stays the better deal.
   */
  overage: number
  features: Record<Feature, boolean>
  /** Kept for the screens drawn against the earlier shape; each mirrors `features`. */
  api: boolean
  webhooks: boolean
  approvals: boolean
  recurring: boolean
  roleBasedAccess: boolean
  prioritySupport: boolean
  supportKey: string
}

const plan = (
  base: Omit<
    CataloguePlan,
    'features' | 'api' | 'webhooks' | 'approvals' | 'recurring' | 'roleBasedAccess'
  >,
): CataloguePlan => {
  const features = FEATURES[base.id]
  return {
    ...base,
    features,
    api: features.api,
    webhooks: features.webhooks,
    approvals: features.approvals,
    recurring: features.recurringInvoices,
    roleBasedAccess: features.rolesAndPermissions,
  }
}

export const CATALOGUE: readonly CataloguePlan[] = [
  plan({
    id: 'starter',
    code: 'STARTER',
    labelKey: 'plan.planName.starter',
    monthly: 35,
    documents: 200,
    people: 2,
    branches: 1,
    extraPerson: 3,
    extraBranch: 8,
    overage: 0.15,
    prioritySupport: true,
    supportKey: 'plan.support.emailAndChat',
  }),
  plan({
    id: 'business',
    code: 'BUSINESS',
    labelKey: 'plan.planName.business',
    monthly: 80,
    documents: 1_000,
    people: 5,
    branches: 2,
    extraPerson: 2.5,
    extraBranch: 8,
    overage: 0.06,
    prioritySupport: true,
    supportKey: 'plan.support.emailAndChat',
  }),
  plan({
    id: 'businessPlus',
    code: 'BUSINESS_PLUS',
    labelKey: 'plan.planName.businessPlus',
    monthly: 150,
    documents: 3_000,
    people: 10,
    branches: 5,
    extraPerson: 2.5,
    extraBranch: 8,
    overage: 0.04,
    prioritySupport: true,
    supportKey: 'plan.support.emailAndChat',
  }),
]

export const PLAN = Object.fromEntries(CATALOGUE.map((p) => [p.id, p])) as Record<
  PlanId,
  CataloguePlan
>

/** Annual billing gives two months free — twelve months for the price of ten. */
export const ANNUAL_FREE_MONTHS = 2

/** The monthly-equivalent rate when billed annually: 35.000 → 29.167, 80.000 → 66.667. */
export const annualMonthly = (p: CataloguePlan) =>
  Math.round(((p.monthly * (12 - ANNUAL_FREE_MONTHS)) / 12) * 1000) / 1000

/** The whole year, paid at once. */
export const annualTotal = (p: CataloguePlan) => p.monthly * (12 - ANNUAL_FREE_MONTHS)

/** VAT on Fawtir's own subscription invoices; prices are shown exclusive. */
export const SUBSCRIPTION_VAT = 0.05

/**
 * Enterprise is Business Plus with limits agreed on a call — documents, people, branches, price
 * are set per tenant after a contract is signed and never priced publicly. Same features.
 */
export const ENTERPRISE = {
  labelKey: 'plan.planName.enterprise',
  features: FEATURES.enterprise,
} as const

/**
 * The trial every new tenant starts on: 14 days of the plan they chose, on every plan except
 * Enterprise (which starts from a contract). Nothing is charged and it never converts by itself.
 */
export const TRIAL = {
  days: 14,
  documents: 25,
  /** The trial carries the chosen plan's own features, not a fixed plan's. */
  ofChosenPlan: true,
  /** Plans that offer a trial. */
  offeredOn: ['starter', 'business', 'businessPlus'] as PlanId[],
  autoConverts: false,
  paymentDetailsRequired: false,
} as const

export const trialOffered = (id: AnyPlanId) => id !== 'enterprise'
