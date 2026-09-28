import type {
  CreatePeriodicScheduleDto,
  PeriodicRunDto,
  PeriodicScheduleDto,
  PeriodicTemplateDto,
  PeriodicTemplateLineDto,
  RecurrenceInterval,
  UpdatePeriodicScheduleDto,
} from '../api/invoices/periodic'
import type { InvoiceDetailDto, InvoiceLineDto } from '../api/invoices/detail'
import { FALLBACK_TAX_CATEGORIES as TAX_CATEGORIES } from './selfBillCreate'
import { CODED_REASON, NEEDS_EXEMPTION_REASON, itemTypeOfUnit } from './invoiceDraft'
import { toExclusivePrice, type DiscountType } from './invoiceMath'

/**
 * Periodic invoices (I-13, design 154:164555 and 154:159427, realigned 25 Sep 2026).
 *
 * The design sets a schedule up **from scratch**: the customer, the invoice details, the lines,
 * the schedule and the notes all live on the screen. The API knows only "copy invoice X on a
 * cadence", so the schedule fields go to the routes as they are and the rest travels as the
 * schedule's own template (`PeriodicTemplateDto`, marked TODO(backend)). An invoice can still be
 * the pre-fill (`?template=<id>` from the invoice pages) and is then named in `templateInvoiceId`.
 *
 * The API answers bare arrays: no paging, no totals, no filters, no summary. Every figure here is
 * counted from the list in hand, and the page says so instead of implying a server-side view.
 */

export const PERIODIC_INTERVALS: RecurrenceInterval[] = [
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'ANNUALLY',
]

/**
 * The design's five tabs. `onRequest` and `draft` are states the API has no schedule for yet: a
 * schedule is always on a cadence and always activated, so they stay empty until it does.
 * TODO(backend): an on-request schedule (no cadence, run by hand) and a draft (not yet activated).
 */
export type PeriodicTabId = 'all' | 'active' | 'onRequest' | 'paused' | 'draft'

export const PERIODIC_TABS: PeriodicTabId[] = ['all', 'active', 'onRequest', 'paused', 'draft']

/** What the status pill says. `finished` is an active series with no runs left. */
export type PeriodicStatus = 'active' | 'paused' | 'finished' | 'onRequest' | 'draft'

export function scheduleStatus(schedule: PeriodicScheduleDto): PeriodicStatus {
  if (!schedule.active) return 'paused'
  if (schedule.remainingOccurrences === 0) return 'finished'
  return 'active'
}

export function inTab(schedule: PeriodicScheduleDto, tab: PeriodicTabId): boolean {
  if (tab === 'all') return true
  const status = scheduleStatus(schedule)
  if (tab === 'active') return status === 'active'
  if (tab === 'paused') return status === 'paused'
  return status === tab
}

export function countTab(schedules: PeriodicScheduleDto[], tab: PeriodicTabId): number {
  return schedules.filter((schedule) => inTab(schedule, tab)).length
}

/** What the list knows about what a schedule sends: its own template, else the invoice it copies. */
export type TemplateInfo = {
  number: string | null
  subject: string | null
  reference: string | null
  /** Null while the template is a draft: a draft is priced only when issued. */
  total: number | null
  currency: string
}

/** The name a schedule goes by: the template's subject, else the customer. */
export function scheduleName(
  template: TemplateInfo | undefined,
  customerName: string | undefined,
): string | undefined {
  return template?.subject?.trim() || customerName
}

/** How much a schedule is worth per month, for the "recurring revenue" figure. */
export function monthlyEquivalent(total: number, interval: RecurrenceInterval): number {
  switch (interval) {
    case 'WEEKLY':
      return (total * 52) / 12
    case 'MONTHLY':
      return total
    case 'QUARTERLY':
      return total / 3
    case 'ANNUALLY':
      return total / 12
  }
}

