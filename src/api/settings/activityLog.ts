import { withQuery } from '../query'
import { apiRequest } from '../client'

/**
 * `GET /v1/settings/activity-log` (`ActivityLogController`): the organisation's append-only
 * activity log, newest first.
 *
 * Needs `admin.settings.manage`, and that is the only authorisation there is: the server answers
 * the whole organisation's log to a holder and refuses everyone else. The filters below narrow
 * what a holder sees; they grant nothing, and no combination of them can widen access. There is
 * no ERP-scoped variant on the server, so a reader without the permission gets nothing here
 * whatever the screen asks for.
 */
export const ACTIVITY_LOG_PATH = '/v1/settings/activity-log'

/**
 * `GET /v1/erp/activity-log` (`ErpActivityLogController`, R22): the same log, confined by the
 * server to ERP and mapping resources, for holders of `erp.audit.read`. The confinement is the
 * server's: a filter here cannot widen it, and a resource kind outside it is refused with 400.
 */
export const ERP_ACTIVITY_LOG_PATH = '/v1/erp/activity-log'

/** The server's default page size; `has_more` says whether another page exists. */
export const ACTIVITY_LOG_PAGE_SIZE = 50

export type ActivityLogItemDto = {
  id: string
  sequence_no: number
  occurred_at: string
  event_type: string
  actor_id: string | null
  /** `USER`, `API_KEY`, `SYSTEM`, `SUPPORT_USER`. */
  actor_type: string
  resource_type: string | null
  resource_id: string | null
  /** `SUCCESS`, `FAILURE`, `DENIED`, `THROTTLED`. */
  outcome: string
  /** Absent from the ERP-scoped log, which does not return it. */
  ip_address?: string | null
  correlation_id: string | null
  metadata: Record<string, unknown> | null
}

export type ActivityLogPageDto = {
  items: ActivityLogItemDto[]
  page: number
  page_size: number
  has_more: boolean
}

/** Every value is the server's exact-match filter; `''` means "any". Dates are `YYYY-MM-DD`. */
export type ActivityLogFilters = {
  resourceType?: string
  outcome?: string
  from?: string
  to?: string
}

export function activityLogPath(
  filters: ActivityLogFilters,
  page: number,
  base: string = ACTIVITY_LOG_PATH,
): string {
  return withQuery(base, {
    resource_type: filters.resourceType,
    outcome: filters.outcome,
    from: filters.from,
    to: filters.to,
    page,
    page_size: ACTIVITY_LOG_PAGE_SIZE,
  })
}

export function loadActivityLog(path: string): Promise<ActivityLogPageDto> {
  return apiRequest<ActivityLogPageDto>(path)
}
