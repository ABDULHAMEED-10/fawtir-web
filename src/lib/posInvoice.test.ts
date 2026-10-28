import { describe, expect, it } from 'vitest'
import { invoiceLinesFor, totalsFor } from './pos'
import { posInvoiceRequest, posLineRefs, posSaleBody } from './posInvoice'
import { DESIGN_REFERENCE } from './invoiceDraft'
import { SAMPLE_SALE } from './posTestSale'
import { paymentsRequest } from './posPayment'
import { choicesOf } from './posShelf'
import type { ProductDto } from '../api/catalog/products'

describe('the till sale as invoice lines (owner, 21 Oct 2026)', () => {
  it("keeps the design's figures: 6.500 of items, 1.120 off drinks, 0.269 VAT, 5.649 to pay", () => {
    expect(totalsFor(SAMPLE_SALE)).toMatchObject({
      items: 6500,
      discount: 1120,
      saleDiscount: 0,
      vat: 269,
      sale: 5649,
      vatRates: [5],
    })
  })

  it("files each priced add-on as its own line, with the rule as each drink line's discount", () => {
    const lines = invoiceLinesFor(SAMPLE_SALE)
    expect(
      lines.map((l) => [l.description, l.quantity, l.unitPrice, l.discountValue, l.taxCode]),
    ).toEqual([
      ['Flat White · Large', '2', '1.800', '20', 'S5'],
      ['Flat White: + extra shot', '2', '0.300', '20', 'S5'],
      ['Flat White: + oat milk', '2', '0.100', '20', 'S5'],
      ['Cortado', '1', '1.200', '20', 'S5'],
      ['Date & walnut slice', '1', '0.900', '0', 'S5'],
    ])
    expect(lines.every((l) => l.itemType === 'goods' && l.unit === 'EA')).toBe(true)
  })

  it('takes a discount on the whole sale after the rule, before VAT', () => {
    const totals = totalsFor(SAMPLE_SALE, { type: 'PERCENTAGE', value: '10' })
    expect(totals.saleDiscount).toBe(538)
    expect(totals.beforeVat).toBe(4842)
    expect(totals.vat).toBe(242)
    expect(totals.sale).toBe(5084)
  })

  it("files a walk-in as a simplified invoice through the composer's own request", () => {
    const request = posInvoiceRequest(DESIGN_REFERENCE, {
      lines: SAMPLE_SALE,
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
      // P.9: the till sells catalogue products; the size's own code names it.
      productId: 'p-flat',
      productCode: 'FW-L',
    })
    expect(request.lines.some((line) => 'classification' in line)).toBe(false)
  })

  it('files a sale put on a company as a full tax invoice', () => {
    const request = posInvoiceRequest(DESIGN_REFERENCE, {
      lines: SAMPLE_SALE,
      customer: { kind: 'business', id: 'c-1' },
      branchId: 'b-main',
    })
    expect(request.details).toMatchObject({ transactionType: 'FULL_TAX' })
  })
})

