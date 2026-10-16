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
  DISCONNECTIONS_READ_PERMISSION,
  companyDisconnectionsPath,
  isClockTime,
  isLive,
  muscatInstant,
  muscatToday,
  refusalKey,
  startDisconnection,
  type AskedVia,
  type DisconnectionPath,
  type PlatformDisconnectionDto,
} from '../../../lib/console/fawtirDisconnections'
import { DISCONNECTION_STATUS_TONE } from './disconnectionTones'
import { MomentField } from './MomentField'

const PATHS: DisconnectionPath[] = [
  'ALREADY_DISCONNECTED',
  'ASK_FAWTIR',
  'MOVED_TO_ANOTHER_PROVIDER',
]
const VIA: AskedVia[] = ['CALL', 'EMAIL', 'TAX_AUTHORITY_NOTICE']

/**
 * "Disconnect from Fawtir" on a company's console page (Business Rules LV-2): where its latest
 * request stands, a link into the queue, and starting one for a customer who asked by phone or
 * e-mail, or recording a Tax Authority notice that it has already left. The operator records who
 * asked, how, when and why; operators never start one without a customer's request, so a notice
 * can never ask Fawtir to disconnect a company (the server refuses that too).
 */
export function TenantDisconnectionCard({ tenantId }: { tenantId: string }) {
  const { t, i18n } = useTranslation()
  const { entitlements } = useEntitlements()
  const canRead =
    entitlements !== null && hasPermission(entitlements, DISCONNECTIONS_READ_PERMISSION)
  const canManage =
    entitlements !== null && hasPermission(entitlements, DISCONNECTIONS_MANAGE_PERMISSION)
  const { read, retry } = useConsoleRead<PlatformDisconnectionDto[]>(
    canRead ? companyDisconnectionsPath(tenantId) : null,
  )
  const [starting, setStarting] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  if (!canRead) return null

  const frame = (children: React.ReactNode) => (
    <section
      aria-labelledby="tenant-disconnection"
      className="flex flex-col gap-4 rounded-sm bg-surface-card p-5"
    >
      <h2 id="tenant-disconnection" className="text-[17px] font-semibold text-text-primary">
        {t('console.disconnections.card.title')}
      </h2>
      {children}
    </section>
  )

  if (read.status === 'loading')
    return frame(<ConsoleNotice busy body={t('console.disconnections.loading')} />)
  if (read.status === 'failed')
    return frame(<ConsoleReadFailure error={read.error} retry={retry} />)

  const latest = read.data[0] ?? null
  // One request is live per company, and a company that has left cannot be asked to leave again.
  const canStart =
    canManage &&
    (!latest || (!isLive(latest.request.status) && latest.request.status !== 'DISCONNECTED'))

  return frame(
    <>
      {latest ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <ConsoleStatusPill
              tone={DISCONNECTION_STATUS_TONE[latest.request.status]}
              label={t(`console.disconnections.status.${latest.request.status}`)}
            />
            <p className="text-sm leading-[1.6] text-text-secondary">
              {t(`console.disconnections.path.${latest.request.path}`)} ·{' '}
              {t('console.disconnections.requestedOn', {
                date: formatInstant(latest.request.requestedAt, i18n.language),
              })}
            </p>
          </div>
          <p
            className={`text-sm font-medium ${latest.overdue ? 'text-danger-700' : 'text-text-secondary'}`}
          >
            {t(`console.disconnections.next.${latest.nextAction}`)}
            {latest.dueAt
              ? ` · ${t(
                  latest.overdue
                    ? 'console.disconnections.dueOverdue'
                    : 'console.disconnections.dueBy',
                  {
                    date: formatInstant(latest.dueAt, i18n.language),
                  },
                )}`
              : ''}
          </p>
          <div>
            <Link
              className={CONSOLE_SMALL}
              to={`/console/disconnections?open=${encodeURIComponent(latest.request.id)}`}
            >
              {t('console.disconnections.card.openInQueue')}
            </Link>
          </div>
        </div>
      ) : (
        <p className="text-sm leading-[1.6] text-text-secondary">
          {t('console.disconnections.card.none')}
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
            {t('console.disconnections.card.start')}
          </button>
        </div>
      ) : null}

      {canStart && starting ? (
        <StartForm
          tenantId={tenantId}
          onCancel={() => setStarting(false)}
          onStarted={() => {
            setStarting(false)
            setDone(t('console.disconnections.card.started'))
            retry()
          }}
        />
      ) : null}
    </>,
  )
}

