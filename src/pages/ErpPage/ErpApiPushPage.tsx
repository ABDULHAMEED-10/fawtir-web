import { useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { SettingsShell, SettingsHeader } from '../SettingsPage/SettingsShell'
import { TextField } from '../../components/form/FormFields'
import {
  ActionMenu,
  Checkbox,
  DateField,
  Modal,
  RowsView,
  type ActionMenuItem,
} from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import {
  ConfirmModal,
  EmptyRow,
  Mono,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SectionCard,
  SecondaryLink,
  TBODY_ROW,
  THEAD_ROW,
  Td,
  Th,
} from './overview/idiom'
import { Pill } from './ErpShell'
import { ReadinessCard } from './ErpBridgePage'
import { useApiRead, type ApiRead } from '../../hooks/useApiRead'
import { useEntitlements } from '../../hooks/useEntitlements'
import { useLanguage } from '../../hooks'
import { hasPermission } from '../../lib/identity/entitlements'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatInstant, formatInstantDay } from '../../lib/format'
import { DEFAULT_TRANSACTION_TYPE } from '../../lib/erp/mappingState'
import {
  ERP_KEY_DEFAULT_DAYS,
  ERP_KEY_MAX_DAYS,
  classifyApiKeyFailure,
  erpIngestionKeys,
  expiryBounds,
  lastUsedPhrase,
  type ApiKeyRefusal,
} from '../../lib/erp/apiPush'
import {
  API_KEYS_PATH,
  API_KEY_LABEL_MAX,
  ERP_INGESTION_SCOPES,
  buildErpKeyRequest,
  completeApiKeyRotation,
  createApiKey,
  listApiKeys,
  newApiKeyRequestKey,
  revokeApiKey,
  rotateApiKey,
  type ApiKeyCreatedDto,
  type ApiKeyStatus,
  type ApiKeySummaryDto,
  type ErpIngestionScope,
} from '../../api/settings/apiKeys'
import refreshIcon from '../../assets/catalog/menu-refresh.svg'
import completeIcon from '../../assets/settings/check-ink.svg'
import revokeIcon from '../../assets/catalog/trash-danger.svg'

/** Every API-key route (`ApiKeyController`). The server decides; this only chooses what to offer. */
const MANAGE_PERMISSION = 'admin.settings.manage'

/**
 * The key shown once, after a creation or a rotation. Held in component state only, for as long
 * as the dialog is open, and dropped when it closes: never in storage, the URL or router state.
 */
type Secret = {
  key: string
  label: string
  rotation: { graceEndsAt: string | null } | null
}

type Pending =
  | { kind: 'rotate'; key: ApiKeySummaryDto }
  | { kind: 'complete'; key: ApiKeySummaryDto }
  | { kind: 'revoke'; key: ApiKeySummaryDto }

type Failure = { refusal: ApiKeyRefusal; error: unknown }

/**
 * Settings › Integration › API push: the organisation's ERP ingestion keys.
 *
 * Built from the Integration templates, as the other ERP screens are (no Figma frame exists for
 * any of them). Everything shown comes from `GET /v1/apikeys`; lifecycle state is the server's
 * `status`, never worked out here from timestamps.
 *
 * **The raw key is shown once.** It exists only in the response to a creation or a rotation, is
 * held in state while its dialog is open, and is gone when the dialog closes. There is no way to
 * see it again, by design.
 *
 * **Refusals are the server's.** Whether ERP is enabled and whether the plan includes API access
 * are decided by the server on each creation and rotation; the screen does not guess them in
 * advance, and renders the refusal it gets.
 */
export function ErpApiPushPage() {
  const { t } = useTranslation()
  const { entitlements, ready } = useEntitlements()
  const canManage = entitlements !== null && hasPermission(entitlements, MANAGE_PERMISSION)
  const [creating, setCreating] = useState(false)

  return (
    <SettingsShell group="integration">
      <SettingsHeader
        title={t('erp.apiPush.title')}
        subtitle={t('erp.apiPush.subtitle')}
        actions={
          ready && canManage ? (
            <button type="button" className={PRIMARY_BUTTON} onClick={() => setCreating(true)}>
              {t('erp.apiPush.create.open')}
            </button>
          ) : undefined
        }
      />
      {!ready ? (
        <LoadingNotice />
      ) : !canManage ? (
        <PermissionDeniedNotice />
      ) : (
        <KeysScreen creating={creating} onCreatingChange={setCreating} />
      )}
    </SettingsShell>
  )
}

