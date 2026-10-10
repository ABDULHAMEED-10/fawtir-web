import { withQuery } from '../query'
import { apiRequest } from '../client'
import type { ConnectionHealthDto } from './connections'
import type { DocumentSummaryDto, ReconciliationLabel, RunDto } from './reporting'

/**
 * `GET /v1/erp/overview` (backend Phase 6): the organisation's ERP integration on one screen.
 *
 * Needs `erp.connection.read` AND `invoice.read`. The window is required and at most 367 days:
 * the server has no default, so every caller names one. Every figure is the server's; nothing
 * here adds or derives totals.
 */
export const ERP_OVERVIEW_PATH = '/v1/erp/overview'

export type OverviewChannelDto = {
  connection_id: string
  name: string
  state: string
  /** The same object the connection list carries. */
  health: ConnectionHealthDto
}

export type ErpOverviewDto = {
  window: { from: string; to: string }
  /** False after the platform revoked ERP: reads still work, nothing new arrives. */
  entitled: boolean
  scheduler_globally_enabled: boolean
  connections: {
    total: number
    by_state: Record<string, number>
    by_mode: Record<string, number>
    by_extraction_status: Record<string, number>
    extraction_unreadable: number
  }
  channels: OverviewChannelDto[]
  mapping: { active_json_profile: boolean; uncertified_channels: number }
  documents: DocumentSummaryDto
  attention: {
    /** Absent for a label the server did not evaluate; never a zero standing in for it. */
    labels: Partial<Record<ReconciliationLabel, number>>
    unevaluated: ReconciliationLabel[]
    delivery_failed: number
    tax_report_attention: number
  }
  latest_runs: RunDto[]
  latest_failed_runs: RunDto[]
}

/** `from` and `to` are the instants {@link windowBounds} produces. */
export function erpOverviewPath(window: { from: string; to: string }): string {
  return withQuery(ERP_OVERVIEW_PATH, { from: window.from, to: window.to })
}

export function loadErpOverview(path: string): Promise<ErpOverviewDto> {
  return apiRequest<ErpOverviewDto>(path)
}
