import { describe, expect, it } from 'vitest'
import { OPEN_SALE, invoiceLinesFor, totalsFor } from './pos'
import { posInvoiceRequest } from './posInvoice'
import { DESIGN_REFERENCE } from './invoiceDraft'

describe('the till sale as invoice lines (owner, 21 Oct 2026)', () => {
  it("keeps the design's figures: 6.500 of items, 1.120 off drinks, 0.269 VAT, 5.649 to pay", () => {
    expect(totalsFor(OPEN_SALE)).toMatchObject({
      items: 6500,
      discount: 1120,
      saleDiscount: 0,
      vat: 269,
      sale: 5649,
      vatRates: [5],
    })
  })

  it("files each priced add-on as its own line, with the rule as each drink line's discount", () => {
    const lines = invoiceLinesFor(OPEN_SALE)
    expect(
      lines.map((l) => [l.description, l.quantity, l.unitPrice, l.discountValue, l.taxCode]),
    ).toEqual([
      ['Flat White · pos.size.large', '2', '1.800', '20', 'S5'],
      ['Flat White: + pos.addOn.extraShot', '2', '0.300', '20', 'S5'],
      ['Flat White: + pos.addOn.oatMilk', '2', '0.100', '20', 'S5'],
      ['Cortado', '1', '1.200', '20', 'S5'],
      ['Date & walnut slice', '1', '0.900', '0', 'S5'],
    ])
    expect(lines.every((l) => l.itemType === 'goods' && l.unit === 'EA')).toBe(true)
  })

  it('takes a discount on the whole sale after the rule, before VAT', () => {
    const totals = totalsFor(OPEN_SALE, { type: 'PERCENTAGE', value: '10' })
    expect(totals.saleDiscount).toBe(538)
    expect(totals.beforeVat).toBe(4842)
    expect(totals.vat).toBe(242)
    expect(totals.sale).toBe(5084)
  })

  it("files a walk-in as a simplified invoice through the composer's own request", () => {
    const request = posInvoiceRequest(DESIGN_REFERENCE, {
      lines: OPEN_SALE,
      customer: { kind: 'consumer', id: 'walk-in' },
      branchId: 'b-nizwa',
      saleDiscount: { type: 'FIXED_AMOUNT', value: '0.500' },
    })
    expect(request).toMatchObject({
      customerId: 'walk-in',
      branchId: 'b-nizwa',
      currency: 'OMR',
      vatMode: 'EXCLUSIVE',
      headerDiscount: { type: 'FIXED_AMOUNT', value: 0.5 },
      details: { transactionType: 'SIMPLIFIED', paymentTerms: { code: 'NET0' } },
    })
    expect(request.lines).toHaveLength(5)
    expect(request.lines[0]).toMatchObject({
      lineNumber: 1,
      unitCode: 'EA',
      quantity: 2,
      unitPrice: 1.8,
      discount: { type: 'PERCENTAGE', value: 20 },
      taxCategory: { code: 'S5', en16931Category: 'S', rate: 5 },
    })
    expect(request.lines.some((line) => 'classification' in line)).toBe(false)
  })

  it('files a sale put on a company as a full tax invoice', () => {
    const request = posInvoiceRequest(DESIGN_REFERENCE, {
      lines: OPEN_SALE,
      customer: { kind: 'business', id: 'c-1' },
      branchId: 'b-main',
    })
    expect(request.details).toMatchObject({ transactionType: 'FULL_TAX' })
  })
})
