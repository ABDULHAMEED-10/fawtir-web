import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import { EmptyRow, PrimaryLink, SectionCard, TBODY_ROW, THEAD_ROW, Td, Th } from './overview/idiom'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { RowsView, Switch } from '../../components/ui'
import { useErpAccess } from '../../hooks/useErpAccess'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'
import { useLanguage } from '../../hooks'
import { useConnectionList } from './connections/connectionData'
import { CollectionCell, ConnectionStatePill, TestOutcomePill } from './connections/connectionParts'
import { testReasonKey } from '../../lib/erp/connectionPolicy'
import { formatInstant } from '../../lib/format'
import { sourceSystemName } from '../../lib/erp/sourceSystem'
import type { ErpConnectionDto } from '../../api/erp/connections'

/**
 * Settings › Integration › Connected systems — the tenant's real ERP connections.
 *
 * Every column comes from `ErpConnectionController`'s list response. There is deliberately no
 * last-run, next-run, collected, rejected, watermark or sync-health column: Phase 2 has no such
 * field, nothing is collected from an ERP yet, and a column showing an invented figure would tell
 * a tenant their invoices are flowing when they are not.
 *
 * The list needs `erp.connection.read`; Add needs `erp.connection.manage`. A reader without
 * manage still sees every row — lacking a mutation permission is not the same as there being
 * nothing there, and rendering it as an empty list would be a lie about the company's setup.
 */
export function ErpConnectionsPage() {
  const { t } = useTranslation()
  const { access, ready } = useErpAccess()
  // A new connection is ERP work, which stops while the subscription is read-only (ST-2).
  const erpAllowed = useSubscriptionAllows('ERP')
  const [includeArchived, setIncludeArchived] = useState(false)
  const { read, reload } = useConnectionList(includeArchived, ready && access.read)

  return (
    <SettingsShell group="integration">
      <SettingsHeader
        title={t('erp.connections.title')}
        subtitle={t('erp.connections.lead')}
        actions={
          access.manage && erpAllowed ? (
            <PrimaryLink to="/settings/erp/connections/new">
              {t('erp.connections.list.add')}
            </PrimaryLink>
          ) : undefined
        }
      />

      {!ready ? (
        <LoadingNotice />
      ) : !access.read ? (
        <PermissionDeniedNotice />
      ) : (
        <>
          {!access.manage ? (
            <p className="text-sm font-medium text-text-quaternary">
              {t('erp.connections.permission.readOnly')}
            </p>
          ) : null}
          <ConnectionTable
            read={read}
            reload={reload}
            includeArchived={includeArchived}
            onIncludeArchived={setIncludeArchived}
            canManage={access.manage}
          />
        </>
      )}
    </SettingsShell>
  )
}

