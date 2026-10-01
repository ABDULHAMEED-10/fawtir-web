import type {
  ExpectationState,
  NotWatchedDto,
  RecurrenceInterval,
  RecurringBillDto,
  RecurringBillRequestDto,
  RecurringChaseDto,
  RecurringListState,
  RecurringMode,
  RecurringRunDto,
} from '../api/expenditure/recurringBills'

/**
 * Recurring bills (E-12; Figma 163:23795, 163:17821, 163:18190).
 *
 * A recurring bill is a standing instruction, not a document. The frames draw the watch: Fawtir
 * expects the supplier's bill around a day, tells you when nothing came or the amount moved, and
 * never writes the bill itself. The API also has a `RAISE` mode; a watch saved in it keeps it and
 * the form asks only for its first date.
 */

export const RECURRING_TABS: RecurringListState[] = ['ACTIVE', 'LATE', 'PAUSED', 'ALL']

export const INTERVALS: RecurrenceInterval[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']

export const MODES: RecurringMode[] = ['EXPECT', 'RAISE']

export const PER_YEAR: Record<RecurrenceInterval, number> = {
  WEEKLY: 52,
  MONTHLY: 12,
  QUARTERLY: 4,
  ANNUALLY: 1,
}

/** The colour a state is read in: amber when something wants attention. */
export const EXPECTATION_TONE: Record<ExpectationState, 'warn' | 'ok' | 'muted'> = {
  LATE: 'warn',
  ARRIVED_OUT_OF_RANGE: 'warn',
  ARRIVED: 'ok',
  DUE_TO_ARRIVE: 'muted',
}

export type StateNote = { key: string; values?: Record<string, string | number> }

/**
 * What the row says about the watch. A paused watch says so before anything else: its expectation
 * is whatever it was when watching stopped. A RAISE watch has no expectation at all: it says when
 * it will next write a bill.
 */
export function stateNote(bill: RecurringBillDto): StateNote {
  if (isEnded(bill)) return { key: 'recurringBills.state.ended' }
  if (!bill.active) return { key: 'recurringBills.state.paused' }
  if (bill.mode === 'RAISE') {
    return bill.nextRunDate
      ? { key: 'recurringBills.state.willRaise', values: { date: bill.nextRunDate } }
      : { key: 'recurringBills.state.noNextRun' }
  }
  const expectation = bill.expectation
  if (!expectation) return { key: 'recurringBills.state.watching' }
  switch (expectation.state) {
    case 'LATE':
      return { key: 'recurringBills.state.late', values: { count: expectation.lateDays ?? 0 } }
    case 'ARRIVED':
      return { key: 'recurringBills.state.arrived' }
    case 'ARRIVED_OUT_OF_RANGE':
      return {
        key: 'recurringBills.state.outOfRange',
        values: { percent: formatVariance(expectation.variancePercent) },
      }
    case 'DUE_TO_ARRIVE':
      return { key: 'recurringBills.state.dueToArrive' }
  }
}

/** A finished instruction: its count ran out or its end date passed. It is not paused, and cannot be resumed. */
export function isEnded(bill: Pick<RecurringBillDto, 'status' | 'ended'>): boolean {
  return bill.status === 'ENDED' || bill.ended === true
}

/**
 * Whether Resume is offered. Never on an ended instruction. One paused because its supplier was
 * switched off stays without it while the supplier is off: `supplierSwitchedOff` is what the
 * supplier's own record says, `null` while that is not known yet.
 */
export function canResume(
  bill: Pick<RecurringBillDto, 'active' | 'status' | 'ended' | 'pauseReason'>,
  supplierSwitchedOff: boolean | null,
): boolean {
  if (bill.active || isEnded(bill)) return false
  if (bill.pauseReason === 'SUPPLIER_SWITCHED_OFF') return supplierSwitchedOff === false
  return true
}

/**
 * What a chase answered: who was told, or that nobody was. A server that does not say (`told`
 * absent) and a person with no name on file both read as the sentence without a name.
 */
export function chaseNotice(answer: RecurringChaseDto): StateNote {
  if (answer.told === false) return { key: 'recurringBills.done.chasedNobody' }
  const name = answer.toldNames?.[0]?.trim()
  return answer.told && name
    ? { key: 'recurringBills.done.chasedTold', values: { name } }
    : { key: 'recurringBills.done.chased' }
}

export function toneOf(bill: RecurringBillDto): 'warn' | 'ok' | 'muted' {
  if (!bill.active) return 'muted'
  return bill.expectation ? EXPECTATION_TONE[bill.expectation.state] : 'muted'
}

/** A signed percentage as a person reads it: "up 22%" is 22, "down 5%" is −5. */
export function formatVariance(percent: number | null): string {
  if (percent === null) return '—'
  const rounded = percent.toFixed(1).replace(/\.0$/, '')
  return `${percent > 0 ? '+' : ''}${rounded}%`
}

/** Chase is refused on a RAISE watch and on a paused one; the page knows both before asking. */
export function chaseBlocker(bill: RecurringBillDto): string | null {
  if (bill.mode !== 'EXPECT') return 'recurringBills.chase.notExpecting'
  if (!bill.active) return 'recurringBills.chase.paused'
  return null
}

/** The server's own refusals, in the page's words. */
export const RECURRING_REFUSALS: Record<string, string> = {
  RECURRING_BILL_ARRIVAL_DAY_REQUIRED: 'recurringBills.error.arrivalDayRequired',
  RECURRING_BILL_ARRIVAL_DAY_INVALID: 'recurringBills.error.arrivalDayInvalid',
  // Draft wording, pending the owner (Wording-For-Abdul.md, "Recurring bill refusal messages").
  // Resume is hidden where the page knows it would be refused, so the first two show when the
  // page is out of date; the next five are Mark as received; the last is a save. Keyed on the
  // code alone: the period and the bill that are gone answer 404, the rest 400.
  RECURRING_BILL_ENDED: 'recurringBills.refused.ended',
  RECURRING_BILL_SUPPLIER_SWITCHED_OFF: 'recurringBills.refused.supplierSwitchedOff',
  RECURRING_BILL_PERIOD_NOT_FOUND: 'recurringBills.refused.periodNotWatched',
  RECURRING_BILL_PERIOD_ALREADY_RECEIVED: 'recurringBills.refused.periodAlreadyReceived',
  RECURRING_BILL_ARRIVAL_BILL_NOT_FOUND: 'recurringBills.refused.billGone',
  RECURRING_BILL_ARRIVAL_ALREADY_MATCHED: 'recurringBills.refused.billAlreadyMatched',
  RECURRING_BILL_ARRIVAL_NOT_ELIGIBLE: 'recurringBills.refused.billNotEligible',
  RECURRING_BILL_END_BEFORE_NEXT_RUN: 'recurringBills.refused.endBeforeNext',
  RECURRING_BILL_DUE_DAY_INVALID: 'recurringBills.error.dueDayInvalid',
  RECURRING_BILL_TOLERANCE_INVALID: 'recurringBills.error.toleranceInvalid',
  RECURRING_BILL_LATE_AFTER_INVALID: 'recurringBills.error.lateAfterInvalid',
  RECURRING_BILL_START_IN_PAST: 'recurringBills.error.startInPast',
  RECURRING_BILL_AMOUNT_INVALID: 'recurringBills.error.amountInvalid',
  RECURRING_BILL_VAT_EXCEEDS_TOTAL: 'recurringBills.error.vatExceedsTotal',
  RECURRING_BILL_NOT_EXPECTING: 'recurringBills.chase.notExpecting',
  RECURRING_BILL_PAUSED: 'recurringBills.chase.paused',
}

/**
 * The same refusals as the add / edit form says them. Draft wording, pending the owner
 * (Wording-For-Abdul.md section 8). A switched-off supplier is one code with two sentences: on
 * the list and the detail it refuses a Resume ("then resume this recurring bill"), on the form
 * it refuses the save, where there is nothing to resume. The person under "who gets told" is
 * chosen on the form alone.
 */
export const RECURRING_FORM_REFUSALS: Record<string, string> = {
  ...RECURRING_REFUSALS,
  RECURRING_BILL_SUPPLIER_SWITCHED_OFF: 'recurringBills.refused.formSupplierSwitchedOff',
  RECURRING_BILL_RECIPIENT_UNKNOWN: 'recurringBills.refused.recipientUnknown',
}

/* -------------------------------------------------------------- the row's words */

/** The tile glyph a watch is drawn with, read off the category it was filed under. */
export type CategoryGlyph = 'premises' | 'power' | 'internet' | 'software' | 'delivery' | 'other'

/** The categories the form offers (Figma 163:17821). The API stores the text as typed. */
export const CATEGORY_OPTIONS: { value: string; key: string; glyph: CategoryGlyph }[] = [
  { value: 'Rent & premises', key: 'premises', glyph: 'premises' },
  { value: 'Utilities', key: 'utilities', glyph: 'power' },
  { value: 'Telecoms', key: 'telecoms', glyph: 'internet' },
  { value: 'Software', key: 'software', glyph: 'software' },
  { value: 'Logistics', key: 'logistics', glyph: 'delivery' },
  { value: 'Professional fees', key: 'fees', glyph: 'other' },
]

export function categoryGlyph(category: string | null): CategoryGlyph {
  const text = (category ?? '').toLowerCase()
  if (/rent|premis|shop|office|clean/.test(text)) return 'premises'
  if (/util|power|electric|water|gas/.test(text)) return 'power'
  if (/tele|internet|phone|mobile/.test(text)) return 'internet'
  if (/soft|subscri|cloud|licen/.test(text)) return 'software'
  if (/logist|deliver|freight|transport/.test(text)) return 'delivery'
  return 'other'
}

/** Weekday names in the order the form lists them: Sunday first, the Omani week's first day. */
export const WEEKDAY_KEYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
]

