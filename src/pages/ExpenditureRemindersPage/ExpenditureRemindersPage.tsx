import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { ApiReadFailure, LoadingNotice, Notice, PermissionDeniedNotice } from '../../components/feedback/ApiNotice'
import { useApiRead } from '../../hooks'
import {
  BILL_REMINDER_PREVIEW_PATH,
  BILL_REMINDER_RULES_PATH,
  BILL_REMINDER_SETTINGS_PATH,
  CONFIGURABLE_RULE_TYPES,
  MAX_OFFSETS,
  MAX_OFFSET_DAYS,
  MAX_RECIPIENTS,
  POSSIBLE_RECIPIENTS_PATH,
  RECIPIENTS_REQUIRED_TO_ENABLE,
  acknowledgeReminder,
  loadPossibleRecipients,
  loadReminderInbox,
  loadReminderPreview,
  loadReminderRules,
  loadReminderSettings,
  reminderInboxPath,
  saveReminderRules,
  saveReminderSettings,
  type ConfigurableRuleType,
  type ReminderDeliveryDto,
  type ReminderInboxItemDto,
  type ReminderPreviewDto,
  type ReminderRecipientDto,
  type ReminderRuleDto,
  type ReminderRulesDto,
  type ReminderSettingsDto,
} from '../../api/expenditure/billReminders'
import { describeApiFailure } from '../../lib/apiFailure'
import { RULE_LABEL_KEY, offsetsProblem, ruleChanged, type OffsetProblem } from '../../lib/billReminders'
import { formatAmount, formatCount, formatDate, formatInstant } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'

const FIELD =
  'h-[46px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-medium text-text-secondary outline-none focus:border-primary-500'

const DELIVERY: { value: ReminderDeliveryDto; titleKey: string; noteKey: string }[] = [
  { value: 'IN_APP', titleKey: 'expenditureReminders.channels.inFawtir', noteKey: 'expenditureReminders.channels.inFawtirNote' },
  { value: 'DAILY_DIGEST', titleKey: 'expenditureReminders.channels.daily', noteKey: 'expenditureReminders.channels.dailyNote' },
  { value: 'IMMEDIATE_EMAIL', titleKey: 'expenditureReminders.channels.each', noteKey: 'expenditureReminders.channels.eachNote' },
]

/**
 * Expenditure › Reminders (E-14).
 *
 * Six rules a tenant can configure, how the reminders are delivered, what today's sweep would
 * send, and the reader's own inbox.
 *
 * **A seventh reminder exists and is deliberately not here.** "A recurring bill that has not
 * arrived" is configured per recurring instruction, so it has no rule row and the server refuses
 * one. The page says where it lives instead of pretending it is missing.
 *
 * Three constraints are the server's and are enforced here so a save is not spent learning them:
 * a repeat belongs to the late rule alone, an escalation to the stale-approval rule alone, and a
 * rule whose recipients are not derived cannot be switched on with nobody to tell.
 */
export function ExpenditureRemindersPage() {
  return (
    <AppShell>
      <RemindersScreen />
    </AppShell>
  )
}

