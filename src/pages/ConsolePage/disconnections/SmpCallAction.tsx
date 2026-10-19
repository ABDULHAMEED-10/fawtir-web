import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DateField, Input, Select } from '../../../components/ui'
import { formatInstant } from '../../../lib/format'
import { useConsoleRead, type ConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { CONSOLE_PRIMARY, CONSOLE_SMALL } from '../../../layouts/ConsoleShell/consoleStyle'
import { muscatToday } from '../../../lib/console/fawtirDisconnections'
import {
  OVERRIDE_KIND,
  SMP_CALL_REASON_MAX,
  SMP_OVERRIDE_CHANNELS,
  SMP_OVERRIDE_REFERENCE_MAX,
  offeredActions,
  recordSmpOverride,
  requestSmpCall,
  smpCallRefusalKey,
  smpCallStatusPath,
  type SmpAction,
  type SmpCallKind,
  type SmpCallStatusDto,
  type SmpOverrideChannel,
  type SmpOverrideKind,
} from '../../../lib/console/platformSmpParticipant'
import { OperatorReasonDialog } from '../operators/OperatorReasonDialog'

/** The latest SMP call for a disconnection (REMOVAL) or a reconnection (ADDITION). */
export function useSmpCallStatus(
  /** `null` until the request is read: nothing is fetched. */
  tenantId: string | null,
  kind: SmpCallKind,
  linkId: string,
): { read: ConsoleRead<SmpCallStatusDto>; retry: () => void } {
  return useConsoleRead<SmpCallStatusDto>(
    tenantId === null ? null : smpCallStatusPath(tenantId, kind, linkId),
  )
}

/** Whether the console's SMP calls are switched on. */
export function smpCallsOn(read: ConsoleRead<SmpCallStatusDto>): boolean {
  return read.status === 'ready' && read.data.enabled
}

/**
 * Whether the SMP box is drawn: the calls or support's record is on. Anything else (both off, an
 * older server without the route, a failed read) keeps the step recorded by hand.
 */
export function smpPanelOn(read: ConsoleRead<SmpCallStatusDto>): boolean {
  return read.status === 'ready' && (read.data.enabled || read.data.overrideEnabled === true)
}

const CALLS: SmpAction[] = ['REMOVE', 'ADD_BACK']

/**
 * Whether support may still record the bare SMP step by hand. Never while support's record is on:
 * the record moves the SMP registration with the step, the bare step does not. Otherwise yes
 * whenever the call cannot be made or did not settle it: switched off, not offered, refused
 * before it was queued (`callRefused`), failed, done but not marked, or unknown. Staff are never
 * left with nothing to press while the deadline runs.
 */
export function smpStepByHand(read: ConsoleRead<SmpCallStatusDto>, callRefused = false): boolean {
  if (read.status !== 'ready') return true
  const status = read.data
  const outcome = status.latest?.outcome
  const actions = offeredActions(status)
  if (actions === null) {
    if (!status.enabled || callRefused) return true
    return outcome === 'DONE' || outcome === 'RECONCILIATION_REQUIRED'
  }
  if (status.overrideEnabled === true) return false
  if (outcome === 'PENDING' || status.notice === 'CHANGE_PENDING') return false
  return (
    callRefused ||
    !actions.some((action) => CALLS.includes(action)) ||
    outcome === 'DONE' ||
    outcome === 'FAILED' ||
    outcome === 'RECONCILIATION_REQUIRED'
  )
}

/** Operations whose confirmation already made the request be read again, once per page load. */
const reread = new Set<string>()

/**
 * The Oman SMP step of a disconnection or a reconnection (Business Rules FC-1, LV-3; F14 and
 * option C): the SMP call when the server offers it, and support's record of a change the call did
 * not make when the server offers that. The buttons follow the server's offered actions; a server
 * that does not list them keeps the earlier behaviour. The server marks the step done when the SMP
 * confirms a call; this only reads it again.
 */
export function SmpCallAction({
  tenantId,
  kind,
  linkId,
  status,
  open,
  canManage,
  minDay,
  onChanged,
  onRefused,
  refresh,
}: {
  tenantId: string
  kind: SmpCallKind
  linkId: string
  status: SmpCallStatusDto
  /** The step is still to do on the request; once it is done there is nothing to call. */
  open: boolean
  canManage: boolean
  /** The Oman day of what the step answers (disconnection, acceptance): the record's earliest date. */
  minDay?: string
  /** Reads the request (and queue) again; the server may have recorded the step. */
  onChanged: () => void
  /** The call was refused before it was queued: the panel offers recording the step instead. */
  onRefused?: () => void
  /** Reads the latest call again. */
  refresh: () => void
}) {
  const { t, i18n } = useTranslation()
  const [asking, setAsking] = useState(false)
  const [recording, setRecording] = useState<SmpOverrideKind | null>(null)
  const refusedCall = useRef(false)
  const latest = status.latest
  const outcome = latest?.outcome ?? null
  const name = kind === 'REMOVAL' ? 'remove' : 'add'
  const actions = offeredActions(status)
  const callAction = actions?.find((action) => CALLS.includes(action)) ?? null
  const legacyCall = actions === null && open && (outcome === null || outcome === 'FAILED')
  const records = (actions ?? []).filter((action) => OVERRIDE_KIND[action] !== undefined)
  const confirmOnly =
    kind === 'ADDITION' && records.length === 1 && records[0] === 'CONFIRM_REGISTRATION'

  // The server records the step just after the SMP confirms; read the request once more so the
  // step shows as done without a reload.
  const confirmedId = outcome === 'DONE' && open ? (latest?.operationId ?? null) : null
  useEffect(() => {
    if (confirmedId === null || reread.has(confirmedId)) return
    reread.add(confirmedId)
    onChanged()
  }, [confirmedId, onChanged])

  if (!open && latest === null && !status.notice) return null

  const why =
    open && status.callable === false && status.notCallableReason ? status.notCallableReason : null

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border-subtle p-4">
      <p className="text-sm font-semibold text-text-primary">
        {t(confirmOnly ? 'console.smpCall.confirm.title' : `console.smpCall.${name}.title`)}
      </p>
      {latest ? (
        <div className="flex flex-col gap-1" role="status">
          <p
            className={`text-sm font-medium ${
              outcome === 'DONE'
                ? 'text-success-700'
                : outcome === 'PENDING'
                  ? 'text-text-secondary'
                  : 'text-danger-700'
            }`}
          >
            {t(`console.smpCall.outcome.${outcome}`)}
          </p>
          <p className="text-xs text-text-tertiary">
            {t('console.smpCall.asked', {
              date: formatInstant(latest.requestedAt, i18n.language),
              attempt: latest.attemptNumber,
            })}
          </p>
          <p className="text-xs text-text-secondary">{latest.reason}</p>
        </div>
      ) : open && !status.notice ? (
        <p className="text-sm font-medium text-text-secondary">
          {t(`console.smpCall.${name}.body`)}
        </p>
      ) : null}
      {status.notice ? (
        <p className="text-sm font-medium text-text-secondary">
          {t(`console.smpCall.notice.${status.notice}`)}
        </p>
      ) : null}
      {why && why !== 'NOT_REMOVED' && (records.length > 0 || !status.overrideEnabled) ? (
        <p className="text-sm font-medium text-text-secondary">
          {t(`console.smpCall.notCallable.${why}`, {
            defaultValue: t('console.smpCall.notCallable.other'),
          })}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2.5">
        {canManage && (callAction !== null || legacyCall) ? (
          <button
            type="button"
            className={CONSOLE_PRIMARY}
            disabled={asking || recording !== null}
            onClick={() => setAsking(true)}
          >
            {t(
              outcome === 'FAILED' ? 'console.smpCall.tryAgain' : `console.smpCall.${name}.action`,
            )}
          </button>
        ) : null}
        {canManage
          ? records.map((action) => (
              <button
                key={action}
                type="button"
                className={callAction === null ? CONSOLE_PRIMARY : CONSOLE_SMALL}
                disabled={asking || recording !== null}
                onClick={() => setRecording(OVERRIDE_KIND[action]!)}
              >
                {t(`console.smpCall.record.${OVERRIDE_KIND[action]}.action`)}
              </button>
            ))
          : null}
        {outcome === 'PENDING' ? (
          <button
            type="button"
            className={CONSOLE_SMALL}
            onClick={() => {
              refresh()
              onChanged()
            }}
          >
            {t('console.smpCall.checkAgain')}
          </button>
        ) : null}
      </div>
      {asking ? (
        <OperatorReasonDialog
          formId={`smp-call-${name}`}
          title={t(`console.smpCall.${name}.title`)}
          body={t(`console.smpCall.${name}.confirm`)}
          confirmLabel={t(`console.smpCall.${name}.action`)}
          confirmingLabel={t('console.smpCall.sending')}
          reasonMax={SMP_CALL_REASON_MAX}
          send={async (reason) => {
            try {
              return await requestSmpCall(tenantId, kind, linkId, reason)
            } catch (error) {
              // Refused before anything was queued: the panel offers the step instead, so support
              // is never left with nothing to press. What the server offers now is read again
              // once the dialog is closed, so its message stays on screen until then.
              refusedCall.current = true
              onRefused?.()
              throw error
            }
          }}
          describeFailure={(error) => ({ key: smpCallRefusalKey(error) })}
          onDone={() => {
            setAsking(false)
            refresh()
            onChanged()
          }}
          onClose={() => {
            setAsking(false)
            if (refusedCall.current) {
              refusedCall.current = false
              refresh()
            }
          }}
        />
      ) : null}
      {recording ? (
        <SmpRecordDialog
          tenantId={tenantId}
          kind={kind}
          linkId={linkId}
          record={recording}
          minDay={minDay}
          onDone={() => {
            setRecording(null)
            refresh()
            onChanged()
          }}
          onClose={() => setRecording(null)}
        />
      ) : null}
    </div>
  )
}

/**
 * Support's record of an SMP change the console's call did not make: the Oman date it happened
 * on, how support knows, a required reason and optional evidence. Never calls the SMP. One request
 * per confirmation (the dialog's own guard).
 */
function SmpRecordDialog({
  tenantId,
  kind,
  linkId,
  record,
  minDay,
  onDone,
  onClose,
}: {
  tenantId: string
  kind: SmpCallKind
  linkId: string
  record: SmpOverrideKind
  minDay?: string
  onDone: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const today = muscatToday()
  const [day, setDay] = useState(today)
  const [channel, setChannel] = useState<SmpOverrideChannel | ''>('')
  const [reference, setReference] = useState('')
  const [errors, setErrors] = useState<{ day?: string; channel?: string }>({})

  const validate = () => {
    const next: { day?: string; channel?: string } = {}
    if (day === '' || day > today || (minDay !== undefined && day < minDay)) {
      next.day = 'console.smpCall.record.dateInvalid'
    }
    if (channel === '') next.channel = 'console.smpCall.record.channelRequired'
    setErrors(next)
    return next.day ? 'day' : next.channel ? 'channel' : undefined
  }

  return (
    <OperatorReasonDialog
      formId={`smp-record-${record.toLowerCase()}`}
      title={t(`console.smpCall.record.${record}.title`)}
      body={t(`console.smpCall.record.${record}.body`)}
      confirmLabel={t(`console.smpCall.record.${record}.action`)}
      confirmingLabel={t('console.smpCall.record.sending')}
      reasonMax={SMP_CALL_REASON_MAX}
      validate={validate}
      fields={
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
            <span>{t('console.smpCall.record.date')}</span>
            <DateField
              value={day}
              onChange={(value) => {
                setDay(value)
                setErrors((e) => ({ ...e, day: undefined }))
              }}
              min={minDay}
              max={today}
              ariaLabel={t('console.smpCall.record.date')}
              ariaInvalid={Boolean(errors.day)}
            />
            {errors.day ? (
              <span className="text-xs font-medium text-danger-700">{t(errors.day)}</span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
            <span>{t('console.smpCall.record.channel')}</span>
            <Select
              value={channel}
              onChange={(value) => {
                setChannel(value as SmpOverrideChannel)
                setErrors((e) => ({ ...e, channel: undefined }))
              }}
              placeholder={t('console.smpCall.record.channelPlaceholder')}
              ariaLabel={t('console.smpCall.record.channel')}
              ariaInvalid={Boolean(errors.channel)}
              options={SMP_OVERRIDE_CHANNELS.map((value) => ({
                value,
                label: t(`console.smpCall.record.channelOption.${value}`),
              }))}
            />
            {errors.channel ? (
              <span className="text-xs font-medium text-danger-700">{t(errors.channel)}</span>
            ) : null}
          </div>
          <div className="md:col-span-2">
            <Input
              bordered
              label={t('console.smpCall.record.reference')}
              hint={t('console.smpCall.record.referenceHint')}
              value={reference}
              maxLength={SMP_OVERRIDE_REFERENCE_MAX}
              dir="ltr"
              onChange={(event) => setReference(event.target.value)}
            />
          </div>
        </div>
      }
      send={(reason) =>
        recordSmpOverride(tenantId, {
          kind: record,
          ...(kind === 'REMOVAL' ? { disconnectionId: linkId } : { reconnectionId: linkId }),
          occurredOn: day,
          channel: channel as SmpOverrideChannel,
          reason,
          reference: reference.trim() || null,
        })
      }
      describeFailure={(error) => ({ key: smpCallRefusalKey(error, 'record') })}
      onDone={onDone}
      onClose={onClose}
    />
  )
}
