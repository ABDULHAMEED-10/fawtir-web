import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import { SelectField, TextAreaField, TextField } from '../../components/form/FormFields'
import { LoadingNotice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SectionCard, SecondaryLink } from './overview/idiom'
import { ConnectionFailure } from './connections/connectionParts'
import { useMutation } from './connections/connectionData'
import { useErpAccess } from '../../hooks/useErpAccess'
import { useSubscriptionAllows } from '../../lib/subscriptionReadOnly'
import { sourceSystemName } from '../../lib/erp/sourceSystem'
import {
  createErpConnection,
  type ErpConnectionMode,
  SELECTABLE_TRANSPORTS,
  type ErpTransportType,
} from '../../api/erp/connections'

/**
 * Settings › Integration › Add a connection.
 *
 * Creates a real `DRAFT` through `POST /v1/erp/connections`. Deliberately a short form of only
 * the fields Phase 2 supports — there is no schedule, frequency, run-now, test-extraction or
 * checkpoint here, because none of those exists on the backend and a control for one would be a
 * promise the platform cannot keep.
 *
 * The credential is **not** collected here. The server needs a persisted connection to attach one
 * to — the credential endpoint is `PUT /{id}/credential` and takes the connection's version — so
 * asking for a secret on this form would mean holding it in browser memory across a round trip
 * that might fail. It is the first thing the detail screen offers instead.
 */

const MODES: ErpConnectionMode[] = ['MANAGED_PULL', 'BRIDGE_UPLOAD', 'API_PUSH']
// Only REST is offered: it is the one transport with an adapter, and the extraction endpoints
// refuse the others outright. FILE and SOAP were offered here and are not on the backend enum at
// all, so choosing either answered 400.
const TRANSPORTS: readonly ErpTransportType[] = SELECTABLE_TRANSPORTS

/**
 * Source systems offered as a starting point. The server accepts any string up to 40 characters,
 * so this is a convenience list and not a constraint — it matches the mapping module's
 * `MAPPING_SOURCE_SYSTEMS` so a tenant sees the same names in both places.
 */
const SOURCE_SYSTEMS = ['ODOO', 'ERPNEXT', 'SAP', 'ORACLE', 'MICROSOFT_DYNAMICS', 'CUSTOM']

