import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  SMALL_BUTTON,
  SectionCard,
  Mono,
} from '../overview/idiom'
import { SelectField, TextField } from '../../../components/form/FormFields'
import { Pill } from '../ErpShell'
import {
  ApiReadFailure,
  LoadingNotice,
  PermissionDeniedNotice,
} from '../../../components/feedback/ApiNotice'
import { ConnectionShell, ConnectionNotFound } from './ConnectionShell'
import { ConnectionFailure, ConnectionNotice } from './connectionParts'
import { useConnectionDetail, useMutation } from './connectionData'
import { useExtractionSettings, useExtractionStatus } from './extractionData'
import { useErpAccess } from '../../../hooks/useErpAccess'
import { isNotFound } from '../../../lib/apiFailure'
import { erpRefusalOf } from '../../../lib/erp/connectionPolicy'
import { formatInstant } from '../../../lib/format'
import { SAMPLE_LIMIT, sessionSamples } from '../../../lib/erp/sample'
import { cadenceParts } from '../../../lib/erp/cadence'
import {
  EXTRACTION_CURSOR_KINDS,
  fetchExtractionSample,
  isDerivedCursorKind,
  putExtractionEnablement,
  putExtractionSettings,
  type ExtractionCursorKind,
  type ExtractionSampleDto,
  type ExtractionSettingsDto,
  type ExtractionStatusCode,
  type ExtractionStatusDto,
} from '../../../api/erp/extraction'

/**
 * Configure, sample, activate and observe one MANAGED_PULL extraction channel.
 *
 * The whole operator sequence lives on one screen because it is one decision made in order:
 * configure the channel, see what the source actually returns, take that document to the mapping,
 * and only then switch production on. Splitting it across pages loses the operator's place between
 * steps, which is what the previous samples page did.
 *
 * **Everything consequential is the backend's.** Which pointers a cursor kind needs, whether the
 * mapping is certified, whether the connection may be activated, and the status precedence are all
 * server rules. Nothing here recomputes them: the status pill renders the code the server sent, and
 * the enable button's pre-disabling is a courtesy that the server still has the last word on.
 */

/** Tone per status. Never the only signal — every pill carries its own words as well. */
const STATUS_TONE: Record<ExtractionStatusCode, 'success' | 'danger' | 'pending' | 'neutral'> = {
  GLOBALLY_DISABLED: 'neutral',
  NOT_CONFIGURED: 'neutral',
  CONNECTION_NOT_READY: 'neutral',
  DISABLED_BY_OPERATOR: 'pending',
  MAPPING_NOT_CERTIFIED: 'danger',
  RUNNING: 'success',
  BACKOFF: 'danger',
  FAILED_LAST_RUN: 'danger',
  WAITING: 'success',
}

type FormState = {
  interval: string
  documentsPointer: string
  documentIdPointer: string
  documentVersionPointer: string
  cursorKind: ExtractionCursorKind
  cursorParameter: string
  nextCursorPointer: string
  documentCursorPointer: string
  pageSizeParameter: string
  initialCursor: string
  transactionType: string
  documentIssueTimePointer: string
}

const EMPTY_FORM: FormState = {
  interval: '',
  documentsPointer: '',
  documentIdPointer: '',
  documentVersionPointer: '',
  cursorKind: 'TIMESTAMP',
  cursorParameter: '',
  nextCursorPointer: '',
  documentCursorPointer: '',
  pageSizeParameter: '',
  initialCursor: '',
  transactionType: '',
  documentIssueTimePointer: '',
}

