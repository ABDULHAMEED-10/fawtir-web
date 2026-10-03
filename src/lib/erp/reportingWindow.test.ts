import { describe, expect, it } from 'vitest'
import {
  addDays,
  businessToday,
  dayStartInstant,
  defaultWindow,
  isIsoDate,
  windowBounds,
  windowProblem,
} from './reportingWindow'
import {
  deliveryStateIsMeaningful,
  displayStatusTone,
  LABEL_GROUPS,
  reconciliationTone,
  recipientAckTone,
} from './reportingStatus'
import { DISPLAY_STATUSES, RECONCILIATION_LABELS } from '../../api/erp/reporting'

describe('the received-at window', () => {
  it('starts a day at Muscat midnight, not UTC midnight', () => {
    expect(dayStartInstant('2026-10-02')).toBe('2026-10-01T20:00:00.000Z')
  })

  it('ends at the start of the day after the last one chosen, as the exclusive bound', () => {
    expect(windowBounds('2026-10-01', '2026-10-02')).toEqual({
      from: '2026-09-30T20:00:00.000Z',
      to: '2026-10-02T20:00:00.000Z',
    })
  })

  it('reads today in the business zone, so 22:00 UTC is already tomorrow', () => {
    expect(businessToday(new Date('2026-10-03T22:00:00Z'))).toBe('2026-10-04')
    expect(defaultWindow(new Date('2026-10-03T22:00:00Z'))).toEqual({
      from: '2026-09-05',
      to: '2026-10-04',
    })
  })

  it('accepts a window of exactly 367 days and refuses 368', () => {
    expect(windowProblem('2026-01-01', addDays('2026-01-01', 366), { required: true })).toBeNull()
    expect(windowProblem('2026-01-01', addDays('2026-01-01', 367), { required: true })).toBe(
      'tooLong',
    )
  })

  it('refuses a reversed, half or malformed window, and allows none only when optional', () => {
    expect(windowProblem('2026-10-05', '2026-10-01', { required: true })).toBe('order')
    expect(windowProblem('2026-10-05', '', { required: false })).toBe('missing')
    expect(windowProblem('2026-13-40', '2026-10-01', { required: true })).toBe('invalid')
    expect(windowProblem('', '', { required: true })).toBe('missing')
    expect(windowProblem('', '', { required: false })).toBeNull()
    expect(isIsoDate('2026-02-30')).toBe(false)
  })
})

describe('the presentation of server states', () => {
  it('has a tone for every display status, and shows an unknown one as neutral', () => {
    for (const status of DISPLAY_STATUSES) expect(displayStatusTone(status)).toBeTruthy()
    expect(displayStatusTone('SOMETHING_NEW')).toBe('neutral')
    // Off the network nothing is claimed about delivery, so it is not shown as success.
    expect(displayStatusTone('OFF_NETWORK')).toBe('neutral')
  })

  it('groups every reconciliation label exactly once', () => {
    const grouped = LABEL_GROUPS.flatMap((group) => group.labels)
    expect([...grouped].sort()).toEqual([...RECONCILIATION_LABELS].sort())
    expect(reconciliationTone('BRAND_NEW')).toBe('pending')
  })

  it('never reads an off-network delivery state as a delivery fact', () => {
    expect(deliveryStateIsMeaningful('OUTSIDE_PEPPOL')).toBe(false)
    expect(deliveryStateIsMeaningful('PEPPOL_NETWORK')).toBe(true)
  })

  it('treats a missing recipient answer as silence, not refusal', () => {
    expect(recipientAckTone('NONE')).toBe('neutral')
    expect(recipientAckTone('RE')).toBe('danger')
  })
})
