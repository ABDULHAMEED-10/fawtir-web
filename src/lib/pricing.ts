import { PLAN, SUBSCRIPTION_VAT, annualMonthly } from './plans'

/** The sign-up flow's own ids: `premium` is the catalogue's Business plan. */
export type PlanId = 'starter' | 'premium' | 'enterprise'
export type BillingCycle = 'monthly' | 'annual'

const MONTHLY_RATES: Record<Exclude<PlanId, 'enterprise'>, Record<BillingCycle, number>> = {
  starter: { monthly: PLAN.starter.monthly, annual: annualMonthly(PLAN.starter) },
  premium: { monthly: PLAN.business.monthly, annual: annualMonthly(PLAN.business) },
}

export type OrderSummary = {
  plan: Exclude<PlanId, 'enterprise'>
  billing: BillingCycle
  monthlyRate: number
  months: number
  subtotal: number
  vat: number
  total: number
}

export function formatOmr(amount: number) {
  return amount.toFixed(3)
}

export function getOrderSummary(plan: PlanId, billing: BillingCycle): OrderSummary | null {
  if (plan === 'enterprise') return null
  const monthlyRate = MONTHLY_RATES[plan][billing]
  const months = billing === 'annual' ? 12 : 1
  const subtotal = +(monthlyRate * months).toFixed(3)
  const vat = +(subtotal * SUBSCRIPTION_VAT).toFixed(3)
  const total = +(subtotal + vat).toFixed(3)
  return { plan, billing, monthlyRate, months, subtotal, vat, total }
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
