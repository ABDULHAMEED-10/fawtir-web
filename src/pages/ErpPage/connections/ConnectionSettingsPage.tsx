import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { SettingsShell } from '../../SettingsPage/SettingsShell'
import { PRIMARY_BUTTON, SECONDARY_BUTTON, SectionCard } from '../overview/idiom'
import { SelectField, TextAreaField, TextField } from '../../../components/form/FormFields'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../../components/feedback/ApiNotice'
import { ConnectionShell, ConnectionNotFound } from './ConnectionShell'
import { ConnectionFailure, ConnectionNotice } from './connectionParts'
import { useConnectionDetail, useMutation } from './connectionData'
import { useErpAccess } from '../../../hooks/useErpAccess'
import { useLanguage } from '../../../hooks'
import { isNotFound } from '../../../lib/apiFailure'
import {
  erpConnectionControls,
  isProbeableCredentialType,
} from '../../../lib/erp/connectionPolicy'
import { formatInstant } from '../../../lib/format'
import { sourceSystemName } from '../../../lib/erp/sourceSystem'
import {
  storeErpCredential,
  updateErpConnection,
  type ErpConnectionDto,
  type ErpCredentialType,
  SELECTABLE_TRANSPORTS,
  type ErpTransportType,
} from '../../../api/erp/connections'

// See SELECTABLE_TRANSPORTS. A connection already storing JDBC or SFTP keeps it: the option list
// below adds the stored value so editing another field cannot silently rewrite the transport.
const TRANSPORTS: readonly ErpTransportType[] = SELECTABLE_TRANSPORTS

/**
 * What the edit form may offer: the selectable transports, plus whatever this connection already
 * stores if that is something else.
 *
 * Without the second part, opening a connection saved as JDBC would show an empty select, and saving
 * any other field would post `transportType: null` — silently rewriting a value the operator never
 * touched. Narrowing the offer must not rewrite history.
 */
function transportOptions(stored: ErpTransportType | null): readonly ErpTransportType[] {
  if (stored === null || TRANSPORTS.includes(stored)) return TRANSPORTS
  return [...TRANSPORTS, stored]
}
const CREDENTIAL_TYPES: ErpCredentialType[] = [
  'BASIC_AUTH',
  'API_TOKEN',
  'OAUTH2_CLIENT_CREDENTIALS',
  'SSH_PRIVATE_KEY',
]

/**
 * A connection's editable configuration and its sign-in details.
 *
 * Two cards behind two different permissions, because the backend draws them separately:
 * `erp.connection.manage` edits the configuration and `erp.credential.replace` writes the secret.
 * Someone holding only the first sees the form but not the credential card — manage does not
 * imply secret administration, and implying otherwise here would be the one place a user could
 * infer a capability they do not have.
 */
export function ConnectionSettingsPage() {
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
  // Last good first, so the refresh after a save or a credential write does not unmount the form
  // and throw away the confirmation it was about to show.
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
      <div className="flex flex-col gap-5">
        <EditForm connection={connection} reload={reload} />
        <CredentialCard connection={connection} reload={reload} />
      </div>
    </ConnectionShell>
  )
}

/**
 * The editable half.
 *
 * `sourceSystem` and `connectionMode` are shown as read-only facts rather than disabled inputs:
 * the update request has no field for either, so a disabled input would imply a control that could
 * one day be enabled, when in fact changing either means archiving and re-creating.
 *
 * `expectedVersion` is the version the read returned, so a save refuses rather than overwrites if
 * somebody else changed the row meanwhile. On that refusal the form keeps what the user typed —
 * losing their edit in order to tell them about somebody else's would be its own bug.
 */
