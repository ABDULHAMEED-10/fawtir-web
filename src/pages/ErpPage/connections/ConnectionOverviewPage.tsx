import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell } from '../../SettingsPage/SettingsShell'
import {
  ConfirmModal,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  SectionCard,
} from '../overview/idiom'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../../components/feedback/ApiNotice'
import { ConnectionShell, ConnectionNotFound } from './ConnectionShell'
import { ConnectionFailure, TestOutcomePill } from './connectionParts'
import { useConnectionDetail, useMutation } from './connectionData'
import { useErpAccess } from '../../../hooks/useErpAccess'
import { useSubscriptionAllows } from '../../../lib/subscriptionReadOnly'
import { useLanguage } from '../../../hooks'
import { isNotFound } from '../../../lib/apiFailure'
import { erpConnectionControls, testReasonKey } from '../../../lib/erp/connectionPolicy'
import { formatInstant } from '../../../lib/format'
import { sourceSystemName } from '../../../lib/erp/sourceSystem'
import {
  testErpConnection,
  transitionErpConnection,
  type ErpConnectionDto,
  type ErpConnectionTestDto,
} from '../../../api/erp/connections'

/**
 * One connection: what it is, what its last check said, and the lifecycle actions.
 *
 * Nothing here is computed from invented data. The last-check panel shows the verdict the backend
 * persisted, and the Check action asks **Fawtir** to probe the endpoint — the browser never
 * contacts the tenant's ERP. Doing it from the page would bypass the server's destination policy,
 * run from the operator's own network instead of ours, and put the result outside the audit trail.
 */
