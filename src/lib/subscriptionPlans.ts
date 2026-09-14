import type { FormMessage } from './identity/errors'

/**
 * One plan of the platform catalogue — `tenant.domain.subscription.SubscriptionPlan`, as both the
 * console (`/platform/plans`) and a tenant's own plan screen (`/settings/plan`) receive it.
 *
 * Money is Omani Rial with three decimals (V176: `NUMERIC(12, 3)`, "Starter 19.000 … OMR a month")
 * and every price is monthly; neither is a field, because the catalogue has no other currency or
 * period. The three nullable fields each carry a meaning, not an absence — see below.
 */
export type SubscriptionPlan = {
  /** `[A-Z][A-Z0-9_]{1,29}`, the identity subscriptions reference. */
  code: string
  name: string
  monthlyPrice: number
  invoicesPerMonth: number
  peopleIncluded: number
  /** `null`: the people count is a hard ceiling — no one can be added beyond it. */
  extraPersonPrice: number | null
  /** `null`: unlimited branches. */
  branchesIncluded: number | null
  apiAccess: boolean
  prioritySupport: boolean
  /** `null`: overage cannot be switched on, so invoicing stops at the quota. */
  overagePricePerInvoice: number | null
  sortOrder: number
  active: boolean
}

/** The app's money convention (catalogue, invoices, payments): Latin digits, three decimals. */
export function formatOmr(value: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
}

const count = (value: number) => value.toLocaleString('en-US')

/**
 * What a plan includes, as the lines a plan card lists — derived only from the backend's fields
 * and their documented null meanings, never from a plan's name or code.
 */
export function planFeatures(plan: SubscriptionPlan): FormMessage[] {
  return [
    { key: 'plan.feature.invoices', values: { count: count(plan.invoicesPerMonth) } },
    plan.extraPersonPrice === null
      ? { key: 'plan.feature.people', values: { count: plan.peopleIncluded } }
      : {
          key: 'plan.feature.peopleThen',
          values: { count: plan.peopleIncluded, amount: formatOmr(plan.extraPersonPrice) },
        },
    plan.branchesIncluded === null
      ? { key: 'plan.feature.unlimitedBranches' }
      : { key: 'plan.feature.branches', values: { count: plan.branchesIncluded } },
    { key: plan.apiAccess ? 'plan.feature.api' : 'plan.feature.noApi' },
    ...(plan.prioritySupport ? [{ key: 'plan.feature.prioritySupport' }] : []),
    plan.overagePricePerInvoice === null
      ? { key: 'plan.feature.noOverage' }
      : { key: 'plan.feature.overage', values: { amount: formatOmr(plan.overagePricePerInvoice) } },
  ]
}

/** The backend's own order (`ORDER BY sort_order, code`), so a saved plan lands where a reload would put it. */
export function sortPlans(plans: readonly SubscriptionPlan[]): SubscriptionPlan[] {
  return [...plans].sort((a, b) => a.sortOrder - b.sortOrder || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
}