describe('POST /v1/pos/sales (P.12)', () => {
  it('names every catalogue line: items with their size, priced add-ons with their add-on', () => {
    expect(posLineRefs(SAMPLE_SALE)).toEqual([
      { lineNumber: 1, role: 'ITEM', productId: 'p-flat', variantId: 'v-large', addOnId: null },
      { lineNumber: 2, role: 'ADD_ON', productId: 'p-flat', variantId: null, addOnId: 'a-shot' },
      { lineNumber: 3, role: 'ADD_ON', productId: 'p-flat', variantId: null, addOnId: 'a-oat' },
      { lineNumber: 4, role: 'ITEM', productId: 'p-cortado', variantId: null, addOnId: null },
      { lineNumber: 5, role: 'ITEM', productId: 'p-slice', variantId: null, addOnId: null },
    ])
  })

  it('sends a walk-in as WALK_IN, with no customer on the draft', () => {
    const body = posSaleBody(DESIGN_REFERENCE, {
      lines: SAMPLE_SALE,
      saleDiscount: { type: 'PERCENTAGE', value: '0' },
      branchId: 'b-main',
      buyer: { kind: 'walkIn' },
    })
    expect(body.customer).toEqual({ kind: 'WALK_IN' })
    expect('customerId' in body.draft).toBe(false)
    expect(body.draft.details.transactionType).toBe('SIMPLIFIED')
  })

  it('sends a company sale as BUSINESS with its customer, as a full tax invoice', () => {
    const body = posSaleBody(DESIGN_REFERENCE, {
      lines: SAMPLE_SALE,
      saleDiscount: { type: 'PERCENTAGE', value: '0' },
      branchId: 'b-main',
      buyer: { kind: 'company', customerId: 'c-grand', customerKind: 'BUSINESS' },
    })
    expect(body.customer).toEqual({ kind: 'BUSINESS', customerId: 'c-grand' })
    expect(body.draft.customerId).toBe('c-grand')
    expect(body.draft.details.transactionType).toBe('FULL_TAX')
  })

  it('resends a sale over the simplified limit as a full invoice to the buyer named with their ID', () => {
    const body = posSaleBody(DESIGN_REFERENCE, {
      lines: SAMPLE_SALE,
      saleDiscount: { type: 'PERCENTAGE', value: '0' },
      branchId: 'b-main',
      buyer: {
        kind: 'named',
        name: 'Salim Al Harthy',
        contact: null,
        identifierScheme: 'CID',
        identifierValue: '12345678',
      },
    })
    expect(body.customer).toEqual({
      kind: 'CONSUMER',
      consumer: {
        name: 'Salim Al Harthy',
        contact: null,
        identifierScheme: 'CID',
        identifierValue: '12345678',
      },
    })
    expect(body.draft.details.transactionType).toBe('FULL_TAX')
  })

  it('takes the tip off the cash it was paid with, and keeps what was handed over', () => {
    // 5.649 sale + 0.351 tip, 10.000 handed over.
    const { payments, tip } = paymentsRequest(
      [{ id: 't1', method: 'cash', amount: 6000, handedOver: 10000 }],
      351,
    )
    expect(payments).toEqual([{ method: 'CASH', amount: 5.649, tendered: 10 }])
    expect(tip).toEqual({ amount: 0.351, method: 'CASH' })
  })

  it('sends a split card and cash, the card with its optional approval code only when typed', () => {
    const { payments, tip } = paymentsRequest(
      [
        { id: 't1', method: 'card', amount: 3000, approvalCode: ' 898498 ' },
        { id: 't2', method: 'card', amount: 1000, approvalCode: '' },
        { id: 't3', method: 'cash', amount: 1649, handedOver: 2000 },
      ],
      0,
    )
    expect(payments).toEqual([
      { method: 'CARD', amount: 3, cardApprovalCode: '898498' },
      { method: 'CARD', amount: 1 },
      { method: 'CASH', amount: 1.649, tendered: 2 },
    ])
    expect(tip).toBeNull()
  })

  it('keeps a scanned slip with its card payment', () => {
    const { payments } = paymentsRequest(
      [
        {
          id: 't1',
          method: 'card',
          amount: 9937,
          slipFileId: 'f-1',
          slipFields: { authCode: '898498', cardLast4: '3315', amount: 9.937 },
        },
      ],
      0,
    )
    expect(payments[0]).toMatchObject({
      method: 'CARD',
      amount: 9.937,
      slipFileId: 'f-1',
      slipFields: { authCode: '898498', cardLast4: '3315', amount: 9.937 },
    })
  })
})

describe('the shelf (P.9)', () => {
  it("prices a size at the branch's price plus its changes, unless it has its own price", () => {
    const product = {
      id: 'p-flat',
      sizes: [
        { id: 's-r', name: 'Regular', nameAr: 'عادي', priceDelta: 0, sortOrder: 0 },
        { id: 's-l', name: 'Large', nameAr: 'كبير', priceDelta: 0.4, sortOrder: 1 },
      ],
      options: [{ id: 'o-oat', name: 'Oat', nameAr: null, priceDelta: 0.1, sortOrder: 0 }],
      variants: [
        {
          id: 'v1',
          sizeId: 's-r',
          size: 'Regular',
          optionId: 'o-oat',
          option: 'Oat',
          name: '',
          code: 'FW-R-O',
          priceOverride: null,
          price: 0,
          onSale: true,
        },
        {
          id: 'v2',
          sizeId: 's-l',
          size: 'Large',
          optionId: null,
          option: null,
          name: '',
          code: 'FW-L',
          priceOverride: 2.5,
          price: 0,
          onSale: true,
        },
        {
          id: 'v3',
          sizeId: 's-l',
          size: 'Large',
          optionId: 'o-oat',
          option: 'Oat',
          name: '',
          code: 'FW-L-O',
          priceOverride: null,
          price: 0,
          onSale: false,
        },
      ],
      addOns: [{ id: 'a1', name: 'Decaf', nameAr: null, price: 0, free: true, sortOrder: 0 }],
    } as unknown as ProductDto
    const choices = choicesOf(product, 1500, true)
    expect(choices.sizes).toEqual([
      { id: 'v1', code: 'FW-R-O', label: 'عادي · Oat', price: 1600 },
      { id: 'v2', code: 'FW-L', label: 'كبير', price: 2500 },
    ])
    expect(choices.addOns).toEqual([{ id: 'a1', label: 'Decaf', price: 0 }])
  })
})
