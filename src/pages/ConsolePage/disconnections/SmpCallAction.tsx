import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatInstant } from '../../../lib/format'
import { useConsoleRead, type ConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { CONSOLE_PRIMARY, CONSOLE_SMALL } from '../../../layouts/ConsoleShell/consoleStyle'
import {
  SMP_CALL_REASON_MAX,
  requestSmpCall,
  smpCallRefusalKey,
  smpCallStatusPath,
  type SmpCallKind,
  type SmpCallStatusDto,
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

/**
 * Whether the screen makes the SMP call itself. Anything but a ready `enabled: true` (the switch
 * off, an older server without the route, a failed read) keeps the step recorded by hand.
 */
export function smpCallsOn(read: ConsoleRead<SmpCallStatusDto>): boolean {
  return read.status === 'ready' && read.data.enabled
}

/**
 * Whether support may still record the SMP step by hand. Yes while the calls are off; with them on,
 * only as the fallback: the SMP confirmed but the step did not get recorded, or the outcome is
 * unknown and support has checked the SMP itself.
 */
export function smpStepByHand(read: ConsoleRead<SmpCallStatusDto>): boolean {
  if (!smpCallsOn(read) || read.status !== 'ready') return true
  const outcome = read.data.latest?.outcome
  return outcome === 'DONE' || outcome === 'RECONCILIATION_REQUIRED'
}

/** Operations whose confirmation already made the request be read again, once per page load. */
const reread = new Set<string>()

/**
 * "Remove from SMP" / "Add to SMP" (Business Rules FC-1, LV-3; F14): asks for a reason, makes the
 * call, and shows where it stands. The server marks the step done when the SMP confirms; this only
 * reads it again. A refused call can be tried again; an unknown outcome is resolved from the SMP
 * problem operations, never by asking again.
 */
export function SmpCallAction({
  tenantId,
  kind,
  linkId,
  status,
  open,
  canManage,
  onChanged,
  refresh,
}: {
  tenantId: string
  kind: SmpCallKind
  linkId: string
  status: SmpCallStatusDto
  /** The step is still to do on the request; once it is done there is nothing to call. */
  open: boolean
  canManage: boolean
  /** Reads the request (and queue) again; the server may have recorded the step. */
  onChanged: () => void
  /** Reads the latest call again. */
  refresh: () => void
}) {
  const { t, i18n } = useTranslation()
  const [asking, setAsking] = useState(false)
  const latest = status.latest
  const outcome = latest?.outcome ?? null
  const name = kind === 'REMOVAL' ? 'remove' : 'add'
  const canCall = canManage && open && (outcome === null || outcome === 'FAILED')

  // The server records the step just after the SMP confirms; read the request once more so the
  // step shows as done without a reload.
  const confirmedId = outcome === 'DONE' && open ? (latest?.operationId ?? null) : null
  useEffect(() => {
    if (confirmedId === null || reread.has(confirmedId)) return
    reread.add(confirmedId)
    onChanged()
  }, [confirmedId, onChanged])

  if (!open && latest === null) return null

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-border-subtle p-4">
      <p className="text-sm font-semibold text-text-primary">
        {t(`console.smpCall.${name}.title`)}
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
      ) : (
        <p className="text-sm font-medium text-text-secondary">
          {t(`console.smpCall.${name}.body`)}
        </p>
      )}
      <div className="flex flex-wrap gap-2.5">
        {canCall ? (
          <button type="button" className={CONSOLE_PRIMARY} onClick={() => setAsking(true)}>
            {t(
              outcome === 'FAILED' ? 'console.smpCall.tryAgain' : `console.smpCall.${name}.action`,
            )}
          </button>
        ) : null}
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
          send={(reason) => requestSmpCall(tenantId, kind, linkId, reason)}
          describeFailure={(error) => ({ key: smpCallRefusalKey(error) })}
          onDone={() => {
            setAsking(false)
            refresh()
            onChanged()
          }}
          onClose={() => setAsking(false)}
        />
      ) : null}
    </div>
  )
}
