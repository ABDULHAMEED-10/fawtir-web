import type { ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../../SettingsPage/SettingsShell'
import { SecondaryLink } from '../overview/idiom'
import { ConnectionStatePill } from './connectionParts'
import type { ErpConnectionDto } from '../../../api/erp/connections'

/**
 * The frame every real connection screen shares: Settings' shell with Integration lit, the
 * connection's name and system with its state, and the tabs.
 *
 * **Two tabs, not six.** The previous shell offered Overview · Mapping · Runs · Records ·
 * Write-back · Settings. Four of those describe extraction — collecting invoices from an ERP on a
 * schedule and writing outcomes back — which Phase 2 does not implement and this phase does not
 * build. Their URLs still resolve so an existing bookmark does not 404, but they are off the strip
 * and say plainly that the feature is not switched on. Leaving them on the strip would advertise
 * working features that do not exist.
 */

// Module-private: nothing outside needs them, and a component module that also exports
// constants breaks fast refresh (react-refresh/only-export-components).
const CONNECTION_TABS = [
  { id: 'overview', path: '' },
  { id: 'settings', path: '/settings' },
] as const
type ConnectionTab = (typeof CONNECTION_TABS)[number]['id']

const connectionPath = (id: string, tab: ConnectionTab = 'overview') =>
  `/settings/erp/connections/${id}${CONNECTION_TABS.find((x) => x.id === tab)!.path}`

function ConnectionTabs({ connectionId }: { connectionId: string }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  return (
    <nav
      aria-label={t('erp.connector.tabs.label')}
      className="-mb-2 flex gap-1 overflow-x-auto border-b border-border-subtle"
    >
      {CONNECTION_TABS.map((tab) => {
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
  const subtitle = [
    connection.sourceSystem,
    connection.sourceVersion,
    t(`erp.connections.mode.${connection.connectionMode}`),
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ')

  return (
    <SettingsShell group="integration">
      <div className="flex flex-col gap-3">
        <Link
          to="/settings/erp/connections"
          className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-primary-700 transition-colors hover:text-primary-800"
        >
          <span aria-hidden="true" className="rtl:rotate-180">
            ‹
          </span>
          {t('erp.connections.backToList')}
        </Link>
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
      </div>
      <ConnectionTabs connectionId={connection.id} />
      {children}
    </SettingsShell>
  )
}

/** The frame for a route whose connection id matches nothing, so a stale link is not a blank page. */
export function ConnectionNotFound() {
  const { t } = useTranslation()
  return (
    <SettingsShell group="integration">
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