function StartForm({
  tenantId,
  onCancel,
  onStarted,
}: {
  tenantId: string
  onCancel: () => void
  onStarted: () => void
}) {
  const { t } = useTranslation()
  const [path, setPath] = useState<DisconnectionPath | ''>('')
  const [askedVia, setAskedVia] = useState<AskedVia | ''>('')
  const [askedByName, setAskedByName] = useState('')
  const [day, setDay] = useState(muscatToday())
  const [time, setTime] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // A Tax Authority notice says the company has already left; it is never a request to leave.
  const viaOptions = VIA.filter((via) => !(path === 'ASK_FAWTIR' && via === 'TAX_AUTHORITY_NOTICE'))
  const ready =
    path !== '' &&
    askedVia !== '' &&
    viaOptions.includes(askedVia) &&
    askedByName.trim() !== '' &&
    day !== '' &&
    isClockTime(time.trim()) &&
    reason.trim() !== ''

  const start = async () => {
    if (!ready) return
    setBusy(true)
    setFailure(null)
    try {
      await startDisconnection(tenantId, {
        path,
        askedVia,
        askedByName: askedByName.trim(),
        askedAt: muscatInstant(day, time.trim()),
        reason: reason.trim(),
      })
      onStarted()
    } catch (error) {
      setFailure(t(refusalKey(error)))
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="flex flex-col gap-5 rounded-sm border border-border-subtle p-4">
      <legend className="px-1 text-sm font-semibold text-text-primary">
        {t('console.disconnections.start.title')}
      </legend>
      <p className="text-sm leading-[1.6] text-text-secondary">
        {t('console.disconnections.start.note')}
      </p>
      <div className="grid gap-5 md:grid-cols-2">
        <div className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
          <span>{t('console.disconnections.start.path')}</span>
          <Select
            value={path}
            onChange={(value) => {
              setPath(value as DisconnectionPath)
              if (value === 'ASK_FAWTIR' && askedVia === 'TAX_AUTHORITY_NOTICE') setAskedVia('')
            }}
            ariaLabel={t('console.disconnections.start.path')}
            placeholder={t('console.disconnections.start.choose')}
            disabled={busy}
            options={PATHS.map((value) => ({
              value,
              label: t(`console.disconnections.path.${value}`),
            }))}
          />
        </div>
        <div className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
          <span>{t('console.disconnections.start.via')}</span>
          <Select
            value={askedVia}
            onChange={(value) => setAskedVia(value as AskedVia)}
            ariaLabel={t('console.disconnections.start.via')}
            placeholder={t('console.disconnections.start.choose')}
            disabled={busy}
            options={viaOptions.map((value) => ({
              value,
              label: t(`console.disconnections.via.${value}`),
            }))}
          />
        </div>
        <Input
          label={t(
            askedVia === 'TAX_AUTHORITY_NOTICE'
              ? 'console.disconnections.start.noticeFrom'
              : 'console.disconnections.start.askedBy',
          )}
          value={askedByName}
          maxLength={200}
          disabled={busy}
          onChange={(event) => setAskedByName(event.target.value)}
        />
        <MomentField
          id="disconnection-asked-time"
          label={t('console.disconnections.start.askedAt')}
          day={day}
          time={time}
          onDay={setDay}
          onTime={setTime}
          disabled={busy}
        />
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
        {t('console.disconnections.start.reason')}
        <textarea
          className="min-h-16 rounded-sm border border-border-default bg-white px-3 py-2"
          value={reason}
          maxLength={500}
          disabled={busy}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="button" className={CONSOLE_PRIMARY} disabled={!ready || busy} onClick={start}>
          {t('console.disconnections.start.submit')}
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