/** The run after `date` on the cadence, as the server steps it (calendar months, same day). */
export function addInterval(date: string, interval: RecurrenceInterval): string {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(Date.UTC(y, m - 1, d))
  if (interval === 'WEEKLY') next.setUTCDate(next.getUTCDate() + 7)
  else if (interval === 'MONTHLY') next.setUTCMonth(next.getUTCMonth() + 1)
  else if (interval === 'QUARTERLY') next.setUTCMonth(next.getUTCMonth() + 3)
  else next.setUTCFullYear(next.getUTCFullYear() + 1)
  return next.toISOString().slice(0, 10)
}

/** The next few run dates, stopping at the end date or the runs left. */
export function upcomingRuns(schedule: PeriodicScheduleDto, count: number): string[] {
  if (!schedule.active) return []
  const dates: string[] = []
  let date = schedule.nextRunDate
  const limit =
    schedule.remainingOccurrences === null ? count : Math.min(count, schedule.remainingOccurrences)
  while (dates.length < limit) {
    if (schedule.endDate && date > schedule.endDate) break
    dates.push(date)
    date = addInterval(date, schedule.interval)
  }
  return dates
}

export type CadenceNote = { key: string; values?: Record<string, string | number> }

export const WEEKDAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const

/** "on the 18th" / "every Saturday": the cadence's second line, worked out from the next run. */
export function cadenceNote(
  schedule: Pick<PeriodicScheduleDto, 'interval' | 'nextRunDate'>,
): CadenceNote {
  const [y, m, d] = schedule.nextRunDate.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  if (schedule.interval === 'WEEKLY')
    return { key: 'periodicList.cadence.weekly', values: { weekday: WEEKDAYS[date.getUTCDay()] } }
  if (schedule.interval === 'ANNUALLY')
    return { key: 'periodicList.cadence.yearly', values: { date: schedule.nextRunDate } }
  return {
    key:
      schedule.interval === 'MONTHLY'
        ? 'periodicList.cadence.monthly'
        : 'periodicList.cadence.quarterly',
    values: { count: d },
  }
}

/* ------------------------------------------------------------ "Repeats on" */

/**
 * The design's "Repeats on" select, read off the first run: the weekday of a weekly series, the
 * day of the month of a monthly or quarterly one, the date of a yearly one. Choosing another value
 * moves the first run to the next date that fits it (`dateForRepeat`), since the server has no
 * separate field: the cadence is "every interval from the next run date".
 */
export type RepeatOption = { value: string; key: string; values?: Record<string, string | number> }

export function repeatOptions(interval: RecurrenceInterval, firstRunDate: string): RepeatOption[] {
  if (interval === 'WEEKLY')
    return WEEKDAYS.map((weekday, index) => ({
      value: `w${index}`,
      key: 'periodicInvoice.repeat.weekly',
      values: { weekday },
    }))
  if (interval === 'ANNUALLY')
    return [
      { value: firstRunDate, key: 'periodicInvoice.repeat.yearly', values: { date: firstRunDate } },
    ]
  return Array.from({ length: 31 }, (_, index) => ({
    value: `d${index + 1}`,
    key:
      interval === 'MONTHLY'
        ? 'periodicInvoice.repeat.monthly'
        : 'periodicInvoice.repeat.quarterly',
    values: { count: index + 1 },
  }))
}

export function repeatValue(interval: RecurrenceInterval, firstRunDate: string): string {
  if (!firstRunDate) return ''
  const [y, m, d] = firstRunDate.split('-').map(Number)
  if (interval === 'WEEKLY') return `w${new Date(Date.UTC(y, m - 1, d)).getUTCDay()}`
  if (interval === 'ANNUALLY') return firstRunDate
  return `d${d}`
}

const pad2 = (value: number) => String(value).padStart(2, '0')

