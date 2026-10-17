import { apiRequest } from '../client'
import { ApiError } from '../errors'
import type { SubscriptionBillDto } from './billing'

/**
 * `/v1/settings/plan/extras` (`PaidExtrasController`, backend V340): paid places for extra users
 * and extra branches above what the plan includes (US-1, BR-3), and the ERP and API add-on on
 * the plans that offer it (ER-1, ER-2). Reading and quoting need `tenant.plan.read`; ordering and
 * stopping or keeping the add-on need `tenant.plan.manage`.
 *
 * Every figure is the server's (PY-2): the pro-rata days, the unit price (× 10 on an annual plan,
 * PL-4), VAT, the total and the per-order maximum (CF-3). The screen never multiplies anything.
 * Ordering issues an ordinary subscription bill (`kind: PAID_EXTRAS`), paid through
 * `/v1/settings/billing` like any other; the places start only once the payment is confirmed.
 */
export const PAID_EXTRAS_PATH = '/v1/settings/plan/extras'

/** The screen's own route, linked from Plan and usage and from the "extra place required" refusal. */
export const PAID_EXTRAS_ROUTE = '/settings/plan/extras'

export type PlaceKind = 'USER' | 'BRANCH' | 'ERP_ADDON'

export type PlaceKindOverviewDto = {
  /** What the plan includes; null for unlimited branches. */
  included: number | null
  /** Enabled users and open invitations, or open branches. */
  inUse: number
  /** Paid places covering today. */
  paidPlacesNow: number
  /** Included plus paid places; null for unlimited branches. */
  capacity: number | null
  /** One place a month, three-decimal OMR; null when the plan does not sell it. */
  unitMonthlyPrice: string | null
  offered: boolean
}

export type ErpAddonStatus = 'PENDING_PAYMENT' | 'ACTIVE' | 'ENDING' | 'ENDED'

export type ErpAddonOverviewDto = {
  /** False on Starter and Business, which never show it (ER-1). */
  offered: boolean
  monthlyPrice: string | null
  /** Null when it was never ordered. */
  status: ErpAddonStatus | null
  /** The last day it is on, once stopped. */
  endsOn: string | null
}

export type PaidExtraPlaceDto = {
  id: string
  kind: PlaceKind
  quantity: number
  source: 'PURCHASE' | 'RENEWAL' | 'BACKFILL'
  status: 'PENDING' | 'ACTIVE' | 'CANCELLED'
  unitPeriodPrice: string | null
  netAmount: string | null
  planCode: string | null
  billingCycle: 'MONTHLY' | 'ANNUAL' | null
  coversFrom: string
  coversTo: string
  billId: string | null
  reason: string | null
  createdAt: string
  activatedAt: string | null
  cancelledAt: string | null
}

export type PaidExtrasOrderDto = { places: PaidExtraPlaceDto[]; bill: SubscriptionBillDto }

export type PaidExtrasOverviewDto = {
  /** False while Fawtir has not opened paid extras: quote and order are then refused. */
  open: boolean
  users: PlaceKindOverviewDto
  branches: PlaceKindOverviewDto
  erpAddon: ErpAddonOverviewDto
  maxUsersPerOrder: number
  maxBranchesPerOrder: number
  /** The order still to pay, with its bill; null when there is none. */
  outstanding: PaidExtrasOrderDto | null
  /** The newest fifty places. */
  places: PaidExtraPlaceDto[]
}

/** One priced line: a kind over a span of days, prorated and rounded once by the server. */
export type PaidExtrasQuoteLineDto = {
  kind: PlaceKind
  quantity: number
  from: string
  to: string
  days: number
  periodDays: number
  unitPeriodPrice: string
  net: string
  planCode: string
  planVersionId: string
  billingCycle: 'MONTHLY' | 'ANNUAL'
}

export type PaidExtrasQuoteDto = {
  users: number
  branches: number
  erpAddon: boolean
  lines: PaidExtrasQuoteLineDto[]
  subtotal: string
  vatRate: string
  vatAmount: string
  total: string
  currency: 'OMR'
  /** From this day the places are on the renewal bill at the monthly price; null when nothing renews. */
  renewalOn: string | null
  /** Set when a downgrade is waiting: the places end on this day and are not renewed. */
  placesEnd: string | null
  maxUsersPerOrder: number
  maxBranchesPerOrder: number
}

export type PaidExtrasSelection = { users: number; branches: number; erpAddon: boolean }

export function loadPaidExtras(): Promise<PaidExtrasOverviewDto> {
  return apiRequest<PaidExtrasOverviewDto>(PAID_EXTRAS_PATH)
}

export function quotePaidExtras(
  selection: PaidExtrasSelection,
  signal?: AbortSignal,
): Promise<PaidExtrasQuoteDto> {
  const query = new URLSearchParams({
    users: String(selection.users),
    branches: String(selection.branches),
    erpAddon: String(selection.erpAddon),
  })
  return apiRequest<PaidExtrasQuoteDto>(`${PAID_EXTRAS_PATH}/quote?${query}`, { signal })
}

/**
 * Orders the places and issues the bill to pay. `expectedTotal` is the quote's total as shown: a
 * different server total is refused `extras-price-changed`. The same numbers again return the open
 * order; other numbers replace an unpaid one on the server, so a retry never orders twice.
 */
export function orderPaidExtras(
  selection: PaidExtrasSelection & { expectedTotal: string },
): Promise<PaidExtrasOrderDto> {
  return apiRequest<PaidExtrasOrderDto>(`${PAID_EXTRAS_PATH}/orders`, {
    method: 'POST',
    body: selection,
  })
}

/** ER-2: the add-on stays on to the end of the time already paid, then stops; nothing is refunded. */
export function stopErpAddon(): Promise<ErpAddonOverviewDto> {
  return apiRequest<ErpAddonOverviewDto>(`${PAID_EXTRAS_PATH}/erp-addon/cancellation`, {
    method: 'POST',
  })
}

/** Withdraws the stop before the add-on's last day. */
export function keepErpAddon(): Promise<ErpAddonOverviewDto> {
  return apiRequest<ErpAddonOverviewDto>(`${PAID_EXTRAS_PATH}/erp-addon/cancellation`, {
    method: 'DELETE',
  })
}

/**
 * The 409 `extra-place-required` the server gives an invite, a new user, a reactivation, a new
 * branch or a reopened branch at capacity (US-1, BR-3): the kind it needs a paid place for.
 * TODO(backend): SETTINGS.md row 5.10. The refusal is added by the limits wiring (backend lane
 * A2, after #538); until it is deployed the server still answers `plan-limit-reached` there.
 */
export function extraPlaceRequired(error: unknown): 'USER' | 'BRANCH' | null {
  if (!(error instanceof ApiError) || error.problemType !== 'extra-place-required') return null
  return error.problem.kind === 'BRANCH' ? 'BRANCH' : 'USER'
}
