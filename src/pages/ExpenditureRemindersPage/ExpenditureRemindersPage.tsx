import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Popover, Switch, withRial } from '../../components/ui'
import {
  ApiReadFailure,
  LoadingNotice,
  Notice,
  PermissionDeniedNotice,
} from '../../components/feedback/ApiNotice'
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
  type ReminderInboxItemDto,
  type ReminderPreviewDto,
  type ReminderRecipientDto,
  type ReminderRuleDto,
  type ReminderRulesDto,
  type ReminderSettingsAnswerDto,
  type ReminderSettingsDto,
} from '../../api/expenditure/billReminders'
import { describeApiFailure } from '../../lib/apiFailure'
import {
  RULE_LABEL_KEY,
  hasNoTiming,
  offsetsProblem,
  ruleChanged,
  type OffsetProblem,
} from '../../lib/billReminders'
import {
  DELIVERIES,
  RULES_IN_SECTION,
  RULE_SPECS,
  audienceOf,
  chipOptions,
  flattenPreview,
  joinNames,
  rulesOn,
  toggleOffset,
  withOneTiming,
  type RuleSpec,
} from '../../lib/expenditureReminders'
import { formatAmount, formatCount, formatInstant } from '../../lib/format'
import { can, useSession } from '../../lib/session/session'
import clockIcon from '../../assets/expenditure-reminders/clock.svg'
import alertIcon from '../../assets/expenditure-reminders/alert.svg'
import discountIcon from '../../assets/expenditure-reminders/discount.svg'
import approvalIcon from '../../assets/expenditure-reminders/approval.svg'
import eyeIcon from '../../assets/expenditure-reminders/eye.svg'
import cameraIcon from '../../assets/expenditure-reminders/camera.svg'
import calendarIcon from '../../assets/expenditure-reminders/calendar.svg'
import bellIcon from '../../assets/expenditure-reminders/bell.svg'
import mailIcon from '../../assets/expenditure-reminders/mail.svg'
import mobileIcon from '../../assets/expenditure-reminders/mobile.svg'
import personAnyIcon from '../../assets/expenditure-reminders/person-any.svg'
import infoIcon from '../../assets/expenditure-reminders/info.svg'
import tickIcon from '../../assets/bill-detail/tick.svg'
import avatarImg from '../../assets/dashboard/avatar.png'
import chevronIcon from '../../assets/create-invoice/chevron.svg'

const RULE_ICON = {
  clock: clockIcon,
  alert: alertIcon,
  discount: discountIcon,
  approval: approvalIcon,
  eye: eyeIcon,
  camera: cameraIcon,
  calendar: calendarIcon,
}
const RULE_TILE = {
  blue: 'bg-primary-50',
  red: 'bg-warning-100',
  green: 'bg-success-100',
  grey: 'bg-surface-background',
  sand: 'bg-pending-100',
}
const CHANNEL_ICON = { bell: bellIcon, mail: mailIcon, mobile: mobileIcon }

const blankRule = (type: ConfigurableRuleType): ReminderRuleDto => ({
  type,
  offsets: [],
  repeatEveryDays: null,
  escalationOffsets: null,
  recipients: [],
  enabled: false,
})