export function ConnectionOverviewPage() {
  const { id } = useParams<{ id: string }>()
  const { access, ready } = useErpAccess()
  const { read, connection, reload } = useConnectionDetail(ready && access.read ? id : undefined)

  if (!ready) {
    return (
      <SettingsShell group="integration">
        <LoadingNotice />
      </SettingsShell>
    )
  }
  if (!access.read) {
    return (
      <SettingsShell group="integration">
        <PermissionDeniedNotice />
      </SettingsShell>
    )
  }
  // The last good answer keeps the screen mounted while a post-mutation refresh is in flight, so
  // a verdict or a confirmation cannot be discarded by its own reload.
  if (connection !== null) return <Overview connection={connection} reload={reload} />
  if (read.status === 'failed') {
    // A 404 is a stale link, not a failure to retry; anything else can be retried.
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

function Overview({
  connection,
  reload,
}: {
  connection: ErpConnectionDto
  reload: () => void
}) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const navigate = useNavigate()
  const { access } = useErpAccess()
  // Checking, enabling and changing settings use the ERP, which stops while the subscription is
  // read-only (ST-2); disabling and archiving only take capability away, so they stay.
  const erpAllowed = useSubscriptionAllows('ERP')
  const policy = erpConnectionControls(connection, access)
  const controls = {
    ...policy,
    canTest: policy.canTest && erpAllowed,
    canMarkReady: policy.canMarkReady && erpAllowed,
    canEdit: policy.canEdit && erpAllowed,
  }
  const mutation = useMutation()
  const [confirmArchive, setConfirmArchive] = useState(false)
  // The freshest verdict, held beside the connection so a check does not have to wait for the
  // reload before the user sees what happened. The row's own persisted verdict still reloads.
  const [verdict, setVerdict] = useState<ErpConnectionTestDto | null>(null)

  async function transition(action: 'ready' | 'disable' | 'archive') {
    const moved = await mutation.run(action, () =>
      transitionErpConnection(connection.id, action, connection.version),
    )
    if (moved !== undefined) reload()
  }

  async function check() {
    const result = await mutation.run('test', () => testErpConnection(connection.id))
    if (result !== undefined) {
      setVerdict(result)
      // Reload so the persisted verdict and the version on screen match what the server now
      // holds. The result stays visible throughout -- the panel is rendered from `verdict`, not
      // from the read, so a refresh cannot discard it.
      reload()
    }
  }

  return (
    <ConnectionShell connection={connection}>
      <div className="flex flex-col gap-5">
        <ConnectionFailure error={mutation.error} onReload={reload} />

        <SectionCard
          title={t('erp.connections.detail.overview')}
          note={t(`erp.connections.stateHint.${connection.state}`)}
        >
          <dl className="grid gap-x-8 gap-y-4 p-5 pt-0 md:grid-cols-2">
            <Fact label={t('erp.connections.detail.system')}>
              {sourceSystemName(t, connection.sourceSystem)}
            </Fact>
            <Fact label={t('erp.connections.detail.version')}>
              {connection.sourceVersion === null ? (
                t('erp.connections.detail.noVersion')
              ) : (
                <bdi dir="ltr">{connection.sourceVersion}</bdi>
              )}
            </Fact>
            <Fact label={t('erp.connections.detail.connects')}>
              {connection.transportType === null
                ? '—'
                : t(`erp.connections.transport.${connection.transportType}`)}
            </Fact>
            <Fact label={t('erp.connections.detail.endpoint')}>
              {connection.endpoint === null ? (
                t('erp.connections.detail.noEndpoint')
              ) : (
                <bdi dir="ltr" className="font-mono">
                  {connection.endpoint}
                </bdi>
              )}
            </Fact>
            <Fact label={t('erp.connections.detail.credential')}>
              {connection.credentialConfigured
                ? [
                    t('erp.connections.credential.configured'),
                    connection.credentialType === null
                      ? null
                      : t(`erp.connections.credentialType.${connection.credentialType}`),
                    connection.credentialHint,
                  ]
                    .filter((part): part is string => part !== null && part !== '')
                    .join(' · ')
                : t('erp.connections.credential.notConfigured')}
            </Fact>
            <Fact label={t('erp.connections.detail.version_label')}>
              <bdi dir="ltr">{String(connection.version)}</bdi>
            </Fact>
            <Fact label={t('erp.connections.detail.created')}>
              {formatInstant(connection.createdAt, language)}
            </Fact>
            <Fact label={t('erp.connections.detail.updated')}>
              {formatInstant(connection.updatedAt, language)}
            </Fact>
            {connection.configuration !== null && connection.configuration !== '{}' ? (
              <div className="md:col-span-2">
                <dt className="text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary">
                  {t('erp.connections.detail.configuration')}
                </dt>
                <dd className="mt-1">
                  <pre
                    dir="ltr"
                    className="overflow-x-auto rounded-sm bg-surface-background p-3 font-mono text-[11px] text-text-secondary"
                  >
                    {connection.configuration}
                  </pre>
                </dd>
              </div>
            ) : null}
          </dl>
        </SectionCard>

        <TestPanel
          connection={connection}
          verdict={verdict}
          canTest={controls.canTest}
          blocked={controls.testBlockedReason}
          hasTestPermission={access.test}
          busy={mutation.busy === 'test'}
          onCheck={check}
        />

        {access.manage ? (
          <SectionCard title={t('erp.connections.detail.settings')}>
            <div className="flex flex-wrap items-center gap-2.5 p-5 pt-0">
              {controls.canMarkReady ? (
                <button
                  type="button"
                  className={SMALL_BUTTON}
                  onClick={() => transition('ready')}
                  disabled={mutation.busy !== null}
                >
                  {mutation.busy === 'ready'
                    ? t('erp.connections.actions.markingReady')
                    : connection.state === 'DISABLED'
                      ? t('erp.connections.actions.enable')
                      : t('erp.connections.actions.markReady')}
                </button>
              ) : null}
              {controls.canDisable ? (
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  onClick={() => transition('disable')}
                  disabled={mutation.busy !== null}
                >
                  {mutation.busy === 'disable'
                    ? t('erp.connections.actions.disabling')
                    : t('erp.connections.actions.disable')}
                </button>
              ) : null}
              {controls.canEdit ? (
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  onClick={() => navigate(`/settings/erp/connections/${connection.id}/settings`)}
                  disabled={mutation.busy !== null}
                >
                  {t('erp.connections.actions.changeSettings')}
                </button>
              ) : null}
              {controls.canArchive ? (
                <button
                  type="button"
                  className={SECONDARY_BUTTON}
                  onClick={() => setConfirmArchive(true)}
                  disabled={mutation.busy !== null}
                >
                  {mutation.busy === 'archive'
                    ? t('erp.connections.actions.archiving')
                    : t('erp.connections.actions.archive')}
                </button>
              ) : null}
            </div>
          </SectionCard>
        ) : null}

        <ConfirmModal
          open={confirmArchive}
          title={t('erp.connections.actions.archiveConfirmTitle')}
          body={t('erp.connections.actions.archiveConfirmBody')}
          confirmLabel={t('erp.connections.actions.archiveConfirm')}
          danger
          onClose={() => setConfirmArchive(false)}
          onConfirm={() => {
            setConfirmArchive(false)
            void transition('archive')
          }}
        />
      </div>
    </ConnectionShell>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-text-secondary">{children}</dd>
    </div>
  )
}

/**
 * The check panel: the action, the freshest verdict, and the one the server has stored.
 *
 * Every line comes from the backend's response. There is no remote body, header, status line,
 * certificate, address or exception text here, because the response carries none — and the reason
 * text is looked up from the stable code rather than printed, so an unrecognised code falls back
 * to a safe sentence instead of rendering blank.
 */
function TestPanel({
  connection,
  verdict,
  canTest,
  blocked,
  hasTestPermission,
  busy,
  onCheck,
}: {
  connection: ErpConnectionDto
  verdict: ErpConnectionTestDto | null
  canTest: boolean
  blocked: 'ARCHIVED' | 'NO_CREDENTIAL' | 'CREDENTIAL_NOT_PROBEABLE' | null
  hasTestPermission: boolean
  busy: boolean
  onCheck: () => void
}) {
  const { t } = useTranslation()
  const { language } = useLanguage()

  return (
    <SectionCard
      title={t('erp.connections.test.heading')}
      note={t('erp.connections.test.intro')}
      actions={
        canTest ? (
          <button type="button" className={SMALL_BUTTON} onClick={onCheck} disabled={busy}>
            {busy ? t('erp.connections.test.running') : t('erp.connections.test.run')}
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 p-5 pt-0">
        {!hasTestPermission ? (
          <p className="text-sm font-medium text-text-quaternary">
            {t('erp.connections.permission.noTest')}
          </p>
        ) : blocked !== null ? (
          <p className="text-sm font-medium text-text-quaternary">
            {t(`erp.connections.test.blocked.${blocked}`)}
          </p>
        ) : null}

        {verdict !== null ? (
          <div className="flex flex-col gap-2 rounded-md bg-surface-background p-4">
            <div className="flex flex-wrap items-center gap-2">
              <TestOutcomePill outcome={verdict.outcome} />
              <span className="text-xs font-medium text-text-quaternary">
                {t('erp.connections.test.latency', { ms: verdict.latencyMs })}
              </span>
            </div>
            <p className="text-sm font-medium leading-[1.6] text-text-secondary">
              {t(testReasonKey(verdict.reasonCode))}
            </p>
            {!verdict.verdictPersisted ? (
              <p className="text-sm font-medium leading-[1.6] text-text-quaternary">
                {t('erp.connections.test.notPersisted')}
              </p>
            ) : null}
            {verdict.success ? (
              <p className="text-xs font-medium text-text-quaternary">
                {t('erp.connections.test.doesNotActivate')}
              </p>
            ) : null}
          </div>
        ) : connection.lastTestOutcome !== null && connection.lastTestedAt !== null ? (
          // Flush with the card's heading: the notice's own padding indented it a further 20px.
          <div role="status" className="text-sm font-medium leading-[1.6] text-text-tertiary">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <TestOutcomePill outcome={connection.lastTestOutcome} />
                <span className="text-xs font-medium text-text-quaternary">
                  {t('erp.connections.test.testedAt', {
                    when: formatInstant(connection.lastTestedAt, language),
                  })}
                </span>
              </div>
              <p>{t(testReasonKey(connection.lastTestReasonCode))}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm font-medium text-text-quaternary">
            {t('erp.connections.list.neverTested')}
          </p>
        )}
      </div>
    </SectionCard>
  )
}
