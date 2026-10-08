import {
  ANNUAL_FREE_MONTHS,
  PLAN,
  TRIAL,
  type AnyPlanId,
  type ExtractionAvailability,
  type PlanId as CataloguePlanId,
} from './plans'
import { PLATFORM_SETTINGS } from './platformSettings'

/** The sign-up flow's own ids: `premium` is the catalogue's Business plan. */
export type PlanId = 'starter' | 'premium' | 'businessPlus' | 'enterprise'
export type BillingCycle = 'monthly' | 'annual'
/** How the first bill will be paid: a Paymob link, a bank transfer, or cash at the office. */
export type SignupPaymentMethod = 'cardLink' | 'bankTransfer' | 'cash'
/** Where a card customer wants the Paymob link sent when the first bill is due. */
export type PaymentLinkVia = 'whatsapp' | 'email'

export type OrderSummary = {
  plan: Exclude<PlanId, 'enterprise'>
  billing: BillingCycle
  /** The rate per month as shown; for annual billing the year's price over twelve, display only. */
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
  /** The same figures in baisa: the integers every rial figure above is derived from. */
  baisa: { planSubtotal: number; addonSubtotal: number; subtotal: number; vat: number; total: number }
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

/**
 * Days of free trial the chosen plan starts with once the registration is approved, or `null`
 * when the plan has none, in which case the first bill goes out on approval (owner decision,
 * 8 Oct 2026). The super admin sets both the length and which plans carry one; until sign-up can
 * read the published plans, this is the launch default. TODO(backend): ONBOARDING.md row 1.1.
 */
export function trialDaysFor(plan: PlanId): number | null {
  if (plan === 'enterprise') return null
  return (TRIAL.offeredOn as readonly AnyPlanId[]).includes(cataloguePlanId(plan))
    ? TRIAL.days
    : null
}

export const extractionMonthly = () => PLATFORM_SETTINGS.addons.erpExtraction.monthly

export function formatOmr(amount: number) {
  return amount.toFixed(3)
}

/*
 * Amounts are worked in baisa (1/1000 OMR) as integers. Multiplying a rounded rial float printed
 * 800.004 for a Business year (66.667 a month times twelve); only a figure shown to the reader is
 * ever turned back into rial.
 */
export const toBaisa = (omr: number) => Math.round(omr * 1000)
export const fromBaisa = (baisa: number) => baisa / 1000

/** Rial to three places from baisa, with no float on the way. */
export function formatBaisa(baisa: number): string {
  const sign = baisa < 0 ? '-' : ''
  const whole = Math.abs(Math.trunc(baisa))
  return `${sign}${Math.floor(whole / 1000)}.${String(whole % 1000).padStart(3, '0')}`
}

/** Fawtir's subscription VAT as a whole percentage, so the VAT sum stays in integers. */
export const SUBSCRIPTION_VAT_PERCENT = 5

/** VAT on a non-negative baisa amount, rounded half up to the baisa. */
export function vatOnBaisa(baisa: number, ratePercent = SUBSCRIPTION_VAT_PERCENT): number {
  return Math.floor((baisa * ratePercent + 50) / 100)
}

/**
 * The plan's price for one billing period. Annual is the monthly price times ten — the "two
 * months free" rule the console bills by (`annualTotal`) — never a rounded monthly times twelve.
 */
export function planPeriodBaisa(plan: Exclude<PlanId, 'enterprise'>, billing: BillingCycle) {
  const monthly = toBaisa(PLAN[cataloguePlanId(plan) as CataloguePlanId].monthly)
  return billing === 'annual' ? monthly * (12 - ANNUAL_FREE_MONTHS) : monthly
}

export function getOrderSummary(
  plan: PlanId,
  billing: BillingCycle,
  options: { addon?: boolean } = {},
): OrderSummary | null {
  if (plan === 'enterprise') return null
  const months = billing === 'annual' ? 12 : 1
  const planSubtotal = planPeriodBaisa(plan, billing)
  // The add-on is priced per month with no annual discount; it is only offered where the console
  // says so, so an unsupported plan never carries it whatever the caller asked.
  const addonMonthly =
    options.addon && extractionOffer(plan) === 'priced' ? toBaisa(extractionMonthly()) : 0
  const addonSubtotal = addonMonthly * months
  const subtotal = planSubtotal + addonSubtotal
  const vat = vatOnBaisa(subtotal)
  const total = subtotal + vat
  return {
    plan,
    billing,
    monthlyRate: fromBaisa(Math.round(planSubtotal / months)),
    months,
    planSubtotal: fromBaisa(planSubtotal),
    addonMonthly: fromBaisa(addonMonthly),
    addonSubtotal: fromBaisa(addonSubtotal),
    subtotal: fromBaisa(subtotal),
    vat: fromBaisa(vat),
    total: fromBaisa(total),
    baisa: { planSubtotal, addonSubtotal, subtotal, vat, total },
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
