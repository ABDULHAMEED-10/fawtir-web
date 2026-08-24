/**
 * Reminders about money going out — Expenditure › Reminders (Figma 86:13150).
 *
 * These never reach a supplier. They are the nudges Fawtir sends *your* team: pay this before
 * it is late, this approval has not moved, this discount is about to lapse. Chasing a customer
 * for money they owe you is the Income-side screen.
 *
 * The right-hand "What today would send" panel is not a static illustration — it is derived
 * from the rules below, so switching a rule off or changing a timing chip changes what the
 * morning email would contain.
 */

/** Who a rule tells. Real people, or a role resolved per document. */
export type Recipient = {
  id: string
  name: string
  /** Roles ("Whoever scanned it") have no avatar and read as a placeholder. */
  role?: boolean
}

export const PEOPLE: Recipient[] = [
  { id: 'yusuf', name: 'Yusuf' },
  { id: 'hafidh', name: 'Hafidh' },
  { id: 'aisha', name: 'Aisha' },
]

export const ROLES: Recipient[] = [
  { id: 'scanner', name: 'Whoever scanned it', role: true },
  { id: 'namedOnEach', name: 'The person named on each', role: true },
]

/** One timing choice inside a rule, e.g. "7 days before". */
export type RuleOption = {
  id: string
  labelKey: string
  /** Days before (positive) or after (negative) the event this fires. */
  offset: number
}

export type RuleId =
  | 'beforeDue'
  | 'whenLate'
  | 'discountExpiry'
  | 'approvalStuck'
  | 'mismatch'
  | 'scannedReceipt'
  | 'recurringMissing'

export type Rule = {
  id: RuleId
  section: 1 | 2
  icon: 'clock' | 'alert' | 'discount' | 'approval' | 'eye' | 'camera' | 'calendar'
  /** Tint behind the rule's icon. */
  tone: 'blue' | 'red' | 'green' | 'grey' | 'sand'
  titleKey: string
  noteKey: string
  /** The word before the chips — "Remind", "Chase", "Warn". */
  leadKey: string
  options: RuleOption[]
  /** More than one timing can be on at once (7 days *and* 2 days before). */
  multi: boolean
  defaultOptions: string[]
  /**
   * A second chip group, for the rules that escalate: nudge one person, then another.
   * The lead reads between the two groups.
   */
  second?: { leadKey: string; options: RuleOption[]; defaultOption: string }
  /** Recipients the rule starts with. */
  defaultRecipients: string[]
  /** Rules that resolve their recipient per document offer roles instead of people. */
  roleOnly?: boolean
  /** "Set per bill on Recurring bills" — the timing lives on each bill, not here. */
  linkTo?: { labelKey: string; to: string }
  defaultOn: boolean
}

const DAY_OPTIONS = (ids: [string, string, string], offsets: [number, number, number]) =>
  ids.map((id, index) => ({
    id,
    labelKey: `expenditureReminders.options.${id}`,
    offset: offsets[index],
  }))

