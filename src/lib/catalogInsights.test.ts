import { describe, expect, it } from 'vitest'
import {
  bestBar,
  bundleVat,
  historyValue,
  partsValue,
  percentOf,
  rollSeries,
  rollUpTill,
  salesPeriod,
  weekdays,
} from './catalogInsights'
import type { ProductSalesBucket, ProductUsageRow } from '../api/catalog/insights'

const day = (start: string, units: number): ProductSalesBucket => ({
  start,
  units,
  revenue: units,
  sales: units,
  tillUnits: units,
  invoiceUnits: 0,
})

describe('the item pages arithmetic', () => {
  it('reads a window ending today, both ends counted', () => {
    expect(salesPeriod('monthly', new Date(2026, 9, 28))).toEqual({
      from: '2026-09-29',
      to: '2026-10-28',
    })
    expect(salesPeriod('yearly', new Date(2026, 9, 28)).from).toBe('2025-10-29')
  })

  it('rolls days into months and ISO weeks, and finds the best bar', () => {
    const series = [day('2026-09-30', 4), day('2026-10-01', 2), day('2026-10-05', 7)]
    expect(rollSeries(series, 'month')).toEqual([
      { start: '2026-09-01', units: 4 },
      { start: '2026-10-01', units: 9 },
    ])
    // 30 Sep and 1 Oct share the week of Monday 28 Sep; 5 Oct is the next Monday.
    expect(rollSeries(series, 'week')).toEqual([
      { start: '2026-09-28', units: 6 },
      { start: '2026-10-05', units: 7 },
    ])
    expect(bestBar(rollSeries(series, 'day'))?.start).toBe('2026-10-05')
    expect(bestBar([{ start: '2026-10-01', units: 0 }])).toBeNull()
  })

  it('names the busiest and quietest weekday, and nothing when nothing sold', () => {
    // 2026-10-05 is a Monday, 2026-10-09 a Friday.
    const series = [day('2026-10-05', 9), day('2026-10-06', 3), day('2026-10-09', 1)]
    const found = weekdays(series)
    expect(found?.busiest).toBe(1)
    expect(found?.quietest).toBe(0)
    expect(weekdays([day('2026-10-05', 0)])).toBeNull()
    expect(percentOf(1, 3)).toBe(33)
    expect(percentOf(1, 0)).toBe(0)
  })

  it('sums the till rows it read into one line', () => {
    const row = (kind: ProductUsageRow['kind'], date: string, quantity: number) =>
      ({ kind, date, quantity, lineValue: quantity * 1.5 }) as ProductUsageRow
    expect(
      rollUpTill([
        row('TILL_SALE', '2026-10-02', 2),
        row('INVOICE', '2026-10-03', 9),
        row('TILL_SALE', '2026-10-01', 1),
      ]),
    ).toEqual({ read: 2, quantity: 3, lineValue: 4.5, first: '2026-10-01', last: '2026-10-02' })
    expect(rollUpTill([row('INVOICE', '2026-10-03', 9)])).toBeNull()
  })

  it('shows history values as sent, only in three decimals or words', () => {
    expect(historyValue('defaultUnitPrice', '1.4')).toEqual({ kind: 'money', value: '1.400' })
    expect(historyValue('defaultTaxRate', '5')).toEqual({ kind: 'percent', value: '5' })
    expect(historyValue('defaultTaxCategory', 'Z')).toMatchObject({
      key: 'catalogReal.category.Z',
    })
    expect(historyValue('onSale', 'false')).toMatchObject({ key: 'itemHistory.no' })
    expect(historyValue('addOn', 'Oat milk 0.200')).toEqual({
      kind: 'text',
      value: 'Oat milk 0.200',
    })
  })

  it('values the parts and the VAT on a bundle priced before VAT', () => {
    const parts = [
      { unitPrice: 10, quantity: 1, taxRate: 5, free: false },
      { unitPrice: 15, quantity: 1, taxRate: 5, free: true },
    ]
    expect(partsValue(parts)).toBe(10)
    expect(bundleVat(20, parts)).toEqual({ vat: 1, rate: 5 })
    // Mixed VAT: 20 shared 3.2 x 2 : 22.8 by value, only the second part at 5%.
    const mixed = bundleVat(26, [
      { unitPrice: 3.2, quantity: 2, taxRate: 0 },
      { unitPrice: 22.8, quantity: 1, taxRate: 5 },
    ])
    expect(mixed.rate).toBeNull()
    expect(mixed.vat).toBe(1.015)
  })
})
