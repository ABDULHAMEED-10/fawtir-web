import type { ReactNode } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../../SettingsPage/SettingsShell'
import { Pill } from '../ErpShell'
import { SecondaryLink } from '../overview/idiom'
import { useErpMapping } from '../../../lib/erpMapping'
import {
  connectionById,
  mappingStatusOf,
  pendingRejections,
  productName,
  useConnector,
  type Connection,
  type ConnectionState,
  type MappingStatus,
  type OutboxState,
  type RecordState,
  type RunState,
} from '../../../lib/erpConnector'

/**
 * The frame every connection screen shares (docs/erp-and-console-plan.md §3, Appendix B):
 * Settings' shell with the Integration tab lit, the connection's label and product with its
 * state, and the strip of six tabs — Overview · Mapping · Runs · Records · Write-back · Settings.
 * A mark on Records counts rejections waiting for someone.
 */

type Tone = 'danger' | 'success' | 'pending' | 'neutral'

const CONNECTION_TONE: Record<ConnectionState, Tone> = {
  DRAFT: 'neutral',
  CONNECTED: 'success',
  PAUSED: 'pending',
  ERROR: 'danger',
  DISCONNECTED: 'neutral',
}
const MAPPING_TONE: Record<MappingStatus, Tone> = {
  UNMAPPED: 'neutral',
  DRAFT: 'pending',
  READY: 'pending',
  CERTIFIED: 'success',
  STALE: 'danger',
}
const RUN_TONE: Record<RunState, Tone> = {
  RUNNING: 'pending',
  SUCCEEDED: 'success',
  PARTIAL: 'pending',
  FAILED: 'danger',
  SKIPPED_QUOTA: 'neutral',
  SKIPPED_LEASE: 'neutral',
}
const RECORD_TONE: Record<RecordState, Tone> = {
  COLLECTED: 'neutral',
  MAPPED: 'neutral',
  SUBMITTED: 'pending',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  WRITTEN_BACK: 'success',
  WRITEBACK_FAILED: 'danger',
  SUPERSEDED: 'pending',
}
const OUTBOX_TONE: Record<OutboxState, Tone> = {
  PENDING: 'pending',
  SENT: 'success',
  FAILED: 'danger',
  ABANDONED: 'neutral',
}

export function ConnectionStatePill({ state }: { state: ConnectionState }) {
  const { t } = useTranslation()
  return <Pill tone={CONNECTION_TONE[state]} label={t(`erp.connector.state.${state}`)} />
}
export function MappingStatusPill({ status }: { status: MappingStatus }) {
  const { t } = useTranslation()
  return <Pill tone={MAPPING_TONE[status]} label={t(`erp.connector.mappingStatus.${status}`)} />
}
export function RunStatePill({ state }: { state: RunState }) {
  const { t } = useTranslation()
  return <Pill tone={RUN_TONE[state]} label={t(`erp.connector.runState.${state}`)} />
}
export function RecordStatePill({ state }: { state: RecordState }) {
  const { t } = useTranslation()
  return <Pill tone={RECORD_TONE[state]} label={t(`erp.connector.recordState.${state}`)} />
}
export function OutboxStatePill({ state }: { state: OutboxState }) {
  const { t } = useTranslation()
  return <Pill tone={OUTBOX_TONE[state]} label={t(`erp.connector.outboxState.${state}`)} />
}

export const CONNECTION_TABS = [
  { id: 'overview', path: '' },
  { id: 'mapping', path: '/mapping' },
  { id: 'runs', path: '/runs' },
  { id: 'records', path: '/records' },
  { id: 'writeBack', path: '/write-back' },
  { id: 'settings', path: '/settings' },
] as const
export type ConnectionTab = (typeof CONNECTION_TABS)[number]['id']

export const connectionPath = (id: string, tab: ConnectionTab = 'overview') =>
  `/settings/erp/connections/${id}${CONNECTION_TABS.find((x) => x.id === tab)!.path}`

/** The current connection from the route, or `undefined` when the id is unknown. */
export function useConnection(): Connection | undefined {
  const { id } = useParams<{ id: string }>()
  const state = useConnector()
  return connectionById(state, id)
}

function ConnectionTabs({ connection }: { connection: Connection }) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const state = useConnector()
  const rejections = pendingRejections(state, connection.id)
  return (
    <nav
      aria-label={t('erp.connector.tabs.label')}
      className="-mb-2 flex gap-1 overflow-x-auto border-b border-border-subtle"
    >
      {CONNECTION_TABS.map((tab) => {
        const to = connectionPath(connection.id, tab.id)
        const active = tab.id === 'overview' ? pathname === to : pathname.startsWith(to)
        const mark = tab.id === 'records' ? rejections : 0
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
            {t(`erp.connector.tabs.${tab.id}`)}
            {mark ? (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-700 px-1 text-[10px] font-semibold text-white">
                {mark}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}

/**
 * Wraps a connection screen. When the route's id matches nothing, the frame says so and offers the
 * way back, so a stale link never lands on an empty page.
 */
export function ConnectionShell({
  connection,
  actions,
  children,
}: {
  connection: Connection | undefined
  actions?: ReactNode
  children: ReactNode
}) {
  const { t } = useTranslation()
  const mapping = useErpMapping()

  if (!connection) {
    return (
      <SettingsShell group="integration">
        <SettingsHeader
          title={t('erp.connector.notFound.title')}
          subtitle={t('erp.connector.notFound.subtitle')}
        />
        <div>
          <SecondaryLink to="/settings/erp/connections">
            {t('erp.connector.backToList')}
          </SecondaryLink>
        </div>
      </SettingsShell>
    )
  }

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
          {t('erp.connector.backToList')}
        </Link>
        <SettingsHeader
          title={connection.label}
          subtitle={t('erp.connector.shell.subtitle', {
            product: productName(connection.product),
            version: connection.erpVersion ?? '',
            url: connection.baseUrl,
          })}
          actions={
            <>
              <ConnectionStatePill state={connection.state} />
              <MappingStatusPill status={mappingStatusOf(connection, mapping)} />
              {actions}
            </>
          }
        />
      </div>
      <ConnectionTabs connection={connection} />
      {children}
    </SettingsShell>
  )
}
