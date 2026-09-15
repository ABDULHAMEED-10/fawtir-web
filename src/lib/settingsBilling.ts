/**
 * Settings › Billing — the plan, what it costs, and every bill Fawtir has sent.
 *
 * Figma 135:40605 (Plan and usage), 135:40971 (Bills and payment).
 */

import { BOOK, COMPANY, RESETS_ON, TODAY, daysFrom, usageForecast, weekdayOf } from './settings'
import { PLATFORM_SETTINGS } from './platformSettings'
import { MEMBERS, SEATS } from './settingsPeople'
import { OPEN_BRANCHES } from './settingsCompany'
import { CATALOGUE, type PlanId } from './plans'

export type Plan = {
  id: PlanId
  monthly: number
  /** Documents a month, sent and received — the field is named for the screen that reads it. */
  invoices: number
  people: number
  /** Null means the plan does not cap branches. */
  branches: number | null
  extraPerson?: number
  /** Per document past the allowance when overage is on. */
  overage: number
  api: boolean
  prioritySupport?: boolean
}

/** The launch catalogue (`plans.ts`), in the shape this screen was drawn against. */
export const PLANS: Plan[] = CATALOGUE.map((plan) => ({
  id: plan.id,
  monthly: plan.monthly,
  invoices: plan.documents,
  people: plan.people,
  branches: plan.branches,
  extraPerson: plan.extraPerson,
  overage: plan.overage,
  api: plan.api,
  prioritySupport: plan.prioritySupport,
}))

export const CURRENT_PLAN = PLANS[1]

export const planById = (id: string) => PLANS.find((plan) => plan.id === id) ?? CURRENT_PLAN

/** Whether the account is already pressing against a plan's limits. */
export function planFit(plan: Plan) {
  const forecast = usageForecast()
  return {
    invoicesTight: forecast.used > plan.invoices * 0.85,
    peopleTight: MEMBERS.length >= plan.people,
    branchesTight: plan.branches !== null && OPEN_BRANCHES.length >= plan.branches,
  }
}

/** What moving up would cost, and what it would cover. */
export const UPGRADE = {
  to: 'businessPlus',
  extraMonthly: PLANS[2].monthly - CURRENT_PLAN.monthly,
}

export const USAGE_STATS = {
  raisedToday: BOOK.todayByBranch,
  resubmissions: BOOK.resubmissions,
  busiestDayCount: BOOK.busiestDayCount,
  busiestDay: BOOK.busiestDay,
  busiestWeekday: weekdayOf(BOOK.busiestDay),
  lastMonth: BOOK.lastMonth,
}

/** Overage is switched off, so invoices past the allowance are refused rather than charged. */
export const OVERAGE_ON = false

/* ------------------------------------------------------------ bills and paying */

export type TenantPaymentMethod = 'cardLink' | 'bankTransfer' | 'cash' | 'cheque'

/**
 * How the account pays Fawtir (15 Sep 2026). Nothing about a card is stored here or anywhere in
 * Fawtir: a card payment opens Thawani's own checkout from a link, and the link is sent to the
 * account a week before each bill falls due. Bank transfer and cash are always open as well; an
 * operator at Fawtir records those and activates the period.
 */
export const HOW_YOU_PAY = {
  method: 'cardLink' as TenantPaymentMethod,
  channel: 'whatsapp' as 'whatsapp' | 'email',
  phone: COMPANY.phone,
  email: COMPANY.email,
  /** Days before the due date the link is sent. */
  linkLeadDays: 7,
  linkValidDays: PLATFORM_SETTINGS.payments.linkExpiryDays,
  /** Where a transfer goes and what to write on it. */
  bank: PLATFORM_SETTINGS.payments.bank,
  /** The last link: sent for the September bill and paid the same day. */
  lastLink: { sentOn: new Date(2026, 8, 1), paidOn: new Date(2026, 8, 1) },
}

const DAY = 24 * 60 * 60 * 1000

