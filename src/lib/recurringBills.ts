/**
 * Recurring bills — Expenditure › Recurring bills (Figma 86:17024, 86:9580, 86:9939).
 *
 * A recurring bill is a *watch*, not a document. Fawtir never creates one: it knows roughly when
 * a bill should turn up and for roughly how much, then tells you when nothing came or when the
 * amount moved. Everything on these screens follows from that one idea.
 */

/** What the watch is currently saying about this bill. */
export type WatchState = 'late' | 'asExpected' | 'dueToArrive' | 'paused' | 'stopped'

/** Left tile glyph, picked from what the bill is for. */
export type BillCategory = 'premises' | 'power' | 'internet' | 'software' | 'delivery'

/** The middle column changes its heading with the state. */
export type TimingKind = 'expected' | 'lastArrived' | 'paused'

/** The one action the row offers, when it offers one. */
export type WatchAction = 'chase' | 'whyTheJump' | 'resume'

export type RecurringBill = {
  id: string
  title: string
  supplier: string
  cadenceKey: string
  category: BillCategory
  state: WatchState
  timingKind: TimingKind
  /** Already formatted; the heading above it says what the date means. */
  timingDate: string
  timingNoteKey: string
  /** Tone of that note — amber when something is wrong. */
  timingTone: 'warn' | 'ok' | 'muted'
  amount: string
  amountNoteKey: string
  /** Amber when the amount has moved outside its tolerance. */
  amountTone: 'warn' | 'muted'
  action?: WatchAction
}

export type RecurringTabId = 'active' | 'late' | 'paused' | 'all'

export const RECURRING_TABS: { id: RecurringTabId; labelKey: string }[] = [
  { id: 'active', labelKey: 'recurringBills.tabs.active' },
  { id: 'late', labelKey: 'recurringBills.tabs.late' },
  { id: 'paused', labelKey: 'recurringBills.tabs.paused' },
  { id: 'all', labelKey: 'recurringBills.tabs.all' },
]

/** Which watch states each tab covers; `all` takes everything. */
export const RECURRING_TAB_STATES: Record<RecurringTabId, WatchState[]> = {
  active: ['late', 'asExpected', 'dueToArrive', 'paused'],
  late: ['late'],
  paused: ['paused'],
  all: [],
}

export const RECURRING_BILLS: RecurringBill[] = [
  {
    id: 'shop-rent-nizwa',
    title: 'Shop rent — Nizwa branch',
    supplier: 'Al Bahja Properties',
    cadenceKey: 'recurringBills.cadence.monthly28',
    category: 'premises',
    state: 'late',
    timingKind: 'expected',
    timingDate: '28 Aug 2026',
    timingNoteKey: 'recurringBills.rows.nothingArrived',
    timingTone: 'warn',
    amount: '1,200.000',
    amountNoteKey: 'recurringBills.rows.sameFor11Months',
    amountTone: 'muted',
    action: 'chase',
  },
  {
    id: 'electricity',
    title: 'Electricity',
    supplier: 'Mazoon Electricity',
    cadenceKey: 'recurringBills.cadence.monthly12',
    category: 'power',
    state: 'asExpected',
    timingKind: 'lastArrived',
    timingDate: '12 Jul 2026',
    timingNoteKey: 'recurringBills.rows.matchedAndPaid',
    timingTone: 'ok',
    amount: '318.400',
    amountNoteKey: 'recurringBills.rows.up22',
    amountTone: 'warn',
    action: 'whyTheJump',
  },
  {
    id: 'internet-phone',
    title: 'Internet & phone',
    supplier: 'Omantel',
    cadenceKey: 'recurringBills.cadence.monthly1st',
    category: 'internet',
    state: 'dueToArrive',
    timingKind: 'expected',
    timingDate: '1 Aug 2026',
    timingNoteKey: 'recurringBills.rows.inTwoDays',
    timingTone: 'muted',
    amount: '84.200',
    amountNoteKey: 'recurringBills.rows.sameEachMonth',
    amountTone: 'muted',
  },
  {
    id: 'accounting-software',
    title: 'Accounting software',
    supplier: 'Sahl Cloud LLC',
    cadenceKey: 'recurringBills.cadence.yearlyMarch',
    category: 'software',
    state: 'asExpected',
    timingKind: 'lastArrived',
    timingDate: '3 Mar 2026',
    timingNoteKey: 'recurringBills.rows.matchedAndPaid',
    timingTone: 'ok',
    amount: '540.000',
    amountNoteKey: 'recurringBills.rows.nextDueMar2027',
    amountTone: 'muted',
  },
  {
    id: 'weekly-cold-delivery',
    title: 'Weekly cold delivery',
    supplier: 'Gulf Cold Logistics',
    cadenceKey: 'recurringBills.cadence.weeklySundays',
    category: 'delivery',
    state: 'paused',
    timingKind: 'paused',
    timingDate: 'recurringBills.rows.since22Jul',
    timingNoteKey: 'recurringBills.rows.disputeOpen',
    timingTone: 'muted',
    amount: '96.000',
    amountNoteKey: 'recurringBills.rows.perWeek',
    amountTone: 'muted',
    action: 'resume',
  },
  {
    id: 'window-cleaning',
    title: 'Window cleaning',
    supplier: 'Bright Facilities LLC',
    cadenceKey: 'recurringBills.cadence.monthly1st',
    category: 'premises',
    state: 'stopped',
    timingKind: 'paused',
    timingDate: 'recurringBills.rows.stoppedApr',
    timingNoteKey: 'recurringBills.rows.contractEnded',
    timingTone: 'muted',
    amount: '45.000',
    amountNoteKey: 'recurringBills.rows.perMonth',
    amountTone: 'muted',
  },
]

