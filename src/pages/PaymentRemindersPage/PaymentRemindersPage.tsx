import { useEffect, useState, type ReactNode } from 'react'
import { selectAllOnFocus } from '../../components/invoice/numericInput'
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
import { saveReminderSchedule } from '../../api/invoices/reminders'
import {
  INVOICE_SUMMARY_PATH,
  loadInvoiceSummary,
  type InvoiceSummaryDto,
} from '../../api/invoices/list'
import { describeApiFailure } from '../../lib/apiFailure'
import { formatCount } from '../../lib/format'
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
  stepOf,
} from '../../lib/paymentReminders'
import { useReminderQueue } from '../RemindersPage/useReminderQueue'
import { TemplateEditorModal, ToneChip } from '../RemindersPage/ReminderModals'
import bellIcon from '../../assets/dashboard/bell.svg'
import editIcon from '../../assets/reminders/edit-one.svg'
import deleteIcon from '../../assets/periodic/delete.svg'
import backIcon from '../../assets/invoice-details/back.svg'
import tickIcon from '../../assets/customers/tick-circle.svg'
import chevronIcon from '../../assets/invoices/chevron.svg'
import clockIcon from '../../assets/periodic/clock.svg'

const muscatToday = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date())

/**
 * Settings › Payment reminders (I-14, Figma 159:16749).
 *
 * The API's whole model is a ladder of **days from the due date** and a switch, and that is what
 * sections 1 and the banner edit. The rest of the design (stop rules, sending identity, the hold
 * and the final-notice approval, editable messages) has nothing behind it yet: each section is
 * drawn as designed and says so (TODO(backend)). The design numbers its last two sections 3 and
 * 3; they are 3 and 4 here.
 */
export function PaymentRemindersPage() {
  // AppShell provides the session, so the permission gate has to sit inside it.
  return (
    <AppShell>
      <ReminderSettings />
    </AppShell>
  )
}

