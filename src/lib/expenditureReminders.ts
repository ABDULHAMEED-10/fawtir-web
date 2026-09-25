import type {
  ReminderDeliveryDto,
  ReminderPreviewDto,
  ReminderRuleDto,
  ReminderRuleTypeDto,
} from '../api/expenditure/billReminders'

/**
 * The Reminders frame's catalogue (Figma 163:21448) over the API's rule types (E-14).
 *
 * The frame draws each rule as a row of timing chips and a picker for who is told; the API keeps
 * an offsets ladder, a repeat on the late rule, an escalation on the stale-approval rule and a
 * recipient set. Each chip here is one offset; a saved offset the frame does not draw becomes an
 * extra chip so nothing on file is hidden or lost on save.
 */

export type RuleOption = { offset: number; labelKey: string }

export type RuleSpec = {
  type: ReminderRuleTypeDto
  section: 1 | 2
  icon: 'clock' | 'alert' | 'discount' | 'approval' | 'eye' | 'camera' | 'calendar'
  /** Tint behind the rule's icon. */
  tone: 'blue' | 'red' | 'green' | 'grey' | 'sand'
  /** The word before the chips: "Remind", "Chase", "Warn". */
  leadKey: string
  options: RuleOption[]
  /** More than one timing can be on at once (7 days *and* 2 days before). */
  multi: boolean
  /** LATE only: the "then every N days" chip, which is `repeatEveryDays`. */
  repeat?: { days: number; labelKey: string }
  /** APPROVAL_STALE only: the second chip group, which is `escalationOffsets`. */
  escalation?: { leadKey: string; options: RuleOption[] }
  /** Who is told: named people, or whoever the document itself points at. */
  recipients: 'people' | 'derived'
  derivedKey?: string
  /** "Set per bill on Recurring bills": the timing lives on each bill, not here. */
  linkTo?: { labelKey: string; to: string }
}

const days = (offsets: number[], keys: string[]): RuleOption[] =>
  offsets.map((offset, index) => ({
    offset,
    labelKey: `expenditureReminders.options.${keys[index]}`,
  }))

export const RULE_SPECS: RuleSpec[] = [
  {
    type: 'BEFORE_DUE',
    section: 1,
    icon: 'clock',
    tone: 'blue',
    leadKey: 'expenditureReminders.leads.remind',
    options: days([7, 2, 0], ['sevenBefore', 'twoBefore', 'onTheDay']),
    multi: true,
    recipients: 'people',
  },
  {
    type: 'LATE',
    section: 1,
    icon: 'alert',
    tone: 'red',
    leadKey: 'expenditureReminders.leads.chase',
    options: days([1], ['dayAfter']),
    multi: true,
    repeat: { days: 3, labelKey: 'expenditureReminders.options.everyThree' },
    recipients: 'people',
  },
  {
    type: 'DISCOUNT_EXPIRY',
    section: 1,
    icon: 'discount',
    tone: 'green',
    leadKey: 'expenditureReminders.leads.warn',
    options: days([3], ['threeBeforeExpiry']),
    multi: false,
    recipients: 'people',
  },
  {
    type: 'APPROVAL_STALE',
    section: 2,
    icon: 'approval',
    tone: 'blue',
    leadKey: 'expenditureReminders.leads.nudgeApprover',
    options: days([1, 2, 3], ['oneDay', 'twoDays', 'threeDays']),
    multi: false,
    escalation: {
      leadKey: 'expenditureReminders.leads.thenOwner',
      options: days([5, 7], ['fiveDays', 'sevenDays']),
    },
    recipients: 'derived',
    derivedKey: 'expenditureReminders.derived.APPROVAL_STALE',
  },
  {
    type: 'MISMATCH_STALE',
    section: 2,
    icon: 'eye',
    tone: 'grey',
    leadKey: 'expenditureReminders.leads.remindAfter',
    options: days([1, 3, 7], ['oneDay', 'threeDays', 'aWeek']),
    multi: false,
    recipients: 'people',
  },
  {
    type: 'SCAN_UNCONFIRMED',
    section: 2,
    icon: 'camera',
    tone: 'grey',
    leadKey: 'expenditureReminders.leads.remindAfter',
    options: days([2, 7], ['twoDays', 'aWeek']),
    multi: false,
    recipients: 'derived',
    derivedKey: 'expenditureReminders.derived.SCAN_UNCONFIRMED',
  },
  {
    // Never a rule: it is set on each recurring bill and the server refuses a row for it.
    type: 'RECURRING_LATE',
    section: 2,
    icon: 'calendar',
    tone: 'sand',
    leadKey: 'expenditureReminders.leads.setPerBill',
    options: [],
    multi: false,
    recipients: 'derived',
    derivedKey: 'expenditureReminders.derived.RECURRING_LATE',
    linkTo: {
      labelKey: 'expenditureReminders.options.recurringBills',
      to: '/expenditure/recurring-bills',
    },
  },
]

