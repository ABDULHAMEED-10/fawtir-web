import { describe, expect, it } from 'vitest'
import type { ExpenditureRowDto } from '../api/reports/reports'
import { byExpenditureGroup, byPeriodSpend, periodsOfExpenditure, topGroupShare } from './expenditureReport'

const row = (over: Partial<ExpenditureRowDto>): ExpenditureRowDto => ({
  period: '2026-01',
  periodStart: '2026-01-01',
  periodEnd: '2026-01-31',
  groupKey: '',
  groupLabel: '',
  currency: 'OMR',
  documents: 1,
  netAmount: 100,
  vatAmount: 5,
  totalAmount: 105,
  ...over,
})

describe('byPeriodSpend', () => {
  it('nets a credit note against the bills in its own period', () => {
    const rows = [
      row({ period: '2026-01', totalAmount: 1050 }),
      row({ period: '2026-01', totalAmount: -105 }),
      row({ period: '2026-02', totalAmount: 200 }),
    ]
    expect(byPeriodSpend(rows, periodsOfExpenditure(rows))).toEqual([945, 200])
  })

  it('keeps a period that nets negative as a negative figure', () => {
    // The chart clamps such a bar to nothing, but the number beside it is the row's truth. A
    // month where last month's bills were all credited really did net below zero.
    const rows = [row({ period: '2026-03', totalAmount: -400 })]
    expect(byPeriodSpend(rows, ['2026-03'])).toEqual([-400])
  })
})

describe('byExpenditureGroup', () => {
  it('keeps bills with no group under one entry instead of dropping them', () => {
    // Under CATEGORY the empty key is every bill with nothing recorded — today most of them.
    const rows = [
      row({ groupKey: 'Fuel', groupLabel: 'Fuel', totalAmount: 300 }),
      row({ groupKey: '', groupLabel: '', totalAmount: 700 }),
      row({ groupKey: '', groupLabel: '', totalAmount: 100 }),
    ]
    const groups = byExpenditureGroup(rows)

    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ key: '', total: 800, documents: 2 })
    expect(groups.reduce((sum, group) => sum + group.total, 0)).toBe(1100)
  })

  it('takes a label from a later row when the first one had none', () => {
    const rows = [
      row({ groupKey: 'abc', groupLabel: '', totalAmount: 10 }),
      row({ groupKey: 'abc', groupLabel: 'Gulf Supplies', totalAmount: 20 }),
    ]
    expect(byExpenditureGroup(rows)[0].label).toBe('Gulf Supplies')
  })
})

describe('topGroupShare', () => {
  it('is the largest group as a percentage of the whole', () => {
    const groups = byExpenditureGroup([
      row({ groupKey: 'a', totalAmount: 750 }),
      row({ groupKey: 'b', totalAmount: 250 }),
    ])
    expect(topGroupShare(groups)).toBe(75)
  })

  it('is null when the window nets to nothing, rather than a share of zero', () => {
    // "80% of spend" over a window whose bills were all credited is a division by roughly
    // nothing, not a fact about a supplier.
    const groups = byExpenditureGroup([
      row({ groupKey: 'a', totalAmount: 500 }),
      row({ groupKey: 'b', totalAmount: -500 }),
    ])
    expect(topGroupShare(groups)).toBeNull()
    expect(topGroupShare([])).toBeNull()
  })
})

describe('topGroupShare rounding', () => {
  it('never says 100% while another group still has spend in it', () => {
    // Live on 2026-09-22: Uploaded 12,374.895 of 12,388.395 rounds to 100 and then contradicts
    // the Scanned row drawn directly beneath it.
    const groups = byExpenditureGroup([
      row({ groupKey: 'UPLOADED', totalAmount: 12374.895 }),
      row({ groupKey: 'SCANNED', totalAmount: 13.5 }),
    ])
    expect(topGroupShare(groups)).toBe(99)
  })

  it('still says 100% when the top group really is everything', () => {
    expect(topGroupShare(byExpenditureGroup([row({ groupKey: 'a', totalAmount: 500 })]))).toBe(100)
  })
})
