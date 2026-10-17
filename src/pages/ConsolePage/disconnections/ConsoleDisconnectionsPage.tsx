import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { Input, Select } from '../../../components/ui'
import { ConsoleShell } from '../../../layouts/ConsoleShell'
import { ConsoleBreadcrumbs } from '../../../layouts/ConsoleShell/ConsoleBreadcrumbs'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_CARD,
  CONSOLE_PAGE,
  CONSOLE_PRIMARY,
  CONSOLE_SMALL,
  CONSOLE_TAB_LINE,
  ConsolePageHeader,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { consoleTab } from '../../../layouts/ConsoleShell/consoleTones'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { hasPermission } from '../../../lib/identity/entitlements'
import { formatDate, formatInstant } from '../../../lib/format'
import {
  DISCONNECTIONS_MANAGE_PERMISSION,
  DISCONNECTIONS_READ_PERMISSION,
  disconnectionPath,
  isClockTime,
  muscatInstant,
  muscatToday,
  queuePath,
  recordDisconnectionStep,
  refusalKey,
  stepNeedsDate,
  stepsOffered,
  type DisconnectionQueueItemDto,
  type PlatformDisconnectionDto,
  type RecordStep,
} from '../../../lib/console/fawtirDisconnections'
import { DISCONNECTION_STATUS_TONE } from './disconnectionTones'
import { MomentField } from './MomentField'

/**
 * Platform support's disconnection queue (Business Rules LV-2 to LV-4, LV-7, FC-1; plan v4 §10,
 * "Console"): every request with its path, what support has to do next and by when, overdue ones
 * flagged. Opening one shows its facts and its step history, and lets support record what it did
 * or saw on the Fawtara Portal and the Oman SMP. The Fawtara Portal has no API, so nothing here
 * acts on the portal: it records.
 *
 * Only the steps that can follow the request's state are offered, as the server allows; the
 * server still decides, and after any answer the request and the queue are read again.
 */
export function ConsoleDisconnectionsPage() {
  return (
    <ConsoleShell requires={DISCONNECTIONS_READ_PERMISSION}>
      <DisconnectionQueue />
    </ConsoleShell>
  )
}

