import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Switch } from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  REMINDER_SCHEDULE_PATH,
  loadReminderSchedule,
  saveReminderSchedule,
  type ReminderScheduleDto,
} from '../../api/invoices/reminders'
import { describeApiFailure } from '../../lib/apiFailure'
import { can, useSession } from '../../lib/session/session'
import {
  MAX_OFFSET_DAYS,
  MAX_RUNGS,
  SUGGESTED_OFFSETS,
  normaliseOffsets,
  rungNote,
  rungProblem,
  scheduleChanged,
  scheduleProblem,
} from '../../lib/paymentReminders'
import bellIcon from '../../assets/reminders/kpi-going-out.svg'
import sendIcon from '../../assets/reminders/send.svg'
import backIcon from '../../assets/invoice-details/back.svg'
import saveIcon from '../../assets/customers/save.svg'

const FIELD =
  'h-[50px] w-full rounded-sm border border-primary-300 bg-surface-tab-bar px-4 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Income › Reminders › Settings (I-14).
 *
 * The whole model is a ladder of **days from the due date** and a switch. The design's "Reminder"
 * card (Figma 154:168196) draws that ladder as a stepper — invoice sent, then each rung in turn —
 * so the ladder is shown that way here above the rows that edit it. The tones, per-step subjects
 * and send hour the earlier design drew have nothing behind them: the message is fixed in the
 * server and the sweep's hour is a deployment setting. What a reminder actually says is shown by
 * **preview**, on the invoice itself.
 */
export function PaymentRemindersPage() {
  // AppShell is what provides the session, so the permission gate has to sit INSIDE it: a
  // `useSession()` called out here always reads null, and `can(null, …)` deliberately allows
  // everything — the gate would silently never engage.
  return (
    <AppShell>
      <ReminderSettings />
    </AppShell>
  )
}

