import { apiRequest } from '../client'
import { withQuery } from '../query'

/**
 * `/v1/settings/subscription` (`SubscriptionController`, V270): trial, paid-through, renewal,
 * grace, auto-renew, cancellation and a downgrade waiting for renewal. Reading needs
 * `tenant.plan.read`, every change `tenant.plan.manage`. Nothing here takes a payment: the
 * server has no payment provider yet, and `access` is shown, never enforced
 * (`restrictionsEnforced` is false).
 */
export const SUBSCRIPTION_PATH = '/v1/settings/subscription'

export type SubscriptionAccess = 'NOT_TRACKED' | 'TRIAL' | 'ACTIVE' | 'GRACE' | 'PAYMENT_REQUIRED' | 'CANCELLED'

export type ScheduledChangeDto = {
  planCode: string
  planName: string
  billingCycle: string
  /** Three-decimal OMR string for one period of the new plan. */
  periodPrice: string
  effectiveOn: string
}

/** Dates are business dates (`YYYY-MM-DD`) in the company's time zone; every end date is inclusive. */
export type SubscriptionStatusDto = {
  tracked: boolean
  access: SubscriptionAccess
  restrictionsEnforced: boolean
  today: string
  planCode: string
  planName: string
  billingCycle: 'MONTHLY' | 'ANNUAL' | null
  periodPrice: string | null
  trialStartsOn: string | null
  trialEndsOn: string | null
  trialDay: number | null
  trialDaysLeft: number | null
  paidThrough: string | null
  renewsOn: string | null
  graceDays: number
  graceUntil: string | null
  autoRenew: boolean
  autoRenewAvailable: boolean
  autoRenewChangedAt: string | null
  cancelAtPeriodEnd: boolean
  accessEndsOn: string | null
  scheduledChange: ScheduledChangeDto | null
}

export function loadSubscription(): Promise<SubscriptionStatusDto> {
  return apiRequest<SubscriptionStatusDto>(SUBSCRIPTION_PATH)
}

/** Ends the subscription at the end of the current trial or paid period. Idempotent. */
export function scheduleCancellation(): Promise<SubscriptionStatusDto> {
  return apiRequest<SubscriptionStatusDto>(`${SUBSCRIPTION_PATH}/cancellation`, { method: 'POST' })
}

export function withdrawCancellation(): Promise<SubscriptionStatusDto> {
  return apiRequest<SubscriptionStatusDto>(`${SUBSCRIPTION_PATH}/cancellation`, { method: 'DELETE' })
}

/** Withdraws a downgrade waiting for the next renewal. Idempotent. */
export function withdrawScheduledChange(): Promise<SubscriptionStatusDto> {
  return apiRequest<SubscriptionStatusDto>(`${SUBSCRIPTION_PATH}/scheduled-change`, { method: 'DELETE' })
}

/**
 * The caller's own trial-ending and grace reminders (`GET /settings/subscription/notices`, V299),
 * newest first. Needs `tenant.plan.read`; only owners and administrators are sent them, so anyone
 * else reads an empty list. A server from before V299 answers 404.
 *
 * `headline` and `actionLabel` are the server's e-mail text, fixed in one language when the
 * reminder was raised: the bell writes its own sentence from the dates instead.
 */
export const SUBSCRIPTION_NOTICES_PATH = `${SUBSCRIPTION_PATH}/notices`

export type SubscriptionNoticeKind = 'TRIAL_ENDING' | 'GRACE'

export type SubscriptionNoticeDto = {
  id: string
  /** A kind this screen does not know yet is shown by its `headline`. */
  kind: SubscriptionNoticeKind | (string & {})
  /** TRIAL_ENDING: the last trial day. GRACE: the last paid day, which lapsed unpaid. */
  coveredThrough: string
  /** GRACE only: 1 is the day after `coveredThrough`. */
  graceDay?: number | null
  /** GRACE only: the last day of grace, inclusive. */
  graceUntil?: string | null
  noticeOn: string
  headline: string
  actionLabel: string
  /** The web route the action opens: `/settings/plan` or `/settings/bills`. */
  actionPath: string
  createdAt: string
  read: boolean
}

/** The server's own cap on one read. */
export const SUBSCRIPTION_NOTICES_MAX = 100

export function subscriptionNoticesPath(unread: boolean, limit: number) {
  return withQuery(SUBSCRIPTION_NOTICES_PATH, { unread: unread ? 'true' : null, limit })
}

export function loadSubscriptionNotices(path: string): Promise<SubscriptionNoticeDto[]> {
  return apiRequest<SubscriptionNoticeDto[]>(path)
}

/** Idempotent; scoped to the caller, so a reminder addressed to someone else answers 404. */
export async function acknowledgeSubscriptionNotice(id: string): Promise<void> {
  await apiRequest<unknown>(`${SUBSCRIPTION_NOTICES_PATH}/${encodeURIComponent(id)}/acknowledge`, {
    method: 'POST',
  })
}