function DisconnectionQueue() {
  const { t, i18n } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [openOnly, setOpenOnly] = useState(true)
  const { read, retry } = useConsoleRead<DisconnectionQueueItemDto[]>(queuePath(openOnly))
  const selected = searchParams.get('open')
  const select = (id: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (id) next.set('open', id)
    else next.delete('open')
    setSearchParams(next, { replace: true })
  }

  let body: ReactNode
  if (read.status === 'loading') {
    body = <ConsoleNotice busy body={t('console.disconnections.loading')} />
  } else if (read.status === 'failed') {
    body = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (read.data.length === 0) {
    body = (
      <p className="rounded-sm bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t(openOnly ? 'console.disconnections.emptyOpen' : 'console.disconnections.empty')}
      </p>
    )
  } else {
    body = (
      <div className={`${CONSOLE_CARD} overflow-x-auto`}>
        <table className="w-full min-w-[760px] text-start text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.6px] text-text-muted">
              <th className="px-4 py-3 text-start">{t('console.disconnections.col.company')}</th>
              <th className="px-4 py-3 text-start">{t('console.disconnections.col.path')}</th>
              <th className="px-4 py-3 text-start">{t('console.disconnections.col.status')}</th>
              <th className="px-4 py-3 text-start">{t('console.disconnections.col.next')}</th>
              <th className="px-4 py-3 text-start">{t('console.disconnections.col.due')}</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {read.data.map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-3 font-medium text-text-primary">
                  {row.companyName ?? row.tenantId}
                  <span className="block text-xs font-normal text-text-tertiary">
                    {t('console.disconnections.requestedOn', {
                      date: formatInstant(row.requestedAt, i18n.language),
                    })}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {t(`console.disconnections.path.${row.path}`)}
                  <span className="block text-xs text-text-tertiary">
                    {t(`console.disconnections.origin.${row.origin}`)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <ConsoleStatusPill
                    tone={DISCONNECTION_STATUS_TONE[row.status]}
                    label={t(`console.disconnections.status.${row.status}`)}
                  />
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {t(`console.disconnections.next.${row.nextAction}`)}
                </td>
                <td className="px-4 py-3">
                  <Due dueAt={row.dueAt} overdue={row.overdue} />
                </td>
                <td className="px-4 py-3 text-end">
                  <button type="button" className={CONSOLE_SMALL} onClick={() => select(row.id)}>
                    {t('console.disconnections.open')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={CONSOLE_PAGE}>
      <ConsoleBreadcrumbs items={[{ labelKey: 'console.nav.disconnections' }]} />
      <ConsolePageHeader
        title={t('console.disconnections.title')}
        subtitle={t('console.disconnections.subtitle')}
      />
      <div className="flex flex-wrap gap-x-6 rounded-sm bg-surface-card px-5">
        {([true, false] as const).map((only) => {
          const active = only === openOnly
          return (
            <button
              key={String(only)}
              type="button"
              aria-pressed={active}
              className={consoleTab(active)}
              onClick={() => setOpenOnly(only)}
            >
              {t(only ? 'console.disconnections.tab.open' : 'console.disconnections.tab.all')}
              {active ? <span className={CONSOLE_TAB_LINE} /> : null}
            </button>
          )
        })}
      </div>
      {body}
      {selected ? (
        <DisconnectionPanel
          key={selected}
          disconnectionId={selected}
          companyName={
            read.status === 'ready'
              ? (read.data.find((row) => row.id === selected)?.companyName ?? null)
              : null
          }
          onRecorded={retry}
          onClose={() => select(null)}
        />
      ) : null}
    </div>
  )
}

function Due({ dueAt, overdue }: { dueAt: string | null; overdue: boolean }) {
  const { t, i18n } = useTranslation()
  if (!dueAt)
    return <span className="text-text-tertiary">{t('console.disconnections.noDeadline')}</span>
  return (
    <span className="flex flex-wrap items-center gap-2 text-text-secondary">
      {formatInstant(dueAt, i18n.language)}
      {overdue ? (
        <ConsoleStatusPill tone="danger" label={t('console.disconnections.overdue')} />
      ) : null}
    </span>
  )
}

function DisconnectionPanel({
  disconnectionId,
  companyName,
  onRecorded,
  onClose,
}: {
  disconnectionId: string
  /** From the queue row, when the request is listed there; the request itself carries only its id. */
  companyName: string | null
  onRecorded: () => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { entitlements } = useEntitlements()
  const canManage =
    entitlements !== null && hasPermission(entitlements, DISCONNECTIONS_MANAGE_PERMISSION)
  const { read, retry } = useConsoleRead<PlatformDisconnectionDto>(
    disconnectionPath(disconnectionId),
  )
  const [done, setDone] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  if (read.status === 'loading')
    return <ConsoleNotice busy body={t('console.disconnections.loading')} />
  if (read.status === 'failed') return <ConsoleReadFailure error={read.error} retry={retry} />
  const view = read.data
  const { request } = view
  const at = (iso: string | null) => (iso ? formatInstant(iso, i18n.language) : null)
  const offered = stepsOffered(view)

  return (
    <section
      aria-labelledby="disconnection-panel"
      className={`${CONSOLE_CARD} flex flex-col gap-5 p-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="disconnection-panel" className="text-lg font-semibold text-text-primary">
          {companyName ? `${companyName} · ` : ''}
          {t(`console.disconnections.path.${request.path}`)}
        </h2>
        <div className="flex items-center gap-3">
          <ConsoleStatusPill
            tone={DISCONNECTION_STATUS_TONE[request.status]}
            label={t(`console.disconnections.status.${request.status}`)}
          />
          <button type="button" className={CONSOLE_SMALL} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-sm bg-surface-background px-4 py-3">
        <p className="text-sm font-semibold text-text-primary">
          {t(`console.disconnections.next.${view.nextAction}`)}
        </p>
        {view.dueAt ? (
          <p
            className={`text-sm font-medium ${view.overdue ? 'text-danger-700' : 'text-text-secondary'}`}
          >
            {t(
              view.overdue ? 'console.disconnections.dueOverdue' : 'console.disconnections.dueBy',
              {
                date: at(view.dueAt),
              },
            )}
          </p>
        ) : null}
        {view.approvalExpired ? (
          <p className="text-sm font-medium text-text-secondary">
            {t('console.disconnections.approvalLapsed')}
          </p>
        ) : null}
      </div>

      <dl className="grid gap-x-6 gap-y-3 md:grid-cols-3">
        <Fact label={t('console.disconnections.fact.requested')} value={at(request.requestedAt)} />
        <Fact
          label={t('console.disconnections.fact.origin')}
          value={t(`console.disconnections.origin.${request.origin}`)}
        />
        {request.askedByName ? (
          <Fact
            label={t('console.disconnections.fact.askedBy')}
            value={request.askedByName}
            note={[
              request.askedVia ? t(`console.disconnections.via.${request.askedVia}`) : null,
              at(request.askedAt),
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ) : null}
        {request.reason ? (
          <Fact label={t('console.disconnections.fact.reason')} value={request.reason} />
        ) : null}
        {request.confirmedCompanyName ? (
          <Fact
            label={t('console.disconnections.fact.typedName')}
            value={request.confirmedCompanyName}
          />
        ) : null}
        <Fact
          label={t('console.disconnections.fact.portalRaised')}
          value={at(request.portalRequestRaisedAt)}
        />
        <Fact
          label={t('console.disconnections.fact.approvalDue')}
          value={at(request.approvalDueAt)}
        />
        <Fact
          label={t('console.disconnections.fact.disconnected')}
          value={at(request.disconnectedAt)}
        />
        <Fact label={t('console.disconnections.fact.smpDue')} value={at(request.smpRemovalDueAt)} />
        <Fact
          label={t('console.disconnections.fact.smpRemoved')}
          value={at(request.smpRemovedAt)}
        />
        {request.notCompletedReason ? (
          <Fact
            label={t('console.disconnections.fact.notCompleted')}
            value={t(`console.disconnections.notCompleted.${request.notCompletedReason}`)}
          />
        ) : null}
        {request.portalWithdrawnAt ? (
          <Fact
            label={t('console.disconnections.fact.portalWithdrawn')}
            value={at(request.portalWithdrawnAt)}
          />
        ) : null}
        {request.subscriptionEndsOn ? (
          <Fact
            label={t('console.disconnections.fact.subscriptionEnds')}
            value={formatDate(request.subscriptionEndsOn, i18n.language)}
          />
        ) : null}
      </dl>

      {canManage && offered.length > 0 ? (
        <StepForm
          key={`${request.status}-${request.version}`}
          disconnectionId={request.id}
          offered={offered}
          onSending={() => {
            setDone(null)
            setFailure(null)
          }}
          onAnswered={(message, refused) => {
            // Either way the request may have moved: read it and the queue again.
            if (refused) setFailure(message)
            else setDone(message)
            onRecorded()
            retry()
          }}
        />
      ) : null}

      {failure ? (
        <p
          role="alert"
          className="rounded-sm bg-danger-100 px-4 py-3 text-sm font-medium text-danger-700"
        >
          {failure}
        </p>
      ) : null}
      {done ? (
        <p
          role="status"
          className="rounded-sm bg-success-100 px-4 py-3 text-sm font-medium text-success-700"
        >
          {done}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-base font-semibold text-text-primary">
          {t('console.disconnections.history')}
        </h3>
        <ol className="flex flex-col">
          {view.steps.map((step, index) => (
            <li
              key={step.id}
              className={[
                'flex flex-col gap-0.5 py-2',
                index < view.steps.length - 1 ? 'border-b border-border-subtle' : '',
              ].join(' ')}
            >
              <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <span className="text-sm font-medium text-text-primary">
                  {t(`console.disconnections.step.${step.step}`)}
                </span>
                <span className="text-sm text-text-secondary">{at(step.occurredAt)}</span>
              </span>
              <span className="text-xs text-text-tertiary">
                {t(`console.disconnections.actor.${step.actorType}`)}
                {step.recordedAt !== step.occurredAt
                  ? ` · ${t('console.disconnections.recordedOn', { date: at(step.recordedAt) })}`
                  : ''}
              </span>
              {step.reference ? (
                <span className="text-xs text-text-secondary">
                  {t('console.disconnections.reference')}: <span dir="ltr">{step.reference}</span>
                </span>
              ) : null}
              {step.note ? <span className="text-xs text-text-secondary">{step.note}</span> : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function StepForm({
  disconnectionId,
  offered,
  onSending,
  onAnswered,
}: {
  disconnectionId: string
  offered: RecordStep['step'][]
  onSending: () => void
  /** The sentence to show; `refused` when the server said no. */
  onAnswered: (message: string, refused: boolean) => void
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState<RecordStep['step']>(offered[0])
  const [day, setDay] = useState(muscatToday())
  const [time, setTime] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const dated = stepNeedsDate(step)
  const ready = !dated || (day !== '' && isClockTime(time.trim()))

  const record = async () => {
    setBusy(true)
    onSending()
    try {
      await recordDisconnectionStep(disconnectionId, {
        step,
        // An expiry is dated by the portal's own 3 days; the server takes the deadline itself.
        occurredAt: dated ? muscatInstant(day, time.trim()) : new Date().toISOString(),
        reference: reference.trim() || null,
        note: note.trim() || null,
      })
      onAnswered(
        t('console.disconnections.recorded', { step: t(`console.disconnections.step.${step}`) }),
        false,
      )
    } catch (error) {
      onAnswered(t(refusalKey(error)), true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <fieldset className="flex flex-col gap-4 rounded-sm border border-border-subtle p-4">
      <legend className="px-1 text-sm font-semibold text-text-primary">
        {t('console.disconnections.form.title')}
      </legend>
      <div className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
        <span>{t('console.disconnections.form.step')}</span>
        <Select
          value={step}
          onChange={(value) => setStep(value as RecordStep['step'])}
          ariaLabel={t('console.disconnections.form.step')}
          disabled={busy}
          options={offered.map((value) => ({
            value,
            label: t(`console.disconnections.record.${value}`),
          }))}
        />
        <span className="text-xs font-normal text-text-tertiary">
          {t(`console.disconnections.recordHint.${step}`)}
        </span>
      </div>
      {dated ? (
        <MomentField
          id="disconnection-step-time"
          label={t('console.disconnections.form.occurredAt')}
          day={day}
          time={time}
          onDay={setDay}
          onTime={setTime}
          disabled={busy}
        />
      ) : null}
      <div className="grid gap-5 md:grid-cols-2">
        <Input
          bordered
          label={t('console.disconnections.form.reference')}
          value={reference}
          maxLength={200}
          dir="ltr"
          disabled={busy}
          onChange={(event) => setReference(event.target.value)}
        />
        <Input
          bordered
          label={t('console.disconnections.form.note')}
          value={note}
          maxLength={500}
          disabled={busy}
          onChange={(event) => setNote(event.target.value)}
        />
      </div>
      <div>
        <button
          type="button"
          className={CONSOLE_PRIMARY}
          disabled={!ready || busy}
          onClick={record}
        >
          {t('console.disconnections.form.record')}
        </button>
      </div>
    </fieldset>
  )
}

function Fact({ label, value, note }: { label: string; value: ReactNode | null; note?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-semibold uppercase tracking-[0.6px] text-text-muted">{label}</dt>
      <dd className="break-words text-sm font-semibold text-text-primary">
        {value ?? (
          <span className="font-medium text-text-tertiary">
            {t('console.disconnections.notYet')}
          </span>
        )}
      </dd>
      {note ? <dd className="text-xs font-medium text-text-tertiary">{note}</dd> : null}
    </div>
  )
}
