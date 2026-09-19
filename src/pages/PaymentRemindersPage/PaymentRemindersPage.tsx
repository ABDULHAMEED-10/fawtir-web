import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
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

const FIELD = 'h-[46px] w-full rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

/**
 * Income › Reminders › Settings (I-14).
 *
 * The whole model is a ladder of **days from the due date** and a switch. The composer the design
 * drew — tones, a subject and body per step, a final notice needing approval, a send hour — has
 * nothing behind it: the message is fixed in the server and the sweep's hour is a deployment
 * setting. What a reminder actually says is shown by **preview**, on the invoice itself.
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

  const read = useApiRead<ReminderScheduleDto>(canManage ? REMINDER_SCHEDULE_PATH : null, loadReminderSchedule)
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
      <div className="mx-auto w-full max-w-[880px]">
        <PermissionDeniedNotice />
      </div>
    )
  }

  const numbers = rungs.map(Number).filter((value) => Number.isInteger(value))
  const problems = rungs.map((value, index) => rungProblem(value, numbers.filter((_, other) => other !== index)))
  const listProblem = scheduleProblem(numbers, enabled)
  const canSave =
    saved !== null && problems.every((problem) => problem === null) && listProblem === null && scheduleChanged(saved, numbers, enabled)

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
      const reordered = answer.offsets.length !== numbers.length || answer.offsets.some((value, index) => value !== numbers[index])
      setNotice({ key: reordered ? 'paymentReminders.done.savedAndSorted' : 'paymentReminders.done.saved' })
    } catch (error) {
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setNotice({ body: message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4 pb-10">
      <div>
        <Link to="/income/reminders" className="text-sm font-semibold text-primary-700 hover:underline">
          {t('paymentReminders.backToHistory')}
        </Link>
        <h1 className="mt-2 text-[32px] font-medium leading-[1.2] text-text-primary">{t('paymentReminders.settings.title')}</h1>
        <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{t('paymentReminders.settings.subtitle')}</p>
      </div>

      {notice ? <Notice body={'key' in notice ? t(notice.key) : notice.body} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}

      {read.read.status === 'loading' ? <LoadingNotice /> : null}
      {read.read.status === 'failed' ? <ApiReadFailure error={read.read.error} retry={read.retry} /> : null}

      {saved ? (
        <>
          <section className="rounded-md bg-surface-card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-[520px]">
                <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('paymentReminders.settings.switchTitle')}</h2>
                <p className="mt-1 text-sm font-medium leading-[1.5] text-text-quaternary">{t('paymentReminders.settings.switchNote')}</p>
              </div>
              <label className="inline-flex items-center gap-3 text-sm font-semibold text-text-secondary">
                <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="size-5 accent-primary-700" />
                {t(enabled ? 'paymentReminders.settings.on' : 'paymentReminders.settings.off')}
              </label>
            </div>
          </section>

          <section className="rounded-md bg-surface-card p-6">
            <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('paymentReminders.settings.ladderTitle')}</h2>
            <p className="mt-1 text-sm font-medium leading-[1.5] text-text-quaternary">{t('paymentReminders.settings.ladderNote')}</p>

            {rungs.length === 0 ? (
              <div className="mt-4 rounded-sm border border-dashed border-border-subtle p-6 text-center">
                <p className="text-sm font-medium text-text-quaternary">{t('paymentReminders.settings.noRungs')}</p>
                <button
                  type="button"
                  onClick={() => setRungs(SUGGESTED_OFFSETS.map(String))}
                  className="mt-3 inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25"
                >
                  {t('paymentReminders.settings.useSuggested')}
                </button>
              </div>
            ) : (
              <ul className="mt-4 flex flex-col gap-3">
                {rungs.map((value, index) => {
                  const problem = problems[index]
                  const days = Number(value)
                  const note = problem === null ? rungNote(days) : null
                  return (
                    <li key={index} className="flex flex-wrap items-start gap-3">
                      <label className="flex-1">
                        <span className="sr-only">{t('paymentReminders.settings.rungLabel', { index: index + 1 })}</span>
                        <input
                          type="number"
                          inputMode="numeric"
                          value={value}
                          aria-label={t('paymentReminders.settings.rungLabel', { index: index + 1 })}
                          aria-invalid={problem !== null}
                          onChange={(event) => setRungs(rungs.map((old, other) => (other === index ? event.target.value : old)))}
                          className={FIELD}
                        />
                      </label>
                      <p className="min-w-[200px] flex-1 pt-3 text-sm font-medium text-text-tertiary">
                        {note ? t(note.key, note.values) : null}
                        {problem ? <span role="alert" className="text-warning-700">{t(`paymentReminders.error.rung.${problem}`, { max: MAX_OFFSET_DAYS })}</span> : null}
                      </p>
                      <button
                        type="button"
                        onClick={() => setRungs(rungs.filter((_, other) => other !== index))}
                        className="h-[46px] shrink-0 rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-quaternary hover:text-warning-700"
                      >
                        {t('paymentReminders.settings.removeRung')}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            {listProblem ? (
              <p role="alert" className="mt-3 text-sm font-medium text-warning-700">
                {t(`paymentReminders.error.schedule.${listProblem}`, { max: MAX_RUNGS })}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={rungs.length >= MAX_RUNGS}
                onClick={() => setRungs([...rungs, ''])}
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-4 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:opacity-50"
              >
                {t('paymentReminders.settings.addRung')}
              </button>
              <p className="text-xs font-medium text-text-quaternary">{t('paymentReminders.settings.rungLimit', { count: MAX_RUNGS })}</p>
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={!canSave || saving}
              onClick={() => void save()}
              className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
            >
              {t(saving ? 'common.saving' : 'paymentReminders.settings.save')}
            </button>
            <p className="text-xs font-medium text-text-quaternary">{t('paymentReminders.settings.sweepNote')}</p>
          </div>
        </>
      ) : null}
    </div>
  )
}