/** The first date on or after `notBefore` that fits the chosen repeat, staying near the first run. */
export function dateForRepeat(
  interval: RecurrenceInterval,
  value: string,
  firstRunDate: string,
  notBefore: string,
): string {
  const base = firstRunDate || notBefore
  const [y, m, d] = base.split('-').map(Number)
  if (interval === 'WEEKLY') {
    const wanted = Number(value.slice(1))
    const date = new Date(Date.UTC(y, m - 1, d))
    date.setUTCDate(date.getUTCDate() + ((wanted - date.getUTCDay() + 7) % 7))
    let iso = date.toISOString().slice(0, 10)
    while (iso < notBefore) {
      date.setUTCDate(date.getUTCDate() + 7)
      iso = date.toISOString().slice(0, 10)
    }
    return iso
  }
  if (interval === 'ANNUALLY') return value
  const day = Number(value.slice(1))
  const clamp = (year: number, month: number) => {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
    return `${year}-${pad2(month)}-${pad2(Math.min(day, last))}`
  }
  let year = y
  let month = m
  let iso = clamp(year, month)
  while (iso < notBefore) {
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
    iso = clamp(year, month)
  }
  return iso
}

export type PeriodicSortId = 'nextSoonest' | 'name' | 'amountHighest'

export const PERIODIC_SORTS: PeriodicSortId[] = ['nextSoonest', 'name', 'amountHighest']

export function sortSchedules(
  schedules: PeriodicScheduleDto[],
  sort: PeriodicSortId,
  nameOf: (schedule: PeriodicScheduleDto) => string,
  amountOf: (schedule: PeriodicScheduleDto) => number,
): PeriodicScheduleDto[] {
  const rows = [...schedules]
  if (sort === 'name') rows.sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
  else if (sort === 'amountHighest') rows.sort((a, b) => amountOf(b) - amountOf(a))
  else rows.sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))
  return rows
}

/** Days between two ISO dates, ignoring time: both are plain dates in the tenant's own day. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

/** The figures the page can count honestly: everything else would need amounts it has not got. */
export function periodicCounts(schedules: PeriodicScheduleDto[], today: string) {
  const active = schedules.filter((schedule) => schedule.active)
  return {
    total: schedules.length,
    active: active.length,
    paused: schedules.length - active.length,
    // A run whose date has already passed is still owed (the sweep fires it on the next pass),
    // so it belongs in "due in 30 days" rather than vanishing from every count on the page.
    dueSoon: active.filter((schedule) => daysBetween(today, schedule.nextRunDate) <= 30).length,
    // A run whose date passed without a draft: with the paused ones, what a person should look at.
    overdue: active.filter(
      (schedule) =>
        schedule.remainingOccurrences !== 0 && daysBetween(today, schedule.nextRunDate) < 0,
    ).length,
  }
}

/**
 * What this month's runs came to, from the schedules that say when they last ran. Null until the
 * API carries `lastRunDate` (TODO(backend)), so the card can say the figure is not known rather
 * than print a zero.
 */
export function generatedThisMonth(
  schedules: PeriodicScheduleDto[],
  today: string,
  amountOf: (schedule: PeriodicScheduleDto) => number,
): { count: number; amount: number } | null {
  const known = schedules.filter((schedule) => schedule.lastRunDate !== undefined)
  if (known.length === 0) return null
  const month = today.slice(0, 7)
  const ran = known.filter((schedule) => (schedule.lastRunDate ?? '').startsWith(month))
  return {
    count: ran.length,
    amount: ran.reduce((sum, schedule) => sum + amountOf(schedule), 0),
  }
}

export type ScheduleNote = { key: string; values?: Record<string, string | number> }

/** What the row says: paused first, then a finished series, then when the next draft is due. */
export function scheduleNote(schedule: PeriodicScheduleDto, today: string): ScheduleNote {
  if (!schedule.active) return { key: 'periodicList.state.paused' }
  if (schedule.remainingOccurrences === 0) return { key: 'periodicList.state.finished' }
  const days = daysBetween(today, schedule.nextRunDate)
  if (days < 0) return { key: 'periodicList.state.overdue', values: { date: schedule.nextRunDate } }
  if (days === 0) return { key: 'periodicList.state.today' }
  return { key: 'periodicList.state.dueIn', values: { count: days } }
}

export function scheduleTone(
  schedule: PeriodicScheduleDto,
  today: string,
): 'warn' | 'ok' | 'muted' {
  if (!schedule.active || schedule.remainingOccurrences === 0) return 'muted'
  return daysBetween(today, schedule.nextRunDate) < 0 ? 'warn' : 'ok'
}

