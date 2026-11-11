import { useTranslation } from 'react-i18next'
import { useEntitlements } from '../../hooks/useEntitlements'
import { hasPermission } from '../../lib/identity/entitlements'
import { describeApiFailure } from '../../lib/apiFailure'
import { priceRuleRefusalKey } from '../../lib/catalogRules'
import { muscatToday } from '../../lib/pos'
import { PRICE_RULES_MANAGE, PRICE_RULES_READ } from '../../api/catalog/priceRules'

/**
 * What the session may do with price rules, from the entitlement snapshot. Display only: the
 * server still decides. Reading needs `product.read`; create, edit, switch, pause and archive need
 * `product.manage` (refused while the subscription is read-only, ST-2).
 */
export function usePriceRuleAccess(): { ready: boolean; canRead: boolean; canManage: boolean } {
  const { entitlements, ready } = useEntitlements()
  if (!ready || entitlements === null) return { ready, canRead: false, canManage: false }
  return {
    ready,
    canRead: hasPermission(entitlements, PRICE_RULES_READ),
    canManage: hasPermission(entitlements, PRICE_RULES_MANAGE),
  }
}

/** A failed rule request in words: the route's own refusal first, then the shared sentence. */
export function usePriceRuleFailureText() {
  const { t } = useTranslation()
  return (error: unknown) => {
    const shared = describeApiFailure(error)
    // A read-only subscription and a plan are worded by the shared sentence, before our codes.
    if (shared.key.startsWith('apiErrors.subscriptionRestricted')) return t(shared.key)
    const own = priceRuleRefusalKey(error)
    if (own) return t(own)
    return t(shared.key, shared.values)
  }
}

/** The day after today in Muscat: the earliest a pause may end. */
export function tomorrowInMuscat(): string {
  const today = new Date(`${muscatToday()}T00:00:00Z`)
  return new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}