function ReminderSettings() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const session = useSession()
  const canManage = can(session, 'admin.settings.manage')
  const today = muscatToday()

  const data = useReminderQueue(canManage, today)
  const summary = useApiRead<InvoiceSummaryDto>(INVOICE_SUMMARY_PATH, loadInvoiceSummary)
  const [rungs, setRungs] = useState<string[]>([])
  const [enabled, setEnabled] = useState(false)
  const [notice, setNotice] = useState<{ key: string } | { body: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [editing, setEditing] = useState<number | null>(null)

  const saved = data.ladder
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
  const changed = saved !== null && scheduleChanged(saved, numbers, enabled)
  const canSave =
    saved !== null &&
    problems.every((problem) => problem === null) &&
    listProblem === null &&
    changed
  const ladder = normaliseOffsets(numbers)

  const save = async () => {
    setSaving(true)
    setNotice(null)
    try {
      const answer = await saveReminderSchedule({ offsets: normaliseOffsets(numbers), enabled })
      setRungs(answer.offsets.map(String))
      setEnabled(answer.enabled)
      data.schedule.retry()
      setSavedAt(new Date().toISOString())
      // The server deduplicates and sorts, so the page says when what it stored differs from the
      // order that was typed rather than quietly rearranging the rows under the cursor.
      const reordered =
        answer.offsets.length !== numbers.length ||
        answer.offsets.some((value, index) => value !== numbers[index])
      if (reordered) setNotice({ key: 'paymentReminders.done.savedAndSorted' })
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

  const sentThisMonth = data.logRows.filter(
    (row) => row.firedOn.startsWith(today.slice(0, 7)) && row.outcome === 'SENT',
  ).length
  const rightNow = [
    {
      key: 'overdue',
      value:
        summary.read.status === 'ready'
          ? formatCount(summary.read.data.overdueInvoices, language)
          : '—',
    },
    {
      key: 'queued',
      value: formatCount(data.queue.filter((entry) => entry.next).length, language),
    },
    { key: 'muted', value: formatCount(data.muted, language) },
    { key: 'sent', value: formatCount(sentThisMonth, language) },
  ]

  const dayBox = (days: number) =>
    days === 0
      ? { number: '0', label: t('reminders.dueDay') }
      : {
          number: days > 0 ? `+${days}` : String(days),
          label: t(days > 0 ? 'reminders.daysLate' : 'reminders.daysEarly'),
        }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-28">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/settings"
              className="text-2xl font-medium leading-[1.2] text-text-quaternary transition-colors hover:text-text-secondary"
            >
              {t('reminders.breadcrumb')}
            </Link>
            <img
              src={backIcon}
              alt=""
              aria-hidden="true"
              className="size-6 rotate-180 rtl:rotate-0"
            />
            <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
              {t('reminders.title')}
            </h1>
          </div>
          <p className="mt-1 max-w-[520px] text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('reminders.subtitle')}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text-tertiary">
          {changed ? (
            t('reminders.unsaved')
          ) : savedAt ? (
            <>
              <img src={tickIcon} alt="" className="size-5" />
              {t('reminders.savedJustNow')}
            </>
          ) : null}
        </span>
      </div>

      {notice ? (
        <Notice
          body={'key' in notice ? t(notice.key) : notice.body}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}

      {data.schedule.read.status === 'loading' ? <LoadingNotice /> : null}
      {data.schedule.read.status === 'failed' ? (
        <ApiReadFailure error={data.schedule.read.error} retry={data.schedule.retry} />
      ) : null}

      {saved ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-primary-75 bg-primary-25/60 p-4">
            <span className="flex min-w-0 items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white">
                <img src={bellIcon} alt="" className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="block text-base font-medium leading-[1.2] text-text-primary">
                  {t(enabled ? 'reminders.bannerTitle' : 'reminders.bannerTitleOff')}
                </span>
                <span className="mt-1 block text-sm font-medium leading-[1.2] text-text-tertiary">
                  {t(enabled ? 'reminders.bannerNote' : 'reminders.bannerNoteOff')}
                </span>
              </span>
            </span>
            <Switch checked={enabled} onChange={setEnabled} label={t('reminders.bannerTitle')} />
          </div>

          <div className="grid items-start gap-4 xl:grid-cols-[1fr_332px]">
            <SectionCard
              step={1}
              title={t('reminders.scheduleTitle')}
              hint={t('reminders.scheduleHint')}
            >
              <div className="flex flex-col gap-3">
                {rungs.map((value, index) => {
                  const problem = problems[index]
                  const days = Number(value)
                  const known = problem === null
                  const found = known ? stepOf(numbers, days) : null
                  const box = known ? dayBox(days) : { number: '', label: t('reminders.daysLate') }
                  const note = known ? rungNote(days) : null
                  return (
                    <div
                      key={index}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border-subtle p-3"
                    >
                      <span className="flex min-w-0 flex-1 items-center gap-4">
                        {/* The day box is the editor: the offset is the one thing the API stores per step. */}
                        <label className="flex h-[62px] w-[78px] shrink-0 flex-col items-center justify-center rounded-sm bg-surface-background">
                          <input
                            type="number"
                            inputMode="numeric"
                            onFocus={selectAllOnFocus}
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
                            className="w-full border-0 bg-transparent text-center text-xl font-semibold leading-[1.2] text-text-secondary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                          />
                          <span className="text-[9px] font-semibold uppercase tracking-[0.04em] text-text-tertiary">
                            {box.label}
                          </span>
                        </label>
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-medium leading-[1.2] text-text-primary">
                              {found
                                ? t(found.nameKey)
                                : t('paymentReminders.settings.stepRung', { index: index + 1 })}
                            </span>
                            {found ? <ToneChip tone={found.tone} /> : null}
                          </span>
                          <span className="mt-1.5 block text-sm font-medium leading-[1.2] text-text-secondary">
                            {note ? t(note.key, note.values) : ''}
                            {problem ? (
                              <span role="alert" className="text-warning-700">
                                {t(`paymentReminders.error.rung.${problem}`, {
                                  max: MAX_OFFSET_DAYS,
                                })}
                              </span>
                            ) : null}
                          </span>
                          <span className="mt-1 block text-xs font-medium leading-[1.2] text-text-quaternary">
                            {t('reminders.stepMeta')}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          disabled={!known}
                          onClick={() => setEditing(days)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary hover:bg-primary-25 disabled:opacity-50"
                        >
                          <img src={editIcon} alt="" className="size-4" />
                          {t('reminders.editMessage')}
                        </button>
                        <button
                          type="button"
                          aria-label={t('reminders.deleteStep')}
                          onClick={() => setRungs(rungs.filter((_, other) => other !== index))}
                          className="flex size-9 items-center justify-center rounded-sm border border-border-subtle bg-white hover:bg-danger-100"
                        >
                          <img src={deleteIcon} alt="" className="size-4" />
                        </button>
                      </span>
                    </div>
                  )
                })}
              </div>

              {rungs.length === 0 ? (
                <div className="mt-3 rounded-sm border border-dashed border-border-subtle p-6 text-center">
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
              ) : null}

              <button
                type="button"
                disabled={rungs.length >= MAX_RUNGS}
                onClick={() => setRungs([...rungs, String((numbers.at(-1) ?? 0) + 7)])}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-sm border border-dashed border-primary-300 py-3 text-base font-semibold text-primary-700 disabled:opacity-50"
              >
                <span className="text-xl leading-none">+</span>
                {t('reminders.addStep')}
              </button>
              {listProblem ? (
                <p role="alert" className="mt-2 text-sm font-medium text-warning-700">
                  {t(`paymentReminders.error.schedule.${listProblem}`, { max: MAX_RUNGS })}
                </p>
              ) : null}
            </SectionCard>

            <div className="flex flex-col gap-4">
              <section className="rounded-sm bg-surface-card p-4">
                <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                  {t('reminders.customerSeesTitle')}
                </h2>
                <div className="mt-3 h-px w-full bg-border-subtle" />
                <ol className="mt-4 flex flex-col gap-4">
                  <SeesRow
                    n="0"
                    title={t('reminders.sees.dueDate')}
                    note={t('reminders.sees.dueDateNote')}
                  />
                  {ladder.map((days, index) => {
                    const found = stepOf(ladder, days)
                    const note = rungNote(days)
                    return (
                      <SeesRow
                        key={days}
                        n={String(index + 1)}
                        title={t(note.key, note.values)}
                        note={t(
                          index === 0
                            ? 'reminders.sees.firstNote'
                            : index === ladder.length - 1
                              ? 'reminders.sees.lastNote'
                              : 'reminders.sees.middleNote',
                          { step: t(found.nameKey) },
                        )}
                      />
                    )
                  })}
                </ol>
              </section>

              <section className="rounded-sm bg-surface-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-medium leading-[1.2] text-text-primary">
                    {t('reminders.rightNowTitle')}
                  </h2>
                  <Link
                    to="/income/reminders"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-primary-800"
                  >
                    {t('reminders.viewQueue')}
                    <img src={chevronIcon} alt="" className="size-4 rtl:rotate-180" />
                  </Link>
                </div>
                <div className="mt-3 h-px w-full bg-border-subtle" />
                <dl className="mt-4 flex flex-col gap-3">
                  {rightNow.map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-3">
                      <dt className="text-sm font-medium leading-[1.2] text-text-tertiary">
                        {t(`reminders.now.${row.key}`)}
                      </dt>
                      <dd className="text-sm font-semibold leading-[1.2] text-text-secondary tabular-nums">
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>
          </div>

          {/* TODO(backend): stop rules. The server stops for a settled invoice and an opted-out customer; nothing else exists. */}
          <SectionCard
            step={2}
            title={t('reminders.stopTitle')}
            pending={t('reminders.stop.notYet')}
          >
            <div className="flex flex-col">
              {(['paid', 'partPayment', 'creditNote', 'replies', 'dispute'] as const).map(
                (rule) => (
                  <RuleRow
                    key={rule}
                    title={t(`reminders.stop.${rule}`)}
                    note={t(`reminders.stop.${rule}Note`)}
                    checked={rule === 'paid'}
                  />
                ),
              )}
            </div>
          </SectionCard>

          {/* TODO(backend): sender, reply-to and attachment are the installation's, not the tenant's; the hour is a deployment setting. */}
          <SectionCard
            step={3}
            title={t('reminders.sendingTitle')}
            pending={t('reminders.sending.notYet')}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <ReadField
                label={t('reminders.sending.sendFrom')}
                required
                value={t('reminders.sending.installation')}
              />
              <ReadField
                label={t('reminders.sending.replyTo')}
                value={t('reminders.sending.installation')}
              />
              <ReadField
                label={t('reminders.sending.sendAt')}
                value={t('reminders.sending.sendAtValue')}
                clock
              />
              <ReadField
                label={t('reminders.sending.attachPdf')}
                value={t('reminders.sending.attachValue')}
              />
            </div>
          </SectionCard>

          {/* TODO(backend): a hold before sending and an approval on the last rung. */}
          <SectionCard
            step={4}
            title={t('reminders.beforeTitle')}
            pending={t('reminders.before.notYet')}
          >
            <div className="flex flex-col gap-3">
              <RuleRow
                title={t('reminders.before.hold')}
                note={t('reminders.before.holdNote')}
                checked={false}
                boxed
              />
              <RuleRow
                title={t('reminders.before.approveFinal')}
                note={t('reminders.before.approveFinalNote')}
                checked={false}
                boxed
              />
            </div>
          </SectionCard>

          <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
            {t('paymentReminders.settings.sweepNote')}
          </p>

          <div className="fixed bottom-0 end-0 start-0 z-30 border-t border-border-subtle bg-white px-4 py-3 md:start-[248px]">
            <div className="mx-auto flex max-w-[1144px] flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                disabled
                title={t('reminders.testNotYet')}
                className="inline-flex h-[46px] items-center rounded-sm border border-border-subtle bg-white px-6 text-base font-medium text-[#3a3a3a] disabled:opacity-50"
              >
                {t('reminders.sendMyselfTest')}
              </button>
              <button
                type="button"
                disabled={!canSave || saving}
                onClick={() => void save()}
                className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-6 text-base font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
              >
                {t(saving ? 'common.saving' : 'reminders.saveChanges')}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {editing !== null ? (
        <TemplateEditorModal offsets={ladder} offset={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  )
}

function SectionCard({
  step,
  title,
  hint,
  pending,
  children,
}: {
  step: number
  title: string
  hint?: string
  /** Said under the heading when the section is drawn ahead of the API. */
  pending?: string
  children: ReactNode
}) {
  return (
    <section className="rounded-sm bg-surface-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex size-6 items-center justify-center rounded-[5px] bg-surface-background text-[13px] font-extrabold leading-[1.2] text-primary-800">
          {step}
        </span>
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{title}</h2>
        {hint ? (
          <span className="text-xs font-medium leading-[1.2] text-text-tertiary">{hint}</span>
        ) : null}
        {pending ? (
          <span className="ms-auto rounded-full bg-pending-100 px-2.5 py-[3px] text-[11px] font-semibold text-pending-700">
            {pending}
          </span>
        ) : null}
      </div>
      <div className="mt-3 h-px w-full bg-border-subtle" />
      <div className="mt-4">{children}</div>
    </section>
  )
}

/** A rule with its explanation, drawn as designed; nothing behind it yet, so it cannot be changed. */
function RuleRow({
  title,
  note,
  checked,
  boxed,
}: {
  title: string
  note: string
  checked: boolean
  boxed?: boolean
}) {
  return (
    <label
      className={[
        'flex items-start gap-3',
        boxed
          ? [
              'rounded-sm border p-3',
              checked ? 'border-primary-700 bg-primary-25/60' : 'border-border-subtle',
            ].join(' ')
          : 'py-3',
      ].join(' ')}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled
        readOnly
        aria-label={title}
        className="mt-0.5 size-5 shrink-0 rounded-[4px] accent-primary-700"
      />
      <span className="min-w-0">
        <span className="block text-base font-medium leading-[1.2] text-text-primary">{title}</span>
        <span className="mt-1 block text-sm font-medium leading-[1.3] text-text-tertiary">
          {note}
        </span>
      </span>
    </label>
  )
}

function ReadField({
  label,
  value,
  required,
  clock,
}: {
  label: string
  value: string
  required?: boolean
  clock?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="flex items-center gap-0.5 text-sm font-medium leading-[1.2] text-text-primary">
        {label}
        {required ? <span className="text-xl leading-4 text-primary-700">*</span> : null}
      </span>
      <div className="flex h-[50px] w-full items-center justify-between gap-2 rounded-sm border border-border-subtle bg-surface-tab-bar px-4">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-quaternary">
          {value}
        </span>
        <img
          src={clock ? clockIcon : chevronIcon}
          alt=""
          className={clock ? 'size-5 opacity-60' : 'size-5 rotate-90 opacity-40'}
        />
      </div>
    </div>
  )
}

function SeesRow({ n, title, note }: { n: string; title: string; note: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-background text-xs font-semibold text-text-tertiary">
        {n}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-[1.2] text-text-primary">{title}</span>
        <span className="mt-1 block text-xs font-medium leading-[1.3] text-text-tertiary">
          {note}
        </span>
      </span>
    </li>
  )
}