function KeysScreen({
  creating,
  onCreatingChange,
}: {
  creating: boolean
  onCreatingChange: (open: boolean) => void
}) {
  const { read, retry } = useApiRead(API_KEYS_PATH, listApiKeys)
  const [secret, setSecret] = useState<Secret | null>(null)
  const [pending, setPending] = useState<Pending | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  /** One action at a time, and the list read again from the server afterwards, success or not. */
  const run = async (action: () => Promise<void>) => {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    setFailure(null)
    try {
      await action()
    } catch (error: unknown) {
      setFailure({ refusal: classifyApiKeyFailure(error), error })
    } finally {
      inFlight.current = false
      setBusy(false)
      setPending(null)
      retry()
    }
  }

  const confirm = () => {
    if (pending === null) return
    const target = pending
    if (target.kind === 'rotate') {
      void run(async () => {
        const created = await rotateApiKey(target.key.id, newApiKeyRequestKey('rotate'))
        setSecret(secretOf(created))
      })
    } else if (target.kind === 'complete') {
      void run(() => completeApiKeyRotation(target.key.id))
    } else {
      void run(() => revokeApiKey(target.key.id))
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {failure !== null ? <ActionRefusal failure={failure} /> : null}
      <KeysCard read={read} retry={retry} busy={busy} onAction={setPending} />
      <ReadinessCard format="JSON" transactionType={DEFAULT_TRANSACTION_TYPE.INVOICE} />
      <GuideCard />

      <CreateKeyModal
        open={creating}
        onClose={() => onCreatingChange(false)}
        onCreated={(created) => {
          onCreatingChange(false)
          setFailure(null)
          setSecret(secretOf(created))
          retry()
        }}
      />
      <SecretModal secret={secret} onClose={() => setSecret(null)} />
      <ActionConfirm
        pending={pending}
        busy={busy}
        onConfirm={confirm}
        onClose={() => setPending(null)}
      />
    </div>
  )
}

const secretOf = (created: ApiKeyCreatedDto): Secret => ({
  key: created.key,
  label: created.label,
  rotation: created.replacesKeyId ? { graceEndsAt: created.previousKeyGraceEndsAt } : null,
})

/* ------------------------------------------------------------------------ the list */

const STATUS_TONE: Record<ApiKeyStatus, 'success' | 'pending' | 'neutral' | 'danger'> = {
  ACTIVE: 'success',
  ROTATION_GRACE: 'pending',
  ROTATED: 'neutral',
  REVOKED: 'danger',
  EXPIRED: 'neutral',
}

function KeysCard({
  read,
  retry,
  busy,
  onAction,
}: {
  read: ApiRead<ApiKeySummaryDto[]>
  retry: () => void
  busy: boolean
  onAction: (pending: Pending) => void
}) {
  const { t } = useTranslation()
  const heading = t('erp.apiPush.keys.title')

  if (read.status === 'loading') {
    return (
      <SectionCard title={heading}>
        <div className="p-5 pt-0">
          <LoadingNotice />
        </div>
      </SectionCard>
    )
  }
  if (read.status === 'failed') {
    return (
      <SectionCard title={heading}>
        <div className="p-5 pt-0">
          <ApiReadFailure error={read.error} retry={retry} />
        </div>
      </SectionCard>
    )
  }

  const keys = erpIngestionKeys(read.data)
  const names = new Map(keys.map((key) => [key.id, key.clientName ?? key.label]))
  return (
    <SectionCard title={heading} note={t('erp.apiPush.keys.note')}>
      {/* relative: keeps the visually hidden Actions heading inside the card, where it cannot
          widen the page (an absolutely positioned element escapes the scroll container). */}
      <div className="relative max-md:px-5 max-md:pb-5">
        <RowsView>
          <table className="w-full min-w-[860px] border-collapse text-sm">
            <thead>
              <tr className={THEAD_ROW}>
                <Th first>{t('erp.apiPush.keys.columnName')}</Th>
                <Th>{t('erp.apiPush.keys.columnStatus')}</Th>
                <Th>{t('erp.apiPush.keys.columnCreated')}</Th>
                <Th>{t('erp.apiPush.keys.columnExpires')}</Th>
                <Th>{t('erp.apiPush.keys.columnLastUsed')}</Th>
                <Th>
                  <span className="sr-only">{t('erp.apiPush.keys.columnActions')}</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <EmptyRow columns={6}>{t('erp.apiPush.keys.empty')}</EmptyRow>
              ) : (
                keys.map((key) => (
                  <KeyRow
                    key={key.id}
                    apiKey={key}
                    replacementName={
                      key.supersededByKeyId ? (names.get(key.supersededByKeyId) ?? null) : null
                    }
                    busy={busy}
                    onAction={onAction}
                  />
                ))
              )}
            </tbody>
          </table>
        </RowsView>
      </div>
    </SectionCard>
  )
}

