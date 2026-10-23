import { apiRequest } from '../client'
import { ApiError } from '../errors'
import type { SubscriptionBillDto } from './billing'

/**
 * `/v1/settings/plan/changes` (`PlanChangeController`, backend P2-2): the customer's own plan and
 * billing-cycle changes. The list says whether self-service changes are open (`available`, the
 * server's `FAWTIR_SUBSCRIPTION_SELF_SERVICE_PLAN_CHANGE_ENABLED`), the charged change waiting for
 * payment and the history; it needs `tenant.plan.read`. The preview, the request and the withdrawal
 * need `tenant.plan.manage`. While the switch is off the preview and the request answer 409
 * `plan-change-unavailable`, and the screens show what they showed before.
 *
 * Every amount is the server's, a three-decimal OMR string (PY-2): the days left with today
 * included (PC-4), the annual price less what was paid (PC-2), the extras at monthly × 10 (PL-4),
 * VAT and the total. The screen never computes a price.
 *
 * A charged change (`UPGRADE`, `CYCLE_TO_ANNUAL`, `KEEP_PLAN`, `TRIAL_UPGRADE`, and PC-7's
 * `READ_ONLY_UPGRADE` and `GRACE_UPGRADE`) issues a `PLAN_CHANGE` bill, paid
 * through `/v1/settings/billing` like every other bill. A downgrade or a move to monthly billing
 * waits on the subscription (`GET /v1/settings/subscription`, `scheduledChange`).
 */
export const PLAN_CHANGES_PATH = '/v1/settings/plan/changes'

export type BillingCycle = 'MONTHLY' | 'ANNUAL'

export type PlanChangeKind =
  | 'UPGRADE'
  | 'CYCLE_TO_ANNUAL'
  | 'DOWNGRADE'
  | 'CYCLE_TO_MONTHLY'
  | 'CHANGE_AT_ONCE'
  | 'KEEP_PLAN'
  /** A dearer plan bought in the free trial: a whole first period from the payment day (TR-5). */
  | 'TRIAL_UPGRADE'
  /**
   * A dearer plan, or another billing cycle, while read-only (trial ended unpaid, Suspended,
   * Cancelled by the customer): a whole period from the payment day, which becomes the
   * subscription date; paying ends read-only at once (PC-7).
   */
  | 'READ_ONLY_UPGRADE'
  /**
   * The same in the grace days: a whole period from the original renewal date, in place of the
   * unpaid renewal bill; the subscription date stays (PC-7).
   */
  | 'GRACE_UPGRADE'
  | 'NONE'

export type PlanChangeApplies = 'AT_ONCE_WHEN_PAID' | 'AT_ONCE' | 'ON_DATE' | 'NOTHING'

export type PlanChangeSideDto = {
  planCode: string
  planName: string
  planVersionId: string
  cycle: BillingCycle
  /** One billing period in its cycle. */
  periodPrice: string
}

export type PlanChangePeriodDto = {
  startsOn: string
  endsOn: string
  totalDays: number
  remainingDays: number
  fromPrice: string
  toPrice: string
  amount: string
}

export type PlanChangeExtraDto = {
  type: 'USER' | 'BRANCH' | 'ERP_ADDON'
  count: number
  /** Monthly × 10 (PL-4). */
  annualUnitPrice: string
  credit: string
  amount: string
  coversFrom: string
  coversTo: string
}

export type PlanChangeChargeDto = {
  windowStartsOn: string
  windowEndsOn: string
  /** Both ends included: today counts (PC-4). */
  daysLeft: number
  /** The screen says "includes today" when true. */
  includesToday: boolean
  periods: PlanChangePeriodDto[]
  /** Monthly to annual: already paid for the months the new year covers. */
  credit: string
  extras: PlanChangeExtraDto[]
  subtotal: string
  vatRate: string
  vatAmount: string
  total: string
  currency: 'OMR'
  newPaidThrough: string | null
}

export type PlanChangePlacesDto = {
  /** Null for unlimited branches. */
  included: number | null
  inUse: number
  overBy: number
  /** The most recently added; never the owner, an administrator or the Head Branch. */
  defaultSwitchOff: string[]
}

export type PlanChangePreviewDto = {
  kind: PlanChangeKind
  applies: PlanChangeApplies
  effectiveOn: string | null
  from: PlanChangeSideDto
  to: PlanChangeSideDto
  /** What is paid now; null when nothing is charged. */
  charge: PlanChangeChargeDto | null
  /** An annual subscriber choosing a dearer plan and monthly billing: monthly from this day. */
  cycleChangeOn: string | null
  /** Day of the month; never changed by a plan change. */
  subscriptionDate: number | null
  allowance: { now: number; used: number; afterChange: number }
  /** Feature keys of today's plan the new plan lacks (PC-1); `api` when API access is lost. */
  lostFeatures: string[]
  erpAddonStops: boolean
  users: PlanChangePlacesDto | null
  branches: PlanChangePlacesDto | null
  /** Refusal types the request would meet now; empty when it can be made. */
  blockers: string[]
  /**
   * The first day of the whole period: the payment day for `TRIAL_UPGRADE` and
   * `READ_ONLY_UPGRADE`, the original renewal date for `GRACE_UPGRADE`; null otherwise (PC-7).
   * Absent from a server older than PC-7.
   */
  periodStartsOn?: string | null
  /** Paying ends read-only at once, and the payment day becomes the subscription date (PC-7). */
  endsReadOnly?: boolean
  /** The number of the unpaid renewal bill that requesting this change cancels (PC-7). */
  replacesRenewalBill?: string | null
}

