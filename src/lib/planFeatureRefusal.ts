import { ApiError } from '../api'
import { isGatedFeature } from './planAccess'

/**
 * The refusal a plan without a feature gives (Business Rules PL-8): `403` with the problem type
 * `plan-feature-not-included`, code `PLAN_FEATURE_NOT_INCLUDED` and `feature`, the console's
 * switch key. Worded by that key, in the reader's language, never from the English `detail`; a
 * key a later server adds still reads as the plan, never as "your account doesn't have
 * permission", which would send the reader to an administrator who cannot help.
 */
export const PLAN_FEATURE_NOT_INCLUDED = 'plan-feature-not-included'

const GENERIC_KEY = 'apiErrors.planFeatureNotIncluded.generic'

export function isPlanFeatureNotIncluded(error: unknown): error is ApiError {
  return error instanceof ApiError && error.problemType === PLAN_FEATURE_NOT_INCLUDED
}

export function planFeatureMessageKey(error: unknown): string | null {
  if (!isPlanFeatureNotIncluded(error)) return null
  const feature = error.problem.feature
  return typeof feature === 'string' && isGatedFeature(feature)
    ? `apiErrors.planFeatureNotIncluded.${feature}`
    : GENERIC_KEY
}
