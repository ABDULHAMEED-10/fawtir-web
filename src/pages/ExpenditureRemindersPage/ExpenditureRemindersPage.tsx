import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AppShell } from '../../layouts/AppShell'
import { Popover, Switch, withRial } from '../../components/ui'
import {
  CANDIDATES,
  DIGEST_TIME,
  PEOPLE,
  ROLES,
  RULES,
  type EmailMode,
  type Rule,
  type RuleId,
} from '../../lib/expenditureReminders'
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

/** One rule's live settings. */
type RuleState = {
  on: boolean
  options: string[]
  second?: string
  recipients: string[]
}

type ChipProps = { active: boolean; onClick: () => void; children: React.ReactNode }

function Chip({ active, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={[
        'inline-flex h-[38px] items-center rounded-sm border px-3.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary-700 bg-primary-25 text-primary-700'
          : 'border-border-subtle bg-white text-text-tertiary hover:border-primary-300',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

/** The avatar-plus-name control that picks who a rule tells. */
function RecipientPicker({
  rule,
  value,
  onChange,
}: {
  rule: Rule
  value: string[]
  onChange: (ids: string[]) => void
}) {
  const { t } = useTranslation()
  const [openFor, setOpenFor] = useState<string | null>(null)
  const refs = useRef(new Map<string, HTMLButtonElement | null>())
  const pool = rule.roleOnly ? ROLES : PEOPLE

  return (
    <div className="flex flex-wrap items-center gap-2">
      {value.map((id) => {
        const person = pool.find((candidate) => candidate.id === id)
        if (!person) return null
        return (
          <div key={id}>
            <button
              ref={(node) => {
                refs.current.set(id, node)
              }}
              type="button"
              onClick={() => setOpenFor((current) => (current === id ? null : id))}
              className="inline-flex h-[42px] items-center gap-2 rounded-sm border border-border-subtle bg-white ps-1.5 pe-2.5 text-sm font-medium text-text-secondary transition-colors hover:border-primary-300"
            >
              <img
                src={person.role ? personAnyIcon : avatarImg}
                alt=""
                className="size-7 shrink-0 rounded-full object-cover"
              />
              {person.name}
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
            >
              <ul className="w-[240px] py-1.5">
                {pool.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onChange(
                          value.includes(option.id)
                            ? value.map((current) => (current === id ? option.id : current))
                            : value.map((current) => (current === id ? option.id : current)),
                        )
                        setOpenFor(null)
                      }}
                      className={[
                        'flex w-full items-center gap-2 px-3 py-2.5 text-start text-sm font-medium transition-colors hover:bg-primary-25',
                        option.id === id ? 'text-primary-700' : 'text-text-secondary',
                      ].join(' ')}
                    >
                      <img
                        src={option.role ? personAnyIcon : avatarImg}
                        alt=""
                        className="size-6 rounded-full object-cover"
                      />
                      {option.name}
                    </button>
                  </li>
                ))}
                {value.length > 1 ? (
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
                ) : null}
              </ul>
            </Popover>
          </div>
        )
      })}

      {/* Only real people can be stacked; a role already resolves to one person per document. */}
      {!rule.roleOnly && value.length < PEOPLE.length ? (
        <button
          type="button"
          onClick={() => {
            const next = PEOPLE.find((person) => !value.includes(person.id))
            if (next) onChange([...value, next.id])
          }}
          className="inline-flex size-[42px] items-center justify-center rounded-sm border border-dashed border-border-default bg-white text-lg font-medium text-text-quaternary transition-colors hover:border-primary-300 hover:text-primary-700"
          aria-label={t('expenditureReminders.addPerson')}
        >
          +
        </button>
      ) : null}
    </div>
  )
}

