import { useSyncExternalStore } from 'react'
import { ANY_PLAN_IDS, hasFeature, lowestPlanWith, type AnyPlanId, type Feature } from './plans'
import { CURRENT_PLAN } from './settingsBilling'

/**
 * What the signed-in tenant may open, by plan (the client's ruling of 20 Sep 2026).
 *
 * A module the plan lacks is never hidden: the route still resolves, the sidebar still lists it,
 * and what the reader meets is a greyed entry and an upgrade nudge naming the plan that carries
 * it. Compliance — invoices, credit notes, debit notes, Peppol — is on every plan and no route
 * here gates it.
 *
 * The tenant's plan is the one Settings › Plan shows (`CURRENT_PLAN`, Al Bahja on Business). An
 * override lets the harness and a demo look at the app as another plan would see it: `?plan=`
 * on any URL, remembered for the tab so it survives navigation.
 */

/**
 * The client's call of 20 Sep 2026: the gating is built but not switched on yet — every module
 * opens on every plan until this is true. The plans page, Settings › Plan and the console already
 * describe the plan model; only the greying and the upgrade nudge wait.
 */
export const PLAN_GATING_ENABLED = false

const STORAGE_KEY = 'fawtir.planOverride'

const isPlanId = (value: unknown): value is AnyPlanId =>
  typeof value === 'string' && (ANY_PLAN_IDS as string[]).includes(value)

function readStored(): AnyPlanId | null {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY)
    return isPlanId(stored) ? stored : null
  } catch {
    return null
  }
}

function writeStored(plan: AnyPlanId | null) {
  try {
    if (plan) sessionStorage.setItem(STORAGE_KEY, plan)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage can be off (private window, blocked site data); the override then lasts a render.
  }
}

let override: AnyPlanId | null = readStored()
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const planAccessStore = {
  /** Look at the app as another plan; `null` goes back to the tenant's own. */
  override(plan: AnyPlanId | null) {
    if (plan === override) return
    override = plan
    writeStored(plan)
    listeners.forEach((listener) => listener())
  },
  /**
   * Reads `?plan=` off a URL and keeps it if it names a plan. Anything else leaves the current
   * override alone, so following a plain link does not drop the plan the harness chose.
   */
  applySearch(search: string) {
    const wanted = new URLSearchParams(search).get('plan')
    if (isPlanId(wanted)) this.override(wanted)
  },
  current: (): AnyPlanId => override ?? CURRENT_PLAN.id,
}

/** The plan the tenant is on — the override when the harness set one, else the billing plan. */
export function useTenantPlan(): AnyPlanId {
  return useSyncExternalStore(subscribe, planAccessStore.current, planAccessStore.current)
}

export type FeatureAccess = {
  available: boolean
  /** The lowest plan that carries the feature — what the nudge names. */
  neededPlan: AnyPlanId
}

export const featureAccess = (plan: AnyPlanId, feature: Feature): FeatureAccess => ({
  available: !PLAN_GATING_ENABLED || hasFeature(plan, feature),
  neededPlan: lowestPlanWith(feature),
})

export function useFeature(feature: Feature): FeatureAccess {
  return featureAccess(useTenantPlan(), feature)
}

/**
 * Route prefix → feature. A path matches when it equals the prefix or continues it with `/`, so
 * `/income/periodic/new` is gated with `/income/periodic` and `/income/periodic-x` is not.
 * Longer prefixes are listed first where two could match.
 */
export const ROUTE_FEATURES: { prefix: string; feature: Feature }[] = [
  { prefix: '/income/periodic', feature: 'recurringInvoices' },
  { prefix: '/income/self-billing', feature: 'selfBilling' },
  { prefix: '/trade-documents', feature: 'tradeDocuments' },
  { prefix: '/expenditure/credit-notes', feature: 'supplierNotes' },
  { prefix: '/expenditure/debit-notes', feature: 'supplierNotes' },
  { prefix: '/expenditure/recurring-bills', feature: 'recurringBills' },
  { prefix: '/settings/erp-mapping', feature: 'erpMapping' },
  { prefix: '/settings/erp/connections', feature: 'erpMapping' },
]

export function featureForPath(pathname: string): Feature | undefined {
  return ROUTE_FEATURES.find(
    ({ prefix }) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )?.feature
}
