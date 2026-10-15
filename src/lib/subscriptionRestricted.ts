import { ApiError } from '../api'

/**
 * The refusal a read-only subscription gives (plan v4 §8): issuing documents, adding people,
 * creating API keys and using the ERP stop while the subscription has not started, is suspended
 * or has ended. Reading, downloading and exporting never stop.
 *
 * The server answers `409` with the problem type `subscription-restricted`, so without this every
 * screen read it as the generic conflict ("someone changed this while you were working on it"),
 * or as a screen's own 409 (an API key "already rotated or revoked"). Both are false, and the
 * reload they advise cannot work: paying or choosing a plan is the only way forward. Keyed on the
 * type and `code`, never on the English `detail`.
 */
export const SUBSCRIPTION_RESTRICTED = 'subscription-restricted'

const MESSAGE_BY_CODE: Record<string, string> = {
  SUBSCRIPTION_NOT_STARTED: 'apiErrors.subscriptionRestricted.notStarted',
  SUBSCRIPTION_SUSPENDED: 'apiErrors.subscriptionRestricted.suspended',
  SUBSCRIPTION_CANCELLED: 'apiErrors.subscriptionRestricted.cancelled',
}

/** For a code a later backend adds: still the subscription, never the conflict sentence. */
const GENERIC_KEY = 'apiErrors.subscriptionRestricted.generic'

export function isSubscriptionRestricted(error: unknown): boolean {
  return error instanceof ApiError && error.problemType === SUBSCRIPTION_RESTRICTED
}

export function subscriptionRestrictedMessageKey(error: unknown): string | null {
  if (!(error instanceof ApiError) || !isSubscriptionRestricted(error)) return null
  return (error.code !== null && MESSAGE_BY_CODE[error.code]) || GENERIC_KEY
}

/**
 * Where a screen that can show a link sends the reader: the bills while one is to be paid (not
 * started, suspended), the plans once the subscription has ended.
 */
export function subscriptionRestrictedAction(
  error: unknown,
): { to: string; labelKey: string } | null {
  if (!(error instanceof ApiError) || !isSubscriptionRestricted(error)) return null
  return error.code === 'SUBSCRIPTION_CANCELLED'
    ? { to: '/settings/plan', labelKey: 'apiErrors.subscriptionRestricted.action.plan' }
    : { to: '/settings/bills', labelKey: 'apiErrors.subscriptionRestricted.action.bills' }
}
