import { useCallback } from 'react'
import { lowestPlanWith, type AnyPlanId, type Feature, type PlanId } from './plans'
import type { Entitlements } from './identity/entitlements'
import { useEntitlements } from '../hooks/useEntitlements'
import { useApiRead } from '../hooks/useApiRead'
import {
  PUBLIC_PLANS_PATH,
  readPublicPlans,
  type SignupCataloguePlan,
} from './identity/signupPlans'

/**
 * What the company's plan lets it make or use (Business Rules PL-8, owner, 23 Oct 2026): the super
 * admin switches each feature on or off per plan in Console › Plans; the server refuses, and the
 * screens hide, a feature switched off for the company's plan. Never fixed in the code.
 *
 * The server says both halves in `GET /v1/me/entitlements`: `planFeaturesEnforced` (whether it
 * refuses anything at all, `FAWTIR_BILLING_PLAN_FEATURES_ENABLED`) and `planFeatures` (the plan's
 * switches, key to on or off; a key absent is off). A feature is offered when the server does not
 * enforce, or when its switch is on. A server older than the fields omits them, which reads as not
 * enforced: every screen stays as it was.
 *
 * Only what the server refuses is hidden ({@link GATED_FEATURES}, the backend's `GatedFeature`).
 * Compliance is on every plan (PL-5), the ERP and API add-on is refused by its own entitlement
 * (`erp-entitlement-required`), and the other switches only describe the plan, so none of those
 * is ever hidden here.
 *
 * Hiding covers making and using, never reading: what the company made before stays listed,
 * viewable, downloadable and exportable, which is what the server allows.
 */
export const GATED_FEATURES: readonly Feature[] = [
  'tradeDocuments',
  'recurringInvoices',
  'selfBilling',
  'supplierNotes',
  'recurringBills',
  'purchaseOrders',
  'approvals',
  'bulkUpload',
  'stock',
]

/**
 * Purchase orders have their own switch (PL-8, owner change, 24 Oct 2026); before it, the server
 * gated them with trade documents. A server that does not yet send the `purchaseOrders` switch is
 * still refusing them by `tradeDocuments`, so that switch decides until the new one is there.
 */
const FALLBACK_SWITCH: Partial<Record<Feature, Feature>> = { purchaseOrders: 'tradeDocuments' }

export const isGatedFeature = (feature: string): feature is Feature =>
  (GATED_FEATURES as readonly string[]).includes(feature)

/** Whether to offer making or using `feature`. Display only: the server still decides. */
export function planIncludes(entitlements: Entitlements | null, feature: Feature): boolean {
  if (!isGatedFeature(feature)) return true
  if (entitlements?.planFeaturesEnforced !== true) return true
  return switchOn(entitlements.planFeatures ?? {}, feature)
}

/** Whether the company's switches, as the server sent them, have `feature` on. */
export function switchOn(switches: Record<string, boolean>, feature: Feature): boolean {
  const fallback = FALLBACK_SWITCH[feature]
  const key = fallback && !(feature in switches) ? fallback : feature
  return switches[key] === true
}

const PLAN_ID_BY_CODE: Record<string, PlanId> = {
  STARTER: 'starter',
  BUSINESS: 'business',
  BUSINESS_PLUS: 'businessPlus',
}

/**
 * The cheapest published plan whose switch for `feature` is on, as Console › Plans sets it today,
 * so the nudge never names a plan from launch figures. Enterprise when no published plan has it;
 * the launch matrix only while the catalogue has not been read.
 */
export function neededPlanFrom(
  catalogue: SignupCataloguePlan[] | null,
  feature: Feature,
): AnyPlanId {
  if (!catalogue) return lowestPlanWith(feature)
  const carrying = [...catalogue]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find(
      (plan) =>
        PLAN_ID_BY_CODE[plan.code] !== undefined &&
        plan.features.some((f) => f.key === feature && f.enabled),
    )
  return carrying ? PLAN_ID_BY_CODE[carrying.code] : 'enterprise'
}

/** Whether any gated feature is switched off for this company while the server enforces. */
const anyOff = (entitlements: Entitlements | null) =>
  GATED_FEATURES.some((feature) => !planIncludes(entitlements, feature))

export type FeatureAccess = {
  available: boolean
  /** The cheapest plan that carries the feature — what the nudge names. */
  neededPlan: AnyPlanId
}

/**
 * Every feature's access at once, for a screen that asks about several (the sidebar). The
 * published catalogue is read only when something is switched off, to name the plan that has it.
 */
export function usePlanAccess(): {
  access: (feature: Feature) => FeatureAccess
  /** The company's own switches, `null` while the server does not enforce or has not answered. */
  companyFeatures: Record<string, boolean> | null
  catalogue: SignupCataloguePlan[] | null
} {
  const { entitlements } = useEntitlements()
  const needCatalogue = anyOff(entitlements)
  const read = useApiRead<SignupCataloguePlan[]>(needCatalogue ? PUBLIC_PLANS_PATH : null, () =>
    readPublicPlans(),
  ).read
  const catalogue = read.status === 'ready' ? read.data : null
  const access = useCallback(
    (feature: Feature): FeatureAccess => ({
      available: planIncludes(entitlements, feature),
      neededPlan: neededPlanFrom(catalogue, feature),
    }),
    [entitlements, catalogue],
  )
  const companyFeatures =
    entitlements?.planFeaturesEnforced === true ? (entitlements.planFeatures ?? {}) : null
  return { access, companyFeatures, catalogue }
}

export function useFeature(feature: Feature): FeatureAccess {
  return usePlanAccess().access(feature)
}

/** Whether to offer making or using `feature`, without the plan the nudge would name. */
export function usePlanIncludes(feature: Feature): boolean {
  return planIncludes(useEntitlements().entitlements, feature)
}

/**
 * Route prefix → feature. A path matches when it equals the prefix or continues it with `/`, so
 * `/income/periodic/new` is gated with `/income/periodic` and `/income/periodic-x` is not.
 * Longer prefixes are listed first where two could match.
 */
export const ROUTE_FEATURES: { prefix: string; feature: Feature }[] = [
  { prefix: '/income/periodic', feature: 'recurringInvoices' },
  { prefix: '/expenditure/self-billing', feature: 'selfBilling' },
  { prefix: '/trade-documents', feature: 'tradeDocuments' },
  { prefix: '/expenditure/credit-notes', feature: 'supplierNotes' },
  { prefix: '/expenditure/debit-notes', feature: 'supplierNotes' },
  { prefix: '/expenditure/recurring-bills', feature: 'recurringBills' },
  { prefix: '/settings/erp-mapping', feature: 'erpMapping' },
  { prefix: '/settings/erp/connections', feature: 'erpMapping' },
  { prefix: '/settings/erp/bridge', feature: 'erpMapping' },
  { prefix: '/settings/erp/api-push', feature: 'erpMapping' },
  { prefix: '/settings/erp/documents', feature: 'erpMapping' },
  { prefix: '/settings/erp/attention', feature: 'erpMapping' },
  { prefix: '/settings/erp/runs', feature: 'erpMapping' },
  { prefix: '/settings/erp/access', feature: 'erpMapping' },
  { prefix: '/settings/erp', feature: 'erpMapping' },
]

export function featureForPath(pathname: string): Feature | undefined {
  return ROUTE_FEATURES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )?.feature
}
