import { describe, expect, it } from 'vitest'
import type { RecurringBillDto } from '../api/expenditure/recurringBills'
import { pauseReasonKey } from './recurringBills'

type Bill = Pick<RecurringBillDto, 'active' | 'status' | 'ended' | 'pauseReason'>
const paused = (pauseReason: Bill['pauseReason']): Bill => ({
  active: false,
  status: 'PAUSED',
  ended: false,
  pauseReason,
})

describe('why a recurring bill is paused', () => {
  it('names the plan beside Paused when a plan change paused it', () => {
    expect(pauseReasonKey(paused('PLAN_FEATURE_NOT_INCLUDED'))).toBe(
      'recurringBills.pauseReason.planFeatureNotIncluded',
    )
  })

  it('adds nothing for a pause by hand, with the supplier, an unknown reason or none', () => {
    expect(pauseReasonKey(paused('MANUAL'))).toBeNull()
    expect(pauseReasonKey(paused('SUPPLIER_SWITCHED_OFF'))).toBeNull()
    expect(pauseReasonKey(paused('SOMETHING_NEW' as Bill['pauseReason']))).toBeNull()
    expect(pauseReasonKey(paused(null))).toBeNull()
    expect(pauseReasonKey(paused(undefined))).toBeNull()
  })

  it('adds nothing on an active or ended instruction', () => {
    expect(
      pauseReasonKey({ ...paused('PLAN_FEATURE_NOT_INCLUDED'), active: true, status: 'ACTIVE' }),
    ).toBeNull()
    expect(
      pauseReasonKey({ ...paused('PLAN_FEATURE_NOT_INCLUDED'), status: 'ENDED', ended: true }),
    ).toBeNull()
  })
})
