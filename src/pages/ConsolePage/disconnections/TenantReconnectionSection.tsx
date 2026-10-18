import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Input, Select } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import {
  CONSOLE_PRIMARY,
  CONSOLE_SECONDARY,
  CONSOLE_SMALL,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { hasPermission } from '../../../lib/identity/entitlements'
import { formatInstant } from '../../../lib/format'
import {
  DISCONNECTIONS_MANAGE_PERMISSION,
  hasLeft,
  isClockTime,
  muscatInstant,
  muscatToday,
  type DisconnectionRequestDto,
} from '../../../lib/console/fawtirDisconnections'
import {
  companyReconnectionsPath,
  isReconnectionLive,
  reconnectionRefusalKey,
  startReconnection,
  type PlatformReconnectionDto,
  type ReconnectionAskedVia,
} from '../../../lib/console/fawtirReconnections'
import { RECONNECTION_STATUS_TONE } from './disconnectionTones'
import { MomentField } from './MomentField'

const VIA: ReconnectionAskedVia[] = ['CALL', 'EMAIL', 'PORTAL_NOTICE']

/**
 * "Coming back to Fawtir" inside a company's "Disconnect from Fawtir" card, once it has left
 * (plan v4 §10): where its request to come back stands, a link into the reconnection queue, and
 * starting one when the customer calls or e-mails, or when support sees the connect request on the
 * Fawtara Portal. Only a reconnection of this departure is shown; one from an earlier departure is
 * history in the queue.
 */
export function TenantReconnectionSection({
  tenantId,
  disconnection,
}: {
  tenantId: string
  /** The company's latest disconnection, completed. */
  disconnection: DisconnectionRequestDto
}) {
  const { t, i18n } = useTranslation()
  const { entitlements } = useEntitlements()
  const canManage =
    entitlements !== null && hasPermission(entitlements, DISCONNECTIONS_MANAGE_PERMISSION)
  const { read, retry } = useConsoleRead<PlatformReconnectionDto[]>(
    companyReconnectionsPath(tenantId),
  )
  const [starting, setStarting] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const heading = (
    <h3 className="text-base font-semibold text-text-primary">
      {t('console.reconnections.card.title')}
    </h3>
  )
  if (read.status === 'loading')
    return (
      <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        {heading}
        <ConsoleNotice busy body={t('console.disconnections.loading')} />
      </div>
    )
  if (read.status === 'failed')
    return (
      <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        {heading}
        <ConsoleReadFailure error={read.error} retry={retry} />
      </div>
    )

  const current = read.data.find((entry) => entry.request.disconnectionId === disconnection.id)
  const canStart =
    canManage && hasLeft(disconnection) && !(current && isReconnectionLive(current.request.status))

  return (
    <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
      {heading}
      {current ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <ConsoleStatusPill
              tone={RECONNECTION_STATUS_TONE[current.request.status]}
              label={t(`console.reconnections.status.${current.request.status}`)}
            />
            <p className="text-sm leading-[1.6] text-text-secondary">
              {t('console.disconnections.requestedOn', {
                date: formatInstant(current.request.requestedAt, i18n.language),
              })}
            </p>
            {current.effectiveDue ? (
              <ConsoleStatusPill tone="info" label={t('console.reconnections.effectiveDue')} />
            ) : null}
          </div>
          <p
            className={`text-sm font-medium ${current.overdue ? 'text-danger-700' : 'text-text-secondary'}`}
          >
            {t(`console.reconnections.next.${current.nextAction}`)}
            {current.dueAt
              ? ` · ${t(
                  current.overdue
                    ? 'console.disconnections.dueOverdue'
                    : 'console.disconnections.dueBy',
                  { date: formatInstant(current.dueAt, i18n.language) },
                )}`
              : ''}
          </p>
          <div>
            <Link
              className={CONSOLE_SMALL}
              to={`/console/disconnections?view=reconnections&open=${encodeURIComponent(current.request.id)}`}
            >
              {t('console.reconnections.card.openInQueue')}
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-[1.6] text-text-secondary">
          {t('console.reconnections.card.none')}
        </p>
      )}

      {done ? (
        <p
          role="status"
          className="rounded-sm bg-success-100 px-4 py-3 text-sm font-medium text-success-700"
        >
          {done}
        </p>
      ) : null}

      {canStart && !starting ? (
        <div>
          <button
            type="button"
            className={CONSOLE_SECONDARY}
            onClick={() => {
              setDone(null)
              setStarting(true)
            }}
          >
            {t('console.reconnections.card.start')}
          </button>
        </div>
      ) : null}

      {canStart && starting ? (
        <StartReconnectionForm
          tenantId={tenantId}
          onCancel={() => setStarting(false)}
          onStarted={() => {
            setStarting(false)
            setDone(t('console.reconnections.card.started'))
            retry()
          }}
        />
      ) : null}
    </div>
  )
}