/**
 * Expenditure › Reminders (Figma 163:21448).
 *
 * Six rules a tenant can configure, drawn as the frame draws them; the seventh, a recurring bill
 * that has not arrived, is set on each recurring bill and is drawn as a link there. How the team
 * is told, what today's sweep would send, and one Save for the lot.
 *
 * Four constraints are the server's and are checked here so a save is not spent learning them:
 * a repeat belongs to the late rule alone, an escalation to the stale-approval rule alone, a rule
 * cannot be switched on with no timing chosen, and a rule whose recipients are not derived cannot
 * be switched on with nobody to tell.
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

  const rules = useApiRead<ReminderRulesDto>(
    canRead ? BILL_REMINDER_RULES_PATH : null,
    loadReminderRules,
  )
  const settings = useApiRead<ReminderSettingsAnswerDto>(
    canRead ? BILL_REMINDER_SETTINGS_PATH : null,
    loadReminderSettings,
  )
  // Held here, not in the editor: a save reads the rules and settings again, the editor is taken
  // down while they load, and a notice kept inside it would go with it.
  const [notice, setNotice] = useState<string | null>(null)

  if (!canRead) {
    return (
      <div className="mx-auto w-full max-w-[1144px]">
        <PermissionDeniedNotice />
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4">
      <div className="max-w-[760px]">
        <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
          {t('expenditureReminders.title')}
        </h1>
        <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
          {t('expenditureReminders.subtitle')}
        </p>
      </div>

      {notice ? (
        <Notice
          body={notice}
          action={{ label: t('common.close'), onClick: () => setNotice(null) }}
        />
      ) : null}
      {/* Only when the server says so. A server from before the field says nothing either way,
          and nothing is shown. */}
      {settings.read.status === 'ready' && settings.read.data.sendingEnabled === false ? (
        <Notice body={t('expenditureReminders.sendingOff')} />
      ) : null}
      {rules.read.status === 'loading' || settings.read.status === 'loading' ? (
        <LoadingNotice />
      ) : null}
      {rules.read.status === 'failed' ? (
        <ApiReadFailure error={rules.read.error} retry={rules.retry} />
      ) : null}
      {settings.read.status === 'failed' ? (
        <ApiReadFailure error={settings.read.error} retry={settings.retry} />
      ) : null}

      {rules.read.status === 'ready' && settings.read.status === 'ready' ? (
        <Editor
          savedRules={rules.read.data.rules}
          savedSettings={settings.read.data}
          canManage={canManage}
          setNotice={setNotice}
          onSaved={() => {
            rules.retry()
            settings.retry()
          }}
        />
      ) : null}
    </div>
  )
}