/** How many drafts a series has actually raised, counted from its runs. */
export function draftedCount(runs: PeriodicRunDto[]): number {
  return runs.filter((run) => run.outcome === 'DRAFTED').length
}

export function narrowSchedules(
  schedules: PeriodicScheduleDto[],
  tab: PeriodicTabId,
  search: string,
  nameOf: (customerId: string) => string | undefined,
  templateOf: (schedule: PeriodicScheduleDto) => TemplateInfo | undefined = () => undefined,
  interval: RecurrenceInterval | null = null,
): PeriodicScheduleDto[] {
  const text = search.trim().toLowerCase()
  return schedules.filter((schedule) => {
    if (!inTab(schedule, tab)) return false
    if (interval && schedule.interval !== interval) return false
    if (!text) return true
    const template = templateOf(schedule)
    return [
      nameOf(schedule.customerId) ?? schedule.customerId,
      template?.subject,
      template?.reference,
      template?.number,
    ]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLowerCase().includes(text))
  })
}

/* ------------------------------------------------------------ the composer */

export type LineKind = 'goods' | 'service'

/** One line as the composer holds it: strings, in whatever VAT mode the toggle is in. */
export type PeriodicLine = {
  id: string
  kind: LineKind
  description: string
  unitPrice: string
  vatRate: string
  quantity: string
  unit: string
  discountType: DiscountType
  discountValue: string
  /** The Oman 12-digit HS code of a goods line (IBR-079-OM), from `lib/codeLists/hs`. */
  hsCode?: string
  /** The CL-12-OM service type of a service line (IBR-155-OM), from `lib/codeLists/serviceTypes`. */
  serviceType?: string
  /** The line's own tax category; unset, it takes the form's default (`PeriodicForm.taxCategory`). */
  taxCode?: string
  /** IBT-121 on a zero-rated (VATZR-OM-nn) or exempt (VATEX-OM-nn) line. */
  exemptionReasonCode?: string
  /** The written reason of a reverse-charge, export or out-of-scope line (no code list). */
  exemptionReason?: string
}

/** The category a line is charged at: its own, else the form's default. */
export function periodicLineTax(line: PeriodicLine, defaultCode: string): string {
  return line.taxCode || defaultCode
}

/**
 * A line's no-VAT reason. A line with its own category keeps its own reason; a line still on the
 * default reads the form's (schedules saved before the category moved onto the line).
 */
function periodicLineReason(line: PeriodicLine, form: PeriodicForm) {
  return line.taxCode
    ? { code: line.exemptionReasonCode ?? '', text: line.exemptionReason ?? '' }
    : {
        code: line.exemptionReasonCode || form.exemptionReasonCode,
        text: line.exemptionReason || form.exemptionReason,
      }
}

/** A line arriving without a kind is read from its unit, as the invoice draft reads its lines. */
export function kindOfUnit(unit: string): LineKind {
  return itemTypeOfUnit(unit)
}

export function blankPeriodicLine(id: string, vatRate: string, taxCode?: string): PeriodicLine {
  return {
    id,
    ...(taxCode ? { taxCode } : {}),
    kind: 'goods',
    description: '',
    unitPrice: '0.000',
    vatRate,
    quantity: '1',
    unit: 'EA',
    discountType: 'PERCENTAGE',
    discountValue: '0',
  }
}

export type PeriodicForm = {
  customerId: string
  /** The invoice copied as a pre-fill, if any: named in the request so the server can copy it. */
  templateInvoiceId: string
  subject: string
  purchaseOrderReference: string
  /** A payment terms code from the catalogue (`PAYMENT_TERMS_OPTIONS`). */
  paymentTerms: string
  currency: string
  /**
   * The header's "Default tax category" (`TAX_CATEGORIES`): new lines take it, and changing it moves
   * only the lines still on the old default. Each line may carry its own (handbook 3.2).
   */
  taxCategory: string
  /** Read back from schedules saved before the reason moved onto the line; lines carry their own. */
  exemptionReasonCode: string
  exemptionReason: string
  branchId: string
  customerNote: string
  internalNote: string
  interval: RecurrenceInterval
  firstRunDate: string
  endDate: string
  occurrences: string
  autoIssue: boolean
  notifyOnRun: boolean
}

