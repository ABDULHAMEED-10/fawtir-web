import { useApiRead } from './useApiRead'
import { PLAN_OVERVIEW_PATH, loadPlanOverview, type PlanOverviewDto } from '../api/settings/plan'
import { useReadOnlyReason } from '../lib/subscriptionReadOnly'

/**
 * This period's documents against the allowance, from `GET /v1/settings/plan`. `null` while
 * loading, when the reader lacks `tenant.plan.read`, or on any failure: a composer then draws no
 * meter. The meters used to draw a sample company's 342-of-1,000 for everyone.
 *
 * AL-9 and EX-4: extra documents bought or granted for the period add to the plan's own, so the
 * meter reads the server's `allowance` (plan plus extras, issued plus received) when it is there,
 * as Plan and usage does. A server without it is read from `usage`, the plan's documents alone.
 *
 * `null` too while the subscription is read-only (trial ended unpaid, suspended, cancelled, not
 * started): nothing can be issued, yet the server still counts against a plan allowance (after an
 * unpaid trial, the paid plan's from the day after it), so "1 / 1,000 used" would promise
 * documents that cannot be issued. The dashboard's allowance card says the same by leaving its
 * figures out.
 */
export function usePlanUsage(): { used: number; allowance: number; percent: number } | null {
  const read = useApiRead<PlanOverviewDto>(PLAN_OVERVIEW_PATH, loadPlanOverview).read
  const readOnly = useReadOnlyReason() !== null
  if (readOnly || read.status !== 'ready') return null
  const counted = read.data.allowance
    ? { used: read.data.allowance.used, quota: read.data.allowance.totalAllowance }
    : read.data.usage
  if (!counted?.quota) return null
  const { used, quota } = counted
  return { used, allowance: quota, percent: Math.round((used / quota) * 1000) / 10 }
}