function EditForm({ connection, reload }: { connection: ErpConnectionDto; reload: () => void }) {
  const { t } = useTranslation()
  const { access } = useErpAccess()
  const controls = erpConnectionControls(connection, access)
  const mutation = useMutation()

  const [name, setName] = useState(connection.name)
  const [sourceVersion, setSourceVersion] = useState(connection.sourceVersion ?? '')
  const [transport, setTransport] = useState<ErpTransportType | ''>(connection.transportType ?? '')
  const [endpoint, setEndpoint] = useState(connection.endpoint ?? '')
  const [configuration, setConfiguration] = useState(connection.configuration ?? '')

  // Re-seed from the server after a successful save or an outside reload, but never while a
  // refusal is on screen: that is exactly when the user's unsaved values must survive.
  useEffect(() => {
    if (mutation.error !== null) return
    setName(connection.name)
    setSourceVersion(connection.sourceVersion ?? '')
    setTransport(connection.transportType ?? '')
    setEndpoint(connection.endpoint ?? '')
    setConfiguration(connection.configuration ?? '')
  }, [connection, mutation.error])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    const saved = await mutation.run('save', () =>
      updateErpConnection(connection.id, {
        name: name.trim(),
        sourceVersion: sourceVersion.trim() === '' ? null : sourceVersion.trim(),
        transportType: transport === '' ? null : transport,
        endpoint: endpoint.trim() === '' ? null : endpoint.trim(),
        configuration: configuration.trim() === '' ? null : configuration.trim(),
        expectedVersion: connection.version,
      }),
    )
    if (saved !== undefined) reload()
  }

  if (!controls.canEdit) {
    return (
      <SectionCard title={t('erp.connections.edit.heading')}>
        <p className="p-5 pt-0 text-sm font-medium text-text-quaternary">
          {connection.state === 'ARCHIVED'
            ? t('erp.connections.stateHint.ARCHIVED')
            : t('erp.connections.permission.readOnly')}
        </p>
      </SectionCard>
    )
  }

  const busy = mutation.busy === 'save'
  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <ConnectionFailure error={mutation.error} onReload={reload} />
      {mutation.done === 'save' && mutation.error === null ? (
        <ConnectionNotice>{t('erp.connections.edit.saved')}</ConnectionNotice>
      ) : null}

      <SectionCard title={t('erp.connections.edit.heading')} note={t('erp.connections.edit.intro')}>
        <div className="grid gap-5 p-5 pt-0 md:grid-cols-2">
          <TextField
            id="erp-edit-name"
            name="name"
            label={t('erp.connections.create.name')}
            required
            maxLength={120}
            value={name}
            onChange={setName}
          />
          <TextField
            id="erp-edit-version"
            name="sourceVersion"
            label={t('erp.connections.create.sourceVersion')}
            maxLength={40}
            value={sourceVersion}
            onChange={setSourceVersion}
          />
          <SelectField
            id="erp-edit-transport"
            name="transportType"
            label={t('erp.connections.create.transport')}
            options={transportOptions(connection.transportType).map((value) => ({
              value,
              label: t(`erp.connections.transport.${value}`),
            }))}
            value={transport}
            onChange={(next) => setTransport(next as ErpTransportType)}
          />
          <TextField
            id="erp-edit-endpoint"
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
              id="erp-edit-configuration"
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
          <div className="md:col-span-2 grid gap-4 rounded-md bg-surface-background p-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary">
                {t('erp.connections.edit.lockedSystem')}
              </p>
              <p className="mt-1 text-sm font-medium text-text-secondary">
                {sourceSystemName(t, connection.sourceSystem)}
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary">
                {t('erp.connections.edit.lockedMode')}
              </p>
              <p className="mt-1 text-sm font-medium text-text-secondary">
                {t(`erp.connections.mode.${connection.connectionMode}`)}
              </p>
            </div>
            <p className="md:col-span-2 text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('erp.connections.edit.lockedWhy')}
            </p>
          </div>
          {/* Inside the card it saves, as on the Extraction tab. */}
          <div className="flex flex-wrap items-center gap-2.5 md:col-span-2">
            <button type="submit" className={PRIMARY_BUTTON} disabled={busy || name.trim() === ''}>
              {busy ? t('erp.connections.edit.saving') : t('erp.connections.edit.save')}
            </button>
          </div>
        </div>
      </SectionCard>
    </form>
  )
}

/**
 * The write-only credential half.
 *
 * What is shown of an existing credential: that one is configured, its kind, its caller-supplied
 * label and when it was last replaced. Never the secret — there is no endpoint that returns it and
 * no field on any response that could carry it, so "show saved password" is not a feature that was
 * left out, it is one that cannot exist.
 *
 * The secret lives in this component's state for exactly as long as it takes to submit, and is
 * cleared on success. It is never written to `localStorage`, `sessionStorage`, a query string, a
 * URL, a log or any store that outlives the form.
 */
