/** The sign-up flow's ids for the launch plans and Enterprise: `premium` is the Business plan. */
export type KnownPlanId = 'starter' | 'premium' | 'businessPlus' | 'enterprise'
/**
 * A plan chosen in sign-up: a launch id, or the backend code of a plan the console published
 * since. The catalogue lives in the database (catalogue contract §13), so the flow cannot list
 * every plan ahead of time.
 */
export type PlanId = KnownPlanId | (string & {})
export type BillingCycle = 'monthly' | 'annual'
/**
 * How the first bill will be paid: card on Paymob's hosted checkout, a bank transfer, or cash at
 * the office. `cardLink` keeps the contract's `CARD_LINK` code; no link is sent any more.
 */
export type SignupPaymentMethod = 'cardLink' | 'bankTransfer' | 'cash'

const KNOWN_PLAN_IDS: readonly string[] = ['starter', 'premium', 'businessPlus', 'enterprise']
export const isKnownPlanId = (plan: PlanId): plan is KnownPlanId => KNOWN_PLAN_IDS.includes(plan)

export function formatOmr(amount: number) {
  return amount.toFixed(3)
}

/*
 * Amounts are worked in baisa (1/1000 OMR) as integers. Multiplying a rounded rial float printed
 * 800.004 for a Business year (66.667 a month times twelve); only a figure shown to the reader is
 * ever turned back into rial.
 */
export const toBaisa = (omr: number) => Math.round(omr * 1000)

/** Rial to three places from baisa, with no float on the way. */
export function formatBaisa(baisa: number): string {
  const sign = baisa < 0 ? '-' : ''
  const whole = Math.abs(Math.trunc(baisa))
  return `${sign}${Math.floor(whole / 1000)}.${String(whole % 1000).padStart(3, '0')}`
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
