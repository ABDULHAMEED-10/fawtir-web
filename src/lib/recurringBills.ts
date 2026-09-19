import type {
  ExpectationState,
  RecurrenceInterval,
  RecurringBillDto,
  RecurringBillRequestDto,
  RecurringListState,
  RecurringMode,
} from '../api/expenditure/recurringBills'

/**
 * Recurring bills (E-12, decisions of 2026-09-18).
 *
 * A recurring bill is a standing instruction, not a document. In `EXPECT` mode Fawtir watches for
 * the supplier's own bill and matches it to the period; in `RAISE` mode Fawtir writes the bill
 * itself. Both are offered, and the words follow the mode.
 *
 * The design's "why the jump?", "mark received" and "stop watching" have nothing behind them — a
 * watch is paused or edited, and arrivals are matched by the sweep — so they are not drawn.
 */

export const RECURRING_TABS: RecurringListState[] = ['ACTIVE', 'LATE', 'PAUSED', 'ALL']

export const INTERVALS: RecurrenceInterval[] = ['WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']

export const MODES: RecurringMode[] = ['EXPECT', 'RAISE']

/** The colour a state is read in: amber when something wants attention. */
export const EXPECTATION_TONE: Record<ExpectationState, 'warn' | 'ok' | 'muted'> = {
  LATE: 'warn',
  ARRIVED_OUT_OF_RANGE: 'warn',
  ARRIVED: 'ok',
  DUE_TO_ARRIVE: 'muted',
}

export type StateNote = { key: string; values?: Record<string, string | number> }

/**
 * What the row says about the watch. A paused watch says so before anything else — its expectation
 * is whatever it was when watching stopped. A RAISE watch has no expectation at all: it says when
 * it will next write a bill.
 */
export function stateNote(bill: RecurringBillDto): StateNote {
  if (!bill.active) return { key: 'recurringBills.state.paused' }
  if (bill.mode === 'RAISE') {
    return bill.nextRunDate ? { key: 'recurringBills.state.willRaise', values: { date: bill.nextRunDate } } : { key: 'recurringBills.state.noNextRun' }
  }
  const expectation = bill.expectation
  if (!expectation) return { key: 'recurringBills.state.watching' }
  switch (expectation.state) {
    case 'LATE':
      return { key: 'recurringBills.state.late', values: { count: expectation.lateDays ?? 0 } }
    case 'ARRIVED':
      return { key: 'recurringBills.state.arrived' }
    case 'ARRIVED_OUT_OF_RANGE':
      return { key: 'recurringBills.state.outOfRange', values: { percent: formatVariance(expectation.variancePercent) } }
    case 'DUE_TO_ARRIVE':
      return expectation.expectedOn ? { key: 'recurringBills.state.dueOn', values: { date: expectation.expectedOn } } : { key: 'recurringBills.state.watching' }
  }
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
  RECURRING_BILL_DUE_DAY_INVALID: 'recurringBills.error.dueDayInvalid',
  RECURRING_BILL_TOLERANCE_INVALID: 'recurringBills.error.toleranceInvalid',
  RECURRING_BILL_LATE_AFTER_INVALID: 'recurringBills.error.lateAfterInvalid',
  RECURRING_BILL_START_IN_PAST: 'recurringBills.error.startInPast',
  RECURRING_BILL_AMOUNT_INVALID: 'recurringBills.error.amountInvalid',
  RECURRING_BILL_VAT_EXCEEDS_TOTAL: 'recurringBills.error.vatExceedsTotal',
  RECURRING_BILL_NOT_EXPECTING: 'recurringBills.chase.notExpecting',
  RECURRING_BILL_PAUSED: 'recurringBills.chase.paused',
}

export type RecurringForm = {
  mode: RecurringMode
  supplierId: string | null
  supplierName: string
  description: string
  category: string
  theirReference: string
  interval: RecurrenceInterval
  arrivesAroundDay: string
  paymentDueDay: string
  paymentTermsDays: string
  startDate: string
  watchingFrom: string
  endDate: string
  totalIncludingVat: string
  vatAmount: string
  tolerancePercent: string
  lateAfterDays: string
  autoApproveWithinRange: boolean
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
    paymentTermsDays: '30',
    startDate: today,
    watchingFrom: today,
    endDate: '',
    totalIncludingVat: '',
    vatAmount: '',
    tolerancePercent: '10',
    lateAfterDays: '5',
    autoApproveWithinRange: false,
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
    paymentTermsDays: String(bill.paymentTermsDays),
    startDate: bill.nextRunDate ?? today,
    watchingFrom: bill.watchingFrom ?? today,
    endDate: bill.endDate ?? '',
    totalIncludingVat: String(bill.totalIncludingVat),
    vatAmount: bill.vatAmount === null ? '' : String(bill.vatAmount),
    tolerancePercent: bill.tolerancePercent === null ? '' : String(bill.tolerancePercent),
    lateAfterDays: bill.lateAfterDays === null ? '' : String(bill.lateAfterDays),
    autoApproveWithinRange: bill.autoApproveWithinRange,
  }
}