function SectionCard({
  step,
  title,
  children,
}: {
  step: number
  title: string
  children: React.ReactNode
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

export function ExpenditureRemindersPage() {
  const { t } = useTranslation()

  const [state, setState] = useState<Record<RuleId, RuleState>>(
    () =>
      Object.fromEntries(
        RULES.map((rule) => [
          rule.id,
          {
            on: rule.defaultOn,
            options: rule.defaultOptions,
            second: rule.second?.defaultOption,
            recipients: rule.defaultRecipients,
          },
        ]),
      ) as Record<RuleId, RuleState>,
  )

  const [inFawtir, setInFawtir] = useState(true)
  const [emailMode, setEmailMode] = useState<EmailMode>('daily')
  const [skipWeekends, setSkipWeekends] = useState(true)
  const [stopInRun, setStopInRun] = useState(true)

  const update = (id: RuleId, patch: Partial<RuleState>) =>
    setState((current) => ({ ...current, [id]: { ...current[id], ...patch } }))

  const toggleOption = (rule: Rule, optionId: string) => {
    const current = state[rule.id].options
    if (!rule.multi) return update(rule.id, { options: [optionId] })
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId]
    /* A rule with no timing left would never fire, so the last one stays on. */
    update(rule.id, { options: next.length ? next : current })
  }

  /**
   * What the panel on the right would actually send this morning.
   *
   * A candidate survives only if its rule is on and one of that rule's chosen timings matches
   * where the document has got to — so switching "7 days before" off drops the Sohar line.
   */
  const sending = useMemo(
    () =>
      CANDIDATES.filter((candidate) => {
        const rule = RULES.find((entry) => entry.id === candidate.rule)
        const current = state[candidate.rule]
        if (!rule || !current.on) return false

        if (rule.id === 'whenLate') {
          /* The day after, then every N days — so day 9 fires on a 3-day cadence. */
          const dayAfter = current.options.includes('dayAfter') && candidate.days === 1
          const repeat = current.options.includes('everyThree') && candidate.days % 3 === 0
          return dayAfter || repeat
        }
        if (rule.id === 'approvalStuck') {
          /* Past the owner's threshold, it is the owner's problem. */
          const owner = rule.second?.options.find((option) => option.id === current.second)
          return candidate.days >= (owner?.offset ?? Infinity)
        }
        return current.options.some(
          (id) => rule.options.find((option) => option.id === id)?.offset === candidate.days,
        )
      }),
    [state],
  )

  /** The people the morning email would actually go to, across every firing rule. */
  const audience = useMemo(() => {
    const ids = new Set<string>()
    for (const candidate of sending) {
      for (const id of state[candidate.rule].recipients) ids.add(id)
    }
    return [...ids]
      .map((id) => [...PEOPLE, ...ROLES].find((person) => person.id === id)?.name)
      .filter((name): name is string => Boolean(name))
  }, [sending, state])

  const audienceText =
    audience.length <= 1
      ? audience.join('')
      : `${audience.slice(0, -1).join(', ')} ${t('expenditureReminders.and')} ${audience.at(-1)}`

  const rulesIn = (section: 1 | 2) => RULES.filter((rule) => rule.section === section)

  const renderRule = (rule: Rule) => {
    const current = state[rule.id]
    return (
      <article key={rule.id} className="overflow-hidden rounded-sm border border-border-subtle">
        <div className="flex items-center gap-3 bg-surface-tab-bar px-4 py-3.5">
          <span
            className={[
              'flex size-9 shrink-0 items-center justify-center rounded-sm',
              RULE_TILE[rule.tone],
            ].join(' ')}
          >
            <img src={RULE_ICON[rule.icon]} alt="" className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold leading-[1.2] text-text-primary">
              {t(rule.titleKey)}
            </h3>
            <p className="mt-1 text-sm font-medium leading-[1.3] text-text-quaternary">
              {t(rule.noteKey)}
            </p>
          </div>
          <Switch
            checked={current.on}
            onChange={(on) => update(rule.id, { on })}
            label={t(rule.titleKey)}
          />
        </div>

        {/* The settings dim rather than disappear, so the shape of the rule stays readable. */}
        <div
          className={[
            'flex items-center gap-3 bg-white px-4 py-3.5 transition-opacity',
            current.on ? '' : 'pointer-events-none opacity-40',
          ].join(' ')}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
            <span className="text-sm font-medium text-text-tertiary">{t(rule.leadKey)}</span>

            {rule.options.map((option) => (
              <Chip
                key={option.id}
                active={current.options.includes(option.id)}
                onClick={() => toggleOption(rule, option.id)}
              >
                {t(option.labelKey)}
              </Chip>
            ))}

            {rule.linkTo ? (
              <Link
                to={rule.linkTo.to}
                className="inline-flex h-[38px] items-center rounded-sm border border-primary-700 bg-primary-25 px-3.5 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50"
              >
                {t(rule.linkTo.labelKey)}
              </Link>
            ) : null}

            {rule.second ? (
              <>
                <span className="text-sm font-medium text-text-tertiary">
                  {t(rule.second.leadKey)}
                </span>
                {rule.second.options.map((option) => (
                  <Chip
                    key={option.id}
                    active={current.second === option.id}
                    onClick={() => update(rule.id, { second: option.id })}
                  >
                    {t(option.labelKey)}
                  </Chip>
                ))}
              </>
            ) : null}
          </div>

          <div className="shrink-0">
            <RecipientPicker
              rule={rule}
              value={current.recipients}
              onChange={(recipients) => update(rule.id, { recipients })}
            />
          </div>
        </div>
      </article>
    )
  }

  const CHANNELS = [
    {
      id: 'inFawtir' as const,
      icon: bellIcon,
      title: t('expenditureReminders.channels.inFawtir'),
      note: t('expenditureReminders.channels.inFawtirNote'),
      active: inFawtir,
      onClick: () => setInFawtir((on) => !on),
    },
    {
      id: 'daily' as const,
      icon: mailIcon,
      title: t('expenditureReminders.channels.daily'),
      note: t('expenditureReminders.channels.dailyNote', { time: DIGEST_TIME }),
      active: emailMode === 'daily',
      onClick: () => setEmailMode((mode) => (mode === 'daily' ? 'off' : 'daily')),
    },
    {
      id: 'each' as const,
      icon: mobileIcon,
      title: t('expenditureReminders.channels.each'),
      note: t('expenditureReminders.channels.eachNote'),
      active: emailMode === 'each',
      onClick: () => setEmailMode((mode) => (mode === 'each' ? 'off' : 'each')),
    },
  ]

  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-[1144px] flex-col gap-4 pb-10">
        <div className="max-w-[760px]">
          <h1 className="text-[32px] font-medium leading-[1.2] text-text-primary">
            {t('expenditureReminders.title')}
          </h1>
          <p className="mt-1 text-sm font-medium leading-[1.4] text-[#8f8f8f]">
            {t('expenditureReminders.subtitle')}
          </p>
        </div>

        <div className="flex flex-col gap-4 xl:flex-row">
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <SectionCard step={1} title={t('expenditureReminders.sections.moneyLeaving')}>
              {rulesIn(1).map(renderRule)}
            </SectionCard>

            <SectionCard step={2} title={t('expenditureReminders.sections.sittingStill')}>
              {rulesIn(2).map(renderRule)}
            </SectionCard>

            <SectionCard step={3} title={t('expenditureReminders.sections.howTold')}>
              <div className="grid gap-3 sm:grid-cols-3">
                {CHANNELS.map((channel) => (
                  <button
                    key={channel.id}
                    type="button"
                    aria-pressed={channel.active}
                    onClick={channel.onClick}
                    className={[
                      'rounded-sm border p-4 text-start transition-colors',
                      channel.active
                        ? 'border-primary-700 bg-primary-25'
                        : 'border-border-subtle bg-white hover:border-primary-300',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'flex size-9 items-center justify-center rounded-sm',
                        channel.active ? 'bg-white' : 'bg-surface-background',
                      ].join(' ')}
                    >
                      <img src={channel.icon} alt="" className="size-5" />
                    </span>
                    <span className="mt-3 block text-base font-semibold leading-[1.2] text-text-primary">
                      {channel.title}
                    </span>
                    <span className="mt-1.5 block text-sm font-medium leading-[1.35] text-text-quaternary">
                      {channel.note}
                    </span>
                  </button>
                ))}
              </div>

              {[
                {
                  id: 'weekends',
                  title: t('expenditureReminders.skipWeekends'),
                  note: t('expenditureReminders.skipWeekendsNote'),
                  checked: skipWeekends,
                  onChange: setSkipWeekends,
                },
                {
                  id: 'inRun',
                  title: t('expenditureReminders.stopInRun'),
                  note: t('expenditureReminders.stopInRunNote'),
                  checked: stopInRun,
                  onChange: setStopInRun,
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
                  <Switch checked={row.checked} onChange={row.onChange} label={row.title} />
                </div>
              ))}
            </SectionCard>
          </div>

          {/* What today would send */}
          <aside className="flex w-full flex-col gap-4 xl:w-[340px] xl:shrink-0">
            <section className="rounded-md bg-surface-card p-5">
              <h2 className="border-b border-surface-background pb-4 text-xl font-medium leading-[1.2] text-text-primary">
                {t('expenditureReminders.preview.title')}
              </h2>

              {sending.length === 0 ? (
                <p className="mt-4 rounded-sm bg-surface-background p-4 text-sm font-medium leading-[1.5] text-text-tertiary">
                  {t('expenditureReminders.preview.nothing')}
                </p>
              ) : (
                <>
                  <div className="mt-4 rounded-sm border border-primary-300 bg-primary-25 p-3.5">
                    <p className="text-[11px] font-semibold uppercase leading-[1.4] tracking-[0.6px] text-primary-700">
                      {emailMode === 'daily'
                        ? t('expenditureReminders.preview.oneEmail', {
                            time: DIGEST_TIME,
                            who: audienceText,
                          })
                        : emailMode === 'each'
                          ? t('expenditureReminders.preview.eachEmail', {
                              count: sending.length,
                              who: audienceText,
                            })
                          : t('expenditureReminders.preview.inAppOnly')}
                    </p>
                    <p className="mt-1.5 text-base font-medium leading-[1.3] text-text-primary">
                      {t('expenditureReminders.preview.headline', { count: sending.length })}
                    </p>
                  </div>

                  <ul className="mt-1 flex flex-col">
                    {sending.map((candidate, index) => {
                      const rule = RULES.find((entry) => entry.id === candidate.rule)!
                      const who = state[candidate.rule].recipients
                        .map(
                          (id) =>
                            [...PEOPLE, ...ROLES].find((person) => person.id === id)?.name ?? '',
                        )
                        .join(` ${t('expenditureReminders.and')} `)
                      return (
                        <li
                          key={candidate.id}
                          className={[
                            'flex items-start gap-3 py-3.5',
                            index < sending.length - 1 ? 'border-b border-surface-background' : '',
                          ].join(' ')}
                        >
                          <span
                            className={[
                              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm',
                              RULE_TILE[rule.tone],
                            ].join(' ')}
                          >
                            <img src={RULE_ICON[rule.icon]} alt="" className="size-4" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold leading-[1.3] text-text-primary">
                              {t(candidate.titleKey, { days: candidate.days })}
                            </p>
                            <p className="mt-1 text-xs font-medium leading-[1.3] text-text-quaternary">
                              {withRial(t(candidate.amountKey))} ·{' '}
                              {t('expenditureReminders.preview.to')} {who}
                            </p>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </>
              )}
            </section>

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
      </div>
    </AppShell>
  )
}
