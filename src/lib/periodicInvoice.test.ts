import { describe, expect, it } from 'vitest'
import type { PeriodicScheduleDto } from '../api/invoices/periodic'
import {
  PERIODIC_REFUSALS,
  addInterval,
  blankPeriodicForm,
  isLastRun,
  periodicCounts,
  periodicProblems,
  runsDueSoon,
  scheduleStatus,
  templateOfForm,
  upcomingRuns,
  type PeriodicLine,
} from './periodicInvoice'

const line = {
  id: '1',
  kind: 'goods' as const,
  description: 'Rice',
  unitPrice: '10.000',
  vatRate: '0',
  quantity: '1',
  unit: 'EA',
  discountType: 'PERCENTAGE' as const,
  discountValue: '0',
}
const form = (taxCategory: string, more: object = {}) => ({
  ...blankPeriodicForm('2026-09-27'),
  customerId: 'c-1',
  taxCategory,
  ...more,
})
const sent = (f: ReturnType<typeof form>) => templateOfForm(f, [line], true, null)

describe('the reason no VAT is charged, on a periodic template', () => {
  it('sends the reason code of a zero-rated or exempt document, on the document and every line', () => {
    const template = sent(form('Z0', { exemptionReasonCode: 'VATZR-OM-01' }))
    expect(template.exemptionReasonCode).toBe('VATZR-OM-01')
    expect(template.lines[0].taxCategory.exemptionReasonCode).toBe('VATZR-OM-01')
    expect(sent(form('E0', { exemptionReasonCode: 'VATEX-OM-03' })).exemptionReasonCode).toBe(
      'VATEX-OM-03',
    )
  })

  it('sends the written reason of an out-of-scope document and nothing at standard rate', () => {
    expect(
      sent(form('O0', { exemptionReason: ' Not a supply ' })).lines[0].taxCategory,
    ).toMatchObject({
      exemptionReason: 'Not a supply',
      exemptionReasonCode: null,
    })
    const standard = sent(form('S5', { exemptionReasonCode: 'VATZR-OM-01', exemptionReason: 'x' }))
    expect(standard.exemptionReasonCode).toBeNull()
    expect(standard.lines[0].taxCategory.exemptionReason).toBeNull()
  })

  it('asks for the reason before saving, only when the category needs one', () => {
    const problem = (f: ReturnType<typeof form>) =>
      periodicProblems(f, '2026-09-27', false, 1).exemptionReasonCode
    expect(problem(form('Z0'))).toBe('periodicInvoice.error.reasonRequired')
    // Outside scope takes an optional reason: no PINT-OM rule asks for one (backend V210).
    expect(problem(form('O0'))).toBeUndefined()
    expect(problem(form('Z0', { exemptionReasonCode: 'VATZR-OM-01' }))).toBeUndefined()
    expect(problem(form('S5'))).toBeUndefined()
  })
})

describe('a tax category per line, on a periodic template', () => {
  const service = {
    ...line,
    id: '2',
    kind: 'service' as const,
    description: 'Delivery',
    vatRate: '5',
  }

  it('sends each line at its own category and reason, the rest at the default', () => {
    const template = templateOfForm(
      form('S5'),
      [{ ...line, taxCode: 'Z0', exemptionReasonCode: 'VATZR-OM-01' }, service],
      true,
      null,
    )
    expect(template.lines[0].taxCategory).toMatchObject({
      code: 'Z0',
      exemptionReasonCode: 'VATZR-OM-01',
    })
    expect(template.lines[1].taxCategory).toMatchObject({ code: 'S5', exemptionReasonCode: null })
  })

  it('asks for the reason on the zero-rated line alone', () => {
    const check = (lines: PeriodicLine[]) =>
      periodicProblems(form('S5'), '2026-09-27', false, lines.length, lines).lines
    expect(check([{ ...line, taxCode: 'Z0' }, service])).toBe(
      'periodicInvoice.error.reasonRequired',
    )
    expect(check([{ ...line, taxCode: 'Z0', exemptionReasonCode: 'VATZR-OM-01' }, service])).toBe(
      undefined,
    )
  })
})

