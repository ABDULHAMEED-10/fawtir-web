import {
  PLAN,
  SUBSCRIPTION_VAT,
  annualMonthly,
  type AnyPlanId,
  type ExtractionAvailability,
} from './plans'
import { PLATFORM_SETTINGS } from './platformSettings'

/** The sign-up flow's own ids: `premium` is the catalogue's Business plan. */
export type PlanId = 'starter' | 'premium' | 'businessPlus' | 'enterprise'
export type BillingCycle = 'monthly' | 'annual'

const MONTHLY_RATES: Record<Exclude<PlanId, 'enterprise'>, Record<BillingCycle, number>> = {
  starter: { monthly: PLAN.starter.monthly, annual: annualMonthly(PLAN.starter) },
  premium: { monthly: PLAN.business.monthly, annual: annualMonthly(PLAN.business) },
  businessPlus: { monthly: PLAN.businessPlus.monthly, annual: annualMonthly(PLAN.businessPlus) },
}

export type OrderSummary = {
  plan: Exclude<PlanId, 'enterprise'>
  billing: BillingCycle
  monthlyRate: number
  months: number
  /** The plan alone, before the add-on. */
  planSubtotal: number
  /** The extraction add-on for the same months, or 0 when not chosen. */
  addonMonthly: number
  addonSubtotal: number
  subtotal: number
  vat: number
  total: number
}

/** The catalogue's id for a sign-up plan id. */
export const cataloguePlanId = (plan: PlanId): AnyPlanId => (plan === 'premium' ? 'business' : plan)

/**
 * Whether the chosen plan may take the automatic ERP extraction add-on — the console's per-plan
 * availability: not supported, offered at the add-on price, or included in the plan.
 */
export function extractionOffer(plan: PlanId): ExtractionAvailability {
  return PLATFORM_SETTINGS.addons.erpExtraction.availability[cataloguePlanId(plan)]
}

export const extractionMonthly = () => PLATFORM_SETTINGS.addons.erpExtraction.monthly

export function formatOmr(amount: number) {
  return amount.toFixed(3)
}

export function getOrderSummary(
  plan: PlanId,
  billing: BillingCycle,
  options: { addon?: boolean } = {},
): OrderSummary | null {
  if (plan === 'enterprise') return null
  const monthlyRate = MONTHLY_RATES[plan][billing]
  const months = billing === 'annual' ? 12 : 1
  const planSubtotal = +(monthlyRate * months).toFixed(3)
  // The add-on is priced per month with no annual discount; it is only offered where the console
  // says so, so an unsupported plan never carries it whatever the caller asked.
  const addonMonthly = options.addon && extractionOffer(plan) === 'priced' ? extractionMonthly() : 0
  const addonSubtotal = +(addonMonthly * months).toFixed(3)
  const subtotal = +(planSubtotal + addonSubtotal).toFixed(3)
  const vat = +(subtotal * SUBSCRIPTION_VAT).toFixed(3)
  const total = +(subtotal + vat).toFixed(3)
  return {
    plan,
    billing,
    monthlyRate,
    months,
    planSubtotal,
    addonMonthly,
    addonSubtotal,
    subtotal,
    vat,
    total,
  }
}

export function getRenewalDate(billing: BillingCycle, from = new Date()) {
  const date = new Date(from)
  if (billing === 'annual') {
    date.setFullYear(date.getFullYear() + 1)
  } else {
    date.setMonth(date.getMonth() + 1)
  }
  return date
}

export function formatRenewalDate(date: Date, locale = 'en') {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date)
}