/* ------------------------------------------------------------- the new form */

export const PREPARED_BY_OPTIONS = [
  { value: 'Al Bahja Properties', label: 'Al Bahja Properties', hint: 'VAT OM1100201477' },
  { value: 'Mazoon Electricity', label: 'Mazoon Electricity', hint: 'VAT OM1100901220' },
  { value: 'Omantel', label: 'Omantel', hint: 'VAT OM1100112040' },
  { value: 'Sahl Cloud LLC', label: 'Sahl Cloud LLC', hint: 'VAT OM1100664220' },
  { value: 'Gulf Cold Logistics', label: 'Gulf Cold Logistics', hint: 'VAT OM1100582341' },
]

export const CATEGORY_OPTIONS = [
  { value: 'Rent & premises', label: 'Rent & premises' },
  { value: 'Utilities', label: 'Utilities' },
  { value: 'Telecoms', label: 'Telecoms' },
  { value: 'Software & subscriptions', label: 'Software & subscriptions' },
  { value: 'Logistics', label: 'Logistics' },
  { value: 'Professional fees', label: 'Professional fees' },
]

export type Cadence = 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export const CADENCES: { id: Cadence; labelKey: string }[] = [
  { id: 'weekly', labelKey: 'recurringBills.form.weekly' },
  { id: 'monthly', labelKey: 'recurringBills.form.monthly' },
  { id: 'quarterly', labelKey: 'recurringBills.form.quarterly' },
  { id: 'yearly', labelKey: 'recurringBills.form.yearly' },
]

/** Day-of-month choices for a monthly watch. */
export const DAY_OPTIONS = Array.from({ length: 28 }, (_, index) => {
  const day = index + 1
  const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'
  return { value: `${day}${suffix}`, label: `${day}${suffix}` }
})

export const PAYMENT_DUE_OPTIONS = [
  { value: 'On arrival', label: 'On arrival' },
  { value: '5th of the next month', label: '5th of the next month' },
  { value: '10th of the next month', label: '10th of the next month' },
  { value: '30 days after it arrives', label: '30 days after it arrives' },
]

export const VAT_TREATMENT_OPTIONS = [
  { value: 'Standard rate · 5%', label: 'Standard rate · 5%' },
  { value: 'Zero rated · 0%', label: 'Zero rated · 0%' },
  { value: 'Exempt', label: 'Exempt' },
  { value: 'Out of scope', label: 'Out of scope' },
]

export const CHASE_AFTER_OPTIONS = [
  { value: 'Straight away', label: 'Straight away' },
  { value: 'After 2 days', label: 'After 2 days' },
  { value: 'After 5 days', label: 'After 5 days' },
  { value: 'After a week', label: 'After a week' },
]

export const NOTIFY_OPTIONS = [
  { value: 'Yusuf Al Balushi', label: 'Yusuf Al Balushi', hint: 'Accounts' },
  { value: 'Hafidh Saif', label: 'Hafidh Saif', hint: 'Owner' },
  { value: 'Mariam Al Hinai', label: 'Mariam Al Hinai', hint: 'Operations' },
]

/* ---------------------------------------------------------------- the detail */

export type MonthRow = {
  id: string
  month: string
  expected: string
  /** Absent while nothing has arrived for that month. */
  bill?: string
  arrivedKey: string
  arrivedTone: 'ok' | 'warn' | 'muted'
  amount: string
  amountNoteKey: string
  paidKey: string
  paidTone: 'ok' | 'muted'
}

/** One bar of the twelve-month chart. */
export type CostBar = {
  month: string
  /** Relative height, 0–1. */
  height: number
  tone: 'paid' | 'recent' | 'expected'
}