function StartReconnectionForm({
  tenantId,
  onCancel,
  onStarted,
}: {
  tenantId: string
  onCancel: () => void
  onStarted: () => void
}) {
  const { t } = useTranslation()
  const [askedVia, setAskedVia] = useState<ReconnectionAskedVia | ''>('')
  const [askedByName, setAskedByName] = useState('')
  const [day, setDay] = useState(muscatToday())
  const [time, setTime] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // A connect request seen on the portal names no person; a call or an e-mail does.
  const needsName = askedVia !== 'PORTAL_NOTICE'
  const ready =
    askedVia !== '' &&
    (!needsName || askedByName.trim() !== '') &&
    day !== '' &&
    isClockTime(time.trim())

  const start = async () => {
    if (!ready) return
    setBusy(true)
    setFailure(null)
    try {
      await startReconnection(tenantId, {
        askedVia,
        askedByName: askedByName.trim() || null,
        askedAt: muscatInstant(day, time.trim()),
        note: note.trim() || null,
      })
      onStarted()
    } catch (error) {
      setFailure(t(reconnectionRefusalKey(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="flex flex-col gap-5 rounded-sm border border-border-subtle p-4">
      <legend className="px-1 text-sm font-semibold text-text-primary">
        {t('console.reconnections.start.title')}
      </legend>
      <p className="text-sm leading-[1.6] text-text-secondary">
        {t('console.reconnections.start.note')}
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
          <span>{t('console.reconnections.start.via')}</span>
          <Select
            value={askedVia}
            onChange={(value) => setAskedVia(value as ReconnectionAskedVia)}
            ariaLabel={t('console.reconnections.start.via')}
            placeholder={t('console.disconnections.start.choose')}
            disabled={busy}
            options={VIA.map((value) => ({
              value,
              label: t(`console.reconnections.via.${value}`),
            }))}
          />
        </div>
        <Input
          bordered
          label={t(
            needsName
              ? 'console.disconnections.start.askedBy'
              : 'console.reconnections.start.askedByOptional',
          )}
          value={askedByName}
          maxLength={200}
          disabled={busy}
          onChange={(event) => setAskedByName(event.target.value)}
        />
        <MomentField
          id="reconnection-asked-time"
          label={t(
            askedVia === 'PORTAL_NOTICE'
              ? 'console.reconnections.start.seenAt'
              : 'console.disconnections.start.askedAt',
          )}
          day={day}
          time={time}
          onDay={setDay}
          onTime={setTime}
          disabled={busy}
        />
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
        {t('console.disconnections.form.note')}
        <textarea
          className="min-h-16 rounded-sm border border-border-default bg-white px-3 py-2"
          value={note}
          maxLength={500}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={CONSOLE_PRIMARY} disabled={!ready || busy} onClick={start}>
          {t('console.reconnections.start.submit')}
        </button>
        <button type="button" className={CONSOLE_SECONDARY} disabled={busy} onClick={onCancel}>
          {t('common.cancel')}
        </button>
      </div>
      {failure ? (
        <p
          role="alert"
          className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
        >
          {failure}
        </p>
      ) : null}
    </fieldset>
  )
}
