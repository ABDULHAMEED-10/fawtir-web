import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Input, Select } from '../../../components/ui'
import { ConsoleNotice, ConsoleReadFailure } from '../../../layouts/ConsoleShell/ConsoleNotice'
import { ConsoleStatusPill } from '../../../layouts/ConsoleShell/ConsoleStatusPill'
import { useConsoleRead } from '../../../layouts/ConsoleShell/useConsoleRead'
import {
  CONSOLE_CARD,
  CONSOLE_PRIMARY,
  CONSOLE_SMALL,
} from '../../../layouts/ConsoleShell/consoleStyle'
import { useEntitlements } from '../../../hooks/useEntitlements'
import { hasPermission } from '../../../lib/identity/entitlements'
import { formatInstant } from '../../../lib/format'
import {
  DISCONNECTIONS_MANAGE_PERMISSION,
  isClockTime,
  muscatInstant,
  muscatToday,
} from '../../../lib/console/fawtirDisconnections'
import {
  reconnectionPath,
  reconnectionQueuePath,
  reconnectionRefusalKey,
  reconnectionStepsOffered,
  recordReconnectionStep,
  type PlatformReconnectionDto,
  type ReconnectionQueueItemDto,
  type RecordableReconnectionStep,
  type RecordReconnectionStep,
} from '../../../lib/console/fawtirReconnections'
import { RECONNECTION_STATUS_TONE } from './disconnectionTones'
import { Due, Fact, SmpRecordLine, stepActor } from './disconnectionParts'
import { MomentField } from './MomentField'
import { SmpCallAction, smpPanelOn, smpStepByHand, useSmpCallStatus } from './SmpCallAction'

/**
 * Console › Disconnections, Reconnections view (plan v4 §10; FC-1): companies coming back to
 * Fawtir after they left, what support does next and by when. Accepting on the Fawtara Portal has
 * no deadline in the plan; adding the company back to the Oman SMP is due 3 Oman business days
 * after the acceptance (manual 7.5.1). Both are done outside the console and recorded here: the
 * SMP add itself is not a console action yet.
 */
