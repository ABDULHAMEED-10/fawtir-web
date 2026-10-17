import { apiRequest } from '../client'

/**
 * `GET /v1/settings/plan` (`PlanController`, permission `tenant.plan.read`): the tenant's plan, this
 * month's usage and the counts the plan's ceilings watch. Only the fields a screen reads are typed;
 * the server's derived figures (`left()`, `projectedMonthEnd()`) are methods on its records and are
 * not serialized, so a screen computes what it needs from `used` and `quota`.
 */
export const PLAN_OVERVIEW_PATH = '/v1/settings/plan'

export type SubscriptionPlanDto = {
  code: string
  name: string
  invoicesPerMonth: number
  peopleIncluded: number
  /** `null` is unlimited. */
  branchesIncluded: number | null
  /*
   * The terms below are three-decimal OMR strings since V265 (they were numbers before). No screen
   * prints them yet; they are typed so a reader that does gets a string, never a float.
   */
  monthlyPrice?: string | null
  annualPrice?: string | null
  extraPersonPrice?: string | null
  extraBranchPrice?: string | null
  overagePricePerInvoice?: string | null
  versionId?: string | null
  versionNumber?: number | null
}

export type PlanUsageDto = {
  period: { start: string; end: string; today: string }
  used: number
  resubmissions: number
  quota: number
  raisedToday: number
}

/** One branch's share of the month. The row with a null branch holds what belongs to no branch. */
export type BranchAllowanceUsageDto = {
  branchId: string | null
  branchName: string | null
  issued: number
  received: number
  total: number
}

/**
 * The month's allowance as plan v4 §6 shows it (`AllowanceUsage`): the plan's documents and the
 * extras apart, issued and received apart, per branch and in total. Every figure is the server's;
 * the per-branch rows add up exactly to `used`.
 */
export type AllowanceUsageDto = {
  periodStart: string
  periodEnd: string
  resetsOn: string
  planDocuments: number
  /** Extra documents active this month, bought and paid or granted. */
  extraDocuments: number
  totalAllowance: number
  issued: number
  resubmissions: number
  /** Supplier documents that used this month's allowance. */
  received: number
  /** Received documents held now and waiting to open; not counted in `used` until they open. */
  receivedHidden: number
  used: number
  planUsed: number
  extraUsed: number
  left: number
  /** The highest of 80, 90 and 100 reached against `totalAllowance`, or null. */
  warningPercent: number | null
  issuingAllowed: boolean
  extrasExpireOn: string | null
  byBranch: BranchAllowanceUsageDto[]
}

export type PlanOverviewDto = {
  plan: SubscriptionPlanDto
  usage: PlanUsageDto
  activePeople: number
  openInvitations: number
  activeBranches: number
  /** Absent from a server older than plan v4 §6; the screen then shows `usage` alone. */
  allowance?: AllowanceUsageDto | null
}

export function loadPlanOverview(): Promise<PlanOverviewDto> {
  return apiRequest<PlanOverviewDto>(PLAN_OVERVIEW_PATH)
}