export const RECURRING_DETAIL = {
  id: 'shop-rent-nizwa',
  title: 'Shop rent Nizwa branch',
  supplier: 'Al Bahja Properties',
  usual: '1,200.000',
  watchedSince: 'Sep 2025',
  cadenceChipKey: 'recurringBills.detail.monthlyAround28',

  alert: {
    titleKey: 'recurringBills.detail.alertTitle',
    bodyKey: 'recurringBills.detail.alertBody',
  },

  chart: {
    noteKey: 'recurringBills.detail.flatFor11',
    bars: [
      { month: 'Aug', height: 1, tone: 'paid' },
      { month: 'Sep', height: 1, tone: 'paid' },
      { month: 'Oct', height: 1, tone: 'paid' },
      { month: 'Nov', height: 1, tone: 'paid' },
      { month: 'Dec', height: 1, tone: 'paid' },
      { month: 'Jan', height: 1, tone: 'paid' },
      { month: 'Feb', height: 1, tone: 'paid' },
      { month: 'Mar', height: 1, tone: 'paid' },
      { month: 'Apr', height: 1, tone: 'paid' },
      { month: 'May', height: 1, tone: 'paid' },
      { month: 'Jun', height: 1, tone: 'recent' },
      { month: 'Jul ?', height: 1, tone: 'expected' },
    ] satisfies CostBar[],
  },

  months: [
    {
      id: 'jul',
      month: 'July 2026',
      expected: 'Expected 28 Jul',
      arrivedKey: 'recurringBills.detail.twoDaysLate',
      arrivedTone: 'warn',
      amount: '1,200.000',
      amountNoteKey: 'recurringBills.detail.expectedAmount',
      paidKey: 'recurringBills.detail.due5Aug',
      paidTone: 'muted',
    },
    {
      id: 'jun',
      month: 'June 2026',
      expected: 'Expected 28 Jun',
      bill: 'ABP-INV-0331',
      arrivedKey: 'recurringBills.detail.onThe27th',
      arrivedTone: 'ok',
      amount: '1,200.000',
      amountNoteKey: 'recurringBills.detail.sameAsUsual',
      paidKey: 'recurringBills.detail.paid4Jul',
      paidTone: 'ok',
    },
    {
      id: 'may',
      month: 'May 2026',
      expected: 'Expected 28 May',
      bill: 'ABP-INV-0318',
      arrivedKey: 'recurringBills.detail.onThe28th',
      arrivedTone: 'ok',
      amount: '1,200.000',
      amountNoteKey: 'recurringBills.detail.sameAsUsual',
      paidKey: 'recurringBills.detail.paid3Jun',
      paidTone: 'ok',
    },
    {
      id: 'apr',
      month: 'April 2026',
      expected: 'Expected 28 Apr',
      bill: 'ABP-INV-0302',
      arrivedKey: 'recurringBills.detail.fourDaysLate',
      arrivedTone: 'warn',
      amount: '1,200.000',
      amountNoteKey: 'recurringBills.detail.sameAsUsual',
      paidKey: 'recurringBills.detail.paid6May',
      paidTone: 'ok',
    },
    {
      id: 'mar',
      month: 'March 2026',
      expected: 'Expected 28 Mar',
      bill: 'ABP-INV-0288',
      arrivedKey: 'recurringBills.detail.onThe26th',
      arrivedTone: 'ok',
      amount: '1,200.000',
      amountNoteKey: 'recurringBills.detail.sameAsUsual',
      paidKey: 'recurringBills.detail.paid2Apr',
      paidTone: 'ok',
    },
  ] satisfies MonthRow[],
  monthsTotal: 11,

  expects: {
    howOften: 'recurringBills.form.monthly',
    arrivesAround: 'recurringBills.detail.the28th',
    paymentDue: 'recurringBills.detail.fifthOfNext',
    usualAmount: '1,200.000',
    flagOutside: '1,080 – 1,320',
    noteKey: 'recurringBills.detail.doesNotCreate',
  },

  tellsYou: {
    ifNothing: 'recurringBills.detail.after2Days',
    ifAmountOff: 'recurringBills.detail.on',
    approveAutomatically: 'recurringBills.detail.off',
    whoGetsTold: 'Yusuf Al Balushi',
  },

  trackRecord: {
    matched: '11 of 11',
    onTime: '10 of 11',
    everChanged: 'recurringBills.detail.never',
    paidThisYear: '8,400.000',
    costPerYear: '14,400.000',
  },

  supplierCard: {
    name: 'Al Bahja Properties',
    vat: 'OM1100201477',
    sendsBy: 'recurringBills.detail.emailPdf',
    contact: 'rent@albahjaprop.om',
    noteKey: 'recurringBills.detail.notOnPeppol',
  },

  activity: [
    {
      id: 'a1',
      titleKey: 'recurringBills.detail.activity.flagged',
      detailKey: 'recurringBills.detail.activity.flaggedDetail',
      tone: 'current' as const,
    },
    {
      id: 'a2',
      titleKey: 'recurringBills.detail.activity.junePaid',
      detailKey: 'recurringBills.detail.activity.junePaidDetail',
      tone: 'done' as const,
    },
    {
      id: 'a3',
      titleKey: 'recurringBills.detail.activity.tolerance',
      detailKey: 'recurringBills.detail.activity.toleranceDetail',
      tone: 'done' as const,
    },
    {
      id: 'a4',
      titleKey: 'recurringBills.detail.activity.started',
      detailKey: 'recurringBills.detail.activity.startedDetail',
      tone: 'done' as const,
    },
  ],
}

/** `1,200.000` → 1200. */
export const toNumber = (amount: string) => Number(amount.replace(/,/g, '')) || 0

/** Back to the display form at OMR's three decimals. */
export const toOmr = (value: number) =>
  value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
