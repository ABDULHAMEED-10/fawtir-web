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
  /**
   * Why the subscription is read-only (`SUBSCRIPTION_NOT_STARTED`, `_SUSPENDED`, `_CANCELLED`), or
   * null. The server fills it only while restrictions are enforced, so it is optional here.
   */
  restriction?: string | null
  /**
   * Null unless the company chose Enterprise at sign-up (F22). While `termsSet` is false Fawtir has
   * not set its terms yet, so there is nothing to pay. Absent from a server before F22.
   */
  enterprise?: { termsSet: boolean } | null
  /**
   * Set while Fawtir has cancelled the subscription at once (CA-7, CA-9): read-only from `on`, and
   * `message` is what Fawtir wrote for the customer. Withdrawing the cancellation is refused
   * (`subscription-cancelled-by-fawtir`); renewing clears it. Absent from a server before it.
   */
  cancelledByFawtir?: { on: string; message: string } | null
}

/** What the status pill and the Settings card say: the server's access, or that nothing has started. */
export type SubscriptionDisplay = SubscriptionAccess | 'NOT_STARTED'

/**
 * Nothing has ever covered the company: approved with no trial and no confirmed payment yet. The
 * server answers PAYMENT_REQUIRED for it, but nothing is owed on a bill and no period has begun, so
 * "payment is due" and a calendar usage period would both be false (K-BC03, K-BC05). The server's
 * own rule (`SubscriptionRestriction.of`) is PAYMENT_REQUIRED with nothing covered, trial or paid;
 * `restriction` says the same thing directly when restrictions are on.
 */
export function subscriptionNotStarted(status: SubscriptionStatusDto): boolean {
  if (status.restriction === 'SUBSCRIPTION_NOT_STARTED') return true
  return status.access === 'PAYMENT_REQUIRED' && status.paidThrough === null && status.trialEndsOn === null
}

export function subscriptionDisplay(status: SubscriptionStatusDto): SubscriptionDisplay {
  return subscriptionNotStarted(status) && status.access === 'PAYMENT_REQUIRED' ? 'NOT_STARTED' : status.access
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

export type SubscriptionNoticeKind = 'TRIAL_ENDING' | 'GRACE' | 'CANCELLED_BY_FAWTIR'

export type SubscriptionNoticeDto = {
  id: string
  /** A kind this screen does not know yet is shown by its `headline`. */
  kind: SubscriptionNoticeKind | (string & {})
  /**
   * TRIAL_ENDING: the last trial day. GRACE: the last paid day, which lapsed unpaid.
   * CANCELLED_BY_FAWTIR (V365): the last covered day; Fawtir's cancellation took effect the day after.
   */
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

/**
 * What a downgrade waiting for renewal will switch off, and the customer's choice
 * (`GET/PUT /settings/subscription/scheduled-change/switch-off`, `DowngradeSwitchOffService`).
 * Both need `tenant.plan.manage`. With no downgrade waiting the server refuses with 409
 * `downgrade-choice-not-allowed`.
 *
 * Users carry an id only (names are encrypted at rest): the screen names them from `GET /users`.
 * At renewal the chosen go first, then the most recently added, and only as many as the new plan
 * requires. The owner, administrators and the Head Branch always stay and still count.
 */
export const SWITCH_OFF_PATH = `${SUBSCRIPTION_PATH}/scheduled-change/switch-off`

/** The refusal slug for a choice the server will not take, or no downgrade waiting. */
export const DOWNGRADE_CHOICE_NOT_ALLOWED = 'downgrade-choice-not-allowed'

export type SwitchOffUserRow = {
  userId: string
  addedAt: string
  /** OWNER or ADMINISTRATOR when the user can never be switched off, else null. */
  kept: 'OWNER' | 'ADMINISTRATOR' | (string & {}) | null
  /** Whether the customer may choose this user. */
  candidate: boolean
  /** Named in the recorded choice. */
  chosen: boolean
  /** What the renewal will do as things stand. */
  switchesOff: boolean
}

export type SwitchOffBranchRow = {
  branchId: string
  name: string
  addedAt: string
  /** HEAD_BRANCH for the Head Branch, else null. */
  kept: 'HEAD_BRANCH' | (string & {}) | null
  candidate: boolean
  chosen: boolean
  switchesOff: boolean
}

export type DowngradeSwitchOffDto = {
  planCode: string
  planVersionId: string
  /** The renewal date the downgrade applies on (`YYYY-MM-DD`). */
  effectiveOn: string
  peopleIncluded: number
  /** Null: the new plan has no branch limit. */
  branchesIncluded: number | null
  activeUsers: number
  openBranches: number
  /** Null when nobody has chosen: the default (most recently added first) applies. */
  choiceRecordedAt: string | null
  users: SwitchOffUserRow[]
  branches: SwitchOffBranchRow[]
}

export function loadSwitchOff(): Promise<DowngradeSwitchOffDto> {
  return apiRequest<DowngradeSwitchOffDto>(SWITCH_OFF_PATH)
}

/** Replaces any earlier choice. Two empty lists mean "use the default". */
export function saveSwitchOffChoice(userIds: string[], branchIds: string[]): Promise<DowngradeSwitchOffDto> {
  return apiRequest<DowngradeSwitchOffDto>(SWITCH_OFF_PATH, { method: 'PUT', body: { userIds, branchIds } })
}