function formOf(settings: ExtractionSettingsDto): FormState {
  if (!settings.configured) return EMPTY_FORM
  return {
    interval: settings.configuredInterval ?? '',
    documentsPointer: settings.documentsPointer ?? '',
    documentIdPointer: settings.documentIdPointer ?? '',
    documentVersionPointer: settings.documentVersionPointer ?? '',
    cursorKind: settings.cursorKind ?? 'TIMESTAMP',
    cursorParameter: settings.cursorParameter ?? '',
    nextCursorPointer: settings.nextCursorPointer ?? '',
    documentCursorPointer: settings.documentCursorPointer ?? '',
    pageSizeParameter: settings.pageSizeParameter ?? '',
    initialCursor: settings.initialCursor ?? '',
    transactionType: settings.transactionType ?? '',
    documentIssueTimePointer: settings.documentIssueTimePointer ?? '',
  }
}

/**
 * A channel saved before the issue-time pointer existed: configured, but missing the one value the
 * server now requires before it will collect. Read from the settings the screen already holds, not
 * from the status code — NOT_CONFIGURED also means "no settings at all", and the two need different
 * words.
 */
function isMissingIssueTime(settings: ExtractionSettingsDto | null): boolean {
  return settings !== null && settings.configured && settings.documentIssueTimePointer === null
}

const ISSUE_TIME_FIELD_ID = 'erp-extraction-document-issue-time-pointer'

const blankToNull = (value: string) => (value.trim() === '' ? null : value.trim())

/** The same ceiling the Samples screen puts on a label an operator types, so the picker stays legible. */
const SAMPLE_LABEL_MAX = 80

/** The body of an ERP section card; the card pads only its own heading. */
const CARD_BODY = 'p-5 pt-0'

/**
 * A cadence in words ("Every 5 minutes"), from the ISO-8601 code the server stores. A code the
 * helper cannot name is shown as it is rather than guessed at; no value at all is a dash.
 */
function useCadenceText() {
  const { t } = useTranslation()
  return (iso: string | null, inline = false): string => {
    if (iso === null) return '—'
    const parts = cadenceParts(iso)
    if (parts === null) return iso
    const span = parts
      .map((part) => t(`erp.extraction.cadence.${part.unit}`, { count: part.count }))
      .join(t('erp.extraction.cadence.join'))
    return t(inline ? 'erp.extraction.cadence.everyInline' : 'erp.extraction.cadence.every', { span })
  }
}