function Editor({
  savedRules: rulesOnFile,
  savedSettings,
  canManage,
  setNotice,
  onSaved,
}: {
  savedRules: ReminderRuleDto[]
  savedSettings: ReminderSettingsDto
  canManage: boolean
  /** The page's one notice line ("Saved."), owned above so it outlives the reload after a save. */
  setNotice: (notice: string | null) => void
  onSaved: () => void
}) {
  const { t } = useTranslation()
  // What the page edits and compares against: the rules on file, with a switched-off row that
  // takes one timing read as holding one. Untouched, nothing differs and nothing is offered to
  // save; a rule that is then saved carries its one timing.
  const savedRules = useMemo(() => rulesOnFile.map(withOneTiming), [rulesOnFile])
  const [draft, setDraft] = useState<ReminderRuleDto[]>(savedRules)
  // The rules on file. The page's read, until a save writes the rules and then fails on the
  // settings: the rules are saved all the same, so the server's answer to that save stands here.
  const [onFile, setOnFile] = useState<ReminderRuleDto[]>(savedRules)
  const [delivery, setDelivery] = useState<ReminderSettingsDto>(savedSettings)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => setDraft(savedRules), [savedRules])
  useEffect(() => setOnFile(savedRules), [savedRules])
  useEffect(() => setDelivery(savedSettings), [savedSettings])

  // The people come from the names-only list, readable by whoever may save these rules. A server
  // from before that list refuses the read: the rules stay editable and the people already on
  // them travel back untouched.
  const people = useApiRead<ReminderRecipientDto[]>(
    canManage ? POSSIBLE_RECIPIENTS_PATH : null,
    loadPossibleRecipients,
  )
  const roster = people.read.status === 'ready' ? people.read.data : null

  const editable = CONFIGURABLE_RULE_TYPES.map(
    (type) => draft.find((rule) => rule.type === type) ?? blankRule(type),
  )

  // In the order the server checks them, so the line under the rule is the one it would refuse on.
  const problems = new Map<ConfigurableRuleType, RuleProblem>()
  for (const rule of editable) {
    const type = rule.type as ConfigurableRuleType
    const offsets = offsetsProblem(rule.offsets)
    if (offsets) problems.set(type, offsets)
    // Asked only of someone who can choose one: a reader is shown the rule as it is on file.
    else if (canManage && hasNoTiming(rule)) problems.set(type, 'noTiming')
    else if (rule.enabled && RECIPIENTS_REQUIRED_TO_ENABLE[type] && rule.recipients.length === 0)
      problems.set(type, 'recipients')
  }

  const changed = editable.filter((rule) => ruleChanged(onFile, rule))
  const deliveryDirty =
    delivery.delivery !== savedSettings.delivery ||
    delivery.digestTime !== savedSettings.digestTime ||
    delivery.skipWeekends !== savedSettings.skipWeekends ||
    delivery.stopWhenInRun !== savedSettings.stopWhenInRun
  const canSave = canManage && (changed.length > 0 || deliveryDirty) && problems.size === 0 && !busy

  const update = (type: ConfigurableRuleType, change: Partial<ReminderRuleDto>) =>
    setDraft((current) =>
      current.some((rule) => rule.type === type)
        ? current.map((rule) => (rule.type === type ? { ...rule, ...change } : rule))
        : [...current, { ...blankRule(type), ...change }],
    )

  const save = async () => {
    setBusy(true)
    setFailure(null)
    // Two calls, rules first. What the rules call answered, if it went through.
    let rulesNowOnFile: ReminderRuleDto[] | null = null
    try {
      if (changed.length > 0) rulesNowOnFile = (await saveReminderRules(changed)).rules ?? null
      if (deliveryDirty) await saveReminderSettings(delivery)
      setNotice(t('expenditureReminders.saved'))
      onSaved()
    } catch (error) {
      // The rules were written and the settings were not. The rules are shown as the server now
      // holds them, so they no longer read as unsaved and are not sent again; the settings edit
      // stays as typed and Save stays lit for it. Taken from the save's own answer, not a fresh
      // read: a read takes this editor down, and the settings edit and this failure with it.
      // TODO(owner): the failure below is the settings' own, in the sentence the page already
      // has. It does not say that the rules were saved. Whether it should is the owner's call.
      if (rulesNowOnFile) {
        // Read the same way as the page's own read: a row that takes one timing holds one.
        const nowOnFile = rulesNowOnFile.map(withOneTiming)
        setOnFile(nowOnFile)
        setDraft(nowOnFile)
      }
      setNotice(null)
      const message = describeApiFailure(error)
      const body = t(message.key, message.values)
      setFailure(
        message.reference ? `${body} ${t('apiErrors.reference', { id: message.reference })}` : body,
      )
    } finally {
      setBusy(false)
    }
  }

  const ruleFor = (spec: RuleSpec): ReminderRuleDto | null =>
    spec.type === 'RECURRING_LATE' ? null : editable.find((rule) => rule.type === spec.type)!

  return (
    <>
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

      <div className="flex flex-col gap-4 xl:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {([1, 2] as const).map((section) => (
            <SectionCard
              key={section}
              step={section}
              title={t(
                section === 1
                  ? 'expenditureReminders.sections.moneyLeaving'
                  : 'expenditureReminders.sections.sittingStill',
              )}
            >
              {RULES_IN_SECTION(section).map((spec) => (
                <RuleCard
                  key={spec.type}
                  spec={spec}
                  rule={ruleFor(spec)}
                  roster={roster}
                  canManage={canManage}
                  problem={
                    spec.type === 'RECURRING_LATE' ? null : (problems.get(spec.type) ?? null)
                  }
                  onChange={(change) => spec.type !== 'RECURRING_LATE' && update(spec.type, change)}
                />
              ))}
            </SectionCard>
          ))}

          <SectionCard step={3} title={t('expenditureReminders.sections.howTold')}>
            <div className="grid gap-3 sm:grid-cols-3">
              {DELIVERIES.map((option) => {
                const active = delivery.delivery === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={active}
                    disabled={!canManage}
                    onClick={() => setDelivery({ ...delivery, delivery: option.value })}
                    className={[
                      'rounded-sm border p-4 text-start transition-colors disabled:cursor-default',
                      active
                        ? 'border-primary-700 bg-primary-25'
                        : 'border-border-subtle bg-white hover:border-primary-300',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex size-9 items-center justify-center rounded-sm',
                        active ? 'bg-white' : 'bg-surface-background',
                      ].join(' ')}
                    >
                      <img src={CHANNEL_ICON[option.icon]} alt="" className="size-5" />
                    </span>
                    <span className="mt-3 block text-base font-semibold leading-[1.2] text-text-primary">
                      {t(option.titleKey)}
                    </span>
                    <span className="mt-1.5 block text-sm font-medium leading-[1.35] text-text-quaternary">
                      {t(option.noteKey, { time: delivery.digestTime })}
                    </span>
                  </button>
                )
              })}
            </div>
            {[
              {
                id: 'weekends',
                title: t('expenditureReminders.skipWeekends'),
                note: t('expenditureReminders.skipWeekendsNote'),
                checked: delivery.skipWeekends,
                onChange: (skipWeekends: boolean) => setDelivery({ ...delivery, skipWeekends }),
              },
              {
                id: 'inRun',
                title: t('expenditureReminders.stopInRun'),
                note: t('expenditureReminders.stopInRunNote'),
                checked: delivery.stopWhenInRun,
                onChange: (stopWhenInRun: boolean) => setDelivery({ ...delivery, stopWhenInRun }),
              },
            ].map((row, index) => (
              <div
                key={row.id}
                className={[
                  'flex items-center justify-between gap-4 py-3.5',
                  index === 0 ? 'mt-1 border-t border-surface-background' : '',
                ].join(' ')}
              >
                <div className="min-w-0">
                  <p className="text-base font-medium leading-[1.2] text-text-primary">
                    {row.title}
                  </p>
                  <p className="mt-1 text-sm font-medium leading-[1.3] text-text-quaternary">
                    {row.note}
                  </p>
                </div>
                <Switch
                  checked={row.checked}
                  onChange={row.onChange}
                  label={row.title}
                  disabled={!canManage}
                />
              </div>
            ))}
          </SectionCard>
        </div>

        <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
          <Preview delivery={delivery.delivery} time={delivery.digestTime} />
          <section className="rounded-md border border-border-subtle bg-surface-tab-bar p-4">
            <p className="flex items-start gap-2 text-sm font-medium leading-[1.5] text-text-tertiary">
              <img src={infoIcon} alt="" className="mt-0.5 size-4 shrink-0" />
              <span>
                {t('expenditureReminders.notSupplier')}{' '}
                <Link to="/income/reminders" className="text-primary-700 hover:underline">
                  {t('expenditureReminders.underIncome')}
                </Link>
                .
              </span>
            </p>
          </section>
        </aside>
      </div>

      {canManage ? (
        <div className="sticky bottom-0 z-10 -mx-4 mt-2 border-t border-border-subtle bg-white px-4 py-3">
          <div className="mx-auto flex w-full max-w-[1144px] flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-text-secondary">
              <span className="font-semibold text-text-primary">
                {t('expenditureReminders.footer.rulesOn', { count: rulesOn(editable) })}
              </span>
              {' · '}
              {t(`expenditureReminders.footer.${delivery.delivery}`, { time: delivery.digestTime })}
              {delivery.skipWeekends ? `, ${t('expenditureReminders.footer.weekendsSkipped')}` : ''}
            </p>
            <div className="flex flex-wrap items-center gap-3 max-md:w-full max-md:justify-end">
              {/* "Send me today's now" is not drawn: no route sends it, and a button that does
                  nothing is not shown (guide row 4.2). */}
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void save()}
                className="inline-flex h-[46px] items-center gap-2 rounded-sm bg-primary-700 px-5 text-sm font-semibold text-white transition-colors hover:bg-primary-800 disabled:opacity-50"
              >
                <img src={tickIcon} alt="" className="size-4 brightness-0 invert" />
                {t(busy ? 'common.saving' : 'expenditureReminders.footer.save')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

/** What stops a rule being saved, said in a line under it. */
type RuleProblem = OffsetProblem | 'noTiming' | 'recipients'

function SectionCard({
  step,
  title,
  children,
}: {
  step: number
  title: string
  children: ReactNode
}) {
  return (
    <section className="rounded-md bg-surface-card p-5">
      <div className="flex items-center gap-3 border-b border-surface-background pb-4">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-sm bg-primary-50 text-xs font-semibold text-primary-700">
          {step}
        </span>
        <h2 className="text-xl font-medium leading-[1.2] text-text-primary">{title}</h2>
      </div>
      <div className="mt-4 flex flex-col gap-3">{children}</div>
    </section>
  )
}

function Chip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={[
        'inline-flex h-[38px] items-center whitespace-nowrap rounded-sm border px-3.5 text-sm font-medium transition-colors disabled:cursor-default',
        active
          ? 'border-primary-700 bg-primary-25 text-primary-700'
          : 'border-border-subtle bg-white text-text-tertiary hover:border-primary-300',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function RuleCard({
  spec,
  rule,
  roster,
  canManage,
  problem,
  onChange,
}: {
  spec: RuleSpec
  /** Null for the recurring row, which has no rule behind it. */
  rule: ReminderRuleDto | null
  roster: ReminderRecipientDto[] | null
  canManage: boolean
  problem: RuleProblem | null
  onChange: (change: Partial<ReminderRuleDto>) => void
}) {
  const { t } = useTranslation()
  const label = RULE_LABEL_KEY[spec.type]
  const on = rule ? rule.enabled : true
  const offsets = rule?.offsets ?? []
  const options = chipOptions(spec.options, offsets)

  return (
    <article className="overflow-hidden rounded-sm border border-border-subtle">
      <div className="flex items-center gap-3 bg-surface-tab-bar px-4 py-3.5">
        <span
          className={[
            'flex size-9 shrink-0 items-center justify-center rounded-sm',
            RULE_TILE[spec.tone],
          ].join(' ')}
        >
          <img src={RULE_ICON[spec.icon]} alt="" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
            {t(`${label}.title`)}
          </h3>
          <p className="mt-1 text-sm font-medium leading-[1.3] text-text-quaternary">
            {t(`${label}.note`)}
          </p>
        </div>
        {/* The recurring row has no rule behind it and nothing to switch: its timing is set on
            each recurring bill, so no switch is drawn there. */}
        {rule ? (
          <Switch
            checked={on}
            onChange={(enabled) => onChange({ enabled })}
            label={t(`${label}.title`)}
            disabled={!canManage}
          />
        ) : null}
      </div>

      {/* The settings dim rather than disappear, so the shape of the rule stays readable. */}
      <div
        className={[
          'flex flex-wrap items-center gap-3 bg-white px-4 py-3.5 transition-opacity max-md:flex-col max-md:items-stretch',
          on ? '' : 'opacity-40',
        ].join(' ')}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3 max-md:w-full">
          <span className="whitespace-nowrap text-sm font-medium text-text-tertiary">
            {t(spec.leadKey)}
          </span>

          {options.map((option) => (
            <Chip
              key={option.offset}
              active={offsets.includes(option.offset)}
              disabled={!canManage || !on}
              onClick={() =>
                onChange({ offsets: toggleOffset(offsets, option.offset, spec.multi) })
              }
            >
              {t(option.labelKey, { count: option.offset })}
            </Chip>
          ))}

          {spec.repeat && rule ? (
            <Chip
              active={rule.repeatEveryDays !== null}
              disabled={!canManage || !on}
              onClick={() =>
                onChange({
                  repeatEveryDays: rule.repeatEveryDays === null ? spec.repeat!.days : null,
                })
              }
            >
              {t(spec.repeat.labelKey, { count: rule.repeatEveryDays ?? spec.repeat.days })}
            </Chip>
          ) : null}

          {spec.escalation && rule ? (
            <>
              <span className="text-sm font-medium text-text-tertiary">
                {t(spec.escalation.leadKey)}
              </span>
              {chipOptions(spec.escalation.options, rule.escalationOffsets ?? []).map((option) => (
                <Chip
                  key={option.offset}
                  active={(rule.escalationOffsets ?? []).includes(option.offset)}
                  disabled={!canManage || !on}
                  onClick={() =>
                    onChange({
                      escalationOffsets: toggleOffset(
                        rule.escalationOffsets ?? [],
                        option.offset,
                        false,
                      ),
                    })
                  }
                >
                  {t(option.labelKey, { count: option.offset })}
                </Chip>
              ))}
            </>
          ) : null}

          {spec.linkTo ? (
            <Link
              to={spec.linkTo.to}
              className="inline-flex h-[38px] items-center rounded-sm border border-primary-700 bg-primary-25 px-3.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50"
            >
              {t(spec.linkTo.labelKey)}
            </Link>
          ) : null}
        </div>

        <div className="shrink-0">
          {spec.recipients === 'derived' ? (
            <span className="inline-flex h-[42px] items-center gap-2 rounded-sm border border-border-subtle bg-white ps-1.5 pe-3 text-sm font-medium text-text-secondary">
              <img src={personAnyIcon} alt="" className="size-7 shrink-0 rounded-full" />
              {t(spec.derivedKey!)}
            </span>
          ) : rule ? (
            <RecipientPicker
              value={rule.recipients}
              roster={roster}
              disabled={!canManage || !on}
              onChange={(recipients) => onChange({ recipients })}
            />
          ) : null}
        </div>
      </div>

      {problem ? (
        <p
          role="alert"
          className="border-t border-surface-background px-4 py-2.5 text-sm font-medium text-warning-700"
        >
          {t(`expenditureReminders.error.${problem}`, {
            max: MAX_OFFSETS,
            maxDays: MAX_OFFSET_DAYS,
          })}
        </p>
      ) : null}
    </article>
  )
}

/** The avatar-plus-name chips that pick who a rule tells, one popover per chip to swap or remove. */
function RecipientPicker({
  value,
  roster,
  disabled,
  onChange,
}: {
  value: string[]
  roster: ReminderRecipientDto[] | null
  disabled: boolean
  onChange: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const [openFor, setOpenFor] = useState<string | null>(null)
  const refs = useRef(new Map<string, HTMLButtonElement | null>())

  if (!roster) {
    // The people cannot be listed, so they are counted and sent back exactly as loaded: saving
    // a rule without them would quietly empty it.
    return (
      <span className="inline-flex h-[42px] items-center gap-2 rounded-sm border border-border-subtle bg-white ps-1.5 pe-3 text-sm font-medium text-text-secondary">
        <img src={personAnyIcon} alt="" className="size-7 shrink-0 rounded-full" />
        {t('expenditureReminders.recipientCount', { count: value.length })}
      </span>
    )
  }

  // First names, as the frame draws them; the popover lists people in full.
  // Someone with no name on file, or no longer on the list, is worded, never shown as an id.
  const nameOf = (id: string) =>
    roster.find((person) => person.id === id)?.name?.split(' ')[0] ??
    t('expenditureReminders.someone')

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((id) => (
        <div key={id}>
          <button
            ref={(node) => {
              refs.current.set(id, node)
            }}
            type="button"
            disabled={disabled}
            onClick={() => setOpenFor((current) => (current === id ? null : id))}
            aria-haspopup="listbox"
            aria-expanded={openFor === id}
            className="inline-flex h-[42px] items-center gap-2 rounded-sm border border-border-subtle bg-white ps-1.5 pe-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-primary-300"
          >
            <img src={avatarImg} alt="" className="size-7 shrink-0 rounded-full object-cover" />
            {nameOf(id)}
            <img
              src={chevronIcon}
              alt=""
              aria-hidden="true"
              className={[
                'size-4 shrink-0 opacity-60 transition-transform',
                openFor === id ? '-rotate-90' : 'rotate-90',
              ].join(' ')}
            />
          </button>
          <Popover
            anchorRef={{ current: refs.current.get(id) ?? null }}
            open={openFor === id}
            onClose={() => setOpenFor(null)}
            width={240}
          >
            <ul role="listbox" className="py-1.5">
              {roster.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={person.id === id}
                    disabled={person.id !== id && value.includes(person.id)}
                    onClick={() => {
                      onChange(value.map((current) => (current === id ? person.id : current)))
                      setOpenFor(null)
                    }}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm font-medium transition-colors hover:bg-primary-25 disabled:opacity-40',
                      person.id === id ? 'text-primary-700' : 'text-text-secondary',
                    ].join(' ')}
                  >
                    <img src={avatarImg} alt="" className="size-6 rounded-full object-cover" />
                    {person.name ?? t('expenditureReminders.someone')}
                  </button>
                </li>
              ))}
              <li className="mt-1 border-t border-surface-background pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onChange(value.filter((current) => current !== id))
                    setOpenFor(null)
                  }}
                  className="flex w-full px-3 py-2.5 text-start text-sm font-medium text-warning-700 transition-colors hover:bg-warning-100/40"
                >
                  {t('expenditureReminders.removePerson')}
                </button>
              </li>
            </ul>
          </Popover>
        </div>
      ))}
      {value.length < Math.min(MAX_RECIPIENTS, roster.length) ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            const next = roster.find((person) => !value.includes(person.id))
            if (next) onChange([...value, next.id])
          }}
          className="inline-flex size-[42px] items-center justify-center rounded-sm border border-dashed border-border-default bg-white text-lg font-medium text-text-quaternary transition-colors hover:border-primary-300 hover:text-primary-700 disabled:opacity-40"
          aria-label={t('expenditureReminders.addPerson')}
        >
          +
        </button>
      ) : null}
    </div>
  )
}