function KeyRow({
  apiKey,
  replacementName,
  busy,
  onAction,
}: {
  apiKey: ApiKeySummaryDto
  replacementName: string | null
  busy: boolean
  onAction: (pending: Pending) => void
}) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const status = apiKey.status
  const name = apiKey.clientName ?? apiKey.label
  const used = lastUsedPhrase(apiKey.lastUsedAt, Date.now(), language)

  const items: ActionMenuItem[] = []
  if (status === 'ACTIVE' || status === 'EXPIRED') {
    items.push({
      id: 'rotate',
      labelKey: 'erp.apiPush.actions.rotate',
      icon: refreshIcon,
      onSelect: () => onAction({ kind: 'rotate', key: apiKey }),
    })
  }
  if (status === 'ROTATION_GRACE') {
    items.push({
      id: 'complete',
      labelKey: 'erp.apiPush.actions.complete',
      icon: completeIcon,
      onSelect: () => onAction({ kind: 'complete', key: apiKey }),
    })
  }
  if (status === 'ACTIVE' || status === 'ROTATION_GRACE') {
    items.push({
      id: 'revoke',
      labelKey: 'erp.apiPush.actions.revoke',
      icon: revokeIcon,
      danger: true,
      onSelect: () => onAction({ kind: 'revoke', key: apiKey }),
    })
  }

  return (
    <tr className={TBODY_ROW}>
      <Td first>
        <span className="font-semibold text-text-primary [overflow-wrap:anywhere]">{name}</span>
        <p className="mt-0.5 text-xs font-medium text-text-quaternary">
          <Mono className="inline-block">
            <bdi dir="ltr">{apiKey.maskedKey}</bdi>
          </Mono>
        </p>
      </Td>
      <Td>
        <div className="flex flex-col items-start gap-1">
          {status !== null ? (
            <Pill tone={STATUS_TONE[status]} label={t(`erp.apiPush.status.${status}`)} />
          ) : null}
          {status === 'ROTATION_GRACE' && apiKey.rotationGraceEndsAt ? (
            <span className="text-xs font-medium leading-[1.5] text-text-quaternary">
              {t('erp.apiPush.keys.graceUntil', {
                when: formatInstant(apiKey.rotationGraceEndsAt, language),
              })}
            </span>
          ) : null}
          {(status === 'ROTATION_GRACE' || status === 'ROTATED') && replacementName ? (
            <span className="text-xs font-medium leading-[1.5] text-text-quaternary [overflow-wrap:anywhere]">
              {t('erp.apiPush.keys.replacedBy', { name: replacementName })}
            </span>
          ) : null}
        </div>
      </Td>
      <Td>
        <span className="font-medium text-text-secondary">
          {apiKey.createdAt ? formatInstantDay(apiKey.createdAt, language) : '—'}
        </span>
      </Td>
      <Td>
        <span className="font-medium text-text-secondary">
          {apiKey.expiresAt
            ? formatInstantDay(apiKey.expiresAt, language)
            : t('erp.apiPush.keys.noExpiry')}
        </span>
      </Td>
      <Td>
        <span className="font-medium text-text-secondary">
          {t(used.key, used.when ? { when: used.when } : undefined)}
        </span>
      </Td>
      <Td>
        {items.length > 0 && !busy ? (
          <ActionMenu items={items} label={t('erp.apiPush.actions.label', { name })} floating />
        ) : null}
      </Td>
    </tr>
  )
}

