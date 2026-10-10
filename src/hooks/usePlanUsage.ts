import { useApiRead } from './useApiRead'
import { PLAN_OVERVIEW_PATH, loadPlanOverview, type PlanOverviewDto } from '../api/settings/plan'

/**
 * This period's documents against the plan's allowance, from `GET /v1/settings/plan`. `null` while
 * loading, when the reader lacks `tenant.plan.read`, or on any failure: a composer then draws no
 * meter. The meters used to draw a sample company's 342-of-1,000 for everyone.
 */
export function usePlanUsage(): { used: number; allowance: number; percent: number } | null {
  const read = useApiRead<PlanOverviewDto>(PLAN_OVERVIEW_PATH, loadPlanOverview).read
  if (read.status !== 'ready' || !read.data.usage?.quota) return null
  const { used, quota } = read.data.usage
  return { used, allowance: quota, percent: Math.round((used / quota) * 1000) / 10 }
}