/** What today's sweep would send, as the server works it out. */
function Preview({ delivery, time }: { delivery: ReminderSettingsDto['delivery']; time: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const preview = useApiRead<ReminderPreviewDto>(BILL_REMINDER_PREVIEW_PATH, loadReminderPreview)
  const data = preview.read.status === 'ready' ? preview.read.data : null
  const lines = data ? flattenPreview(data) : []
  // First names, as the frame draws them. A person the server could not name gets the wording the
  // people picker already uses for one, never their id.
  const firstName = (name: string | null) =>
    name === null || name.trim() === '' ? t('expenditureReminders.someone') : name.split(' ')[0]
  const audience = data
    ? joinNames(audienceOf(data).map(firstName), t('expenditureReminders.and'))
    : ''

  return (
    <section className="rounded-md bg-surface-card p-5">
      <h2 className="border-b border-surface-background pb-4 text-xl font-medium leading-[1.2] text-text-primary">
        {t('expenditureReminders.preview.title')}
      </h2>
      {preview.read.status === 'loading' ? <LoadingNotice /> : null}
      {preview.read.status === 'failed' ? (
        <ApiReadFailure error={preview.read.error} retry={preview.retry} />
      ) : null}
      {data && lines.length === 0 ? (
        <p className="mt-4 rounded-sm bg-surface-background p-4 text-sm font-medium leading-[1.5] text-text-tertiary">
          {t('expenditureReminders.preview.nothing')}
        </p>
      ) : null}
      {data && lines.length > 0 ? (
        <>
          <div className="mt-4 rounded-sm border border-primary-300 bg-primary-25 p-3.5">
            <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-primary-700">
              {delivery === 'DAILY_DIGEST'
                ? t('expenditureReminders.preview.oneEmail', { time, who: audience })
                : delivery === 'IMMEDIATE_EMAIL'
                  ? t('expenditureReminders.preview.eachEmail', {
                      count: lines.length,
                      who: audience,
                    })
                  : t('expenditureReminders.preview.inAppOnly')}
            </p>
            <p className="mt-1.5 text-base font-medium leading-[1.3] text-text-primary">
              {t('expenditureReminders.preview.headline', { count: lines.length })}
            </p>
          </div>
          <ul className="mt-1 flex flex-col">
            {lines.map((line, index) => {
              const spec = RULE_SPECS.find((entry) => entry.type === line.ruleType) ?? RULE_SPECS[0]
              return (
                <li
                  key={line.id}
                  className={[
                    'flex items-start gap-3 py-3.5',
                    index < lines.length - 1 ? 'border-b border-surface-background' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm',
                      RULE_TILE[spec.tone],
                    ].join(' ')}
                  >
                    <img src={RULE_ICON[spec.icon]} alt="" className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                      {line.headline}
                    </p>
                    <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
                      {line.amount !== null && line.currency
                        ? withRial(
                            `${line.currency} ${formatAmount(line.amount, line.currency, language)}`,
                          )
                        : null}
                      {line.amount !== null ? ' · ' : ''}
                      {t('expenditureReminders.preview.to')}{' '}
                      {joinNames(line.recipients.map(firstName), t('expenditureReminders.and'))}
                    </p>
                  </div>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}
    </section>
  )
}

/**
 * The reader's own bell, not the tenant's: a reminder addressed to someone else is not here.
 *
 * The Reminders frame does not draw an inbox (its "In Fawtir" card says the count sits on the
 * bell), so this is not mounted on the page. It is kept, with its read and its acknowledge, for
 * the bell to take up; see docs/backend-guides/EXPENDITURE.md.
 */
export function ReminderInbox() {
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
        <h2 className="text-xl font-medium leading-[1.2] text-text-secondary">
          {t('expenditureReminders.inbox.title')}
        </h2>
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
      {inbox.read.status === 'failed' ? (
        <ApiReadFailure error={inbox.read.error} retry={inbox.retry} />
      ) : null}
      {inbox.read.status === 'ready' ? (
        inbox.read.data.length === 0 ? (
          <p className="mt-3 text-sm font-medium text-text-quaternary">
            {t(
              unreadOnly
                ? 'expenditureReminders.inbox.noneUnread'
                : 'expenditureReminders.inbox.none',
            )}
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {inbox.read.data.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-background pb-3 last:border-0"
              >
                <div>
                  <p className="text-sm font-semibold text-text-secondary">{item.headline}</p>
                  <p className="mt-0.5 text-xs font-medium text-text-quaternary">
                    {t(`${RULE_LABEL_KEY[item.ruleType]}.title`)} ·{' '}
                    {formatInstant(item.createdAt, language)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {item.billId ? (
                    <Link
                      to={`/expenditure/bills/${item.billId}`}
                      className="text-sm font-semibold text-primary-700 hover:underline"
                    >
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
        {t('expenditureReminders.inbox.count', {
          count: formatCount(inbox.read.status === 'ready' ? inbox.read.data.length : 0, language),
        })}
      </p>
    </section>
  )
}
