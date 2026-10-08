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
}

export type PlanUsageDto = {
  period: { start: string; end: string; today: string }
  used: number
  resubmissions: number
  quota: number
  raisedToday: number
}

export type PlanOverviewDto = {
  plan: SubscriptionPlanDto
  usage: PlanUsageDto
  activePeople: number
  openInvitations: number
  activeBranches: number
}

export function loadPlanOverview(): Promise<PlanOverviewDto> {
  return apiRequest<PlanOverviewDto>(PLAN_OVERVIEW_PATH)
}