export function ConnectionExtractionPage() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const { access, ready: accessReady } = useErpAccess()
  // Each read waits for the one before it: nothing about this connection is requested until the
  // operator is known to be allowed to read it, and nothing about extraction until the connection
  // is known to be one Fawtir collects from. Any other mode answers
  // EXTRACTION_CONNECTION_MODE_UNSUPPORTED.
  const readable = accessReady && access.read
  const { read, connection, reload: reloadConnection } = useConnectionDetail(
    readable ? id : undefined,
  )
  const collects = connection?.connectionMode === 'MANAGED_PULL'
  const settingsRead = useExtractionSettings(collects ? id : undefined)
  const statusRead = useExtractionStatus(collects ? id : undefined)
  const mutation = useMutation()
  const cadence = useCadenceText()

  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [sample, setSample] = useState<ExtractionSampleDto | null>(null)

  const settings = settingsRead.settings
  const status = statusRead.status

  // Seeded from the server, and re-seeded whenever a write returns a newer document. Guarded on
  // there being no failure to look at: re-seeding over a refusal would discard the operator's input
  // and leave them nothing to correct.
  useEffect(() => {
    if (settings !== null && mutation.error === null) setForm(formOf(settings))
  }, [settings, mutation.error])

  if (!accessReady) return <LoadingNotice />
  if (!access.read) return <PermissionDeniedNotice />
  if (read.status === 'failed') {
    return isNotFound(read.error) ? <ConnectionNotFound /> : <ApiReadFailure error={read.error} retry={reloadConnection} />
  }
  if (connection === null) return <LoadingNotice />
  if (!collects) {
    return (
      <ConnectionShell connection={connection}>
        <SectionCard title={t('erp.extraction.modeUnsupported.title')}>
          <p className={`${CARD_BODY} text-sm text-text-tertiary`}>
            {t('erp.extraction.modeUnsupported.body')}
          </p>
        </SectionCard>
      </ConnectionShell>
    )
  }

  const version = connection.version
  const canManage = access.manage
  const canSample = access.test
  const missingIssueTime = isMissingIssueTime(settings)
  // The refusal belongs next to the field it names as well as in the banner, because the banner
  // sits above the form and the field may be off screen when Enable is pressed.
  const issueTimeRefused = erpRefusalOf(mutation.error) === 'EXTRACTION_ISSUE_TIME_POINTER_REQUIRED'

  function goToIssueTimeField() {
    document.getElementById(ISSUE_TIME_FIELD_ID)?.focus()
  }

  async function save() {
    if (id === undefined) return
    const next = await mutation.run('save', () =>
      putExtractionSettings(id, {
        // Activation is a separate decision: this save carries whatever the channel is already set
        // to, so pressing Save can never switch production on or off by accident.
        enabled: settings?.enabled ?? false,
        interval: blankToNull(form.interval),
        documentsPointer: form.documentsPointer.trim(),
        documentIdPointer: form.documentIdPointer.trim(),
        documentVersionPointer: blankToNull(form.documentVersionPointer),
        cursorKind: form.cursorKind,
        cursorParameter: blankToNull(form.cursorParameter),
        nextCursorPointer: blankToNull(form.nextCursorPointer),
        documentCursorPointer: blankToNull(form.documentCursorPointer),
        pageSizeParameter: blankToNull(form.pageSizeParameter),
        initialCursor: blankToNull(form.initialCursor),
        transactionType: form.transactionType.trim(),
        // Always sent, so what the operator sees is what is stored: empty clears it on the server,
        // and an empty field over a pointer that was never set leaves it unset.
        documentIssueTimePointer: form.documentIssueTimePointer.trim(),
        expectedVersion: version,
      }),
    )
    if (next !== undefined) refreshAll()
  }

  async function setEnabled(enabled: boolean) {
    if (id === undefined) return
    const next = await mutation.run(enabled ? 'enable' : 'disable', () =>
      putExtractionEnablement(id, { enabled, expectedVersion: version }),
    )
    if (next !== undefined) refreshAll()
  }

  async function takeSample() {
    if (id === undefined) return
    const next = await mutation.run('sample', () => fetchExtractionSample(id))
    if (next !== undefined) setSample(next)
  }

  /**
   * The connection version is shared by every write on this resource, so any successful one makes
   * the others' copy stale. Refetching all three is cheaper than explaining a 409 the operator did
   * nothing to cause.
   */
  function refreshAll() {
    reloadConnection()
    settingsRead.reload()
    statusRead.reload()
  }

  return (
    <ConnectionShell connection={connection}>
      <ConnectionFailure error={mutation.error} onReload={refreshAll} />
      {mutation.done !== null && mutation.error === null ? (
        <ConnectionNotice>{t(`erp.extraction.done.${mutation.done}`)}</ConnectionNotice>
      ) : null}

      <StatusPanel read={statusRead.read} status={status} missingIssueTime={missingIssueTime} />

      <SectionCard
        title={t('erp.extraction.config.title')}
        note={t('erp.extraction.config.description')}
      >
        <div className={`flex flex-col gap-5 ${CARD_BODY}`}>
          {settingsRead.read.status === 'failed' ? (
            <ConnectionFailure error={settingsRead.read.error} onReload={settingsRead.reload} />
          ) : null}
          {missingIssueTime ? (
            // Inline, inside the card it is about: the page-level notice drew a card within a card.
            <div
              role="alert"
              className="flex flex-col items-start gap-3 rounded-sm bg-pending-100 p-4 md:flex-row md:items-center md:justify-between"
            >
              <p className="text-sm font-medium leading-[1.6] text-text-secondary">
                {t(
                  canManage
                    ? 'erp.extraction.issueTime.missing'
                    : 'erp.extraction.issueTime.missingReadOnly',
                )}
              </p>
              {canManage ? (
                <button type="button" className={SMALL_BUTTON} onClick={goToIssueTimeField}>
                  {t('erp.extraction.issueTime.goToField')}
                </button>
              ) : null}
            </div>
          ) : null}
          {!canManage ? (
            <ConfigFacts settings={settings} />
          ) : (
            <>
          <div className="grid gap-5 md:grid-cols-2">
            <TextField
              id="erp-extraction-interval"
              name="interval"
              label={t('erp.extraction.field.interval')}
              hint={t('erp.extraction.field.intervalHint', {
                effective: cadence(settings?.effectiveCadence ?? null, true),
              })}
              maxLength={40}
              dir="ltr"
              value={form.interval}
              onChange={(next) => setForm({ ...form, interval: next })}
            />
            <TextField
              id="erp-extraction-transaction-type"
              name="transactionType"
              label={t('erp.extraction.field.transactionType')}
              hint={t('erp.extraction.field.transactionTypeHint')}
              maxLength={20}
              dir="ltr"
              value={form.transactionType}
              onChange={(next) => setForm({ ...form, transactionType: next })}
            />
            <TextField
              id="erp-extraction-documents-pointer"
              name="documentsPointer"
              label={t('erp.extraction.field.documentsPointer')}
              hint={t('erp.extraction.field.pointerHint')}
              maxLength={200}
              dir="ltr"
              value={form.documentsPointer}
              onChange={(next) => setForm({ ...form, documentsPointer: next })}
            />
            <TextField
              id="erp-extraction-document-id-pointer"
              name="documentIdPointer"
              label={t('erp.extraction.field.documentIdPointer')}
              hint={t('erp.extraction.field.pointerHint')}
              maxLength={200}
              dir="ltr"
              value={form.documentIdPointer}
              onChange={(next) => setForm({ ...form, documentIdPointer: next })}
            />
            <TextField
              id={ISSUE_TIME_FIELD_ID}
              name="documentIssueTimePointer"
              label={t('erp.extraction.field.documentIssueTimePointer')}
              hint={t('erp.extraction.field.documentIssueTimePointerHint')}
              error={
                issueTimeRefused
                  ? t('erp.connections.refusal.EXTRACTION_ISSUE_TIME_POINTER_REQUIRED')
                  : undefined
              }
              maxLength={200}
              dir="ltr"
              value={form.documentIssueTimePointer}
              onChange={(next) => setForm({ ...form, documentIssueTimePointer: next })}
            />
            <TextField
              id="erp-extraction-document-version-pointer"
              name="documentVersionPointer"
              label={t('erp.extraction.field.documentVersionPointer')}
              hint={t('erp.extraction.field.optionalPointerHint')}
              maxLength={200}
              dir="ltr"
              value={form.documentVersionPointer}
              onChange={(next) => setForm({ ...form, documentVersionPointer: next })}
            />
            <SelectField
              id="erp-extraction-cursor-kind"
              name="cursorKind"
              label={t('erp.extraction.field.cursorKind')}
              options={EXTRACTION_CURSOR_KINDS.map((value) => ({
                value,
                label: t(`erp.extraction.cursorKind.${value}`),
                hint: t(
                  isDerivedCursorKind(value)
                    ? 'erp.extraction.cursorKind.derivedHint'
                    : 'erp.extraction.cursorKind.opaqueHint',
                ),
              }))}
              value={form.cursorKind}
              onChange={(next) => setForm({ ...form, cursorKind: next as ExtractionCursorKind })}
            />
            <TextField
              id="erp-extraction-cursor-parameter"
              name="cursorParameter"
              label={t('erp.extraction.field.cursorParameter')}
              hint={t('erp.extraction.field.cursorParameterHint')}
              maxLength={60}
              dir="ltr"
              value={form.cursorParameter}
              onChange={(next) => setForm({ ...form, cursorParameter: next })}
            />
            {isDerivedCursorKind(form.cursorKind) ? (
              <TextField
                id="erp-extraction-document-cursor-pointer"
                name="documentCursorPointer"
                label={t('erp.extraction.field.documentCursorPointer')}
                hint={t('erp.extraction.field.documentCursorPointerHint')}
                maxLength={200}
                dir="ltr"
                value={form.documentCursorPointer}
                onChange={(next) => setForm({ ...form, documentCursorPointer: next })}
              />
            ) : (
              <TextField
                id="erp-extraction-next-cursor-pointer"
                name="nextCursorPointer"
                label={t('erp.extraction.field.nextCursorPointer')}
                hint={t('erp.extraction.field.nextCursorPointerHint')}
                maxLength={200}
                dir="ltr"
                value={form.nextCursorPointer}
                onChange={(next) => setForm({ ...form, nextCursorPointer: next })}
              />
            )}
            <TextField
              id="erp-extraction-page-size-parameter"
              name="pageSizeParameter"
              label={t('erp.extraction.field.pageSizeParameter')}
              hint={t('erp.extraction.field.pageSizeParameterHint')}
              maxLength={60}
              dir="ltr"
              value={form.pageSizeParameter}
              onChange={(next) => setForm({ ...form, pageSizeParameter: next })}
            />
            <TextField
              id="erp-extraction-initial-cursor"
              name="initialCursor"
              label={t('erp.extraction.field.initialCursor')}
              hint={t('erp.extraction.field.initialCursorHint')}
              maxLength={512}
              dir="ltr"
              value={form.initialCursor}
              onChange={(next) => setForm({ ...form, initialCursor: next })}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={!canManage || mutation.busy !== null}
              onClick={save}
            >
              {mutation.busy === 'save'
                ? t('erp.extraction.config.saving')
                : t('erp.extraction.config.save')}
            </button>
          </div>
            </>
          )}
        </div>
      </SectionCard>

      <SamplePanel
        sample={sample}
        busy={mutation.busy === 'sample'}
        canSample={canSample}
        onFetch={takeSample}
        connectionId={connection.id}
      />

      <EnablementPanel
        settings={settings}
        status={status}
        canManage={canManage}
        busy={mutation.busy}
        onEnable={() => setEnabled(true)}
        onDisable={() => setEnabled(false)}
      />
    </ConnectionShell>
  )
}