const schedule = (more: Partial<PeriodicScheduleDto>): PeriodicScheduleDto => ({
  id: 's-1',
  customerId: 'c-1',
  templateInvoiceId: null,
  interval: 'MONTHLY',
  transactionSubtype: 'SUMMARY',
  nextRunDate: '2026-01-31',
  endDate: null,
  remainingOccurrences: null,
  active: true,
  ...more,
})

describe('stepping a series, as the server steps it', () => {
  it('clamps to the last day of a shorter month instead of spilling into the next', () => {
    expect(addInterval('2026-01-31', 'MONTHLY')).toBe('2026-02-28')
    expect(addInterval('2028-01-31', 'MONTHLY')).toBe('2028-02-29')
    expect(addInterval('2026-03-31', 'QUARTERLY')).toBe('2026-06-30')
    expect(addInterval('2026-11-30', 'QUARTERLY')).toBe('2027-02-28')
    expect(addInterval('2028-02-29', 'ANNUALLY')).toBe('2029-02-28')
    expect(addInterval('2026-12-28', 'WEEKLY')).toBe('2027-01-04')
  })

  it('keeps a monthly series on its anchor day: 31 Jan, 28 Feb, 31 Mar', () => {
    expect(upcomingRuns(schedule({ nextRunDate: '2026-01-31' }), 4)).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
    // The server's anchor wins over the day of the next run.
    expect(upcomingRuns(schedule({ nextRunDate: '2026-02-28', dayOfMonth: 31 }), 3)).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('keeps a quarterly series on 31 and a yearly one on 29 Feb', () => {
    expect(upcomingRuns(schedule({ interval: 'QUARTERLY', nextRunDate: '2026-03-31' }), 4)).toEqual(
      ['2026-03-31', '2026-06-30', '2026-09-30', '2026-12-31'],
    )
    expect(upcomingRuns(schedule({ interval: 'ANNUALLY', nextRunDate: '2028-02-29' }), 5)).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ])
  })
})

describe('what a finished series is, and what falls due', () => {
  it('calls a series with nothing left finished, never paused', () => {
    const finished = schedule({ active: false, remainingOccurrences: 0 })
    const ended = schedule({ active: false, endDate: '2026-01-15' })
    const paused = schedule({ active: false })
    expect(scheduleStatus(finished)).toBe('finished')
    expect(scheduleStatus(ended)).toBe('finished')
    expect(scheduleStatus(paused)).toBe('paused')
    expect(periodicCounts([finished, ended, paused], '2026-01-01')).toMatchObject({
      active: 0,
      paused: 1,
    })
    expect(PERIODIC_REFUSALS.PERIODIC_SCHEDULE_FINISHED).toBe('periodicInvoice.error.finished')
  })

  it('counts every run in the next 30 days, within the runs left', () => {
    const weekly = schedule({ interval: 'WEEKLY', nextRunDate: '2026-10-13' })
    // 13, 20 and 27 Oct fall within 30 days of 1 Oct; 3 Nov does not.
    expect(runsDueSoon(weekly, '2026-10-01')).toBe(3)
    expect(runsDueSoon({ ...weekly, remainingOccurrences: 2 }, '2026-10-01')).toBe(2)
    expect(runsDueSoon({ ...weekly, endDate: '2026-10-19' }, '2026-10-01')).toBe(1)
    expect(runsDueSoon({ ...weekly, active: false }, '2026-10-01')).toBe(0)
    expect(periodicCounts([weekly], '2026-10-01').dueSoon).toBe(3)
  })

  it('knows the last run from the runs left, not from an empty list', () => {
    expect(isLastRun(schedule({ remainingOccurrences: 1 }))).toBe(true)
    expect(isLastRun(schedule({ remainingOccurrences: 2 }))).toBe(false)
    expect(isLastRun(schedule({ endDate: '2026-02-15' }))).toBe(true)
    expect(isLastRun(schedule({}))).toBe(false)
  })
})