function ConnectionTable({
  read,
  reload,
  includeArchived,
  onIncludeArchived,
  canManage,
}: {
  read: ReturnType<typeof useConnectionList>['read']
  reload: () => void
  includeArchived: boolean
  onIncludeArchived: (next: boolean) => void
  canManage: boolean
}) {
  const { t } = useTranslation()

  // The switch names itself only to a screen reader, so its words are drawn beside it as well;
  // clicking them flips it too. Hidden from assistive tech, which already hears the switch's name.
  const archivedToggle = (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className="cursor-pointer select-none text-sm font-medium text-text-tertiary"
        onClick={() => onIncludeArchived(!includeArchived)}
      >
        {t('erp.connections.list.includeArchived')}
      </span>
      <Switch
        checked={includeArchived}
        onChange={onIncludeArchived}
        label={t('erp.connections.list.includeArchived')}
      />
    </span>
  )
  const heading = t('erp.connections.list.heading')

  if (read.status === 'loading') {
    return (
      <SectionCard title={heading} actions={archivedToggle}>
        <div className="p-5 pt-0">
          <LoadingNotice />
        </div>
      </SectionCard>
    )
  }
  if (read.status === 'failed') {
    return (
      <SectionCard title={heading} actions={archivedToggle}>
        <div className="p-5 pt-0">
          <ApiReadFailure error={read.error} retry={reload} />
        </div>
      </SectionCard>
    )
  }

  const { connections, total } = read.data
  return (
    <SectionCard
      title={heading}
      note={t('erp.connections.list.count', { count: total })}
      actions={archivedToggle}
    >
      {/* Cards on a phone (the shared RowsView), the table from md up. */}
      <div className="max-md:px-5 max-md:pb-5">
      <RowsView>
        <table className="w-full min-w-[940px] border-collapse text-sm">
          <thead>
            <tr className={THEAD_ROW}>
              <Th first>{t('erp.connections.list.columnName')}</Th>
              <Th>{t('erp.connections.list.columnSource')}</Th>
              <Th>{t('erp.connections.list.columnTransport')}</Th>
              <Th>{t('erp.connections.list.columnState')}</Th>
              <Th>{t('erp.connections.list.columnCredential')}</Th>
              <Th>{t('erp.connections.list.columnLastTest')}</Th>
              <Th>{t('erp.connections.list.columnCollection')}</Th>
            </tr>
          </thead>
          <tbody>
            {connections.length === 0 ? (
              <EmptyRow columns={7}>
                {canManage
                  ? `${t('erp.connections.list.empty')} ${t('erp.connections.list.emptyBody')}`
                  : t('erp.connections.list.emptyReadOnly')}
              </EmptyRow>
            ) : (
              connections.map((connection) => (
                <ConnectionRow key={connection.id} connection={connection} />
              ))
            )}
          </tbody>
        </table>
      </RowsView>
      </div>
    </SectionCard>
  )
}

function ConnectionRow({ connection }: { connection: ErpConnectionDto }) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  return (
    <tr className={TBODY_ROW}>
      <Td first>
        <Link
          to={`/settings/erp/connections/${connection.id}`}
          className="font-semibold text-primary-700 transition-colors hover:text-primary-800"
        >
          {connection.name}
        </Link>
        <p className="mt-0.5 text-xs font-medium text-text-quaternary">
          {t(`erp.connections.mode.${connection.connectionMode}`)}
        </p>
      </Td>
      <Td>
        <span className="font-medium text-text-secondary">
          {sourceSystemName(t, connection.sourceSystem)}
        </span>
        {connection.sourceVersion !== null ? (
          <p className="mt-0.5 text-xs font-medium text-text-quaternary">
            <bdi dir="ltr">{connection.sourceVersion}</bdi>
          </p>
        ) : null}
      </Td>
      <Td>
        <span className="font-medium text-text-secondary">
          {connection.transportType === null
            ? '—'
            : t(`erp.connections.transport.${connection.transportType}`)}
        </span>
      </Td>
      <Td>
        <ConnectionStatePill state={connection.state} />
      </Td>
      <Td>
        <span className="font-medium text-text-secondary">
          {connection.credentialConfigured
            ? t('erp.connections.list.credentialSet')
            : t('erp.connections.list.credentialMissing')}
        </span>
      </Td>
      <Td>
        {/* The verdict the backend persisted, or nothing. Never a figure computed here. */}
        {connection.lastTestOutcome === null || connection.lastTestedAt === null ? (
          <span className="text-xs font-medium text-text-quaternary">
            {t('erp.connections.list.neverTested')}
          </span>
        ) : (
          <div className="flex flex-col items-start gap-1">
            <TestOutcomePill outcome={connection.lastTestOutcome} />
            <span className="text-xs font-medium text-text-quaternary">
              {formatInstant(connection.lastTestedAt, language)}
            </span>
            {connection.lastTestOutcome === 'FAILURE' ? (
              <span className="text-xs font-medium text-text-quaternary">
                {t(testReasonKey(connection.lastTestReasonCode))}
              </span>
            ) : null}
          </div>
        )}
      </Td>
      <Td>
        {/* The list's own health field (backend Phase 6): no status read per row. */}
        <CollectionCell health={connection.health} />
      </Td>
    </tr>
  )
}
