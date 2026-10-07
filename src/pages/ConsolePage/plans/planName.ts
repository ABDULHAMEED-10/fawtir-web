import type { TFunction } from 'i18next'
import type { SubscriptionPlan } from '../../../lib/subscriptionPlans'

/** The catalogue codes the app already names in both languages (`plan.planName.*`). */
const KNOWN_PLAN_NAMES: Record<string, string> = {
  STARTER: 'plan.planName.starter',
  BUSINESS: 'plan.planName.business',
  BUSINESS_PLUS: 'plan.planName.businessPlus',
}

/**
 * The name the backend holds, except in Arabic for a standard plan still carrying its standard
 * English name: that one has an Arabic name already. A renamed plan keeps the operator's name.
 */
export function displayPlanName(plan: SubscriptionPlan, t: TFunction, language: string) {
  const key = KNOWN_PLAN_NAMES[plan.code]
  if (!key || !language.startsWith('ar')) return plan.name
  return t(key, { lng: 'en' }) === plan.name ? t(key) : plan.name
}