/**
 * A weekly watch's `arrivesAroundDay` is the ISO weekday, as the server stores and reads it:
 * 1 = Monday … 7 = Sunday. These two are the only place the list's Sunday-first order meets it.
 */
export const WEEKDAY_OPTIONS: { iso: number; key: string }[] = WEEKDAY_KEYS.map((key, index) => ({
  iso: index === 0 ? 7 : index,
  key,
}))

/** The name of an ISO weekday (1 = Monday … 7 = Sunday). */
export function weekdayKey(iso: number): string {
  return WEEKDAY_KEYS[((iso % 7) + 7) % 7]
}

/** "Monthly, around the 28th" / "Weekly, on Sundays" / "Yearly, in March". */
export function cadenceNote(
  bill: Pick<RecurringBillDto, 'interval' | 'arrivesAroundDay' | 'mode' | 'nextRunDate'>,
  language: string,
): StateNote {
  const day = bill.arrivesAroundDay
  if (bill.interval === 'WEEKLY') {
    return day
      ? {
          key: 'recurringBills.cadence.weekly',
          values: { weekday: `recurringBills.weekday.${weekdayKey(day)}` },
        }
      : { key: 'recurringBills.interval.WEEKLY' }
  }
  if (bill.interval === 'ANNUALLY') {
    const iso = bill.nextRunDate
    return iso
      ? { key: 'recurringBills.cadence.yearly', values: { month: monthName(iso, language) } }
      : { key: 'recurringBills.interval.ANNUALLY' }
  }
  const key =
    bill.interval === 'MONTHLY'
      ? 'recurringBills.cadence.monthly'
      : 'recurringBills.cadence.quarterly'
  return day
    ? { key, values: { day: ordinal(day, language) } }
    : { key: `recurringBills.interval.${bill.interval}` }
}

