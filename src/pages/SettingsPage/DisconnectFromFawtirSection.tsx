import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router-dom'
import { useApiRead } from '../../hooks'
import { useEntitlements } from '../../hooks/useEntitlements'
import { formatDate, formatInstantDay } from '../../lib/format'
import { Button, Input, Modal } from '../../components/ui'
import { ApiReadFailure, LoadingNotice } from '../../components/feedback/ApiNotice'
import { ApiError } from '../../api'
import {
  FAWTIR_DISCONNECTION_PATH,
  loadFawtirDisconnection,
  requestFawtirDisconnection,
  requestFawtirReconnection,
  withdrawFawtirDisconnection,
  withdrawFawtirReconnection,
  type CompanyDisconnectionDto,
  type DisconnectionAnswer,
  type DisconnectionStatus,
  type ReconnectionStatus,
} from '../../api/settings/fawtirDisconnection'
import {
  canSeeDisconnection,
  currentReconnection,
  disconnectionStanding,
  reconnectionStanding,
  renewalNeeded,
  showsComingBack,
} from '../../lib/fawtirDisconnection'

const STATUS_TONE: Record<DisconnectionStatus, string> = {
  REQUESTED: 'bg-pending-100 text-pending-700',
  WAITING_FOR_CUSTOMER_APPROVAL: 'bg-pending-100 text-pending-700',
  DISCONNECTED: 'bg-danger-100 text-danger-700',
  NOT_COMPLETED: 'bg-primary-25 text-primary-800',
  WITHDRAWN: 'bg-primary-25 text-primary-800',
}

const RECONNECTION_TONE: Record<ReconnectionStatus, string> = {
  REQUESTED: 'bg-pending-100 text-pending-700',
  ACCEPTED: 'bg-pending-100 text-pending-700',
  CONNECTED: 'bg-success-100 text-success-700',
  NOT_COMPLETED: 'bg-primary-25 text-primary-800',
  WITHDRAWN: 'bg-primary-25 text-primary-800',
}

const ANSWERS: DisconnectionAnswer[] = ['ALREADY_DISCONNECTED', 'ASK_FAWTIR', 'MOVING_TO_ANOTHER_PROVIDER']

/** A refusal's slug to the sentence this card shows; the server's English `detail` never is. */
function failureKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.problemType === 'admin-authority-required') return 'fawtirDisconnection.error.notOwner'
    if (error.problemType === 'impersonation-not-allowed') return 'fawtirDisconnection.error.impersonating'
    if (error.problemType === 'disconnection-state-conflict') return 'fawtirDisconnection.error.changed'
    if (error.status === 400) return 'fawtirDisconnection.error.nameMismatch'
    if (error.status === 403) return 'fawtirDisconnection.error.notOwner'
  }
  return 'fawtirDisconnection.error.failed'
}

/**
 * Settings › Company profile, danger zone: "Disconnect from Fawtir" (Business Rules LV-1 to LV-7,
 * plan v4 §10). Only the owner or an Administrator sees it (LV-1). The screen first asks whether
 * the company has already disconnected on the Fawtara Portal (LV-3), warns before confirming
 * (LV-5), and confirms by typing the company name (LV-1). The status line shows each step with its
 * date (LV-7), and a request that has not completed can be withdrawn (LV-4).
 *
 * Once disconnected, "Coming back to Fawtir" (plan v4 §10) tells Fawtir the company chose it again
 * on the Fawtara Portal and shows where that stands; it shows only while the server offers it
 * (`canReconnect`, off with `FAWTIR_RECONNECTION_ENABLED`) or a request to come back exists.
 */
export function DisconnectFromFawtirSection() {
  const { entitlements } = useEntitlements()
  const allowed = canSeeDisconnection(entitlements)
  if (!allowed) return null
  return <DangerZone />
}

