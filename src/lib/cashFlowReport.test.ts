import { describe, expect, it } from 'vitest'
import type { CashFlowRowDto } from '../api/reports/reports'
import {
  inAndOut,
  netByPeriod,
  periodsOfCashFlow,
  periodsWithNegativeDirection,
} from './cashFlowReport'

const row = (over: Partial<CashFlowRowDto>): CashFlowRowDto => ({
  period: '2026-09',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  currency: 'OMR',
  received: 0,
  paidOut: 0,
  net: 0,
  ...over,
})

const september = row({ period: '2026-09', received: 1000, paidOut: 400, net: 600 })
const october = row({ period: '2026-10', received: -1000, paidOut: 250, net: -1250 })

describe('inAndOut', () => {
  it('keeps the two directions apart, so a reversal never reads as money paid out', () => {
    // October's receipt was reversed. Netting it against what went out would give the same
    // surplus while reporting 1,250 leaving the business that never left it.
    expect(inAndOut([september, october], ['2026-09', '2026-10'])).toEqual([
      { up: 1000, down: 400 },
      { up: -1000, down: 250 },
    ])
  })

  it('sums the currencies present in a period rather than dropping any of them', () => {
    const rows = [
      row({ period: '2026-09', currency: 'OMR', received: 100 }),
      row({ period: '2026-09', currency: 'USD', received: 50 }),
    ]
    expect(inAndOut(rows, ['2026-09'])).toEqual([{ up: 150, down: 0 }])
  })
})

describe('netByPeriod', () => {
  it('is the row net, not a recomputation that could drift from it', () => {
    expect(netByPeriod([september, october], periodsOfCashFlow([september, october]))).toEqual([600, -1250])
  })
})

describe('periodsWithNegativeDirection', () => {
  it('names a period whose reversals outweighed its payments', () => {
    // Neither bar chart can draw a negative length, so such a period has to be named or it
    // reads as a small positive.
    expect(periodsWithNegativeDirection([september, october])).toEqual(['2026-10'])
  })

  it('is empty when every direction is positive', () => {
    expect(periodsWithNegativeDirection([september])).toEqual([])
  })

  it('also catches a negative on the money-out side', () => {
    expect(periodsWithNegativeDirection([row({ period: '2026-11', paidOut: -5 })])).toEqual(['2026-11'])
  })
})
