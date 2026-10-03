import { Navigate, useParams } from 'react-router-dom'

/**
 * The per-connection records address, kept so an existing bookmark still lands somewhere true.
 *
 * Source documents are reported for every channel in one place (`/settings/erp/documents`); this
 * address opens that report narrowed to the connection, or the document itself.
 */
export function ConnectionRecordsPage() {
  const { id = '', recordId } = useParams<{ id: string; recordId?: string }>()
  const to = recordId
    ? `/settings/erp/documents/${encodeURIComponent(recordId)}`
    : `/settings/erp/documents?connection=${encodeURIComponent(id)}`
  return <Navigate to={to} replace />
}