/** The design's "Ends" choice: the two API fields, read as one decision. */
export type PeriodicEnding = 'never' | 'date' | 'count'

export function endingOf(form: Pick<PeriodicForm, 'endDate' | 'occurrences'>): PeriodicEnding {
  if (form.endDate) return 'date'
  if (form.occurrences.trim()) return 'count'
  return 'never'
}

export function blankPeriodicForm(today: string): PeriodicForm {
  return {
    customerId: '',
    templateInvoiceId: '',
    subject: '',
    purchaseOrderReference: '',
    paymentTerms: 'NET30',
    currency: 'OMR',
    taxCategory: 'S5',
    exemptionReasonCode: '',
    exemptionReason: '',
    branchId: '',
    customerNote: '',
    internalNote: '',
    interval: 'MONTHLY',
    firstRunDate: today,
    endDate: '',
    occurrences: '',
    autoIssue: false,
    notifyOnRun: false,
  }
}

export function taxRateOf(taxCategory: string): string {
  return TAX_CATEGORIES.find((category) => category.code === taxCategory)?.rate ?? '0'
}

/** A saved schedule back in the form, with its own template's details when it carries one. */
export function formOfSchedule(schedule: PeriodicScheduleDto, today: string): PeriodicForm {
  const template = schedule.template ?? null
  return {
    ...blankPeriodicForm(today),
    customerId: schedule.customerId,
    templateInvoiceId: schedule.templateInvoiceId ?? '',
    interval: schedule.interval,
    firstRunDate: schedule.nextRunDate,
    endDate: schedule.endDate ?? '',
    occurrences:
      schedule.remainingOccurrences === null ? '' : String(schedule.remainingOccurrences),
    autoIssue: schedule.autoIssue ?? false,
    notifyOnRun: schedule.notifyOnRun ?? false,
    ...(template
      ? {
          subject: template.details.subject ?? '',
          purchaseOrderReference: template.details.purchaseOrderReference ?? '',
          paymentTerms: template.details.paymentTerms?.code ?? 'NET30',
          currency: template.currency,
          taxCategory: template.taxCategoryCode,
          exemptionReasonCode: template.exemptionReasonCode ?? '',
          exemptionReason: template.exemptionReason ?? '',
          branchId: template.branchId,
          customerNote: template.details.customerVisibleNote ?? '',
          internalNote: template.details.internalNote ?? '',
        }
      : {}),
  }
}

/** The details of an invoice, as a pre-fill: what the page copies when it is handed one. */
export function formOfInvoice(
  form: PeriodicForm,
  doc: InvoiceDetailDto,
  internalNote: string | null,
): PeriodicForm {
  return {
    ...form,
    customerId: doc.customerId,
    templateInvoiceId: doc.id,
    subject: doc.details?.subject ?? '',
    purchaseOrderReference: doc.details?.purchaseOrderReference ?? '',
    paymentTerms: doc.details?.paymentTerms?.code ?? form.paymentTerms,
    currency: doc.currency || form.currency,
    taxCategory: doc.lines[0]?.taxCategoryCode ?? form.taxCategory,
    exemptionReasonCode: doc.lines[0]?.exemptionReasonCode ?? '',
    exemptionReason: doc.lines[0]?.exemptionReason ?? '',
    branchId: doc.branchId || form.branchId,
    customerNote: doc.details?.customerVisibleNote ?? '',
    internalNote: internalNote ?? '',
  }
}

export function linesOfInvoice(lines: InvoiceLineDto[]): PeriodicLine[] {
  return lines.map((line) => ({
    id: String(line.lineNumber),
    kind: kindOfUnit(line.unitCode),
    description: line.description,
    unitPrice: line.unitPrice.toFixed(3),
    vatRate: String(line.taxRate ?? 0),
    quantity: String(line.quantity),
    unit: line.unitCode,
    discountType: line.discountType,
    discountValue: String(line.discountValue),
    taxCode: line.taxCategoryCode,
    exemptionReasonCode: line.exemptionReasonCode ?? '',
    exemptionReason: line.exemptionReason ?? '',
  }))
}