export type RecurringField = keyof RecurringForm

const AMOUNT = /^\d{1,15}(\.\d{1,3})?$/

/** What the server would refuse, said before it is asked. */
export function recurringProblems(form: RecurringForm): Partial<Record<RecurringField, string>> {
  const problems: Partial<Record<RecurringField, string>> = {}
  if (!form.supplierName.trim()) problems.supplierName = 'validation.required'
  if (!form.description.trim()) problems.description = 'validation.required'
  if (!AMOUNT.test(form.totalIncludingVat.trim()) || Number(form.totalIncludingVat) <= 0) problems.totalIncludingVat = 'recurringBills.error.amountInvalid'
  if (form.vatAmount.trim()) {
    if (!AMOUNT.test(form.vatAmount.trim())) problems.vatAmount = 'recurringBills.error.amountInvalid'
    else if (Number(form.vatAmount) > Number(form.totalIncludingVat)) problems.vatAmount = 'recurringBills.error.vatExceedsTotal'
  }
  const maxDay = form.interval === 'WEEKLY' ? 7 : 31
  if (form.mode === 'EXPECT') {
    const day = Number(form.arrivesAroundDay)
    if (!form.arrivesAroundDay.trim()) problems.arrivesAroundDay = 'recurringBills.error.arrivalDayRequired'
    else if (!Number.isInteger(day) || day < 1 || day > maxDay) problems.arrivesAroundDay = 'recurringBills.error.arrivalDayInvalid'
    const tolerance = Number(form.tolerancePercent)
    if (form.tolerancePercent.trim() && (!(tolerance >= 0) || tolerance > 100)) problems.tolerancePercent = 'recurringBills.error.toleranceInvalid'
    const late = Number(form.lateAfterDays)
    if (form.lateAfterDays.trim() && (!Number.isInteger(late) || late < 0 || late > 60)) problems.lateAfterDays = 'recurringBills.error.lateAfterInvalid'
  }
  if (form.paymentDueDay.trim()) {
    const due = Number(form.paymentDueDay)
    if (!Number.isInteger(due) || due < 1 || due > 31) problems.paymentDueDay = 'recurringBills.error.dueDayInvalid'
  }
  return problems
}

const digitsOrNull = (value: string): number | null => (value.trim() ? Number(value) : null)

export function toRecurringRequest(form: RecurringForm, currency = 'OMR'): RecurringBillRequestDto {
  const expecting = form.mode === 'EXPECT'
  return {
    supplierId: form.supplierId,
    supplierName: form.supplierName.trim(),
    description: form.description.trim(),
    currencyCode: currency,
    totalIncludingVat: Number(form.totalIncludingVat),
    vatAmount: digitsOrNull(form.vatAmount),
    paymentTermsDays: digitsOrNull(form.paymentTermsDays),
    interval: form.interval,
    // A RAISE watch starts on its start date; an EXPECT watch is told when to start watching, and
    // the server works out the first expected day from the arrival day.
    startDate: expecting ? null : form.startDate || null,
    endDate: form.endDate || null,
    occurrences: null,
    mode: form.mode,
    category: form.category.trim() || null,
    theirReference: form.theirReference.trim() || null,
    arrivesAroundDay: expecting ? digitsOrNull(form.arrivesAroundDay) : null,
    paymentDueDay: digitsOrNull(form.paymentDueDay),
    tolerancePercent: expecting ? digitsOrNull(form.tolerancePercent) : null,
    lateAfterDays: expecting ? digitsOrNull(form.lateAfterDays) : null,
    autoApproveWithinRange: expecting ? form.autoApproveWithinRange : null,
    notifyUserId: null,
    watchingFrom: expecting ? form.watchingFrom || null : null,
  }
}

/** The whole instruction in one sentence, so it can be read back before it is saved. */
export function plainWords(form: RecurringForm): StateNote {
  const values = {
    supplier: form.supplierName.trim() || '…',
    description: form.description.trim() || '…',
    amount: form.totalIncludingVat.trim() || '…',
    day: form.arrivesAroundDay || '…',
    tolerance: form.tolerancePercent || '0',
    count: Number(form.lateAfterDays || 0),
  }
  return { key: form.mode === 'EXPECT' ? 'recurringBills.plain.expect' : 'recurringBills.plain.raise', values }
}

/** The category and the search box narrow the page in hand: the API filters by state only. */
export function narrow(items: RecurringBillDto[], search: string, category: string): RecurringBillDto[] {
  const text = search.trim().toLowerCase()
  return items.filter((bill) => {
    if (category && (bill.category ?? '') !== category) return false
    if (!text) return true
    return [bill.description, bill.supplierName, bill.theirReference ?? ''].some((field) => field.toLowerCase().includes(text))
  })
}

export function categoriesOf(items: RecurringBillDto[]): string[] {
  return [...new Set(items.map((bill) => bill.category).filter((category): category is string => Boolean(category)))].sort()
}

/** A full page may have more behind it; the API answers no total. */
export function hasMore(page: { count: number; pageSize: number }): boolean {
  return page.count === page.pageSize
}