/* ------------------------------------------------------------------- confirmations */

function ActionConfirm({
  pending,
  busy,
  onConfirm,
  onClose,
}: {
  pending: Pending | null
  busy: boolean
  onConfirm: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  if (pending === null) {
    return null
  }
  const name = pending.key.clientName ?? pending.key.label
  const copy = {
    rotate: {
      title: t('erp.apiPush.confirm.rotateTitle', { name }),
      body: t('erp.apiPush.confirm.rotateBody'),
      confirm: t('erp.apiPush.actions.rotate'),
      danger: false,
    },
    complete: {
      title: t('erp.apiPush.confirm.completeTitle', { name }),
      body: t('erp.apiPush.confirm.completeBody', {
        when: pending.key.rotationGraceEndsAt
          ? formatInstant(pending.key.rotationGraceEndsAt, language)
          : '',
      }),
      confirm: t('erp.apiPush.actions.complete'),
      danger: true,
    },
    revoke: {
      title: t('erp.apiPush.confirm.revokeTitle', { name }),
      body: t('erp.apiPush.confirm.revokeBody'),
      confirm: t('erp.apiPush.actions.revoke'),
      danger: true,
    },
  }[pending.kind]
  return (
    <ConfirmModal
      open
      title={copy.title}
      body={<p className="text-sm font-medium leading-[1.6] text-text-tertiary">{copy.body}</p>}
      confirmLabel={busy ? t('erp.apiPush.working') : copy.confirm}
      danger={copy.danger}
      onConfirm={() => {
        if (!busy) onConfirm()
      }}
      onClose={onClose}
    />
  )
}

/** A refused action, in our words. Never the server's English or anything that could be secret. */
function ActionRefusal({ failure }: { failure: Failure }) {
  const { t } = useTranslation()
  let body: string
  if (failure.refusal === 'other') {
    const message = describeApiFailure(failure.error)
    body = t(message.key, message.values)
    if (message.reference) body = `${body} ${t('apiErrors.reference', { id: message.reference })}`
  } else {
    body = t(`erp.apiPush.refusal.${failure.refusal}`)
  }
  return (
    <p
      role="alert"
      className="rounded-md bg-danger-100 p-4 text-sm font-medium leading-[1.6] text-danger-700"
    >
      {body}
    </p>
  )
}

/* -------------------------------------------------------------------------- create */

function CreateKeyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (created: ApiKeyCreatedDto) => void
}) {
  const { t } = useTranslation()
  const [label, setLabel] = useState('')
  const [scopes, setScopes] = useState<ErpIngestionScope[]>(['invoice.submit'])
  const [expiryDate, setExpiryDate] = useState('')
  const [sending, setSending] = useState(false)
  const [failure, setFailure] = useState<Failure | null>(null)
  const inFlight = useRef(false)
  /** Kept while the same request is retried after a dropped connection; dropped on any change. */
  const requestKey = useRef<string | null>(null)
  const bounds = expiryBounds(Date.now())

  const changed = () => {
    requestKey.current = null
    setFailure(null)
  }

  const close = () => {
    if (sending) return
    setLabel('')
    setScopes(['invoice.submit'])
    setExpiryDate('')
    setFailure(null)
    requestKey.current = null
    onClose()
  }

  const ready = label.trim() !== '' && scopes.length > 0 && !sending

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!ready || inFlight.current) return
    inFlight.current = true
    setSending(true)
    setFailure(null)
    requestKey.current ??= newApiKeyRequestKey('create')
    try {
      const created = await createApiKey(
        buildErpKeyRequest({ label, scopes, expiryDate }),
        requestKey.current,
      )
      requestKey.current = null
      setLabel('')
      setScopes(['invoice.submit'])
      setExpiryDate('')
      onCreated(created)
    } catch (error: unknown) {
      const refusal = classifyApiKeyFailure(error)
      if (refusal !== 'unreachable') requestKey.current = null
      setFailure({ refusal, error })
    } finally {
      inFlight.current = false
      setSending(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('erp.apiPush.create.title')}
      subtitle={t('erp.apiPush.create.subtitle')}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className={SECONDARY_BUTTON} onClick={close} disabled={sending}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="erp-api-push-create"
            className={PRIMARY_BUTTON}
            disabled={!ready}
          >
            {sending ? t('erp.apiPush.working') : t('erp.apiPush.create.submit')}
          </button>
        </div>
      }
    >
      <form id="erp-api-push-create" onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <TextField
          id="erp-api-push-name"
          name="label"
          label={t('erp.apiPush.create.name')}
          hint={t('erp.apiPush.create.nameHint')}
          required
          maxLength={API_KEY_LABEL_MAX - ' (rotation)'.length}
          value={label}
          onChange={(next) => {
            setLabel(next)
            changed()
          }}
        />
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-text-primary">
            {t('erp.apiPush.create.documents')}
          </legend>
          {ERP_INGESTION_SCOPES.map((scope) => (
            <Checkbox
              key={scope}
              label={t(`erp.apiPush.scope.${scope.replace('.', '_')}`)}
              checked={scopes.includes(scope)}
              disabled={sending}
              onChange={(event) => {
                setScopes((current) =>
                  event.target.checked
                    ? ERP_INGESTION_SCOPES.filter((s) => s === scope || current.includes(s))
                    : current.filter((s) => s !== scope),
                )
                changed()
              }}
            />
          ))}
          {scopes.length === 0 ? (
            <p role="alert" className="text-xs font-medium text-danger-700">
              {t('erp.apiPush.create.documentsRequired')}
            </p>
          ) : null}
        </fieldset>
        <div className="flex flex-col gap-1">
          <span id="erp-api-push-expiry-label" className="text-sm font-medium text-text-primary">
            {t('erp.apiPush.create.expiry')}
          </span>
          <DateField
            value={expiryDate}
            onChange={(next) => {
              setExpiryDate(next)
              changed()
            }}
            min={bounds.min}
            max={bounds.max}
            ariaLabel={t('erp.apiPush.create.expiry')}
            ariaDescribedBy="erp-api-push-expiry-hint"
            disabled={sending}
          />
          <p
            id="erp-api-push-expiry-hint"
            className="text-xs font-medium leading-[1.5] text-text-quaternary"
          >
            {t('erp.apiPush.create.expiryHint', {
              defaultDays: ERP_KEY_DEFAULT_DAYS,
              maxDays: ERP_KEY_MAX_DAYS,
            })}
          </p>
        </div>
        {failure !== null ? <ActionRefusal failure={failure} /> : null}
      </form>
    </Modal>
  )
}