export const RULES_IN_SECTION = (section: 1 | 2) =>
  RULE_SPECS.filter((spec) => spec.section === section)

/** The frame's chips, plus one for any saved offset the frame does not draw. */
export function chipOptions(options: RuleOption[], offsets: number[]): RuleOption[] {
  const extra = offsets
    .filter((offset) => !options.some((option) => option.offset === offset))
    .sort((a, b) => a - b)
  return [
    ...options,
    ...extra.map((offset) => ({ offset, labelKey: 'expenditureReminders.options.nDays' })),
  ]
}

/** A single-choice rule swaps its offset; a multi-choice one toggles it and keeps the ladder's order. */
export function toggleOffset(offsets: number[], offset: number, multi: boolean): number[] {
  if (!multi) return offsets.length === 1 && offsets[0] === offset ? [] : [offset]
  return offsets.includes(offset)
    ? offsets.filter((value) => value !== offset)
    : [...offsets, offset]
}

/** The rules the footer counts as on: every enabled rule, and the recurring one, which is always set per bill. */
export function rulesOn(rules: ReminderRuleDto[]): number {
  return rules.filter((rule) => rule.enabled).length + 1
}

export type PreviewLine = {
  id: string
  ruleType: ReminderRuleTypeDto
  headline: string
  amount: number | null
  currency: string | null
  recipients: string[]
}

/** The preview is grouped per person; the frame lists each thing once, naming everyone it goes to. */
export function flattenPreview(preview: ReminderPreviewDto): PreviewLine[] {
  const lines = new Map<string, PreviewLine>()
  for (const group of preview.groups) {
    const who = group.displayName ?? group.recipientUserId
    for (const item of group.items) {
      const id = `${item.ruleType}:${item.subjectId}:${item.daysFromDue}`
      const line = lines.get(id) ?? {
        id,
        ruleType: item.ruleType,
        headline: item.headline,
        amount: item.amount,
        currency: item.currency,
        recipients: [],
      }
      if (!line.recipients.includes(who)) line.recipients.push(who)
      lines.set(id, line)
    }
  }
  return [...lines.values()]
}

export function audienceOf(preview: ReminderPreviewDto): string[] {
  return preview.groups.map((group) => group.displayName ?? group.recipientUserId)
}

/** "Yusuf", "Yusuf and Hafidh", "Yusuf, Hafidh and Aisha". */
export function joinNames(names: string[], and: string): string {
  if (names.length <= 1) return names.join('')
  return `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`
}

export const DELIVERIES: {
  value: ReminderDeliveryDto
  icon: 'bell' | 'mail' | 'mobile'
  titleKey: string
  noteKey: string
}[] = [
  {
    value: 'IN_APP',
    icon: 'bell',
    titleKey: 'expenditureReminders.channels.inFawtir',
    noteKey: 'expenditureReminders.channels.inFawtirNote',
  },
  {
    value: 'DAILY_DIGEST',
    icon: 'mail',
    titleKey: 'expenditureReminders.channels.daily',
    noteKey: 'expenditureReminders.channels.dailyNote',
  },
  {
    value: 'IMMEDIATE_EMAIL',
    icon: 'mobile',
    titleKey: 'expenditureReminders.channels.each',
    noteKey: 'expenditureReminders.channels.eachNote',
  },
]