function RemindersScreen() {
  const { t } = useTranslation()
  const session = useSession()
  const canRead = can(session, 'invoice.read')
  const canManage = can(session, 'invoice.payment.manage')

  const rules = useApiRead<ReminderRulesDto>(canRead ? BILL_REMINDER_RULES_PATH : null, loadReminderRules)
  const settings = useApiRead<ReminderSettingsDto>(canRead ? BILL_REMINDER_SETTINGS_PATH : null, loadReminderSettings)

  if (!canRead) {
    return (
      <div className="mx-auto w-full max-w-[880px]">
        <PermissionDeniedNotice />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-4 pb-10">
      <div>
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">{t('expenditureReminders.title')}</h1>
        <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">{t('expenditureReminders.subtitle')}</p>
      </div>

      {rules.read.status === 'loading' || settings.read.status === 'loading' ? <LoadingNotice /> : null}
      {rules.read.status === 'failed' ? <ApiReadFailure error={rules.read.error} retry={rules.retry} /> : null}
      {settings.read.status === 'failed' ? <ApiReadFailure error={settings.read.error} retry={settings.retry} /> : null}

      {rules.read.status === 'ready' ? (
        <Rules saved={rules.read.data.rules} canManage={canManage} onSaved={() => rules.retry()} />
      ) : null}

      {settings.read.status === 'ready' ? (
        <Settings saved={settings.read.data} canManage={canManage} onSaved={() => settings.retry()} />
      ) : null}

      <Preview />
      <Inbox />

      <p className="text-xs font-medium leading-[1.5] text-text-quaternary">
        {t('expenditureReminders.notSupplier')}{' '}
        <Link to="/income/reminders" className="font-semibold text-primary-700 hover:underline">
          {t('expenditureReminders.underIncome')}
        </Link>
        .
      </p>
    </div>
  )
}

function Rules({
  saved,
  canManage,
  onSaved,
}: {
  saved: ReminderRuleDto[]
  canManage: boolean
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ReminderRuleDto[]>(saved)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => setDraft(saved), [saved])

  // The picker needs admin.users.manage, which someone who may edit these rules does not
  // necessarily hold. A refusal is expected, not an error: the rules stay editable and the
  // people already on them travel back untouched.
  const people = useApiRead<ReminderRecipientDto[]>(canManage ? POSSIBLE_RECIPIENTS_PATH : null, loadPossibleRecipients)
  const roster = people.read.status === 'ready' ? people.read.data : null

  const editable = CONFIGURABLE_RULE_TYPES.map((type) => {
    const found = draft.find((rule) => rule.type === type)
    return (
      found ?? { type, offsets: [], repeatEveryDays: null, escalationOffsets: null, recipients: [], enabled: false }
    )
  })

  const problems = new Map<ConfigurableRuleType, OffsetProblem | 'recipients'>()
  for (const rule of editable) {
    const type = rule.type as ConfigurableRuleType
    const offsets = offsetsProblem(rule.offsets)
    if (offsets) problems.set(type, offsets)
    else if (rule.enabled && RECIPIENTS_REQUIRED_TO_ENABLE[type] && rule.recipients.length === 0) {
      problems.set(type, 'recipients')
    }
  }

  const changed = editable.filter((rule) => ruleChanged(saved, rule))
  const canSave = canManage && changed.length > 0 && problems.size === 0 && !busy

  const update = (type: ConfigurableRuleType, change: Partial<ReminderRuleDto>) =>
    setDraft((current) => {
      const next = current.some((rule) => rule.type === type)
        ? current.map((rule) => (rule.type === type ? { ...rule, ...change } : rule))
        : [...current, { ...editable.find((rule) => rule.type === type)!, ...change }]
      return next
    })

  const save = async () => {
    setBusy(true)
    setFailure(null)
    try {
      await saveReminderRules(changed)
      setNotice(t('expenditureReminders.saved'))
      onSaved()
    } catch (error) {
      setNotice(null)
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setFailure(message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-col gap-4">
      {notice ? <Notice body={notice} action={{ label: t('common.close'), onClick: () => setNotice(null) }} /> : null}
      {failure ? (
        <Notice
          badge={t('supplierCreditNoteDetail.notDone')}
          body={failure}
          action={{ label: t('common.close'), onClick: () => setFailure(null) }}
        />
      ) : null}

      {canManage && people.read.status === 'failed' ? (
        <p className="rounded-md bg-surface-card p-4 text-sm font-medium text-text-tertiary">
          {t('expenditureReminders.noRoster')}
        </p>
      ) : null}

      {editable.map((rule) => (
        <RuleCard
          key={rule.type}
          rule={rule}
          roster={roster}
          canManage={canManage}
          problem={problems.get(rule.type as ConfigurableRuleType) ?? null}
          onChange={(change) => update(rule.type as ConfigurableRuleType, change)}
        />
      ))}

      <article className="rounded-md border border-dashed border-border-subtle p-5">
        <h3 className="text-base font-semibold leading-[1.2] text-text-secondary">
          {t('expenditureReminders.rules.recurringMissing.title')}
        </h3>
        <p className="mt-1 text-sm font-medium leading-[1.4] text-text-quaternary">
          {/* Not an omission. It is set on the recurring instruction itself, so there is no rule
              here to edit and the server refuses one. */}
          {t('expenditureReminders.perRecurring')}{' '}
          <Link to="/expenditure/recurring-bills" className="font-semibold text-primary-700 hover:underline">
            {t('expenditureReminders.onTheRecurringBill')}
          </Link>
          .
        </p>
      </article>

      {canManage ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void save()}
            className="inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
          >
            {t(busy ? 'common.saving' : 'expenditureReminders.saveRules')}
          </button>
          {changed.length > 0 ? (
            <p className="text-xs font-medium text-text-quaternary">
              {t('expenditureReminders.unsaved', { count: changed.length })}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function RuleCard({
  rule,
  roster,
  canManage,
  problem,
  onChange,
}: {
  rule: ReminderRuleDto
  roster: ReminderRecipientDto[] | null
  canManage: boolean
  problem: OffsetProblem | 'recipients' | null
  onChange: (change: Partial<ReminderRuleDto>) => void
}) {
  const { t } = useTranslation()
  const type = rule.type as ConfigurableRuleType
  const label = RULE_LABEL_KEY[type]
  const derivedRecipients = !RECIPIENTS_REQUIRED_TO_ENABLE[type]

  return (
    <article className="rounded-md bg-surface-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-[560px]">
          <h3 className="text-base font-semibold leading-[1.2] text-text-secondary">{t(`${label}.title`)}</h3>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-text-quaternary">{t(`${label}.note`)}</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-text-secondary">
          <input
            type="checkbox"
            checked={rule.enabled}
            disabled={!canManage}
            onChange={(event) => onChange({ enabled: event.target.checked })}
            className="size-5 accent-primary-700"
          />
          {t(rule.enabled ? 'expenditureReminders.on' : 'expenditureReminders.off')}
        </label>
      </div>

      <Days
        legend={t('expenditureReminders.days')}
        values={rule.offsets}
        disabled={!canManage}
        onChange={(offsets) => onChange({ offsets })}
      />

      {type === 'LATE' ? (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary">
          {t('expenditureReminders.repeatEvery')}
          <input
            type="number"
            min={1}
            max={MAX_OFFSET_DAYS}
            value={rule.repeatEveryDays ?? ''}
            disabled={!canManage}
            onChange={(event) =>
              onChange({ repeatEveryDays: event.target.value.trim() === '' ? null : Number(event.target.value) })
            }
            className={`${FIELD} w-24`}
          />
          {t('expenditureReminders.days_unit')}
        </label>
      ) : null}

      {type === 'APPROVAL_STALE' ? (
        <Days
          legend={t('expenditureReminders.escalateAfter')}
          values={rule.escalationOffsets ?? []}
          disabled={!canManage}
          onChange={(escalationOffsets) => onChange({ escalationOffsets })}
        />
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.6px] text-text-quaternary">
          {t('expenditureReminders.whoIsTold')}
        </p>
        {derivedRecipients ? (
          <p className="mt-1 text-sm font-medium text-text-tertiary">
            {/* These two find their own people, so naming someone is not required and the rule
                can be switched on with nobody listed. */}
            {t(`expenditureReminders.derived.${type}`)}
          </p>
        ) : roster ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {roster.map((person) => {
              const chosen = rule.recipients.includes(person.id)
              return (
                <label
                  key={person.id}
                  className={[
                    'inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium',
                    chosen ? 'border-primary-700 bg-primary-50 text-primary-800' : 'border-border-subtle text-text-tertiary',
                  ].join(' ')}
                >
                  <input
                    type="checkbox"
                    checked={chosen}
                    disabled={!canManage || (!chosen && rule.recipients.length >= MAX_RECIPIENTS)}
                    onChange={() =>
                      onChange({
                        recipients: chosen
                          ? rule.recipients.filter((id) => id !== person.id)
                          : [...rule.recipients, person.id],
                      })
                    }
                    className="size-4 accent-primary-700"
                  />
                  {person.name}
                </label>
              )
            })}
          </div>
        ) : (
          <p className="mt-1 text-sm font-medium text-text-tertiary">
            {/* The people cannot be listed, so they are counted and sent back exactly as loaded:
                saving a rule without them would quietly empty it. */}
            {t('expenditureReminders.recipientCount', { count: rule.recipients.length })}
          </p>
        )}
      </div>

      {problem ? (
        <p role="alert" className="mt-3 text-sm font-medium text-warning-700">
          {t(`expenditureReminders.error.${problem}`, { max: MAX_OFFSETS, maxDays: MAX_OFFSET_DAYS })}
        </p>
      ) : null}
    </article>
  )
}

/** A row of day numbers: the offsets a rule fires at, or the ages an approval escalates at. */
function Days({
  legend,
  values,
  disabled,
  onChange,
}: {
  legend: string
  values: number[]
  disabled: boolean
  onChange: (values: number[]) => void
}) {
  const { t } = useTranslation()
  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.6px] text-text-quaternary">{legend}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {values.map((value, index) => (
          <span key={index} className="inline-flex items-center gap-1">
            <input
              type="number"
              value={value}
              disabled={disabled}
              onChange={(event) =>
                onChange(values.map((old, other) => (other === index ? Number(event.target.value) : old)))
              }
              aria-label={t('expenditureReminders.dayAt', { index: index + 1 })}
              className={`${FIELD} w-20`}
            />
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(values.filter((_, other) => other !== index))}
              aria-label={t('expenditureReminders.removeDay', { day: value })}
              className="text-sm font-semibold text-text-quaternary hover:text-warning-700 disabled:opacity-50"
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          disabled={disabled || values.length >= MAX_OFFSETS}
          onClick={() => onChange([...values, 0])}
          className="h-[46px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary disabled:opacity-50"
        >
          {t('expenditureReminders.addDay')}
        </button>
      </div>
    </div>
  )
}

function Settings({
  saved,
  canManage,
  onSaved,
}: {
  saved: ReminderSettingsDto
  canManage: boolean
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const [draft, setDraft] = useState<ReminderSettingsDto>(saved)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => setDraft(saved), [saved])

  const dirty =
    draft.delivery !== saved.delivery ||
    draft.digestTime !== saved.digestTime ||
    draft.skipWeekends !== saved.skipWeekends ||
    draft.stopWhenInRun !== saved.stopWhenInRun

  const save = async () => {
    setBusy(true)
    setFailure(null)
    try {
      await saveReminderSettings(draft)
      onSaved()
    } catch (error) {
      const message = describeApiFailure(error)
      setFailure(t(message.key, message.values))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="rounded-md bg-surface-card p-6">
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
        {t('expenditureReminders.sections.howTold')}
      </h2>

      <div className="mt-4 flex flex-col gap-3">
        {DELIVERY.map((option) => (
          <label key={option.value} className="flex items-start gap-3">
            <input
              type="radio"
              name="delivery"
              checked={draft.delivery === option.value}
              disabled={!canManage}
              onChange={() => setDraft({ ...draft, delivery: option.value })}
              className="mt-1 size-4 accent-primary-700"
            />
            <span>
              <span className="block text-sm font-semibold text-text-secondary">{t(option.titleKey)}</span>
              <span className="block text-sm font-medium text-text-quaternary">
                {t(option.noteKey, { time: draft.digestTime })}
              </span>
            </span>
          </label>
        ))}
      </div>

      <label className="mt-4 flex flex-wrap items-center gap-2 text-sm font-medium text-text-secondary">
        {t('expenditureReminders.digestTime')}
        <input
          type="time"
          value={draft.digestTime}
          disabled={!canManage}
          onChange={(event) => setDraft({ ...draft, digestTime: event.target.value })}
          className={`${FIELD} w-32`}
        />
        <span className="text-xs font-medium text-text-quaternary">{t('expenditureReminders.digestTimeNote')}</span>
      </label>

      <div className="mt-4 flex flex-col gap-3">
        <Switch
          checked={draft.skipWeekends}
          disabled={!canManage}
          onChange={(skipWeekends) => setDraft({ ...draft, skipWeekends })}
          title={t('expenditureReminders.skipWeekends')}
          note={t('expenditureReminders.skipWeekendsNote')}
        />
        <Switch
          checked={draft.stopWhenInRun}
          disabled={!canManage}
          onChange={(stopWhenInRun) => setDraft({ ...draft, stopWhenInRun })}
          title={t('expenditureReminders.stopInRun')}
          note={t('expenditureReminders.stopInRunNote')}
        />
      </div>

      {failure ? (
        <p role="alert" className="mt-3 text-sm font-medium text-warning-700">
          {failure}
        </p>
      ) : null}

      {canManage ? (
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={() => void save()}
          className="mt-4 inline-flex h-[46px] items-center rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
        >
          {t(busy ? 'common.saving' : 'expenditureReminders.saveDelivery')}
        </button>
      ) : null}
    </section>
  )
}

function Switch({
  checked,
  disabled,
  onChange,
  title,
  note,
}: {
  checked: boolean
  disabled: boolean
  onChange: (value: boolean) => void
  title: string
  note: string
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-1 size-5 accent-primary-700"
      />
      <span>
        <span className="block text-sm font-semibold text-text-secondary">{title}</span>
        <span className="block text-sm font-medium text-text-quaternary">{note}</span>
      </span>
    </label>
  )
}

function Preview() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const preview = useApiRead<ReminderPreviewDto>(BILL_REMINDER_PREVIEW_PATH, loadReminderPreview)

  return (
    <section className="rounded-md bg-surface-card p-6">
      <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('expenditureReminders.preview.title')}</h2>
      {preview.read.status === 'loading' ? <LoadingNotice /> : null}
      {preview.read.status === 'failed' ? <ApiReadFailure error={preview.read.error} retry={preview.retry} /> : null}
      {preview.read.status === 'ready' ? (
        preview.read.data.total === 0 ? (
          <p className="mt-3 text-sm font-medium text-text-quaternary">{t('expenditureReminders.preview.nothing')}</p>
        ) : (
          <>
            <p className="mt-1 text-sm font-medium text-text-quaternary">
              {t('expenditureReminders.preview.headline', {
                count: preview.read.data.total,
                date: formatDate(preview.read.data.date, language),
              })}
            </p>
            <div className="mt-4 flex flex-col gap-4">
              {preview.read.data.groups.map((group) => (
                <div key={group.recipientUserId} className="border-s-2 border-surface-background ps-4">
                  <p className="text-sm font-semibold text-text-secondary">
                    {group.displayName ?? t('expenditureReminders.someone')}
                  </p>
                  <p className="text-xs font-medium text-text-quaternary">{group.headline}</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {group.items.map((item) => (
                      <li key={`${item.subjectId}-${item.ruleType}-${item.daysFromDue}`} className="text-sm font-medium text-text-tertiary">
                        {item.headline}
                        {item.amount !== null && item.currency ? (
                          <span className="ms-2 tabular-nums text-text-secondary">
                            {formatAmount(item.amount, item.currency, language)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )
      ) : null}
    </section>
  )
}

/** The reader's own bell, not the tenant's: a reminder addressed to someone else is not here. */
function Inbox() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const [unreadOnly, setUnreadOnly] = useState(true)
  const path = reminderInboxPath(unreadOnly)
  const inbox = useApiRead<ReminderInboxItemDto[]>(path, () => loadReminderInbox(path))
  const [acking, setAcking] = useState<string | null>(null)

  const acknowledge = async (id: string) => {
    setAcking(id)
    try {
      await acknowledgeReminder(id)
      inbox.retry()
    } finally {
      setAcking(null)
    }
  }

  return (
    <section className="rounded-md bg-surface-card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">{t('expenditureReminders.inbox.title')}</h2>
        <label className="inline-flex items-center gap-2 text-sm font-medium text-text-secondary">
          <input
            type="checkbox"
            checked={unreadOnly}
            onChange={(event) => setUnreadOnly(event.target.checked)}
            className="size-4 accent-primary-700"
          />
          {t('expenditureReminders.inbox.unreadOnly')}
        </label>
      </div>

      {inbox.read.status === 'loading' ? <LoadingNotice /> : null}
      {inbox.read.status === 'failed' ? <ApiReadFailure error={inbox.read.error} retry={inbox.retry} /> : null}
      {inbox.read.status === 'ready' ? (
        inbox.read.data.length === 0 ? (
          <p className="mt-3 text-sm font-medium text-text-quaternary">
            {t(unreadOnly ? 'expenditureReminders.inbox.noneUnread' : 'expenditureReminders.inbox.none')}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {inbox.read.data.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-background pb-3 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-text-secondary">{item.headline}</p>
                  <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                    {t(`${RULE_LABEL_KEY[item.ruleType]}.title`)} · {formatInstant(item.createdAt, language)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {item.billId ? (
                    <Link to={`/expenditure/bills/${item.billId}`} className="text-sm font-semibold text-primary-700 hover:underline">
                      {t('expenditureReminders.inbox.openBill')}
                    </Link>
                  ) : null}
                  {item.acknowledgedAt === null ? (
                    <button
                      type="button"
                      disabled={acking === item.id}
                      onClick={() => void acknowledge(item.id)}
                      className="h-[36px] rounded-sm border border-border-subtle bg-white px-3 text-sm font-semibold text-text-secondary disabled:opacity-50"
                    >
                      {t('expenditureReminders.inbox.acknowledge')}
                    </button>
                  ) : (
                    <span className="text-xs font-medium text-text-quaternary">
                      {t('expenditureReminders.inbox.acknowledged')}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : null}
      <p className="mt-3 text-xs font-medium text-text-quaternary">
        {t('expenditureReminders.inbox.count', { count: formatCount(inbox.read.status === 'ready' ? inbox.read.data.length : 0, language) })}
      </p>
    </section>
  )
}