/* -------------------------------------------------------------------------- secret */

/**
 * The key, once. Closing the dialog is the end of it: the state is cleared by the parent and there
 * is no way back to it from this screen or any other.
 */
function SecretModal({ secret, onClose }: { secret: Secret | null; onClose: () => void }) {
  const { t } = useTranslation()
  const { language } = useLanguage()
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null)

  const close = () => {
    setCopied(null)
    onClose()
  }

  const copy = async () => {
    if (secret === null) return
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(secret.key)
      setCopied('yes')
    } catch {
      // The key is on screen to select by hand; nothing else is done with it.
      setCopied('no')
    }
  }

  return (
    <Modal
      open={secret !== null}
      onClose={close}
      title={
        secret?.rotation ? t('erp.apiPush.secret.rotatedTitle') : t('erp.apiPush.secret.title')
      }
      subtitle={secret?.label}
      footer={
        <div className="flex flex-wrap justify-end gap-2.5">
          <button type="button" className={PRIMARY_BUTTON} onClick={close}>
            {t('erp.apiPush.secret.done')}
          </button>
        </div>
      }
    >
      {secret !== null ? (
        <div className="flex flex-col gap-4">
          <p
            role="note"
            className="rounded-md bg-pending-100 p-4 text-sm font-semibold leading-[1.6] text-pending-700"
          >
            {t('erp.apiPush.secret.once')}
          </p>
          <div className="flex flex-col gap-2">
            <span id="erp-api-push-secret-label" className="text-sm font-medium text-text-primary">
              {t('erp.apiPush.secret.key')}
            </span>
            <code
              aria-labelledby="erp-api-push-secret-label"
              dir="ltr"
              className="block select-all rounded-sm bg-surface-background p-3 font-mono text-xs font-semibold leading-[1.6] text-text-primary [overflow-wrap:anywhere]"
            >
              {secret.key}
            </code>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={SECONDARY_BUTTON} onClick={() => void copy()}>
                {t('erp.apiPush.secret.copy')}
              </button>
              <span role="status" className="text-xs font-medium text-text-quaternary">
                {copied === 'yes'
                  ? t('erp.apiPush.secret.copied')
                  : copied === 'no'
                    ? t('erp.apiPush.secret.copyFailed')
                    : ''}
              </span>
            </div>
          </div>
          {secret.rotation ? (
            <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
              {secret.rotation.graceEndsAt
                ? t('erp.apiPush.secret.grace', {
                    when: formatInstant(secret.rotation.graceEndsAt, language),
                  })
                : t('erp.apiPush.secret.noGrace')}
            </p>
          ) : null}
        </div>
      ) : null}
    </Modal>
  )
}