export function ordinal(day: number, language: string): string {
  if (language.startsWith('ar')) return new Intl.NumberFormat('ar-OM').format(day)
  const rest = day % 100
  const suffix =
    rest >= 11 && rest <= 13
      ? 'th'
      : day % 10 === 1
        ? 'st'
        : day % 10 === 2
          ? 'nd'
          : day % 10 === 3
            ? 'rd'
            : 'th'
  return `${day}${suffix}`
}

export function monthName(
  isoDate: string,
  language: string,
  style: 'long' | 'short' = 'long',
): string {
  const match = /^(\d{4})-(\d{2})/.exec(isoDate)
  if (!match) return isoDate
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  return new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar-OM' : 'en-GB', {
    month: style,
    timeZone: 'UTC',
  }).format(date)
}

export function monthYear(isoDate: string, language: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(isoDate)
  if (!match) return isoDate
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  return new Intl.DateTimeFormat(language.startsWith('ar') ? 'ar-OM' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

/** Days between two ISO dates, positive when `to` is later. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/* ------------------------------------------------------------------ the form */

export type VatTreatment = 'standard' | 'zero' | 'exempt' | 'outOfScope'
export const VAT_TREATMENTS: VatTreatment[] = ['standard', 'zero', 'exempt', 'outOfScope']
const STANDARD_RATE = 5

/** The VAT inside a VAT-inclusive amount under the chosen treatment; null when nothing is charged. */
export function vatOf(total: number, treatment: VatTreatment): number | null {
  if (!(total > 0)) return null
  if (treatment !== 'standard') return 0
  return Math.round((total - total / (1 + STANDARD_RATE / 100)) * 1000) / 1000
}

/** Each treatment as the PINT-OM category it stands for (OMTaxCat, CL-04-OM). */
export const TREATMENT_CATEGORY: Record<VatTreatment, 'S5' | 'Z0' | 'E0' | 'O0'> = {
  standard: 'S5',
  zero: 'Z0',
  exempt: 'E0',
  outOfScope: 'O0',
}

/**
 * The treatment a saved schedule carries: its category when the server echoes one, else read off
 * the VAT amount as before (which cannot tell exempt or out of scope from zero-rated).
 */
export function treatmentOf(
  vatAmount: number | null,
  total: number,
  taxCategoryCode?: string | null,
): VatTreatment {
  const named = (Object.keys(TREATMENT_CATEGORY) as VatTreatment[]).find(
    (treatment) => TREATMENT_CATEGORY[treatment] === taxCategoryCode,
  )
  if (named) return named
  if (vatAmount === null) return 'standard'
  return vatAmount > 0 && total > 0 ? 'standard' : 'zero'
}

/** The band a bill passes in without comment. */
export function toleranceBand(amount: number, percent: number): { low: number; high: number } {
  const spread = (amount * percent) / 100
  return {
    low: Math.round((amount - spread) * 1000) / 1000,
    high: Math.round((amount + spread) * 1000) / 1000,
  }
}

/** "If it hasn't arrived": straight away, then the design's steps. */
export const LATE_AFTER_OPTIONS = [0, 2, 5, 7]

export type RecurringForm = {
  mode: RecurringMode
  supplierId: string | null
  supplierName: string
  description: string
  category: string
  theirReference: string
  interval: RecurrenceInterval
  arrivesAroundDay: string
  /** Empty when the bill is paid on arrival. */
  paymentDueDay: string
  startDate: string
  watchingFrom: string
  endDate: string
  totalIncludingVat: string
  vatTreatment: VatTreatment
  tolerancePercent: string
  /** Off: an amount outside the band is not flagged. The percentage is kept for when it is on again. */
  flagOutsideRange: boolean
  lateAfterDays: string
  autoApproveWithinRange: boolean
  notifyUserId: string | null
}

export function blankRecurringForm(today: string): RecurringForm {
  return {
    mode: 'EXPECT',
    supplierId: null,
    supplierName: '',
    description: '',
    category: '',
    theirReference: '',
    interval: 'MONTHLY',
    arrivesAroundDay: '1',
    paymentDueDay: '',
    startDate: today,
    watchingFrom: today,
    endDate: '',
    totalIncludingVat: '',
    vatTreatment: 'standard',
    tolerancePercent: '10',
    flagOutsideRange: true,
    lateAfterDays: '2',
    autoApproveWithinRange: false,
    notifyUserId: null,
  }
}

export function formOf(bill: RecurringBillDto, today: string): RecurringForm {
  return {
    ...blankRecurringForm(today),
    mode: bill.mode,
    supplierId: bill.supplierId,
    supplierName: bill.supplierName,
    description: bill.description,
    category: bill.category ?? '',
    theirReference: bill.theirReference ?? '',
    interval: bill.interval,
    arrivesAroundDay: bill.arrivesAroundDay === null ? '' : String(bill.arrivesAroundDay),
    paymentDueDay: bill.paymentDueDay === null ? '' : String(bill.paymentDueDay),
    startDate: bill.nextRunDate ?? today,
    watchingFrom: bill.watchingFrom ?? today,
    endDate: bill.endDate ?? '',
    totalIncludingVat: String(bill.totalIncludingVat),
    vatTreatment: treatmentOf(bill.vatAmount, bill.totalIncludingVat, bill.taxCategoryCode),
    tolerancePercent: bill.tolerancePercent === null ? '10' : String(bill.tolerancePercent),
    // A server that does not say reads as before: on exactly when a percentage is stored.
    flagOutsideRange:
      bill.mode !== 'EXPECT' || (bill.toleranceEnabled ?? bill.tolerancePercent !== null),
    lateAfterDays: bill.lateAfterDays === null ? '' : String(bill.lateAfterDays),
    autoApproveWithinRange: bill.autoApproveWithinRange,
    notifyUserId: bill.notifyUserId,
  }
}

export type RecurringField = keyof RecurringForm

const AMOUNT = /^\d{1,15}(\.\d{1,3})?$/

/** What the server would refuse, said before it is asked. */
export function recurringProblems(form: RecurringForm): Partial<Record<RecurringField, string>> {
  const problems: Partial<Record<RecurringField, string>> = {}
  if (!form.supplierName.trim()) problems.supplierName = 'validation.required'
  if (!form.category.trim()) problems.category = 'validation.required'
  if (!form.description.trim()) problems.description = 'validation.required'
  if (!AMOUNT.test(form.totalIncludingVat.trim()) || Number(form.totalIncludingVat) <= 0)
    problems.totalIncludingVat = 'recurringBills.error.amountInvalid'
  const maxDay = form.interval === 'WEEKLY' ? 7 : 31
  if (form.mode === 'EXPECT') {
    const day = Number(form.arrivesAroundDay)
    if (!form.arrivesAroundDay.trim())
      problems.arrivesAroundDay = 'recurringBills.error.arrivalDayRequired'
    else if (!Number.isInteger(day) || day < 1 || day > maxDay)
      problems.arrivesAroundDay = 'recurringBills.error.arrivalDayInvalid'
    const tolerance = Number(form.tolerancePercent)
    if (
      form.flagOutsideRange &&
      form.tolerancePercent.trim() &&
      (!(tolerance >= 0) || tolerance > 100)
    )
      problems.tolerancePercent = 'recurringBills.error.toleranceInvalid'
    const late = Number(form.lateAfterDays)
    if (form.lateAfterDays.trim() && (!Number.isInteger(late) || late < 0 || late > 60))
      problems.lateAfterDays = 'recurringBills.error.lateAfterInvalid'
  }
  if (form.paymentDueDay.trim()) {
    const due = Number(form.paymentDueDay)
    if (!Number.isInteger(due) || due < 1 || due > 31)
      problems.paymentDueDay = 'recurringBills.error.dueDayInvalid'
  }
  return problems
}

const digitsOrNull = (value: string): number | null => (value.trim() ? Number(value) : null)

/** Whether the percentage the form holds is one the server takes. */
function toleranceHeld(form: RecurringForm): number | null {
  const percent = digitsOrNull(form.tolerancePercent)
  return percent !== null && percent >= 0 && percent <= 100 ? percent : null
}

/**
 * The request body. `stored` is the instruction being edited: what the form does not show
 * (its currency, the count it has left) goes back as it was, so a save does not rewrite it.
 */
export function toRecurringRequest(
  form: RecurringForm,
  stored?: Pick<RecurringBillDto, 'currencyCode' | 'remainingOccurrences'> | null,
): RecurringBillRequestDto {
  const expecting = form.mode === 'EXPECT'
  const total = Number(form.totalIncludingVat)
  return {
    supplierId: form.supplierId,
    supplierName: form.supplierName.trim(),
    description: form.description.trim(),
    currencyCode: stored?.currencyCode ?? 'OMR',
    totalIncludingVat: total,
    vatAmount: vatOf(total, form.vatTreatment),
    // The design asks for the day the payment usually falls due, not a number of days; a bill
    // paid on arrival has no terms. A RAISE instruction's terms date the bills it writes and the
    // form has no field for them: null keeps the stored ones.
    paymentTermsDays: !expecting || form.paymentDueDay.trim() ? null : 0,
    interval: form.interval,
    // A RAISE watch starts on its start date; an EXPECT watch is told when to start watching, and
    // the server works out the first expected day from the arrival day.
    startDate: expecting ? null : form.startDate || null,
    endDate: form.endDate || null,
    occurrences: stored?.remainingOccurrences ?? null,
    mode: form.mode,
    category: form.category.trim() || null,
    theirReference: form.theirReference.trim() || null,
    arrivesAroundDay: expecting ? digitsOrNull(form.arrivesAroundDay) : null,
    paymentDueDay: digitsOrNull(form.paymentDueDay),
    // The percentage goes with the switch off too, so it is there when the switch comes back on;
    // one the server would refuse is left out while off, which keeps the stored one.
    tolerancePercent: !expecting
      ? null
      : form.flagOutsideRange
        ? digitsOrNull(form.tolerancePercent)
        : toleranceHeld(form),
    toleranceEnabled: expecting ? form.flagOutsideRange : null,
    lateAfterDays: expecting ? digitsOrNull(form.lateAfterDays) : null,
    autoApproveWithinRange: expecting ? form.autoApproveWithinRange : null,
    notifyUserId: form.notifyUserId,
    watchingFrom: expecting ? form.watchingFrom || null : null,
    // The treatment round-trips as its category (EXPENDITURE.md M.3).
    taxCategoryCode: TREATMENT_CATEGORY[form.vatTreatment],
  }
}

/** The whole instruction in one sentence, so it can be read back before it is saved. */
export function plainWords(form: RecurringForm, language: string, who: string): StateNote {
  const day = Number(form.arrivesAroundDay) || 0
  const late = Number(form.lateAfterDays) || 0
  const values = {
    supplier: form.supplierName.trim() || '…',
    description: form.description.trim() || '…',
    amount: form.totalIncludingVat.trim() || '…',
    when: `recurringBills.when.${form.interval}`,
    day:
      form.interval === 'WEEKLY'
        ? `recurringBills.weekday.${weekdayKey(day || 1)}`
        : ordinal(day || 1, language),
    flagDay: ordinal(day + late || 1, language),
    who,
    tolerance: form.flagOutsideRange ? form.tolerancePercent || '0' : '',
  }
  if (form.mode === 'RAISE') return { key: 'recurringBills.plain.raise', values }
  return {
    key: form.flagOutsideRange
      ? 'recurringBills.plain.expect'
      : 'recurringBills.plain.expectNoTolerance',
    values,
  }
}

/** The three dates the aside draws: expected, flagged if absent, payment due. */
export function timelineOf(
  form: RecurringForm,
  language: string,
): { day: string; key: string; noteKey: string }[] {
  const day = Number(form.arrivesAroundDay) || 1
  const late = Number(form.lateAfterDays) || 0
  const due = Number(form.paymentDueDay) || 0
  const label = (value: number) => (form.interval === 'WEEKLY' ? '' : String(value))
  return [
    {
      day: label(day),
      key: 'recurringBills.form.timeline.expected',
      noteKey: 'recurringBills.form.timeline.expectedNote',
    },
    {
      day: label(day + late),
      key: 'recurringBills.form.timeline.flagged',
      noteKey: 'recurringBills.form.timeline.flaggedNote',
    },
    {
      day: due ? String(due) : label(day),
      key: 'recurringBills.form.timeline.due',
      noteKey: 'recurringBills.form.timeline.dueNote',
    },
  ].map((step) => ({
    ...step,
    day:
      step.day && language.startsWith('ar')
        ? new Intl.NumberFormat('ar-OM').format(Number(step.day))
        : step.day,
  }))
}

/* ------------------------------------------------------------------ the detail */

/**
 * What a period cost, once a bill arrived: the bill's own total when the server sends it, else
 * the usual amount moved by the recorded variance.
 */
export function amountOf(run: RecurringRunDto, usual: number): number | null {
  if (
    run.outcome === 'ARRIVED' ||
    run.outcome === 'ARRIVED_OUT_OF_RANGE' ||
    run.outcome === 'RAISED'
  ) {
    if (typeof run.billAmount === 'number') return run.billAmount
    return Math.round(usual * (1 + (run.variancePercent ?? 0) / 100) * 1000) / 1000
  }
  return null
}

export type ChartBar = { label: string; amount: number; tone: 'paid' | 'recent' | 'expected' }

/** The last twelve periods, oldest first; the latest arrival in brand blue, an open period dashed. */
export function chartBars(runs: RecurringRunDto[], usual: number, language: string): ChartBar[] {
  const ordered = [...runs].sort((a, b) => a.runDate.localeCompare(b.runDate)).slice(-12)
  const lastArrived = [...ordered].reverse().find((run) => amountOf(run, usual) !== null)
  return ordered.map((run) => {
    const amount = amountOf(run, usual)
    return {
      label:
        monthName(run.periodStart ?? run.runDate, language, 'short') +
        (amount === null ? ' ?' : ''),
      amount: amount ?? usual,
      tone: amount === null ? 'expected' : run === lastArrived ? 'recent' : 'paid',
    }
  })
}

export type TrackRecord = {
  matched: number
  periods: number
  onTime: number
  changed: number
  paidThisYear: number
  costPerYear: number
}

export function trackRecord(
  runs: RecurringRunDto[],
  bill: RecurringBillDto,
  today: string,
): TrackRecord {
  const closed = runs.filter((run) => run.outcome !== 'EXPECTED')
  const arrived = closed.filter((run) => amountOf(run, bill.totalIncludingVat) !== null)
  const year = today.slice(0, 4)
  // Where the server says when each bill was paid, "paid this year" is what was paid this year;
  // without it, it is what arrived this year, as before.
  const knowsPayments = runs.some((run) => run.paidOn !== undefined)
  const countedThisYear = knowsPayments
    ? arrived.filter((run) => run.paidOn?.startsWith(year))
    : arrived.filter((run) => run.runDate.startsWith(year))
  return {
    matched: arrived.length,
    periods: closed.length,
    onTime: arrived.filter((run) => run.outcome !== 'LATE').length,
    changed: arrived.filter((run) => (run.variancePercent ?? 0) !== 0).length,
    paidThisYear:
      Math.round(
        countedThisYear.reduce(
          (sum, run) => sum + (amountOf(run, bill.totalIncludingVat) ?? 0),
          0,
        ) * 1000,
      ) / 1000,
    costPerYear: Math.round(bill.totalIncludingVat * PER_YEAR[bill.interval] * 1000) / 1000,
  }
}

export type Activity = {
  id: string
  key: string
  values: Record<string, string | number>
  tone: 'current' | 'done'
  /** False for a line that is the whole of what there is to say: no second line under it. */
  detail?: false
}

/**
 * What happened, newest first: the open period, the last few arrivals, any span that was not
 * watched, and the day watching began.
 */
export function activityOf(
  bill: RecurringBillDto,
  runs: RecurringRunDto[],
  day: (iso: string) => string,
  limit = 4,
): Activity[] {
  const dated: { on: string; item: Activity }[] = []
  const ordered = [...runs].sort((a, b) => b.runDate.localeCompare(a.runDate)).slice(0, limit)
  for (const run of ordered) {
    const when = run.periodStart ?? run.runDate
    const add = (item: Omit<Activity, 'id'>) =>
      dated.push({ on: run.runDate, item: { id: run.id, ...item } })
    if (run.outcome === 'LATE')
      add({
        key: 'recurringBills.detail.activity.flagged',
        values: { expected: run.expectedOn ? day(run.expectedOn) : '' },
        tone: 'current',
      })
    else if (run.outcome === 'ARRIVED')
      add({
        key: 'recurringBills.detail.activity.arrived',
        values: { when: day(when), expected: run.expectedOn ? day(run.expectedOn) : '' },
        tone: 'done',
      })
    else if (run.outcome === 'ARRIVED_OUT_OF_RANGE')
      add({
        key: 'recurringBills.detail.activity.outOfRange',
        values: { when: day(when), percent: formatVariance(run.variancePercent) },
        tone: 'done',
      })
    else if (run.outcome === 'RAISED')
      add({
        key: 'recurringBills.detail.activity.raised',
        values: { when: day(run.runDate) },
        tone: 'done',
      })
  }
  for (const gap of bill.notWatched ?? [])
    dated.push({ on: gapDay(gap), item: notWatched(gap, day) })
  // Stable: lines of one day keep the order they were added in.
  const feed = dated
    .map((entry, index) => ({ ...entry, index }))
    .sort((a, b) => b.on.localeCompare(a.on) || a.index - b.index)
    .map((entry) => entry.item)
  if (bill.watchingFrom)
    feed.push({
      id: 'started',
      key: 'recurringBills.detail.activity.started',
      values: { date: day(bill.watchingFrom) },
      tone: 'done',
    })
  return feed
}

/** The day a skip was recorded, to place its line among the periods. */
const gapDay = (gap: NotWatchedDto) => gap.recordedAt.slice(0, 10)

function notWatched(gap: NotWatchedDto, day: (iso: string) => string): Activity {
  return {
    id: `not-watched-${gap.from}-${gap.to}`,
    key: 'recurringBills.detail.activity.notWatched',
    values: { from: day(gap.from), to: day(gap.to) },
    tone: 'current',
    detail: false,
  }
}

/** The category and the search box narrow the page in hand: the API filters by state only. */
export function narrow(
  items: RecurringBillDto[],
  search: string,
  category: string,
): RecurringBillDto[] {
  const text = search.trim().toLowerCase()
  return items.filter((bill) => {
    if (category && (bill.category ?? '') !== category) return false
    if (!text) return true
    return [bill.description, bill.supplierName, bill.theirReference ?? ''].some((field) =>
      field.toLowerCase().includes(text),
    )
  })
}

export function categoriesOf(items: RecurringBillDto[]): string[] {
  return [
    ...new Set(
      items
        .map((bill) => bill.category)
        .filter((category): category is string => Boolean(category)),
    ),
  ].sort()
}

export type RecurringSort = 'natural' | 'amountDesc' | 'amountAsc' | 'titleAsc'
export const RECURRING_SORTS: RecurringSort[] = ['natural', 'amountDesc', 'amountAsc', 'titleAsc']

export function sortRows(items: RecurringBillDto[], sort: RecurringSort): RecurringBillDto[] {
  if (sort === 'natural') return items
  return [...items].sort((a, b) => {
    if (sort === 'titleAsc') return a.description.localeCompare(b.description)
    const diff = a.totalIncludingVat - b.totalIncludingVat
    return sort === 'amountAsc' ? diff : -diff
  })
}

/** A full page may have more behind it; the API answers no total. */
export function hasMore(page: { count: number; pageSize: number }): boolean {
  return page.count === page.pageSize
}
