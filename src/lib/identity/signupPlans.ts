import { apiRequest } from '../../api'

/** One active row of `tenant.subscription_plans` as `GET /signup/plans` returns it (contract §9). */
export type SignupCataloguePlan = {
  code: string
  /** OMR as a decimal string with three places; kept a string so no float rounds it. */
  monthlyPrice: string
  invoicesPerMonth: number
  peopleIncluded: number
  extraPersonPrice: string | null
  branchesIncluded: number | null
  apiAccess: boolean
  prioritySupport: boolean
  overagePricePerInvoice: string | null
  sortOrder: number
}

/**
 * The published catalogue, public and read-only.
 *
 * TODO(backend): ONBOARDING.md row 1.1 — not drawn yet. The plan screens keep the launch defaults
 * (35 / 80 / 150) because the backend seed prices them 19 / 49 / 89 and the owner has not decided
 * which is right; showing either here would quote a price that may not be charged.
 */
export function readSignupPlans(signal?: AbortSignal): Promise<SignupCataloguePlan[]> {
  return apiRequest<SignupCataloguePlan[]>('/v1/auth/signup/plans', {
    method: 'GET',
    signal,
    credentials: 'omit',
  })
}