export const RULES: Rule[] = [
  {
    id: 'beforeDue',
    section: 1,
    icon: 'clock',
    tone: 'blue',
    titleKey: 'expenditureReminders.rules.beforeDue.title',
    noteKey: 'expenditureReminders.rules.beforeDue.note',
    leadKey: 'expenditureReminders.leads.remind',
    options: DAY_OPTIONS(['sevenBefore', 'twoBefore', 'onTheDay'], [7, 2, 0]),
    multi: true,
    defaultOptions: ['sevenBefore', 'twoBefore'],
    defaultRecipients: ['yusuf'],
    defaultOn: true,
  },
  {
    id: 'whenLate',
    section: 1,
    icon: 'alert',
    tone: 'red',
    titleKey: 'expenditureReminders.rules.whenLate.title',
    noteKey: 'expenditureReminders.rules.whenLate.note',
    leadKey: 'expenditureReminders.leads.chase',
    options: [
      { id: 'dayAfter', labelKey: 'expenditureReminders.options.dayAfter', offset: -1 },
      { id: 'everyThree', labelKey: 'expenditureReminders.options.everyThree', offset: -3 },
    ],
    multi: true,
    defaultOptions: ['dayAfter', 'everyThree'],
    defaultRecipients: ['yusuf', 'hafidh'],
    defaultOn: true,
  },
  {
    id: 'discountExpiry',
    section: 1,
    icon: 'discount',
    tone: 'green',
    titleKey: 'expenditureReminders.rules.discountExpiry.title',
    noteKey: 'expenditureReminders.rules.discountExpiry.note',
    leadKey: 'expenditureReminders.leads.warn',
    options: [
      {
        id: 'threeBeforeExpiry',
        labelKey: 'expenditureReminders.options.threeBeforeExpiry',
        offset: 3,
      },
    ],
    multi: false,
    defaultOptions: ['threeBeforeExpiry'],
    defaultRecipients: ['hafidh'],
    defaultOn: true,
  },
  {
    id: 'approvalStuck',
    section: 2,
    icon: 'approval',
    tone: 'blue',
    titleKey: 'expenditureReminders.rules.approvalStuck.title',
    noteKey: 'expenditureReminders.rules.approvalStuck.note',
    leadKey: 'expenditureReminders.leads.nudgeApprover',
    options: [
      { id: 'twoDays', labelKey: 'expenditureReminders.options.twoDays', offset: 2 },
      { id: 'threeDays', labelKey: 'expenditureReminders.options.threeDays', offset: 3 },
    ],
    multi: false,
    defaultOptions: ['twoDays'],
    second: {
      leadKey: 'expenditureReminders.leads.thenOwner',
      options: [
        { id: 'fiveDays', labelKey: 'expenditureReminders.options.fiveDays', offset: 5 },
        { id: 'sevenDays', labelKey: 'expenditureReminders.options.sevenDays', offset: 7 },
      ],
      defaultOption: 'fiveDays',
    },
    defaultRecipients: ['hafidh'],
    defaultOn: true,
  },
  {
    id: 'mismatch',
    section: 2,
    icon: 'eye',
    tone: 'grey',
    titleKey: 'expenditureReminders.rules.mismatch.title',
    noteKey: 'expenditureReminders.rules.mismatch.note',
    leadKey: 'expenditureReminders.leads.remindAfter',
    options: DAY_OPTIONS(['oneDay', 'threeDays', 'aWeek'], [1, 3, 7]),
    multi: false,
    defaultOptions: ['threeDays'],
    defaultRecipients: ['yusuf'],
    defaultOn: true,
  },
  {
    id: 'scannedReceipt',
    section: 2,
    icon: 'camera',
    tone: 'grey',
    titleKey: 'expenditureReminders.rules.scannedReceipt.title',
    noteKey: 'expenditureReminders.rules.scannedReceipt.note',
    leadKey: 'expenditureReminders.leads.remindAfter',
    options: [
      { id: 'twoDays', labelKey: 'expenditureReminders.options.twoDays', offset: 2 },
      { id: 'aWeek', labelKey: 'expenditureReminders.options.aWeek', offset: 7 },
    ],
    multi: false,
    defaultOptions: ['twoDays'],
    defaultRecipients: ['scanner'],
    roleOnly: true,
    defaultOn: true,
  },
  {
    id: 'recurringMissing',
    section: 2,
    icon: 'calendar',
    tone: 'sand',
    titleKey: 'expenditureReminders.rules.recurringMissing.title',
    noteKey: 'expenditureReminders.rules.recurringMissing.note',
    leadKey: 'expenditureReminders.leads.setPerBill',
    options: [],
    multi: false,
    defaultOptions: [],
    linkTo: {
      labelKey: 'expenditureReminders.options.recurringBills',
      to: '/expenditure/recurring-bills',
    },
    defaultRecipients: ['namedOnEach'],
    roleOnly: true,
    defaultOn: true,
  },
]

/* ------------------------------------------------------- what today would send */

/**
 * The things sitting in the ledger this morning that a rule could fire on.
 *
 * `days` is how far the event is — days until due for `beforeDue`, days overdue for `whenLate`,
 * days waiting for `approvalStuck`. A candidate appears in the panel only when its rule is on
 * and one of the rule's chosen timings actually matches, which is what makes the panel move
 * when a chip is clicked.
 */
export type Candidate = {
  id: string
  rule: RuleId
  titleKey: string
  amountKey: string
  days: number
}

export const CANDIDATES: Candidate[] = [
  {
    id: 'alNoor',
    rule: 'whenLate',
    titleKey: 'expenditureReminders.preview.alNoor',
    amountKey: 'expenditureReminders.preview.alNoorAmount',
    days: 9,
  },
  {
    /**
     * Figma prints "due in 4 days" against a rule set to 7 and 2 days before, so as drawn this
     * line could never fire. Seven puts it on the earlier of the two chosen timings.
     */
    id: 'sohar',
    rule: 'beforeDue',
    titleKey: 'expenditureReminders.preview.sohar',
    amountKey: 'expenditureReminders.preview.soharAmount',
    days: 7,
  },
  {
    id: 'discount',
    rule: 'discountExpiry',
    titleKey: 'expenditureReminders.preview.discount',
    amountKey: 'expenditureReminders.preview.discountAmount',
    days: 3,
  },
  {
    id: 'approvals',
    rule: 'approvalStuck',
    titleKey: 'expenditureReminders.preview.approvals',
    amountKey: 'expenditureReminders.preview.approvalsAmount',
    days: 6,
  },
]

/** How the team hears about all this. */
export type EmailMode = 'daily' | 'each' | 'off'

export const DIGEST_TIME = '08:00'
