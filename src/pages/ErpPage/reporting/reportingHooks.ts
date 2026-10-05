import { useTranslation } from 'react-i18next'
import type { SelectOption } from '../../../components/ui'
import { useApiRead } from '../../../hooks/useApiRead'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { hasPermission } from '../../../lib/identity/entitlements'
import { listErpConnections, type ErpConnectionListDto } from '../../../api/erp/connections'
import { documentDetailPath, type SourceDocumentDetailDto } from '../../../api/erp/reporting'

/** The reporting routes' permission (`ExtractionRunReportController.READ`). */
export const REPORT_READ = 'invoice.read'
/** The connection list's. Held by administrators; without it a connection is shown by its id. */
const CONNECTION_READ = 'erp.connection.read'

/**
 * Whether a report may be asked for yet: `false` until the entitlement snapshot is in, and when it
 * lacks `invoice.read`. The pages hold their request keys back on this rather than relying on the
 * shell hiding them, because a page's reads start in its own hooks before the shell renders.
 *
 * A snapshot that could not be fetched does not block the read: it is harmless, and the server's
 * own 403 is then what the reader sees.
 */
export function useReportReadable(): boolean {
  const { entitlements, ready } = useEntitlements()
  return ready && (entitlements === null || hasPermission(entitlements, REPORT_READ))
}

/**
 * Connection names, read once for the whole screen — never per row.
 *
 * Only for a holder of `erp.connection.read`; anyone else sees the id, because a report reader is
 * not necessarily allowed to see how connections are configured. Archived connections are
 * included so an old run still names the connection it came from.
 */
export function useConnectionNames(): {
  names: Map<string, string> | null
  options: SelectOption[]
} {
  const { entitlements } = useEntitlements()
  const allowed = entitlements !== null && hasPermission(entitlements, CONNECTION_READ)
  const path = allowed ? '/v1/erp/connections?includeArchived=true' : null
  const list = useApiRead<ErpConnectionListDto>(path, () => listErpConnections(true))
  if (list.read.status !== 'ready') return { names: null, options: [] }
  const connections = list.read.data.connections
  return {
    names: new Map(connections.map((connection) => [connection.id, connection.name])),
    options: connections.map((connection) => ({ value: connection.id, label: connection.name })),
  }
}

/** A server code in words, or the code itself when this build has no words for it yet. */
export function useCode() {
  const { t } = useTranslation()
  return (group: string, code: string | null | undefined) =>
    code ? t(`erp.reporting.${group}.${code}`, { defaultValue: code }) : ''
}

/** Enum values as dropdown options, worded where this build has words for them. */
export function useEnumOptions() {
  const code = useCode()
  return (group: string, values: readonly string[]): SelectOption[] =>
    values.map((value) => ({ value, label: code(group, value) }))
}

/**
 * A code, id or version set inside a translated sentence, kept left to right in Arabic.
 *
 * Interpolated values are plain strings, so the bidi isolate goes into the string itself
 * (U+2066 LEFT-TO-RIGHT ISOLATE ... U+2069 POP DIRECTIONAL ISOLATE): `2026-10-01T05:59:58Z`
 * would otherwise be reordered by the Arabic around it.
 */
export const ltr = (value: string) => `\u2066${value}\u2069`

/** Where a report's links lead: the global report, or the same report under one connection. */
export type ReportLinks = {
  document: (recordId: string) => string
  run: (runId: string) => string
}

export const GLOBAL_LINKS: ReportLinks = {
  document: (recordId) => `/settings/erp/documents/${encodeURIComponent(recordId)}`,
  run: (runId) => `/settings/erp/runs/${encodeURIComponent(runId)}`,
}

export function connectionLinks(connectionId: string): ReportLinks {
  const base = `/settings/erp/connections/${encodeURIComponent(connectionId)}`
  return {
    document: (recordId) => `${base}/records/${encodeURIComponent(recordId)}`,
    run: (runId) => `${base}/runs/${encodeURIComponent(runId)}`,
  }
}

/** One document's read, held back until the reader may ask for it. */
export function useDocumentDetail(recordId: string) {
  const readable = useReportReadable()
  const path = readable ? documentDetailPath(recordId) : null
  return useApiRead<SourceDocumentDetailDto>(path)
}