/* --------------------------------------------------------------------------- guide */

/**
 * How a developer calls the API. Placeholders only: a real key never appears here, and the
 * address is this deployment's own, because the API is served under the same origin as the app.
 */
function GuideCard() {
  const { t } = useTranslation()
  const endpoint = `${window.location.origin}/api/v1/invoices`
  const sample = [
    `POST ${endpoint}`,
    'Content-Type: application/json',
    'X-API-Key: <your ERP ingestion key>',
    'Idempotency-Key: erp-INV-2026-0042-v1-2f8c1d0e',
    '',
    '{',
    '  "format": "JSON",',
    '  "document": { "...": "the invoice as your ERP exports it" },',
    '  "supplement": {',
    '    "issue_time": "14:35:22",',
    '    "transaction_type": "1XXXXXXXXXXXXXXXXXXX"',
    '  },',
    '  "source": {',
    '    "external_document_id": "INV-2026-0042",',
    '    "external_version": "1"',
    '  }',
    '}',
  ].join('\n')

  return (
    <SectionCard title={t('erp.apiPush.guide.title')} note={t('erp.apiPush.guide.note')}>
      <div className="flex flex-col gap-4 p-5 pt-0 text-sm font-medium leading-[1.6] text-text-tertiary">
        <dl className="flex flex-col gap-3">
          <GuideItem term={t('erp.apiPush.guide.endpoint')}>
            <Mono className="inline-block [overflow-wrap:anywhere]">
              <bdi dir="ltr">{`POST ${endpoint}`}</bdi>
            </Mono>
          </GuideItem>
          <GuideItem term={t('erp.apiPush.guide.keyHeader')}>
            {t('erp.apiPush.guide.keyHeaderBody')}
          </GuideItem>
          <GuideItem term={t('erp.apiPush.guide.idempotency')}>
            {t('erp.apiPush.guide.idempotencyBody')}
          </GuideItem>
          <GuideItem term={t('erp.apiPush.guide.source')}>
            {t('erp.apiPush.guide.sourceBody')}
          </GuideItem>
          <GuideItem term={t('erp.apiPush.guide.supplement')}>
            {t('erp.apiPush.guide.supplementBody')}
          </GuideItem>
          <GuideItem term={t('erp.apiPush.guide.answers')}>
            {t('erp.apiPush.guide.answersBody')}
          </GuideItem>
        </dl>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text-primary">
            {t('erp.apiPush.guide.sample')}
          </span>
          <pre
            dir="ltr"
            className="overflow-x-auto rounded-sm bg-surface-background p-3 font-mono text-xs leading-[1.6] text-text-secondary"
          >
            {sample}
          </pre>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <SecondaryLink to="/settings/erp/documents?channel=API_PUSH">
            {t('erp.apiPush.guide.activity')}
          </SecondaryLink>
          <SecondaryLink to="/settings/erp-mapping">{t('erp.apiPush.guide.mapping')}</SecondaryLink>
        </div>
      </div>
    </SectionCard>
  )
}

function GuideItem({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-semibold text-text-primary">{term}</dt>
      <dd>{children}</dd>
    </div>
  )
}