/* ------------------------------------------------------------------- status */

function StatusPanel({
  read,
  status,
  missingIssueTime,
}: {
  read: ReturnType<typeof useExtractionStatus>['read']
  status: ExtractionStatusDto | null
  missingIssueTime: boolean
}) {
  const { t } = useTranslation()
  const cadence = useCadenceText()
  if (read.status === 'failed') {
    return (
      <SectionCard title={t('erp.extraction.status.title')}>
        <div className={CARD_BODY}>
          <ConnectionFailure error={read.error} />
        </div>
      </SectionCard>
    )
  }
  if (status === null) {
    return (
      <SectionCard title={t('erp.extraction.status.title')}>
        <div className={CARD_BODY}>
          <LoadingNotice />
        </div>
      </SectionCard>
    )
  }
  return (
    <SectionCard
      title={t('erp.extraction.status.title')}
      note={t('erp.extraction.status.description')}
    >
      <div className={CARD_BODY}>
        <div className="flex flex-wrap items-center gap-3">
          {/* The server's code, rendered. The frontend does not decide precedence. */}
          <Pill tone={STATUS_TONE[status.status]} label={t(`erp.extraction.state.${status.status}`)} />
          <p className="text-sm text-text-tertiary">
            {/* The server's code stays the headline; only the explanation is more specific when the
                settings show the one value that is missing. */}
            {status.status === 'NOT_CONFIGURED' && missingIssueTime
              ? t('erp.extraction.stateHelp.NOT_CONFIGURED_ISSUE_TIME')
              : t(`erp.extraction.stateHelp.${status.status}`)}
          </p>
        </div>
        <dl className="mt-5 grid gap-4 sm:grid-cols-3">
          <Fact label={t('erp.extraction.status.automation')}>
            {t(
              status.schedulerGloballyEnabled
                ? 'erp.extraction.status.automationOn'
                : 'erp.extraction.status.automationOff',
            )}
          </Fact>
          <Fact label={t('erp.extraction.status.cadence')}>{cadence(status.effectiveCadence)}</Fact>
          <Fact label={t('erp.extraction.status.nextRun')}>
            {status.nextRunAt === null
              ? t('erp.extraction.status.notScheduled')
              : formatInstant(status.nextRunAt)}
          </Fact>
          {status.consecutiveFailures > 0 ? (
            <Fact label={t('erp.extraction.status.failures')}>{status.consecutiveFailures}</Fact>
          ) : null}
          {status.backoffUntil !== null ? (
            <Fact label={t('erp.extraction.status.backoffUntil')}>
              {formatInstant(status.backoffUntil)}
            </Fact>
          ) : null}
          {status.lastRunState !== null ? (
            <Fact label={t('erp.extraction.status.lastRun')}>
              {t(`erp.extraction.runState.${status.lastRunState}`)}
              {status.lastRunCompletedAt !== null ? ` · ${formatInstant(status.lastRunCompletedAt)}` : ''}
            </Fact>
          ) : null}
          {status.lastRunState !== null ? (
            <Fact label={t('erp.extraction.status.lastRunCounts')}>
              {t('erp.extraction.status.counts', {
                discovered: status.lastRunDiscovered,
                accepted: status.lastRunAccepted,
                rejected: status.lastRunRejected,
                duplicates: status.lastRunDuplicates,
              })}
            </Fact>
          ) : null}
          {status.lastFailureReason !== null ? (
            <Fact label={t('erp.extraction.status.lastFailure')}>
              {/* The server's classified code and stage. No exception text exists to render. */}
              <Mono>{status.lastFailureReason}</Mono>
              {status.lastFailureStage !== null ? ` · ${status.lastFailureStage}` : ''}
              {status.lastFailureRetryable === true
                ? ` · ${t('erp.extraction.status.retryable')}`
                : ''}
            </Fact>
          ) : null}
        </dl>
      </div>
    </SectionCard>
  )
}