function CredentialCard({
  connection,
  reload,
}: {
  connection: ErpConnectionDto
  reload: () => void
}) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const { access } = useErpAccess()
  const controls = erpConnectionControls(connection, access)
  const mutation = useMutation()

  const [open, setOpen] = useState(false)
  const [type, setType] = useState<ErpCredentialType>(connection.credentialType ?? 'BASIC_AUTH')
  const [secret, setSecret] = useState('')
  const [hint, setHint] = useState('')

  function close() {
    // Clearing on cancel as well as on success: a secret typed and abandoned must not sit in
    // component state waiting for the next time the panel opens.
    setSecret('')
    setHint('')
    setOpen(false)
    mutation.clear()
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const stored = await mutation.run('credential', () =>
      storeErpCredential(connection.id, {
        credentialType: type,
        secret,
        hint: hint.trim() === '' ? null : hint.trim(),
        expectedVersion: connection.version,
      }),
    )
    if (stored !== undefined) {
      // Cleared the moment the write is acknowledged, before the reload. The response carries
      // metadata only, so there is nothing to put back into the field even if we wanted to.
      setSecret('')
      setHint('')
      setOpen(false)
      reload()
    }
  }

  const facts = (
    <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary">
          {t('erp.connections.credential.heading')}
        </dt>
        <dd className="mt-1 text-sm font-medium text-text-secondary">
          {connection.credentialConfigured
            ? t('erp.connections.credential.configured')
            : t('erp.connections.credential.notConfigured')}
        </dd>
      </div>
      {connection.credentialType !== null ? (
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary">
            {t('erp.connections.credential.type')}
          </dt>
          <dd className="mt-1 text-sm font-medium text-text-secondary">
            {t(`erp.connections.credentialType.${connection.credentialType}`)}
          </dd>
        </div>
      ) : null}
      {connection.credentialHint !== null ? (
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary">
            {t('erp.connections.credential.hint')}
          </dt>
          <dd className="mt-1 text-sm font-medium text-text-secondary">
            {connection.credentialHint}
          </dd>
        </div>
      ) : null}
      {connection.credentialConfigured ? (
        <div>
          <dt className="text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary">
            {t('erp.connections.credential.rotated')}
          </dt>
          <dd className="mt-1 text-sm font-medium text-text-secondary">
            {connection.credentialRotatedAt === null
              ? t('erp.connections.credential.never')
              : formatInstant(connection.credentialRotatedAt, language)}
          </dd>
        </div>
      ) : null}
    </dl>
  )

  if (!access.credential) {
    return (
      <SectionCard title={t('erp.connections.credential.heading')}>
        <div className="flex flex-col gap-3 p-5 pt-0">
          {facts}
          <p className="text-sm font-medium text-text-quaternary">
            {t('erp.connections.permission.noCredential')}
          </p>
        </div>
      </SectionCard>
    )
  }

  const busy = mutation.busy === 'credential'
  return (
    <SectionCard
      title={t('erp.connections.credential.heading')}
      actions={
        controls.canConfigureCredential && !open ? (
          <button type="button" className={SECONDARY_BUTTON} onClick={() => setOpen(true)}>
            {connection.credentialConfigured
              ? t('erp.connections.credential.replace')
              : t('erp.connections.credential.configure')}
          </button>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4 p-5 pt-0">
        {facts}

        {mutation.done === 'credential' && !open && mutation.error === null ? (
          <ConnectionNotice>{t('erp.connections.credential.saved')}</ConnectionNotice>
        ) : null}

        {open ? (
          <form onSubmit={submit} className="flex flex-col gap-4 rounded-md bg-surface-background p-4">
            <ConnectionFailure error={mutation.error} onReload={reload} />
            <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
              {t('erp.connections.credential.writeOnly')}
            </p>
            {connection.credentialConfigured ? (
              <p className="text-sm font-semibold leading-[1.6] text-text-secondary">
                {t('erp.connections.credential.replaceWarning')}
              </p>
            ) : null}

            <SelectField
              id="erp-credential-type"
              name="credentialType"
              label={t('erp.connections.credential.type')}
              options={CREDENTIAL_TYPES.map((value) => ({
                value,
                label: t(`erp.connections.credentialType.${value}`),
              }))}
              required
              value={type}
              onChange={(next) => setType(next as ErpCredentialType)}
            />
            {!isProbeableCredentialType(type) ? (
              <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
                {t('erp.connections.credential.notProbeable')}
              </p>
            ) : null}

            <TextField
              id="erp-credential-secret"
              name="secret"
              // A password input so the value is masked on screen. type="password" alone still lets a
              // browser autofill the operator's own saved Fawtir login here; new-password stops that,
              // because this is a third party's secret and must only ever be typed or pasted.
              type="password"
              autoComplete="new-password"
              label={t('erp.connections.credential.secret')}
              hint={
                type === 'BASIC_AUTH'
                  ? t('erp.connections.credential.secretHintBasic')
                  : t('erp.connections.credential.secretHintToken')
              }
              required
              maxLength={4096}
              value={secret}
              onChange={setSecret}
            />
            <TextField
              id="erp-credential-hint"
              name="hint"
              // A text input beside a password field is what browsers treat as the user name, and
              // would fill with the operator's own; the hint is a label for the ERP secret instead.
              autoComplete="off"
              label={t('erp.connections.credential.hint')}
              hint={t('erp.connections.credential.hintHint')}
              maxLength={64}
              value={hint}
              onChange={setHint}
            />

            <div className="flex flex-wrap items-center gap-2.5">
              <button type="submit" className={PRIMARY_BUTTON} disabled={busy || secret === ''}>
                {busy
                  ? t('erp.connections.credential.submitting')
                  : t('erp.connections.credential.submit')}
              </button>
              <button
                type="button"
                className={SECONDARY_BUTTON}
                onClick={close}
                disabled={busy}
              >
                {t('erp.connections.credential.cancel')}
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </SectionCard>
  )
}