function ReminderSettings() {
  const { t } = useTranslation()
  const session = useSession()
  const canManage = can(session, 'admin.settings.manage')

  const read = useApiRead<ReminderScheduleDto>(
    canManage ? REMINDER_SCHEDULE_PATH : null,
    loadReminderSchedule,
  )
  const [rungs, setRungs] = useState<string[]>([])
  const [enabled, setEnabled] = useState(false)
  const [notice, setNotice] = useState<{ key: string } | { body: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const saved = read.read.status === 'ready' ? read.read.data : null
  useEffect(() => {
    if (saved) {
      setRungs(saved.offsets.map(String))
      setEnabled(saved.enabled)
    }
  }, [saved])

  if (!canManage) {
    return (
      <div className="mx-auto w-full max-w-[1144px]">
        <PermissionDeniedNotice />
      </div>
    )
  }

  const numbers = rungs.map(Number).filter((value) => Number.isInteger(value))
  const problems = rungs.map((value, index) =>
    rungProblem(
      value,
      numbers.filter((_, other) => other !== index),
    ),
  )
  const listProblem = scheduleProblem(numbers, enabled)
  const canSave =
    saved !== null &&
    problems.every((problem) => problem === null) &&
    listProblem === null &&
    scheduleChanged(saved, numbers, enabled)
  // The ladder as the server will hold it — sorted, without repeats — is what the stepper draws.
  const ladder = normaliseOffsets(rungs.map(Number).filter((value) => Number.isInteger(value)))

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const answer = await saveReminderSchedule({ offsets: normaliseOffsets(numbers), enabled })
      setRungs(answer.offsets.map(String))
      setEnabled(answer.enabled)
      read.retry()
      // The server deduplicates and sorts, so the page says when what it stored differs from the
      // order that was typed rather than quietly rearranging the rows under the cursor.
      const reordered =
        answer.offsets.length !== numbers.length ||
        answer.offsets.some((value, index) => value !== numbers[index])
      setNotice({
        key: reordered ? 'paymentReminders.done.savedAndSorted' : 'paymentReminders.done.saved',
      })
    } catch (error) {
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setNotice({
        body: message.reference
          ? `${body} ${t('apiErrors.reference', { id: message.reference })}`
          : body,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/income/reminders"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t('paymentReminders.history.title')}
            </Link>
            <img
              src={backIcon}
              alt=""
              aria-hidden="true"
              className="size-6 rotate-180 rtl:rotate-0"
            />
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('paymentReminders.settings.title')}
            </h1>
          </div>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('paymentReminders.settings.subtitle')}
          </p>
        </div>
        {saved ? (
          <button
            type="button"
            disabled={!canSave || saving}
            onClick={() => void save()}
            className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
          >
            <img src={saveIcon} alt="" className="size-5 brightness-0 invert" />
            {t(saving ? 'common.saving' : 'paymentReminders.settings.save')}
          </button>
        ) : null}
      </div>

      {notice ? (
        <Notice
          body={'key' in notice ? t(notice.key) : notice.body}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      {read.read.status === 'loading' ? <LoadingNotice /> : null}
      {read.read.status === 'failed' ? (
        <ApiReadFailure error={read.read.error} retry={read.retry} />
      ) : null}

      {saved ? (
        <>
          <section className="rounded-sm bg-surface-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[560px]">
                <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                  {t('paymentReminders.settings.switchTitle')}
                </h2>
                <p className="mt-1 text-sm font-medium leading-[1.5] text-text-quaternary">
                  {t('paymentReminders.settings.switchNote')}
                </p>
              </div>
              <label className="inline-flex items-center gap-3 text-sm font-semibold text-text-secondary">
                <Switch
                  checked={enabled}
                  onChange={setEnabled}
                  label={t('paymentReminders.settings.switchTitle')}
                />
                {t(enabled ? 'paymentReminders.settings.on' : 'paymentReminders.settings.off')}
              </label>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-sm bg-surface-card p-4">
            <div>
              <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
                {t('paymentReminders.settings.ladderTitle')}
              </h2>
              <p className="mt-1 text-sm font-medium leading-[1.5] text-text-quaternary">
                {t('paymentReminders.settings.ladderNote')}
              </p>
            </div>
            <div className="h-px w-full bg-surface-background" />

            {/* The ladder as the design's Reminder card draws it: the invoice, then each rung in turn. */}
            <div className="flex flex-col gap-4 rounded-sm border border-primary-300 bg-primary-25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1">
                  <span className="flex size-8 items-center justify-center rounded-[2px] bg-white">
                    <img src={bellIcon} alt="" className="size-5" />
                  </span>
                  <p className="ms-1 text-base font-semibold text-text-primary">
                    {t('paymentReminders.settings.ladderCount', { count: ladder.length })}
                  </p>
                  <p className="text-xs font-medium text-text-tertiary">
                    {t(
                      enabled
                        ? 'paymentReminders.settings.ladderOn'
                        : 'paymentReminders.settings.ladderOff',
                    )}
                  </p>
                </div>
                <Link
                  to="/invoices"
                  className="inline-flex h-[38px] items-center gap-1.5 rounded-sm border border-border-subtle bg-white ps-2.5 pe-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
                >
                  <img src={sendIcon} alt="" className="size-6" />
                  {t('paymentReminders.settings.sentFromInvoice')}
                </Link>
              </div>
              <ol className="flex items-start gap-0 overflow-x-auto rounded-sm bg-white px-4 py-4">
                <Step
                  tone="done"
                  glyph={<img src={sendIcon} alt="" className="size-5 brightness-0 invert" />}
                  label={t('paymentReminders.settings.stepInvoice')}
                  note={t('paymentReminders.settings.stepInvoiceNote')}
                />
                {ladder.map((days, index) => {
                  return (
                    <Step
                      key={days}
                      tone={index === 0 ? 'next' : 'later'}
                      connector
                      glyph={<span className="text-lg font-semibold">{index + 1}</span>}
                      label={t('paymentReminders.settings.stepRung', { index: index + 1 })}
                      note={t('paymentReminders.settings.stepDay', {
                        day: days > 0 ? `+${days}` : String(days),
                      })}
                    />
                  )
                })}
                {ladder.length === 0 ? (
                  <li className="ps-4 text-sm font-medium text-text-quaternary">
                    {t('paymentReminders.settings.noRungs')}
                  </li>
                ) : null}
              </ol>
            </div>

            {rungs.length === 0 ? (
              <div className="rounded-sm border border-dashed border-border-subtle p-6 text-center">
                <p className="text-sm font-medium text-text-quaternary">
                  {t('paymentReminders.settings.noRungs')}
                </p>
                <button
                  type="button"
                  onClick={() => setRungs(SUGGESTED_OFFSETS.map(String))}
                  className="mt-3 inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
                >
                  {t('paymentReminders.settings.useSuggested')}
                </button>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {rungs.map((value, index) => {
                  const problem = problems[index]
                  const days = Number(value)
                  const note = problem === null ? rungNote(days) : null
                  return (
                    <li
                      key={index}
                      className="grid items-start gap-3 md:grid-cols-[220px_1fr_auto]"
                    >
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-text-quaternary">
                          {t('paymentReminders.settings.rungLabel', { index: index + 1 })}
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={value}
                          aria-label={t('paymentReminders.settings.rungLabel', {
                            index: index + 1,
                          })}
                          aria-invalid={problem !== null}
                          onChange={(event) =>
                            setRungs(
                              rungs.map((old, other) =>
                                other === index ? event.target.value : old,
                              ),
                            )
                          }
                          className={FIELD}
                        />
                      </label>
                      <p className="min-w-[200px] pt-7 text-sm font-medium text-text-tertiary">
                        {note ? t(note.key, note.values) : null}
                        {problem ? (
                          <span role="alert" className="text-warning-700">
                            {t(`paymentReminders.error.rung.${problem}`, { max: MAX_OFFSET_DAYS })}
                          </span>
                        ) : null}
                      </p>
                      <button
                        type="button"
                        onClick={() => setRungs(rungs.filter((_, other) => other !== index))}
                        className="mt-6 h-[46px] shrink-0 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-quaternary hover:text-warning-700"
                      >
                        {t('paymentReminders.settings.removeRung')}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {listProblem ? (
              <p role="alert" className="text-sm font-medium text-warning-700">
                {t(`paymentReminders.error.schedule.${listProblem}`, { max: MAX_RUNGS })}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={rungs.length >= MAX_RUNGS}
                onClick={() => setRungs([...rungs, ''])}
                className="inline-flex h-[46px] items-center rounded-sm border border-dashed border-primary-300 px-4 text-sm font-semibold text-primary-800 disabled:opacity-50"
              >
                + {t('paymentReminders.settings.addRung')}
              </button>
              <p className="text-xs font-medium text-text-quaternary">
                {t('paymentReminders.settings.rungLimit', { count: MAX_RUNGS })}
              </p>
            </div>
          </section>

          <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
            {t('paymentReminders.settings.sweepNote')}
          </p>
        </>
      ) : null}
    </div>
  )
}

/** One stop on the ladder: the invoice going out, or a rung. */
function Step({
  tone,
  glyph,
  label,
  note,
  connector,
}: {
  tone: 'done' | 'next' | 'later'
  glyph: React.ReactNode
  label: string
  note: string
  connector?: boolean
}) {
  const circle =
    tone === 'done'
      ? 'bg-primary-700 text-white'
      : tone === 'next'
        ? 'bg-success-100 text-success-700'
        : 'border border-border-default text-text-secondary opacity-70'
  return (
    <li className="flex shrink-0 items-start">
      {connector ? <span className="mt-5 h-px w-12 shrink-0 bg-border-default max-md:w-6" /> : null}
      <div className="flex w-[124px] flex-col items-center gap-1 text-center">
        <span
          className={['flex size-10 items-center justify-center rounded-full', circle].join(' ')}
        >
          {glyph}
        </span>
        <span className="text-[10px] font-semibold uppercase leading-[1.5] tracking-[1.2px] text-text-tertiary">
          {label}
        </span>
        <span className="text-[11px] font-medium leading-[1.2] text-text-tertiary">{note}</span>
      </div>
    </li>
  )
}
