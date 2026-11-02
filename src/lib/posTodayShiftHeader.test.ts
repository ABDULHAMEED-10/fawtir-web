import { describe, expect, it } from 'vitest'
import type { PosTodaySaleRow } from '../api/pos/pos'
import { groupByShift } from './posToday'

// NOT RUN (batch 40, static only). WSR-9 / FIN-2: a shift's header names only a proven cashier.

const row = (
  saleId: string,
  cashier: PosTodaySaleRow['cashier'],
  attribution?: PosTodaySaleRow['attribution'],
): PosTodaySaleRow =>
  ({
    saleId,
    shiftId: 'shift-1',
    tillNumber: 1,
    total: 1,
    cashier,
    ...(attribution === undefined ? {} : { attribution }),
  }) as unknown as PosTodaySaleRow

const SENDER = { userId: 'u-9', name: 'Sender' }
const AISHA = { userId: 'u-1', name: 'Aisha' }

describe('the shift header names only a proven cashier', () => {
  it('a LEGACY-first group takes the name from the first proven row', () => {
    const [group] = groupByShift([row('a', SENDER, 'LEGACY'), row('b', AISHA, 'VERIFIED')])
    expect(group.cashier).toBe('Aisha')
  })

  it('a PENDING-first group takes the name from the first proven row', () => {
    const [group] = groupByShift([row('a', null, 'PENDING_REVIEW'), row('b', AISHA, 'ONLINE')])
    expect(group.cashier).toBe('Aisha')
  })

  it('a group with no proven row names nobody', () => {
    const [group] = groupByShift([row('a', SENDER, 'LEGACY'), row('b', null, 'PENDING_REVIEW')])
    expect(group.cashier).toBe('')
  })

  it('an older server without attribution reads as before', () => {
    const [group] = groupByShift([row('a', AISHA), row('b', AISHA, null)])
    expect(group.cashier).toBe('Aisha')
    expect(group.sales).toHaveLength(2)
  })
})
