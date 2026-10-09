import { apiRequest } from '../client'

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