export function ReconnectionQueueBody({
  openOnly,
  selected,
  select,
}: {
  openOnly: boolean
  selected: string | null
  select: (id: string | null) => void
}) {
  const { t, i18n } = useTranslation()
  const { read, retry } = useConsoleRead<ReconnectionQueueItemDto[]>(
    reconnectionQueuePath(openOnly),
  )

  let list: ReactNode
  if (read.status === 'loading') {
    list = <ConsoleNotice busy body={t('console.disconnections.loading')} />
  } else if (read.status === 'failed') {
    list = <ConsoleReadFailure error={read.error} retry={retry} />
  } else if (read.data.length === 0) {
    list = (
      <p className="rounded-sm bg-surface-card px-6 py-12 text-center text-sm font-medium text-text-tertiary">
        {t(openOnly ? 'console.reconnections.emptyOpen' : 'console.reconnections.empty')}
      </p>
    )
  } else {
    list = (
      <div className={`${CONSOLE_CARD} overflow-x-auto`}>
        <table className="w-full min-w-[760px] text-start text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.6px] text-text-muted">
              <th className="px-4 py-3 text-start">{t('console.disconnections.col.company')}</th>
              <th className="px-4 py-3 text-start">{t('console.reconnections.col.origin')}</th>
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
                  {t(`console.disconnections.origin.${row.origin}`)}
                </td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap items-center gap-2">
                    <ConsoleStatusPill
                      tone={RECONNECTION_STATUS_TONE[row.status]}
                      label={t(`console.reconnections.status.${row.status}`)}
                    />
                    {row.effectiveDue ? (
                      <ConsoleStatusPill
                        tone="info"
                        label={t('console.reconnections.effectiveDue')}
                      />
                    ) : null}
                  </span>
                </td>
                <td className="px-4 py-3 text-text-secondary">
                  {t(`console.reconnections.next.${row.nextAction}`)}
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
    <>
      {list}
      {selected ? (
        <ReconnectionPanel
          key={selected}
          reconnectionId={selected}
          companyName={
            read.status === 'ready'
              ? (read.data.find((row) => row.id === selected)?.companyName ?? null)
              : null
          }
          onRecorded={retry}
          onClose={() => select(null)}
        />
      ) : null}
    </>
  )
}

function ReconnectionPanel({
  reconnectionId,
  companyName,
  onRecorded,
  onClose,
}: {
  reconnectionId: string
  companyName: string | null
  onRecorded: () => void
  onClose: () => void
}) {
  const { t, i18n } = useTranslation()
  const { entitlements } = useEntitlements()
  const canManage =
    entitlements !== null && hasPermission(entitlements, DISCONNECTIONS_MANAGE_PERMISSION)
  const { read, retry } = useConsoleRead<PlatformReconnectionDto>(reconnectionPath(reconnectionId))
  const [done, setDone] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const smp = useSmpCallStatus(
    read.status === 'ready' ? read.data.request.tenantId : null,
    'ADDITION',
    reconnectionId,
  )
  const [callRefused, setCallRefused] = useState(false)

  if (read.status === 'loading')
    return <ConsoleNotice busy body={t('console.disconnections.loading')} />
  if (read.status === 'failed') return <ConsoleReadFailure error={read.error} retry={retry} />
  const view = read.data
  const { request } = view
  const at = (iso: string | null) => (iso ? formatInstant(iso, i18n.language) : null)
  // With the console's SMP call or support's record on, the add is made or recorded in the SMP box;
  // the bare step by hand only as the fallback (smpStepByHand).
  const smpShown = smpPanelOn(smp.read)
  const offered = reconnectionStepsOffered(view).filter(
    (step) => step !== 'SMP_ADDED' || smpStepByHand(smp.read, callRefused),
  )

  return (
    <section
      aria-labelledby="reconnection-panel"
      className={`${CONSOLE_CARD} flex flex-col gap-5 p-5`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="reconnection-panel" className="text-lg font-semibold text-text-primary">
          {companyName ? `${companyName} · ` : ''}
          {t('console.reconnections.panelTitle')}
        </h2>
        <div className="flex items-center gap-3">
          <ConsoleStatusPill
            tone={RECONNECTION_STATUS_TONE[request.status]}
            label={t(`console.reconnections.status.${request.status}`)}
          />
          <button type="button" className={CONSOLE_SMALL} onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-1 rounded-sm bg-surface-background px-4 py-3">
        <p className="text-sm font-semibold text-text-primary">
          {t(`console.reconnections.next.${view.nextAction}`)}
        </p>
        {view.dueAt ? (
          <p
            className={`text-sm font-medium ${view.overdue ? 'text-danger-700' : 'text-text-secondary'}`}
          >
            {t(
              view.overdue ? 'console.disconnections.dueOverdue' : 'console.disconnections.dueBy',
              { date: at(view.dueAt) },
            )}
          </p>
        ) : null}
        {view.nextAction === 'ADD_TO_SMP' && !smpShown ? (
          <p className="text-sm font-medium text-text-secondary">
            {t('console.reconnections.smpOutside')}
          </p>
        ) : null}
        {view.effectiveDue ? (
          <p className="text-sm font-medium text-text-secondary">
            {t('console.reconnections.effectiveDueNote')}
          </p>
        ) : null}
      </div>

      <dl className="grid gap-x-6 gap-y-3 md:grid-cols-3">
        <Fact label={t('console.disconnections.fact.requested')} value={at(request.requestedAt)} />
        <Fact
          label={t('console.disconnections.fact.origin')}
          value={t(`console.disconnections.origin.${request.origin}`)}
        />
        {request.askedVia ? (
          <Fact
            label={t('console.reconnections.fact.askedVia')}
            value={request.askedByName ?? t(`console.reconnections.via.${request.askedVia}`)}
            note={[
              request.askedByName ? t(`console.reconnections.via.${request.askedVia}`) : null,
              at(request.askedAt),
            ]
              .filter(Boolean)
              .join(' · ')}
          />
        ) : null}
        {request.note ? (
          <Fact label={t('console.reconnections.fact.note')} value={request.note} />
        ) : null}
        <Fact label={t('console.reconnections.fact.accepted')} value={at(request.acceptedAt)} />
        <Fact
          label={t('console.reconnections.fact.effectiveFrom')}
          value={at(request.effectiveFrom)}
        />
        <Fact label={t('console.reconnections.fact.connected')} value={at(request.connectedAt)} />
        <Fact label={t('console.reconnections.fact.smpDue')} value={at(request.smpAddDueAt)} />
        <Fact label={t('console.reconnections.fact.smpAdded')} value={at(request.smpAddedAt)} />
        {request.notCompletedReason ? (
          <Fact
            label={t('console.disconnections.fact.notCompleted')}
            value={t(`console.reconnections.notCompleted.${request.notCompletedReason}`)}
            note={request.declineReason ?? undefined}
          />
        ) : null}
        {request.status === 'CONNECTED' ? (
          <Fact
            label={t('console.reconnections.fact.subscription')}
            value={t(
              request.subscriptionResumed
                ? 'console.reconnections.subscriptionResumed'
                : 'console.reconnections.subscriptionUnchanged',
            )}
          />
        ) : null}
      </dl>

      {smpShown && smp.read.status === 'ready' ? (
        <SmpCallAction
          tenantId={request.tenantId}
          kind="ADDITION"
          linkId={request.id}
          status={smp.read.data}
          open={view.nextAction === 'ADD_TO_SMP'}
          canManage={canManage}
          minDay={request.acceptedAt ? muscatToday(new Date(request.acceptedAt)) : undefined}
          onRefused={() => setCallRefused(true)}
          refresh={smp.retry}
          onChanged={() => {
            onRecorded()
            retry()
          }}
        />
      ) : null}

      {canManage && offered.length > 0 ? (
        <ReconnectionStepForm
          key={`${request.status}-${request.version}`}
          reconnectionId={request.id}
          offered={offered}
          onSending={() => {
            setDone(null)
            setFailure(null)
          }}
          onAnswered={(message, refused) => {
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
                  {t(`console.reconnections.step.${step.step}`)}
                </span>
                <span className="text-sm text-text-secondary">{at(step.occurredAt)}</span>
              </span>
              <span className="text-xs text-text-tertiary">
                {stepActor(t, step)}
                {step.recordedAt !== step.occurredAt
                  ? ` · ${t('console.disconnections.recordedOn', { date: at(step.recordedAt) })}`
                  : ''}
              </span>
              {step.reference ? (
                <span className="text-xs text-text-secondary">
                  {t('console.disconnections.reference')}: <span dir="ltr">{step.reference}</span>
                </span>
              ) : null}
              <SmpRecordLine step={step} />
              {step.note ? <span className="text-xs text-text-secondary">{step.note}</span> : null}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

function ReconnectionStepForm({
  reconnectionId,
  offered,
  onSending,
  onAnswered,
}: {
  reconnectionId: string
  offered: RecordableReconnectionStep[]
  onSending: () => void
  onAnswered: (message: string, refused: boolean) => void
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState<RecordableReconnectionStep>(offered[0])
  const [day, setDay] = useState(muscatToday())
  const [time, setTime] = useState('')
  const [effectiveDay, setEffectiveDay] = useState('')
  const [effectiveTime, setEffectiveTime] = useState('')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [declineReason, setDeclineReason] = useState('')
  const [busy, setBusy] = useState(false)

  const accepting = step === 'PORTAL_CONNECTION_ACCEPTED'
  const declining = step === 'CONNECTION_DECLINED'
  // The effective date is optional: left empty, the connection takes effect at the acceptance.
  const effectiveReady = !accepting || effectiveDay === '' || isClockTime(effectiveTime.trim())
  const ready =
    day !== '' &&
    isClockTime(time.trim()) &&
    effectiveReady &&
    (!declining || declineReason.trim() !== '')

  const record = async () => {
    setBusy(true)
    onSending()
    const body: RecordReconnectionStep = {
      step,
      occurredAt: muscatInstant(day, time.trim()),
      reference: reference.trim() || null,
      note: note.trim() || null,
    }
    if (accepting && effectiveDay !== '') {
      body.effectiveFrom = muscatInstant(effectiveDay, effectiveTime.trim())
    }
    if (declining) body.declineReason = declineReason.trim()
    try {
      await recordReconnectionStep(reconnectionId, body)
      onAnswered(
        t('console.disconnections.recorded', { step: t(`console.reconnections.step.${step}`) }),
        false,
      )
    } catch (error) {
      onAnswered(t(reconnectionRefusalKey(error)), true)
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
          onChange={(value) => setStep(value as RecordableReconnectionStep)}
          ariaLabel={t('console.disconnections.form.step')}
          disabled={busy}
          options={offered.map((value) => ({
            value,
            label: t(`console.reconnections.record.${value}`),
          }))}
        />
        <span className="text-xs font-normal text-text-tertiary">
          {t(`console.reconnections.recordHint.${step}`)}
        </span>
      </div>
      <MomentField
        id="reconnection-step-time"
        label={t('console.disconnections.form.occurredAt')}
        day={day}
        time={time}
        onDay={setDay}
        onTime={setTime}
        disabled={busy}
      />
      {accepting ? (
        <MomentField
          id="reconnection-effective-time"
          label={t('console.reconnections.form.effectiveFrom')}
          day={effectiveDay}
          time={effectiveTime}
          onDay={setEffectiveDay}
          onTime={setEffectiveTime}
          disabled={busy}
          future
          noteKey="console.reconnections.form.effectiveNote"
        />
      ) : null}
      {declining ? (
        <div className="flex flex-col gap-1">
          <label className="flex flex-col gap-1 text-sm font-medium text-text-secondary">
            {t('console.reconnections.form.declineReason')}
            <textarea
              className="min-h-16 rounded-sm border border-border-default bg-white px-3 py-2"
              value={declineReason}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setDeclineReason(event.target.value)}
            />
          </label>
          <span className="text-xs text-text-tertiary">
            {t('console.reconnections.form.declineNote')}
          </span>
        </div>
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