/** When the link for a bill goes out. */
export const linkArrivesOn = (dueOn: Date) =>
  new Date(dueOn.getTime() - HOW_YOU_PAY.linkLeadDays * DAY)

export type PastBill = {
  reference: string
  issued: string
  monthKey: string
  coveredKey: string
  coveredValues?: Record<string, string | number>
  amount: number
  method: TenantPaymentMethod
  /** The day the money was recorded. */
  paidOn: string
  /** Who confirmed it arrived: Thawani for a link, the Fawtir team for anything else. */
  confirmedBy: 'thawani' | 'fawtir'
  status: 'paid' | 'paidLate'
  lateNoteKey?: string
}

export const PAST_BILLS: PastBill[] = [
  {
    reference: 'FWT-2026-0912',
    issued: '1 Sep 2026',
    monthKey: 'bills.month.september',
    coveredKey: 'bills.coveredPlanPeople',
    coveredValues: { people: 5 },
    amount: 28,
    method: 'cardLink',
    paidOn: '1 Sep 2026',
    confirmedBy: 'thawani',
    status: 'paid',
  },
  {
    reference: 'FWT-2026-0811',
    issued: '1 Aug 2026',
    monthKey: 'bills.month.august',
    coveredKey: 'bills.coveredPlanPeople',
    coveredValues: { people: 5 },
    amount: 28,
    method: 'cardLink',
    paidOn: '1 Aug 2026',
    confirmedBy: 'thawani',
    status: 'paid',
  },
  {
    reference: 'FWT-2026-0710',
    issued: '1 Jul 2026',
    monthKey: 'bills.month.july',
    coveredKey: 'bills.coveredPlanPeopleExtra',
    coveredValues: { people: 5, extra: 1 },
    amount: 30.5,
    method: 'cardLink',
    paidOn: '1 Jul 2026',
    confirmedBy: 'thawani',
    status: 'paid',
  },
  {
    reference: 'FWT-2026-0609',
    issued: '1 Jun 2026',
    monthKey: 'bills.month.june',
    coveredKey: 'bills.coveredRetried',
    coveredValues: { date: '3 June' },
    amount: 28,
    method: 'bankTransfer',
    paidOn: '3 Jun 2026',
    confirmedBy: 'fawtir',
    status: 'paidLate',
  },
  {
    reference: 'FWT-2026-0508',
    issued: '1 May 2026',
    monthKey: 'bills.month.may',
    coveredKey: 'bills.coveredPlanPeople',
    coveredValues: { people: 4 },
    amount: 28,
    method: 'cash',
    paidOn: '2 May 2026',
    confirmedBy: 'fawtir',
    status: 'paid',
  },
  {
    reference: 'FWT-2026-0407',
    issued: '1 Apr 2026',
    monthKey: 'bills.month.april',
    coveredKey: 'bills.coveredPlanPeople',
    coveredValues: { people: 4 },
    amount: 28,
    method: 'bankTransfer',
    paidOn: '1 Apr 2026',
    confirmedBy: 'fawtir',
    status: 'paid',
  },
]

/**
 * The next bill, built from the plan and the account rather than stated — so adding a sixth
 * person moves the total on this screen and the warning on the plan screen together.
 */
export function nextBill(extraPeople = Math.max(0, MEMBERS.length - SEATS.included)) {
  const people = extraPeople * SEATS.extraMonthly
  /** Overage is off, so nothing can accrue here however many invoices are refused. */
  const overage = 0
  return {
    dueOn: RESETS_ON,
    inDays: daysFrom(RESETS_ON),
    plan: CURRENT_PLAN.monthly,
    people,
    overage,
    total: CURRENT_PLAN.monthly + people + overage,
    /** What it would come to if one more person were added before the first. */
    withOneMore: CURRENT_PLAN.monthly + (extraPeople + 1) * SEATS.extraMonthly,
  }
}

export const formatOmr = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

export { TODAY, usageForecast }
