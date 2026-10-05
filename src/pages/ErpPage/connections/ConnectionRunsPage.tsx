import type { ReactNode } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell } from '../../SettingsPage/SettingsShell'
import { ApiReadFailure, LoadingNotice } from '../../../components/feedback/ApiNotice'
import { ConnectionShell, ConnectionNotFound } from './ConnectionShell'
import { useConnectionDetail } from './connectionData'
import { useErpAccess } from '../../../hooks/useErpAccess'
import { isNotFound } from '../../../lib/apiFailure'
import type { ErpConnectionDto } from '../../../api/erp/connections'
import { RunsReport } from '../reporting/ErpRunsPage'
import { RunDetailBody } from '../reporting/ErpRunDetailPage'
import { BackLink, ReportReadGate } from '../reporting/reportingParts'
import { connectionLinks } from '../reporting/reportingHooks'

/**
 * A connection's runs, inside the connection's own frame: its name, state and tabs stay on screen
 * and the run report below is narrowed to it.
 *
 * The report is the same component the all-channels report draws (`/settings/erp/runs`), so the
 * two never disagree; only the frame and the links differ. Two reads, two permissions: the
 * connection needs `erp.connection.read` and the report `invoice.read`. Someone holding only the
 * second cannot read the connection's name, so for them this address opens the all-channels
 * report narrowed to the connection, as it did before.
 */
export function ConnectionRunsPage() {
  const { t } = useTranslation()
  const { id = '', runId } = useParams<{ id: string; runId?: string }>()
  const links = connectionLinks(id)
  return (
    <InConnection
      connectionId={id}
      fallback={
        runId
          ? `/settings/erp/runs/${encodeURIComponent(runId)}`
          : `/settings/erp/runs?connection=${encodeURIComponent(id)}`
      }
    >
      {() =>
        runId ? (
          <>
            <BackLink to={`/settings/erp/connections/${encodeURIComponent(id)}/runs`}>
              {t('erp.reporting.run.back')}
            </BackLink>
            <RunDetailBody runId={runId} links={links} />
          </>
        ) : (
          <RunsReport connectionId={id} links={links} />
        )
      }
    </InConnection>
  )
}

/**
 * Reads the connection and draws its shell around a report, with the report's own read gate
 * inside. Loading, not-found and failure are the connection's, drawn as the other connection
 * screens draw them.
 */
export function InConnection({
  connectionId,
  fallback,
  children,
}: {
  connectionId: string
  /** Where a reader without `erp.connection.read` is sent: the all-channels report. */
  fallback: string
  children: (connection: ErpConnectionDto) => ReactNode
}) {
  const { access, ready } = useErpAccess()
  const { read, connection, reload } = useConnectionDetail(
    ready && access.read ? connectionId : undefined,
  )

  if (!ready) {
    return (
      <SettingsShell group="integration">
        <LoadingNotice />
      </SettingsShell>
    )
  }
  if (!access.read) return <Navigate to={fallback} replace />
  if (connection === null) {
    if (read.status === 'failed') {
      if (isNotFound(read.error)) return <ConnectionNotFound />
      return (
        <SettingsShell group="integration">
          <ApiReadFailure error={read.error} retry={reload} />
        </SettingsShell>
      )
    }
    return (
      <SettingsShell group="integration">
        <LoadingNotice />
      </SettingsShell>
    )
  }
  return (
    <ConnectionShell connection={connection}>
      <ReportReadGate>{children(connection)}</ReportReadGate>
    </ConnectionShell>
  )
}