/* ------------------------------------------------------------------- sample */

function SamplePanel({
  sample,
  busy,
  canSample,
  onFetch,
  connectionId,
}: {
  sample: ExtractionSampleDto | null
  busy: boolean
  canSample: boolean
  onFetch: () => void
  connectionId: string
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  /**
   * Whether this document can be handed to the mapping preview, and why not when it cannot.
   *
   * The preview walks a parsed structure to offer source paths, so a payload that is not JSON cannot
   * go there — an AS4 or CSV source is legitimate and must be refused plainly rather than crash the
   * screen. The ceiling is the sample store's, checked here so this screen cannot fill a picker the
   * Samples screen reports as full.
   */
  const handover = useMemo((): { kind: 'ready' | 'notJson' | 'atLimit'; parsed?: unknown } => {
    if (sample === null) return { kind: 'notJson' }
    if (sessionSamples.snapshot().length >= SAMPLE_LIMIT) return { kind: 'atLimit' }
    try {
      return { kind: 'ready', parsed: JSON.parse(sample.payload) }
    } catch {
      return { kind: 'notJson' }
    }
  }, [sample])

  function useInMapping() {
    if (sample === null || handover.kind !== 'ready') return
    // Labelled by the document it came from, so the picker names a real invoice rather than
    // "sample 3". The connection id keeps two connections' documents apart.
    const label = `${sample.externalDocumentId ?? 'document'} (${connectionId.slice(0, 8)})`
    sessionSamples.add(label.slice(0, SAMPLE_LABEL_MAX), handover.parsed)
    navigate('/settings/erp-mapping/preview')
  }

  return (
    <SectionCard
      title={t('erp.extraction.sample.title')}
      note={t('erp.extraction.sample.description')}
    >
      <div className={CARD_BODY}>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={SECONDARY_BUTTON}
            disabled={!canSample || busy}
            onClick={onFetch}
          >
            {busy ? t('erp.extraction.sample.fetching') : t('erp.extraction.sample.fetch')}
          </button>
          {!canSample ? (
            <p className="text-sm text-text-quaternary">{t('erp.extraction.sample.noPermission')}</p>
          ) : null}
        </div>

        {sample !== null ? (
          <>
            <dl className="mt-5 grid gap-4 sm:grid-cols-4">
              <Fact label={t('erp.extraction.sample.documentId')}>
                {sample.externalDocumentId ?? '—'}
              </Fact>
              <Fact label={t('erp.extraction.sample.version')}>{sample.externalVersion ?? '—'}</Fact>
              <Fact label={t('erp.extraction.sample.size')}>
                {t('erp.extraction.sample.bytes', { count: sample.payloadBytes })}
              </Fact>
              <Fact label={t('erp.extraction.sample.latency')}>
                {t('erp.extraction.sample.ms', { count: sample.latencyMs })}
              </Fact>
            </dl>
            {/*
              The payload exactly as the source sent it. Read-only, scrollable, and NOT pretty-printed:
              the mapping is the only thing that should interpret these bytes, so what is shown here is
              what the mapping will receive.
            */}
            <label
              htmlFor="erp-extraction-sample-payload"
              className="mt-5 block text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary"
            >
              {t('erp.extraction.sample.payload')}
            </label>
            <textarea
              id="erp-extraction-sample-payload"
              readOnly
              spellCheck={false}
              value={sample.payload}
              rows={10}
              className="mt-2 w-full resize-y rounded-md border border-border-subtle bg-surface-background p-3 font-mono text-xs leading-[1.6] text-text-secondary"
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={SECONDARY_BUTTON}
                disabled={handover.kind !== 'ready'}
                onClick={useInMapping}
              >
                {t('erp.extraction.sample.useInMapping')}
              </button>
              <p className="text-sm text-text-quaternary">
                {t(`erp.extraction.sample.handover.${handover.kind}`, { limit: SAMPLE_LIMIT })}
              </p>
            </div>
          </>
        ) : null}
      </div>
    </SectionCard>
  )
}

/* --------------------------------------------------------------- enablement */

function EnablementPanel({
  settings,
  status,
  canManage,
  busy,
  onEnable,
  onDisable,
}: {
  settings: ExtractionSettingsDto | null
  status: ExtractionStatusDto | null
  canManage: boolean
  busy: string | null
  onEnable: () => void
  onDisable: () => void
}) {
  const { t } = useTranslation()
  const enabled = settings?.enabled ?? false

  /**
   * Prerequisites shown from the server's own status, never inferred. The enable button is
   * pre-disabled when one of them plainly fails, which is a courtesy — the backend refuses it
   * regardless, and this is not a second implementation of its rules.
   */
  const notReady = status !== null && status.connectionState !== 'READY'
  const notConfigured = settings !== null && !settings.configured
  const missingIssueTime = isMissingIssueTime(settings)
  const notCertified = status !== null && status.status === 'MAPPING_NOT_CERTIFIED'
  // Unknown counts as blocked: before both reads land, a pressable Enable would be offered on the
  // strength of nothing, which is what the permission gate already refuses to do.
  const unknown = settings === null || status === null
  const blocked = unknown || notReady || notConfigured || missingIssueTime

  return (
    <SectionCard
      title={t('erp.extraction.enablement.title')}
      note={t('erp.extraction.enablement.description')}
    >
      <div className={CARD_BODY}>
        <ul className="mb-5 space-y-2.5 text-sm">
          <Prerequisite met={!notConfigured}>{t('erp.extraction.enablement.needConfig')}</Prerequisite>
          <Prerequisite met={!notConfigured && !missingIssueTime}>
            {t('erp.extraction.enablement.needIssueTime')}
          </Prerequisite>
          <Prerequisite met={!notReady}>{t('erp.extraction.enablement.needReady')}</Prerequisite>
          <Prerequisite met={!notCertified}>
            {t('erp.extraction.enablement.needCertified')}
          </Prerequisite>
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          {enabled ? (
            <button
              type="button"
              className={SECONDARY_BUTTON}
              disabled={!canManage || busy !== null}
              onClick={onDisable}
            >
              {busy === 'disable'
                ? t('erp.extraction.enablement.disabling')
                : t('erp.extraction.enablement.disable')}
            </button>
          ) : (
            <button
              type="button"
              className={PRIMARY_BUTTON}
              disabled={!canManage || busy !== null || blocked}
              onClick={onEnable}
            >
              {busy === 'enable'
                ? t('erp.extraction.enablement.enabling')
                : t('erp.extraction.enablement.enable')}
            </button>
          )}
          <p className="text-sm text-text-quaternary">
            {t(
              enabled
                ? 'erp.extraction.enablement.enabledNote'
                : 'erp.extraction.enablement.disabledNote',
            )}
          </p>
        </div>
      </div>
    </SectionCard>
  )
}

function Prerequisite({ met, children }: { met: boolean; children: ReactNode }) {
  const { t } = useTranslation()
  return (
    <li className="flex items-center gap-3 text-text-tertiary">
      {/* Words, not only a colour: the state has to survive being read aloud. */}
      <Pill
        tone={met ? 'success' : 'pending'}
        label={met ? t('erp.extraction.enablement.ok') : t('erp.extraction.enablement.outstanding')}
      />
      <span>{children}</span>
    </li>
  )
}

/**
 * The configuration as read-only facts, for a viewer holding `erp.connection.read` and no more.
 *
 * The form fields have no disabled state, so the alternative was editable inputs above a dead Save
 * button — which invites someone to type a correction that cannot be kept. Facts say what is
 * configured and claim nothing about being able to change it.
 */
function ConfigFacts({ settings }: { settings: ExtractionSettingsDto | null }) {
  const { t } = useTranslation()
  const cadence = useCadenceText()
  if (settings === null) return <LoadingNotice />
  if (!settings.configured) {
    return <p className="text-sm text-text-tertiary">{t('erp.extraction.config.none')}</p>
  }
  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Fact label={t('erp.extraction.field.interval')}>
          {settings.configuredInterval === null
            ? t('erp.extraction.config.platformDefault')
            : cadence(settings.configuredInterval)}
        </Fact>
        <Fact label={t('erp.extraction.status.cadence')}>{cadence(settings.effectiveCadence)}</Fact>
        <Fact label={t('erp.extraction.field.transactionType')}>
          <Mono>{settings.transactionType ?? '—'}</Mono>
        </Fact>
        <Fact label={t('erp.extraction.field.documentsPointer')}>
          <Mono>{settings.documentsPointer ?? '—'}</Mono>
        </Fact>
        <Fact label={t('erp.extraction.field.documentIdPointer')}>
          <Mono>{settings.documentIdPointer ?? '—'}</Mono>
        </Fact>
        <Fact label={t('erp.extraction.field.documentIssueTimePointer')}>
          <Mono>{settings.documentIssueTimePointer ?? '—'}</Mono>
        </Fact>
        <Fact label={t('erp.extraction.field.cursorKind')}>
          {settings.cursorKind === null
            ? '—'
            : t(`erp.extraction.cursorKind.${settings.cursorKind}`)}
        </Fact>
      </dl>
      <p className="mt-4 text-sm text-text-quaternary">{t('erp.extraction.config.readOnly')}</p>
    </>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-[0.4px] text-text-quaternary">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-text-secondary">{children}</dd>
    </div>
  )
}