export function ErpConnectPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { access, ready } = useErpAccess()
  // A new connection is ERP work, which stops while the subscription is read-only (ST-2): the form
  // is not offered, and the line at the top of the screen says why.
  const erpAllowed = useSubscriptionAllows('ERP')
  const mutation = useMutation()

  const [name, setName] = useState('')
  const [sourceSystem, setSourceSystem] = useState(SOURCE_SYSTEMS[0])
  const [sourceVersion, setSourceVersion] = useState('')
  const [mode, setMode] = useState<ErpConnectionMode>('MANAGED_PULL')
  const [transport, setTransport] = useState<ErpTransportType>('REST')
  const [endpoint, setEndpoint] = useState('')
  const [configuration, setConfiguration] = useState('')

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const created = await mutation.run('create', () =>
      createErpConnection({
        name: name.trim(),
        sourceSystem,
        // Blank means "not recorded", which is a null on the wire rather than an empty string:
        // the server's own column is nullable and an empty string would read as a real value.
        sourceVersion: sourceVersion.trim() === '' ? null : sourceVersion.trim(),
        connectionMode: mode,
        transportType: transport,
        endpoint: endpoint.trim() === '' ? null : endpoint.trim(),
        configuration: configuration.trim() === '' ? null : configuration.trim(),
      }),
    )
    if (created !== undefined) {
      // Straight to the new connection, which is where the credential is added. `replace` so Back
      // does not re-submit the form.
      navigate(`/settings/erp/connections/${created.id}`, { replace: true })
    }
  }

  if (!ready) {
    return (
      <SettingsShell group="integration">
        <LoadingNotice />
      </SettingsShell>
    )
  }
  if (!access.manage || !erpAllowed) {
    return (
      <SettingsShell group="integration">
        <SettingsHeader
          title={t('erp.connections.create.heading')}
          subtitle={t('erp.connections.create.intro')}
        />
        {access.manage ? null : <PermissionDeniedNotice />}
        <div>
          <SecondaryLink to="/settings/erp/connections">
            {t('erp.connections.backToList')}
          </SecondaryLink>
        </div>
      </SettingsShell>
    )
  }

  const busy = mutation.busy === 'create'
  return (
    <SettingsShell group="integration">
      <SettingsHeader
        title={t('erp.connections.create.heading')}
        subtitle={t('erp.connections.create.intro')}
      />

      <form onSubmit={submit} className="flex flex-col gap-5">
        <ConnectionFailure error={mutation.error} />

        <SectionCard title={t('erp.connections.create.cardTitle')}>
          <div className="grid gap-5 p-5 pt-0 md:grid-cols-2">
            <TextField
              id="erp-connection-name"
              name="name"
              label={t('erp.connections.create.name')}
              hint={t('erp.connections.create.nameHint')}
              required
              maxLength={120}
              value={name}
              onChange={setName}
            />
            <SelectField
              id="erp-connection-source"
              name="sourceSystem"
              label={t('erp.connections.create.sourceSystem')}
              options={SOURCE_SYSTEMS.map((value) => ({
                value,
                label: sourceSystemName(t, value),
              }))}
              required
              value={sourceSystem}
              onChange={setSourceSystem}
            />
            <TextField
              id="erp-connection-version"
              name="sourceVersion"
              label={t('erp.connections.create.sourceVersion')}
              hint={t('erp.connections.create.sourceVersionHint')}
              maxLength={40}
              value={sourceVersion}
              onChange={setSourceVersion}
            />
            <SelectField
              id="erp-connection-mode"
              name="connectionMode"
              label={t('erp.connections.create.mode')}
              // Fixed at creation by the server, so the form says so here rather than letting a
              // tenant discover it when the edit screen refuses the change.
              hint={t('erp.connections.create.modeLocked')}
              options={MODES.map((value) => ({
                value,
                label: t(`erp.connections.mode.${value}`),
              }))}
              required
              value={mode}
              onChange={(next) => setMode(next as ErpConnectionMode)}
            />
            <SelectField
              id="erp-connection-transport"
              name="transportType"
              label={t('erp.connections.create.transport')}
              options={TRANSPORTS.map((value) => ({
                value,
                label: t(`erp.connections.transport.${value}`),
              }))}
              value={transport}
              onChange={(next) => setTransport(next as ErpTransportType)}
            />
            <TextField
              id="erp-connection-endpoint"
              name="endpoint"
              dir="ltr"
              label={t('erp.connections.create.endpoint')}
              hint={t('erp.connections.create.endpointHint')}
              maxLength={2048}
              value={endpoint}
              onChange={setEndpoint}
            />
            <div className="md:col-span-2 [&_textarea]:font-mono [&_textarea]:text-xs [&_textarea]:[direction:ltr]">
              <TextAreaField
                id="erp-connection-configuration"
                name="configuration"
                label={t('erp.connections.create.configuration')}
                value={configuration}
                onChange={setConfiguration}
                maxLength={8192}
              />
              <p className="mt-1 text-xs font-medium leading-[1.5] text-text-quaternary">
                {t('erp.connections.create.configurationHint')}
              </p>
            </div>
          </div>
        </SectionCard>

        <div className="flex flex-wrap items-center gap-2.5">
          <button type="submit" className={PRIMARY_BUTTON} disabled={busy || name.trim() === ''}>
            {busy ? t('erp.connections.create.submitting') : t('erp.connections.create.submit')}
          </button>
          <button
            type="button"
            className={SECONDARY_BUTTON}
            onClick={() => navigate('/settings/erp/connections')}
            disabled={busy}
          >
            {t('erp.connections.edit.cancel')}
          </button>
        </div>
      </form>
    </SettingsShell>
  )
}