export type PlanChangeStatus =
  'PENDING_PAYMENT' | 'APPLIED' | 'WITHDRAWN' | 'EXPIRED' | 'SUPERSEDED'

export type PlanChangeViewDto = {
  /** Null for a change that charged nothing (a downgrade, a move to monthly, one applied at once). */
  id: string | null
  kind: PlanChangeKind
  status: PlanChangeStatus | null
  applies: PlanChangeApplies
  effectiveOn: string | null
  fromPlanCode: string
  fromCycle: BillingCycle
  toPlanCode: string
  toPlanVersionId: string
  toCycle: BillingCycle
  cycleChangeOn: string | null
  windowStartsOn: string | null
  windowEndsOn: string | null
  daysLeft: number | null
  newPaidThrough: string | null
  credit: string | null
  net: string | null
  /** The PLAN_CHANGE bill, the same shape as every subscription bill. */
  bill: SubscriptionBillDto | null
  requestedAt: string | null
  closedAt: string | null
  closeReason: string | null
  /**
   * A charged change: the last day its bill can be paid for it to apply; unpaid after it, it
   * expires. Absent from a server older than PC-7.
   */
  lastDayToPay?: string | null
}

export type PlanChangesDto = {
  available: boolean
  pending: PlanChangeViewDto | null
  history: PlanChangeViewDto[]
}

/** What a server before P2-2, or one that cannot be read, is taken to say: nothing new to show. */
export const PLAN_CHANGES_UNAVAILABLE: PlanChangesDto = {
  available: false,
  pending: null,
  history: [],
}

export const PLAN_CHANGE_UNAVAILABLE = 'plan-change-unavailable'
export const PLAN_CHANGE_QUOTE_CHANGED = 'plan-change-quote-changed'

/**
 * Whether self-service changes are open, the change waiting for payment and the history. Any
 * failure (a server before P2-2 answers 404) reads as "not available", so the Plan page falls back
 * to what it showed before rather than to an error.
 */
export async function loadPlanChanges(): Promise<PlanChangesDto> {
  try {
    const read = await apiRequest<PlanChangesDto>(PLAN_CHANGES_PATH)
    return {
      available: read?.available === true,
      pending: read?.pending ?? null,
      history: read?.history ?? [],
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) throw error
    return PLAN_CHANGES_UNAVAILABLE
  }
}

export function previewPlanChange(
  planCode: string,
  billingCycle: BillingCycle,
  signal?: AbortSignal,
): Promise<PlanChangePreviewDto> {
  const query = new URLSearchParams({ planCode, billingCycle })
  return apiRequest<PlanChangePreviewDto>(`${PLAN_CHANGES_PATH}/preview?${query}`, { signal })
}

/** One key per confirmation, kept across retries: the same key again returns the first change. */
export function newPlanChangeKey(): string {
  return `plan-change-${crypto.randomUUID()}`
}

/**
 * Makes the change the preview described. `expectedTotal` (the preview's charge total) and
 * `expectedPlanVersionId` are compared by the server, never trusted: a different figure is refused
 * `plan-change-quote-changed` with the new preview in the body ({@link changedPreview}).
 */
export function requestPlanChange(
  request: {
    planCode: string
    billingCycle: BillingCycle
    expectedTotal: string | null
    expectedPlanVersionId: string
  },
  idempotencyKey: string,
): Promise<PlanChangeViewDto> {
  return apiRequest<PlanChangeViewDto>(PLAN_CHANGES_PATH, {
    method: 'POST',
    body: {
      planCode: request.planCode,
      billingCycle: request.billingCycle,
      ...(request.expectedTotal !== null ? { expectedTotal: request.expectedTotal } : {}),
      expectedPlanVersionId: request.expectedPlanVersionId,
    },
    headers: { 'Idempotency-Key': idempotencyKey },
  })
}

/** Withdraws a charged change while nothing is paid against its bill ("not after it is paid"). */
export function withdrawPlanChange(id: string): Promise<PlanChangeViewDto> {
  return apiRequest<PlanChangeViewDto>(`${PLAN_CHANGES_PATH}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

/** The fresh preview a `plan-change-quote-changed` refusal carries, or null for any other failure. */
export function changedPreview(error: unknown): PlanChangePreviewDto | null {
  if (!(error instanceof ApiError) || error.problemType !== PLAN_CHANGE_QUOTE_CHANGED) return null
  const preview = error.problem.preview
  return preview && typeof preview === 'object' ? (preview as PlanChangePreviewDto) : null
}
