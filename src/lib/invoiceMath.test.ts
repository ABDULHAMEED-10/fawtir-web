import { describe, expect, it } from 'vitest'
import { calculateInvoice, formatAtScale, projectInvoice, type DiscountType, type LineInput } from './invoiceMath'

/**
 * Parity with the server's calculation engine. The composer's figures are only an estimate while
 * a draft is being typed; the server's preview is what the invoice will say. These are the golden
 * vectors from the backend's own `InvoiceCalculationEngineTest`, so a drift on either side shows
 * here as a failing digit rather than as an invoice that disagrees with its own preview.
 */

const line = (
  lineNumber: number,
  quantity: string,
  unitPrice: string,
  discount: [DiscountType, string] = ['PERCENTAGE', '0'],
): LineInput => ({
  id: String(lineNumber),
  lineNumber,
  quantity,
  unitPrice,
  vatRate: '5',
  discountType: discount[0],
  discountValue: discount[1],
})

/** `goldenLines()`: 12 × 1.800, and 4 × 9.500 less 10%, both at 5%. */
const GOLDEN = [line(1, '12', '1.800'), line(2, '4', '9.500', ['PERCENTAGE', '10'])]

const projected = (lines: LineInput[], header: [DiscountType, string]) =>
  projectInvoice(calculateInvoice(lines, header[0], header[1]))

describe('invoice maths, against the server engine', () => {
  it('reproduces the fixed header discount golden vector', () => {
    const totals = projected(GOLDEN, ['FIXED_AMOUNT', '5.000'])
    expect(formatAtScale(totals.subtotal)).toBe('59.600')
    expect(formatAtScale(totals.itemDiscount)).toBe('3.800')
    expect(formatAtScale(totals.headerDiscount)).toBe('5.000')
    expect(formatAtScale(totals.taxable)).toBe('50.800')
    expect(formatAtScale(totals.vat)).toBe('2.540')
    expect(formatAtScale(totals.total)).toBe('53.340')
  })

  it('reproduces the percentage header discount golden vector', () => {
    const totals = projected(GOLDEN, ['PERCENTAGE', '10'])
    expect(formatAtScale(totals.headerDiscount)).toBe('5.580')
    expect(formatAtScale(totals.taxable)).toBe('50.220')
    expect(formatAtScale(totals.vat)).toBe('2.511')
    expect(formatAtScale(totals.total)).toBe('52.731')
  })

  it('reconciles the lines to the total at three decimals, the leftover to the first line', () => {
    const totals = projected([line(1, '1', '10'), line(2, '1', '10'), line(3, '1', '10')], ['FIXED_AMOUNT', '10'])
    expect(totals.lines.map((each) => formatAtScale(each.headerDiscount))).toEqual(['3.334', '3.333', '3.333'])
    expect(totals.lines.map((each) => formatAtScale(each.taxable))).toEqual(['6.666', '6.667', '6.667'])
    expect(formatAtScale(totals.taxable)).toBe('20.000')
  })

  it('projects INV-2026-000001 as the server does, so the lines foot to the net amount (D-01, D-02)', () => {
    // RC5 browser E2E: 2 × 125.500, and 3 × 10.125 less 10%. The server stored and served a net of
    // 278.337 and a total of 292.254; rounding 27.3375 and 278.3375 alone gave 278.338 for both.
    const totals = projected(
      [line(1, '2', '125.500'), line(2, '3', '10.125', ['PERCENTAGE', '10'])],
      ['PERCENTAGE', '0'],
    )
    expect(totals.lines.map((each) => formatAtScale(each.afterLineDiscount))).toEqual(['251.000', '27.337'])
    // The taxable series is reconciled to 278.337 with the server's own clawback order
    // (ResidualReconciler: smallest remainder first), which takes the baisa from line 1. That is what
    // the server projects and what its Peppol document states as IBT-131.
    expect(totals.lines.map((each) => formatAtScale(each.taxable))).toEqual(['250.999', '27.338'])
    expect(formatAtScale(totals.itemDiscount)).toBe('3.038')
    expect(formatAtScale(totals.taxable)).toBe('278.337')
    expect(formatAtScale(totals.vat)).toBe('13.917')
    expect(formatAtScale(totals.total)).toBe('292.254')
    expect(formatAtScale(totals.lines.reduce((sum, each) => sum + each.afterLineDiscount, 0n))).toBe('278.337')
    expect(totals.taxable + totals.vat).toBe(totals.total)
  })

  it('reproduces the single decimal line', () => {
    const totals = projected([line(1, '2.5', '1.8')], ['PERCENTAGE', '0'])
    expect(formatAtScale(totals.subtotal)).toBe('4.500')
    expect(formatAtScale(totals.vat)).toBe('0.225')
    expect(formatAtScale(totals.total)).toBe('4.725')
  })
})
