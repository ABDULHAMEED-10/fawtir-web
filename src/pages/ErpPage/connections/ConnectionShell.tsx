import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../../SettingsPage/SettingsShell'
import { SecondaryLink, SectionCard } from '../overview/idiom'
import { LoadingNotice } from '../../../components/feedback/ApiNotice'
import { ConnectionFeatureUnavailable, ConnectionStatePill } from './connectionParts'
import { useConnectionDetail } from './connectionData'
import { useErpAccess } from '../../../hooks/useErpAccess'
import { isNotFound } from '../../../lib/apiFailure'
import { sourceSystemName } from '../../../lib/erp/sourceSystem'
import type { ErpConnectionDto } from '../../../api/erp/connections'

/**
 * The frame every real connection screen shares: Settings' shell with Integration lit, the
 * connection's name and system with its state, and the tabs.
 *
 * **Five tabs.** Overview, Settings, Extraction (collecting connections only), Runs and Records.
 * Runs and records are still reported for every channel in one place (`/settings/erp/runs`,
 * `/settings/erp/documents`), because uploads and API pushes have runs and no connection; the
 * per-connection Runs and Records tabs show that same report fixed to this connection, inside this
 * frame, and a run or record opened from them keeps its parent tab lit.
 * Write-back and the per-connection mapping have no backend, so their URLs still resolve, inside this
 * frame, and say plainly that the feature is not switched on, off the strip.
 */

// Module-private: nothing outside needs them, and a component module that also exports
// constants breaks fast refresh (react-refresh/only-export-components).
const CONNECTION_TABS = [
  { id: 'overview', path: '' },
  { id: 'settings', path: '/settings' },
  // Extraction joins the strip because it now has a backend behind it: configuration, sample,
  // activation and status are all real endpoints. Write-back and the per-connection mapping stay
  // off the strip until the same is true of them.
  { id: 'extraction', path: '/extraction' },
  // The shared runs and documents reports, fixed to this connection. A sub-route (one run, one
  // record) lights its parent tab, because the match below is by prefix.
  { id: 'runs', path: '/runs' },
  { id: 'records', path: '/records' },
] as const
type ConnectionTab = (typeof CONNECTION_TABS)[number]['id']

const connectionPath = (id: string, tab: ConnectionTab = 'overview') =>
  `/settings/erp/connections/${id}${CONNECTION_TABS.find((x) => x.id === tab)!.path}`

function ConnectionTabs({
  connectionId,
  connectionMode,
}: {
  connectionId: string
  connectionMode: ErpConnectionDto['connectionMode']
}) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  // Extraction is how Fawtir collects from an ERP, so it exists only for MANAGED_PULL. An upload or
  // push connection has nothing to configure there, and the server would refuse every read with
  // EXTRACTION_CONNECTION_MODE_UNSUPPORTED.
  const tabs = CONNECTION_TABS.filter(
    (tab) => tab.id !== 'extraction' || connectionMode === 'MANAGED_PULL',
  )
  return (
    <nav
      aria-label={t('erp.connector.tabs.label')}
      className="-mb-2 flex gap-1 overflow-x-auto border-b border-border-subtle"
    >
      {tabs.map((tab) => {
        const to = connectionPath(connectionId, tab.id)
        const active = tab.id === 'overview' ? pathname === to : pathname.startsWith(to)
        return (
          <Link
            key={tab.id}
            to={to}
            aria-current={active ? 'page' : undefined}
            className={[
              'inline-flex h-[46px] shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors',
              active
                ? 'border-primary-700 text-primary-800'
                : 'border-transparent text-text-quaternary hover:text-text-secondary',
            ].join(' ')}
          >
            {t(`erp.connections.detail.${tab.id}`)}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Wraps a connection screen once its data has arrived.
 *
 * Loading, not-found and refused states belong to the screen that owns the read; this only draws
 * the frame around a connection that exists. The subtitle names the system and how it connects,
 * never the endpoint — an address can carry a query string, and a page heading is the one place a
 * reader cannot choose not to look at.
 */
export function ConnectionShell({
  connection,
  actions,
  children,
}: {
  connection: ErpConnectionDto
  actions?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const backToList = { to: '/settings/erp/connections', label: t('erp.connections.backToList') }
  // The heading takes a string, so each part is isolated with Unicode controls (the string form
  // of <bdi>): the version always left to right, the others by their own first letter. Without
  // them an Arabic page ran "Odoo · 17.0" together into one left-to-right run, reading 17.0 first.
  const isolate = (part: string, ltr = false) => `${ltr ? '\u2066' : '\u2068'}${part}\u2069`
  const subtitle = [
    isolate(sourceSystemName(t, connection.sourceSystem)),
    connection.sourceVersion === null || connection.sourceVersion === ''
      ? null
      : isolate(connection.sourceVersion, true),
    isolate(t(`erp.connections.mode.${connection.connectionMode}`)),
  ]
    .filter((part): part is string => part !== null)
    .join(' · ')

  return (
    <SettingsShell group="integration" back={backToList}>
      {/* No back link of its own: the Settings shell already draws one above the heading, and two
          stacked back links read as a mistake. */}
      <SettingsHeader
        title={connection.name}
        subtitle={subtitle}
        actions={
          <>
            <ConnectionStatePill state={connection.state} />
            {actions}
          </>
        }
      />
      <ConnectionTabs connectionId={connection.id} connectionMode={connection.connectionMode} />
      {children}
    </SettingsShell>
  )
}

/** The frame for a route whose connection id matches nothing, so a stale link is not a blank page. */
export function ConnectionNotFound() {
  const { t } = useTranslation()
  const backToList = { to: '/settings/erp/connections', label: t('erp.connections.backToList') }
  return (
    <SettingsShell group="integration" back={backToList}>
      <SettingsHeader
        title={t('erp.connector.notFound.title')}
        subtitle={t('erp.connector.notFound.subtitle')}
      />
      <div>
        <SecondaryLink to="/settings/erp/connections">
          {t('erp.connections.backToList')}
        </SecondaryLink>
      </div>
    </SettingsShell>
  )
}

/**
 * A per-connection address whose feature has no backend (write-back, the per-connection mapping),
 * drawn inside the connection's own frame so its name, state and tabs stay on screen.
 *
 * Reading the connection needs `erp.connection.read`; without it, or when the read fails for a
 * reason other than a stale link, the plain notice is shown as before.
 */
export function ConnectionUnavailablePage() {
  const { t } = useTranslation()
  const backToList = { to: '/settings/erp/connections', label: t('erp.connections.backToList') }
  const { id } = useParams<{ id: string }>()
  const { access, ready } = useErpAccess()
  const { read, connection } = useConnectionDetail(ready && access.read ? id : undefined)

  if (connection !== null) {
    return (
      <ConnectionShell connection={connection}>
        <SectionCard title={t('erp.connections.unavailable.title')}>
          <p className="p-5 pt-0 text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('erp.connections.unavailable.body')}
          </p>
        </SectionCard>
      </ConnectionShell>
    )
  }
  if (ready && access.read && read.status === 'failed') {
    return isNotFound(read.error) ? (
      <ConnectionNotFound />
    ) : (
      <ConnectionFeatureUnavailable connectionId={id} />
    )
  }
  if (ready && !access.read) return <ConnectionFeatureUnavailable connectionId={id} />
  return (
    <SettingsShell group="integration" back={backToList}>
      <LoadingNotice />
    </SettingsShell>
  )
}