function DangerZone() {
  const { t, i18n } = useTranslation()
  const { read, retry } = useApiRead<CompanyDisconnectionDto>(
    FAWTIR_DISCONNECTION_PATH,
    loadFawtirDisconnection,
  )
  const [latest, setLatest] = useState<CompanyDisconnectionDto | null>(null)
  const [asking, setAsking] = useState(false)
  const [withdrawing, setWithdrawing] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const day = (iso: string | null) => (iso ? formatInstantDay(iso, i18n.language) : '')
  // Opened from a billing screen's "reconnect before paying" note (A3.8): bring the card into view.
  const { hash } = useLocation()
  useEffect(() => {
    if (hash === '#danger-zone' && read.status === 'ready') {
      document.getElementById('danger-zone')?.scrollIntoView?.({ block: 'start' })
    }
  }, [hash, read.status])

  let body
  if (read.status === 'loading') {
    body = <LoadingNotice />
  } else if (read.status === 'failed') {
    body = <ApiReadFailure error={read.error} retry={retry} />
  } else {
    const view = latest ?? read.data
    const request = view.request
    const standing = request ? disconnectionStanding(request) : null

    const withdraw = async () => {
      setWithdrawing(true)
      setFailure(null)
      try {
        setLatest(await withdrawFawtirDisconnection())
      } catch (error) {
        setFailure(failureKey(error))
        if (error instanceof ApiError && error.problemType === 'disconnection-state-conflict') {
          await reload(setLatest)
        }
      } finally {
        setWithdrawing(false)
      }
    }

    body = (
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h4 className="text-base font-semibold text-text-primary">{t('fawtirDisconnection.title')}</h4>
          <p className="text-sm font-medium leading-[1.6] text-text-tertiary">
            {t('fawtirDisconnection.intro')}
          </p>
        </div>

        {request && standing ? (
          <div className="flex flex-col gap-4 rounded-sm bg-surface-background px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span
                className={[
                  'rounded-full px-3 py-1 text-xs font-semibold',
                  STATUS_TONE[standing.pill],
                ].join(' ')}
              >
                {t(`fawtirDisconnection.status.${standing.pill}`)}
              </span>
              <p role="status" className="min-w-0 flex-1 text-sm font-medium leading-[1.6] text-text-secondary">
                {t(`fawtirDisconnection.line.${standing.line}`, { date: day(standing.dateAt) })}
              </p>
            </div>

            {request.origin === 'CONSOLE' && request.askedVia !== 'TAX_AUTHORITY_NOTICE' ? (
              <p className="text-xs font-medium text-text-tertiary">
                {t(
                  request.askedVia === 'EMAIL'
                    ? 'fawtirDisconnection.onYourBehalfEmail'
                    : 'fawtirDisconnection.onYourBehalfCall',
                )}
              </p>
            ) : null}
            {request.origin === 'CONSOLE' && request.askedVia === 'TAX_AUTHORITY_NOTICE' ? (
              <p className="text-xs font-medium text-text-tertiary">
                {t('fawtirDisconnection.fromNotice')}
              </p>
            ) : null}

            {/* Once back, these are no longer true; the disconnection stays as history. */}
            {request.status === 'DISCONNECTED' && !view.connected ? (
              <ul className="flex list-disc flex-col gap-1 ps-5 text-sm font-medium leading-[1.6] text-text-secondary">
                {request.subscriptionEndsOn ? (
                  <li>
                    {t('fawtirDisconnection.after.subscription', {
                      date: formatDate(request.subscriptionEndsOn, i18n.language),
                    })}
                  </li>
                ) : null}
                <li>{t('fawtirDisconnection.after.nothingSent')}</li>
                <li>{t('fawtirDisconnection.after.records')}</li>
              </ul>
            ) : null}

            {request.steps.length > 0 ? (
              <div className="flex flex-col gap-2">
                <h5 className="text-sm font-semibold text-text-primary">
                  {t('fawtirDisconnection.stepsTitle')}
                </h5>
                <ol className="flex flex-col">
                  {request.steps.map((step, index) => (
                    <li
                      key={`${step.step}-${step.recordedAt}`}
                      className={[
                        'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2',
                        index < request.steps.length - 1 ? 'border-b border-border-subtle' : '',
                      ].join(' ')}
                    >
                      <span className="text-sm font-medium text-text-secondary">
                        {t(`fawtirDisconnection.step.${step.step}`)}
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-text-primary">
                        {day(step.occurredAt)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
            <p className="text-xs font-medium text-text-tertiary">{t('fawtirDisconnection.toldNote')}</p>
          </div>
        ) : null}

        {showsComingBack(view) ? <ComingBack view={view} onChanged={setLatest} onFailure={setFailure} /> : null}

        {view.canRequest || view.canWithdraw ? (
          <div className="flex flex-wrap gap-3">
            {view.canWithdraw ? (
              <Button variant="secondary" size="md" disabled={withdrawing} onClick={withdraw}>
                {t('fawtirDisconnection.withdraw')}
              </Button>
            ) : null}
            {view.canRequest ? (
              <button
                type="button"
                onClick={() => {
                  setFailure(null)
                  setAsking(true)
                }}
                className="inline-flex h-11 items-center rounded-sm border border-danger-700 bg-white px-4 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-100"
              >
                {t(request ? 'fawtirDisconnection.requestAgain' : 'fawtirDisconnection.start')}
              </button>
            ) : null}
          </div>
        ) : null}

        {failure && !asking ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(failure)}
          </p>
        ) : null}

        <DisconnectDialog
          open={asking}
          companyName={view.companyName}
          yearlyRefundReview={view.yearlyRefundReview === true}
          onClose={() => setAsking(false)}
          onDone={(next, why) => {
            setLatest(next)
            setAsking(false)
            setFailure(why ?? null)
          }}
        />
      </div>
    )
  }

  return (
    <section aria-labelledby="danger-zone" className="rounded-md bg-surface-card">
      <div className="border-b border-surface-background p-5">
        <h3 id="danger-zone" className="text-lg font-semibold leading-[1.2] text-danger-700">
          {t('fawtirDisconnection.dangerZone')}
        </h3>
        <p className="mt-0.5 text-xs font-medium text-text-quaternary">
          {t('fawtirDisconnection.dangerZoneNote')}
        </p>
      </div>
      <div className="p-5">{body}</div>
    </section>
  )
}

/** A reconnection refusal's slug to this card's sentence. */
function reconnectionFailureKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.problemType === 'admin-authority-required') return 'fawtirDisconnection.error.notOwner'
    if (error.problemType === 'impersonation-not-allowed') return 'fawtirDisconnection.error.impersonating'
    if (error.problemType === 'reconnection-not-open') return 'fawtirReconnection.error.notOpen'
    if (
      error.problemType === 'reconnection-state-conflict' ||
      error.problemType === 'disconnection-state-conflict'
    ) {
      return 'fawtirDisconnection.error.changed'
    }
    if (error.status === 400) return 'fawtirReconnection.error.confirm'
    if (error.status === 403) return 'fawtirDisconnection.error.notOwner'
  }
  return 'fawtirDisconnection.error.failed'
}

const isStateConflict = (error: unknown) =>
  error instanceof ApiError &&
  (error.problemType === 'reconnection-state-conflict' ||
    error.problemType === 'disconnection-state-conflict' ||
    error.problemType === 'reconnection-not-open')

/**
 * "Coming back to Fawtir" (plan v4 §10, CA-6): the three steps, the confirmation, and where the
 * Fawtara Portal request stands with the date of each step. Fawtir accepts the connection on the
 * portal; issuing comes back from the acceptance or the date the company chose there, whichever is
 * later. A request Fawtir has accepted is not withdrawn: once it takes effect the company can
 * disconnect again.
 */
function ComingBack({
  view,
  onChanged,
  onFailure,
}: {
  view: CompanyDisconnectionDto
  onChanged: (view: CompanyDisconnectionDto) => void
  /** Shown by the danger zone, so it outlives this block when a re-read hides it. */
  onFailure: (key: string | null) => void
}) {
  const { t, i18n } = useTranslation()
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const reconnection = currentReconnection(view)
  const standing = reconnection ? reconnectionStanding(reconnection) : null
  const day = (iso: string | null) => (iso ? formatInstantDay(iso, i18n.language) : '')
  const back = standing?.pill === 'CONNECTED'

  const act = async (call: () => Promise<CompanyDisconnectionDto>) => {
    setBusy(true)
    onFailure(null)
    try {
      onChanged(await call())
      setConfirmed(false)
    } catch (error) {
      onFailure(reconnectionFailureKey(error))
      if (isStateConflict(error)) await reload(onChanged)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-sm bg-surface-background px-4 py-3">
      <h5 className="text-sm font-semibold text-text-primary">{t('fawtirReconnection.title')}</h5>

      {reconnection && standing ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={[
                'rounded-full px-3 py-1 text-xs font-semibold',
                RECONNECTION_TONE[standing.pill],
              ].join(' ')}
            >
              {t(`fawtirReconnection.status.${standing.pill}`)}
            </span>
            <p role="status" className="min-w-0 flex-1 text-sm font-medium leading-[1.6] text-text-secondary">
              {t(`fawtirReconnection.line.${standing.line}`, { date: day(standing.dateAt) })}
            </p>
          </div>
          {reconnection.origin === 'CONSOLE' ? (
            <p className="text-xs font-medium text-text-tertiary">{t('fawtirReconnection.onYourBehalf')}</p>
          ) : null}
          {standing.pill === 'ACCEPTED' ? (
            <p className="text-xs font-medium text-text-tertiary">{t('fawtirReconnection.acceptedNote')}</p>
          ) : null}
          {back && view.request ? (
            renewalNeeded(view.request) ? (
              <p className="text-sm font-medium leading-[1.6] text-text-secondary">
                {t('fawtirReconnection.renewNeeded')}{' '}
                <Link to="/settings/plan" className="font-semibold text-primary-600 underline">
                  {t('fawtirReconnection.renewLink')}
                </Link>
              </p>
            ) : (
              <p className="text-sm font-medium leading-[1.6] text-text-secondary">
                {t('fawtirReconnection.carriesOn')}
              </p>
            )
          ) : null}
          {reconnection.steps.length > 0 ? (
            <ol className="flex flex-col">
              {reconnection.steps.map((step, index) => (
                <li
                  key={`${step.step}-${step.recordedAt}`}
                  className={[
                    'flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2',
                    index < reconnection.steps.length - 1 ? 'border-b border-border-subtle' : '',
                  ].join(' ')}
                >
                  <span className="text-sm font-medium text-text-secondary">
                    {t(`fawtirReconnection.step.${step.step}`)}
                  </span>
                  <span className="shrink-0 text-sm font-semibold text-text-primary">
                    {day(step.occurredAt)}
                  </span>
                </li>
              ))}
            </ol>
          ) : null}
          {reconnection.status === 'REQUESTED' ? (
            <div>
              <Button
                variant="secondary"
                size="md"
                disabled={busy}
                onClick={() => act(withdrawFawtirReconnection)}
              >
                {t('fawtirReconnection.withdraw')}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}

      {view.canReconnect ? (
        <>
          <ol className="flex list-decimal flex-col gap-1 ps-5 text-sm font-medium leading-[1.6] text-text-secondary">
            <li>{t('fawtirReconnection.how.portal')}</li>
            <li>{t('fawtirReconnection.how.tellUs')}</li>
            <li>{t('fawtirReconnection.how.accept')}</li>
          </ol>
          <label className="flex items-start gap-3 text-sm font-medium text-text-primary">
            <input
              type="checkbox"
              className="mt-1"
              checked={confirmed}
              disabled={busy}
              onChange={(event) => {
                setConfirmed(event.target.checked)
                onFailure(null)
              }}
            />
            <span>{t('fawtirReconnection.confirm')}</span>
          </label>
          <div>
            <Button
              variant="primary"
              size="md"
              disabled={busy || !confirmed}
              onClick={() => act(requestFawtirReconnection)}
            >
              {t(reconnection ? 'fawtirReconnection.tellAgain' : 'fawtirReconnection.tell')}
            </Button>
          </div>
        </>
      ) : null}

    </div>
  )
}

/** After a 409 the request changed elsewhere (support, another administrator): show where it is now. */
async function reload(set: (view: CompanyDisconnectionDto) => void) {
  try {
    set(await loadFawtirDisconnection())
  } catch {
    // The failure sentence is already on screen; the next visit reads it again.
  }
}

function DisconnectDialog({
  open,
  companyName,
  yearlyRefundReview,
  onClose,
  onDone,
}: {
  open: boolean
  companyName: string
  /** A yearly subscription's whole months left go for a refund review (LV-6, E31). */
  yearlyRefundReview: boolean
  onClose: () => void
  /** `why` is the sentence to show when the request had changed elsewhere meanwhile. */
  onDone: (view: CompanyDisconnectionDto, why?: string) => void
}) {
  const { t } = useTranslation()
  const [answer, setAnswer] = useState<DisconnectionAnswer | null>(null)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const close = () => {
    setAnswer(null)
    setTyped('')
    setFailure(null)
    onClose()
  }

  // Moving to another provider needs no request in Fawtir (LV-4, manual 3.8.1): the screen says
  // so and sends nothing, as the server would record nothing.
  const needsRequest = answer === 'ALREADY_DISCONNECTED' || answer === 'ASK_FAWTIR'

  const confirm = async () => {
    if (!needsRequest) return
    setBusy(true)
    setFailure(null)
    try {
      const result = await requestFawtirDisconnection(answer, typed.trim())
      setAnswer(null)
      setTyped('')
      onDone(result.disconnection)
    } catch (error) {
      const why = failureKey(error)
      setFailure(why)
      if (error instanceof ApiError && error.problemType === 'disconnection-state-conflict') {
        await reload((view) => {
          setAnswer(null)
          setTyped('')
          setFailure(null)
          onDone(view, why)
        })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('fawtirDisconnection.dialog.title')}
      footer={
        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" size="md" onClick={close}>
            {needsRequest ? t('fawtirDisconnection.dialog.back') : t('fawtirDisconnection.dialog.close')}
          </Button>
          {needsRequest ? (
            <button
              type="button"
              disabled={busy || typed.trim().length === 0}
              onClick={confirm}
              className="inline-flex h-11 items-center rounded-sm bg-danger-700 px-4 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t(`fawtirDisconnection.dialog.confirm.${answer}`)}
            </button>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-semibold text-text-primary">
            {t('fawtirDisconnection.dialog.question')}
          </legend>
          {ANSWERS.map((option) => (
            <label
              key={option}
              className="flex items-start gap-3 rounded-sm border border-border-subtle bg-white p-3"
            >
              <input
                type="radio"
                name="fawtir-disconnection-answer"
                className="mt-1"
                checked={answer === option}
                disabled={busy}
                onChange={() => {
                  setAnswer(option)
                  setFailure(null)
                }}
              />
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-text-primary">
                  {t(`fawtirDisconnection.answer.${option}.title`)}
                </span>
                <span className="text-xs font-medium text-text-tertiary">
                  {t(`fawtirDisconnection.answer.${option}.body`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        {answer === 'MOVING_TO_ANOTHER_PROVIDER' ? (
          <p role="status" className="rounded-sm bg-surface-background px-4 py-3 text-sm font-medium leading-[1.6] text-text-secondary">
            {t('fawtirDisconnection.dialog.movingNote')}
          </p>
        ) : null}

        {needsRequest ? (
          <>
            <div className="flex flex-col gap-2 rounded-sm border-s-4 border-s-danger-700 bg-danger-100 p-4">
              <p className="text-sm font-semibold text-danger-700">
                {t('fawtirDisconnection.dialog.warningTitle')}
              </p>
              <ul className="flex list-disc flex-col gap-1 ps-5 text-sm font-medium leading-[1.6] text-text-secondary">
                <li>{t(`fawtirDisconnection.dialog.path.${answer}`)}</li>
                <li>{t('fawtirDisconnection.dialog.warning.nothingSent')}</li>
                <li>{t('fawtirDisconnection.dialog.warning.legalDuty')}</li>
                <li>{t('fawtirDisconnection.dialog.warning.records')}</li>
                <li>
                  {t(
                    yearlyRefundReview
                      ? 'fawtirDisconnection.dialog.warning.subscriptionYearly'
                      : 'fawtirDisconnection.dialog.warning.subscription',
                  )}
                </li>
                <li>{t('fawtirDisconnection.dialog.warning.withdraw')}</li>
              </ul>
            </div>
            <Input
              label={t('fawtirDisconnection.dialog.typeName', { name: companyName })}
              value={typed}
              maxLength={255}
              autoComplete="off"
              disabled={busy}
              onChange={(event) => {
                setTyped(event.target.value)
                setFailure(null)
              }}
              error={failure === 'fawtirDisconnection.error.nameMismatch' ? t(failure) : undefined}
            />
          </>
        ) : null}

        {failure && failure !== 'fawtirDisconnection.error.nameMismatch' ? (
          <p role="alert" className="text-sm font-medium text-danger-700">
            {t(failure)}
          </p>
        ) : null}
      </div>
    </Modal>
  )
}
