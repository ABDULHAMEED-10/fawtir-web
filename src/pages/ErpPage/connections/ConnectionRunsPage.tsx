import { Navigate, useParams } from 'react-router-dom'

/**
 * The per-connection runs address, kept so an existing bookmark still lands somewhere true.
 *
 * Runs are reported for every channel in one place (`/settings/erp/runs`), because a Bridge
 * upload and an API push have runs and no connection. This address opens that report narrowed to
 * the connection, or the run itself, instead of keeping a second runs screen beside it.
 */
export function ConnectionRunsPage() {
  const { id = '', runId } = useParams<{ id: string; runId?: string }>()
  const to = runId
    ? `/settings/erp/runs/${encodeURIComponent(runId)}`
    : `/settings/erp/runs?connection=${encodeURIComponent(id)}`
  return <Navigate to={to} replace />
}