export function linesOfTemplate(template: PeriodicTemplateDto): PeriodicLine[] {
  return template.lines.map((line) => ({
    id: String(line.lineNumber),
    kind: line.itemType === 'SERVICE' ? 'service' : 'goods',
    description: line.description,
    unitPrice: line.unitPrice.toFixed(3),
    vatRate: String(line.taxCategory.rate),
    quantity: String(line.quantity),
    unit: line.unitCode,
    discountType: line.discount.type,
    discountValue: String(line.discount.value),
    hsCode: line.hsCode ?? undefined,
    serviceType: line.serviceType ?? undefined,
    taxCode: line.taxCategory.code,
    exemptionReasonCode: line.taxCategory.exemptionReasonCode ?? '',
    exemptionReason: line.taxCategory.exemptionReason ?? '',
  }))
}

/** The written reason, only for the categories that state theirs as text (Z and E use a code). */
function writtenReason(category: string | undefined, reason: string): string | null {
  return category && NEEDS_EXEMPTION_REASON.has(category) && !CODED_REASON.has(category)
    ? reason.trim() || null
    : null
}

/** The document half of the form, in the shape the schedule would carry it. Prices go out ex-VAT. */
export function templateOfForm(
  form: PeriodicForm,
  lines: PeriodicLine[],
  exclVat: boolean,
  paymentTermsLabel: string | null,
): PeriodicTemplateDto {
  const category = TAX_CATEGORIES.find((entry) => entry.code === form.taxCategory)
  const kept = lines.filter((line) => line.description.trim())
  return {
    branchId: form.branchId,
    currency: form.currency,
    vatMode: exclVat ? 'EXCLUSIVE' : 'INCLUSIVE',
    taxCategoryCode: form.taxCategory,
    exemptionReasonCode: CODED_REASON.has(category?.en16931Category ?? '')
      ? form.exemptionReasonCode || null
      : null,
    exemptionReason: writtenReason(category?.en16931Category, form.exemptionReason),
    details: {
      subject: form.subject.trim() || null,
      purchaseOrderReference: form.purchaseOrderReference.trim() || null,
      paymentTerms: form.paymentTerms
        ? { code: form.paymentTerms, label: paymentTermsLabel ?? form.paymentTerms }
        : null,
      customerVisibleNote: form.customerNote.trim() || null,
      internalNote: form.internalNote.trim() || null,
    },
    lines: kept.map((line, index): PeriodicTemplateLineDto => {
      const lineCategory = TAX_CATEGORIES.find(
        (entry) => entry.code === periodicLineTax(line, form.taxCategory),
      )
      const reason = periodicLineReason(line, form)
      return {
        lineNumber: index + 1,
        description: line.description.trim(),
        itemType: line.kind === 'service' ? 'SERVICE' : 'GOODS',
        unitCode: line.unit,
        quantity: Number(line.quantity) || 0,
        unitPrice: Number(
          exclVat ? line.unitPrice : toExclusivePrice(line.unitPrice || '0', line.vatRate || '0'),
        ),
        discount: { type: line.discountType, value: Number(line.discountValue) || 0 },
        taxCategory: {
          code: lineCategory?.code ?? form.taxCategory,
          en16931Category: lineCategory?.en16931Category ?? 'S',
          rate: Number(lineCategory?.rate ?? line.vatRate) || 0,
          exemptionReason: writtenReason(lineCategory?.en16931Category, reason.text),
          exemptionReasonCode: CODED_REASON.has(lineCategory?.en16931Category ?? '')
            ? reason.code || null
            : null,
        },
        hsCode: line.kind === 'goods' ? line.hsCode || null : null,
        serviceType: line.kind === 'service' ? line.serviceType || null : null,
      }
    }),
  }
}

export type PeriodicField = keyof PeriodicForm | 'lines'

/**
 * What the server would refuse, said first, plus what the design requires before a schedule can
 * mean anything: a customer and at least one described line. `firstRunDate` is `@FutureOrPresent`
 * on both routes, so a date already past is refused, which matters most when editing a schedule
 * whose run has lapsed.
 */
export function periodicProblems(
  form: PeriodicForm,
  today: string,
  editing: boolean,
  describedLines = 1,
  /** The composer's lines: when given, each described line's category and reason is checked. */
  lines?: PeriodicLine[],
): Partial<Record<PeriodicField, string>> {
  const problems: Partial<Record<PeriodicField, string>> = {}
  if (!form.customerId) problems.customerId = 'periodicInvoice.error.customerRequired'
  if (describedLines < 1) problems.lines = 'periodicInvoice.error.linesRequired'
  const categoryOf = (code: string) =>
    TAX_CATEGORIES.find((entry) => entry.code === code)?.en16931Category ?? ''
  const missing = (kind: string, reason: { code: string; text: string }) =>
    CODED_REASON.has(kind)
      ? !reason.code
      : NEEDS_EXEMPTION_REASON.has(kind) && reason.text.trim() === ''
  if (lines) {
    const described = lines.filter((line) => line.description.trim())
    const kinds = described.map((line) => categoryOf(periodicLineTax(line, form.taxCategory)))
    // PINT-OM has no EN 16931 BR-O-11 counterpart: an out-of-scope line may sit beside taxed ones.
    if (described.some((line, index) => missing(kinds[index], periodicLineReason(line, form)))) {
      problems.lines = 'periodicInvoice.error.reasonRequired'
    }
  } else if (
    missing(categoryOf(form.taxCategory), {
      code: form.exemptionReasonCode,
      text: form.exemptionReason,
    })
  ) {
    problems.exemptionReasonCode = 'periodicInvoice.error.reasonRequired'
  }
  if (!form.firstRunDate) problems.firstRunDate = 'periodicInvoice.error.dateRequired'
  else if (form.firstRunDate < today) problems.firstRunDate = 'periodicInvoice.error.datePast'
  if (form.endDate && form.firstRunDate && form.endDate < form.firstRunDate)
    problems.endDate = 'periodicInvoice.error.endBeforeStart'
  if (form.occurrences.trim()) {
    const count = Number(form.occurrences)
    if (!Number.isInteger(count) || count < (editing ? 0 : 1))
      problems.occurrences = 'periodicInvoice.error.occurrences'
  }
  return problems
}

export function toCreateRequest(
  form: PeriodicForm,
  template: PeriodicTemplateDto,
): CreatePeriodicScheduleDto {
  return {
    customerId: form.customerId,
    templateInvoiceId: form.templateInvoiceId || null,
    template,
    interval: form.interval,
    firstRunDate: form.firstRunDate,
    endDate: form.endDate || null,
    occurrences: form.occurrences.trim() ? Number(form.occurrences) : null,
    autoIssue: form.autoIssue,
    notifyOnRun: form.notifyOnRun,
  }
}

export function toUpdateRequest(
  form: PeriodicForm,
  template: PeriodicTemplateDto,
): UpdatePeriodicScheduleDto {
  return {
    interval: form.interval,
    nextRunDate: form.firstRunDate,
    endDate: form.endDate || null,
    occurrences: form.occurrences.trim() ? Number(form.occurrences) : null,
    customerId: form.customerId,
    template,
    autoIssue: form.autoIssue,
    notifyOnRun: form.notifyOnRun,
  }
}

/** The server's refusals, in the page's words. */
export const PERIODIC_REFUSALS: Record<string, string> = {
  PERIODIC_INTERVAL_REQUIRED: 'periodicInvoice.error.intervalRequired',
  PERIODIC_NEXT_RUN_REQUIRED: 'periodicInvoice.error.dateRequired',
  PERIODIC_END_BEFORE_START: 'periodicInvoice.error.endBeforeStart',
  PERIODIC_OCCURRENCES_NEGATIVE: 'periodicInvoice.error.occurrences',
  PERIODIC_SCHEDULE_NOT_FOUND: 'periodicInvoice.error.notFound',
}
