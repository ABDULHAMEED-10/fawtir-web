import { describe, expect, it } from 'vitest'
import type { AgreementDto } from '../api/selfBilling/agreements'
import { NEW_QUOTATION } from './newQuotation'
import { quotationById } from './quotationDetail'
import { QUOTATION_ROWS, quotationSummary, quotationTabCount } from './quotations'
import { ORDER_ROWS, inOrderTab, orderKpis } from './orderForms'
import { orderById } from './orderFormDetail'
import { DELIVERY_ROWS } from './deliveryNotes'
import { deliveryById } from './deliveryNoteDetail'
import { invoicePrefill, linkableDocsFor } from './tradeConvert'
import { invoiceForDelivery, orderProgress, overDeliveredLines, rials } from './tradeLedger'
import { selfBillGate } from './tradeDocuments'

describe('the quantity ledger', () => {
  it('derives SO-0073 from its lines, drops and invoice', () => {
    const p = orderProgress('SO-0073')!
    expect(rials(p.net)).toBe('1,240.000')
    expect(rials(p.deliveredValue)).toBe('744.000')
    expect(rials(p.invoicedValue)).toBe('372.000')
    expect(rials(p.deliveredNotInvoicedValue)).toBe('372.000')
    expect(rials(p.toDeliverValue)).toBe('496.000')
    expect([p.deliveredPct, p.invoicedPct, p.toDeliverPct]).toEqual([60, 30, 40])
    expect(p.lines.map((line) => line.toDeliver)).toEqual([32, 24, 4])
  })

  it('knows DN-0124 is not billed and DN-0121 is billed by INV-2041', () => {
    expect(invoiceForDelivery('DN-0124')).toBeNull()
    expect(invoiceForDelivery('DN-0121')?.id).toBe('INV-2041')
    expect(DELIVERY_ROWS.find((row) => row.id === 'DN-0124')?.status).toBe('readyToInvoice')
    expect(deliveryById('DN-0124')?.action.amount).toBe('372.000')
  })

  it('refuses a note that ships past what the order still owes', () => {
    expect(overDeliveredLines('SO-0073', { 1: 24, 2: 26, 3: 0 })).toEqual([2])
    expect(overDeliveredLines('SO-0073', { 1: 32, 2: 24, 3: 4 })).toEqual([])
  })
})

describe('computed totals', () => {
  it('takes the QUO-0119 discount off once', () => {
    expect(NEW_QUOTATION.totals).toEqual({
      subtotal: '7,272.000',
      discount: '492.000',
      net: '6,780.000',
      vat: '339.000',
      total: '7,119.000',
    })
  })
})

describe('lists and details', () => {
  it('counts each tab as the rows it shows', () => {
    expect(quotationTabCount(QUOTATION_ROWS, 'all')).toBe(QUOTATION_ROWS.length)
    expect(quotationSummary(QUOTATION_ROWS).count).toBe(QUOTATION_ROWS.length)
    const tabs = [
      'draft',
      'open',
      'overdue',
      'readyToInvoice',
      'awaitingSupplierBill',
      'completed',
    ] as const
    expect(tabs.reduce((n, tab) => n + inOrderTab(ORDER_ROWS, tab).length, 0)).toBe(
      ORDER_ROWS.length,
    )
    expect(orderKpis(ORDER_ROWS)[2].link?.values.count).toBe(3)
  })

  it('reads the record the address names', () => {
    expect(quotationById('QUO-0139')?.subject).toBe('Staff training package')
    expect(quotationById('QUO-9999')).toBeNull()
    expect(orderById('PO-0031')?.direction).toBe('purchase')
    expect(orderById('PO-0029')).toMatchObject({
      direction: 'purchase',
      supplier: 'Al Noor Dates LLC',
    })
    expect(orderById('SO-0074')).toMatchObject({ direction: 'sales', customer: 'Sohar Grand Mall' })
    expect(deliveryById('GRN-0089')?.direction).toBe('purchase')
  })
})

describe('converting to an invoice', () => {
  it('carries DN-0124 lines, classification, VAT category and references', () => {
    const prefill = invoicePrefill('DN-0124')!
    expect(prefill.customerId).toBe('c-nizwa')
    expect(prefill.deliveryDate).toBe('2026-07-27')
    expect(
      prefill.lines.map((line) => [line.itemType, line.unitCode, line.qty, line.taxCode]),
    ).toEqual([
      ['goods', 'KGM', 24, 'S5'],
      ['service', 'C62', 18, 'S5'],
      ['goods', 'PK', 3, 'S5'],
    ])
    expect(prefill.lines[0].hsCode).toBe('000000000000')
    expect(prefill.lines.every((line) => line.deliveryNote === 'DN-0124')).toBe(true)
    expect(prefill.references).toMatchObject({ salesOrder: 'SO-0073', despatchAdvice: 'DN-0124' })
    expect(prefill.linked.map((doc) => doc.id)).toEqual(['DN-0124', 'SO-0073'])
  })

  it('bills an order for what is delivered and not yet invoiced', () => {
    const prefill = invoicePrefill('SO-0073')!
    expect(prefill.lines.map((line) => line.qty)).toEqual([24, 18, 3])
    expect(prefill.references.despatchAdvice).toBe('DN-0124')
  })

  it('offers only the chosen customer’s documents', () => {
    expect(linkableDocsFor(null)).toEqual([])
    const docs = linkableDocsFor('c-nizwa')
    expect(docs.map((doc) => doc.id)).toEqual(['DN-0124', 'SO-0073'])
    expect(docs.some((doc) => doc.id === 'DN-0131')).toBe(false)
  })
})

describe('self-billing', () => {
  const agreement = (extra: Partial<AgreementDto>): AgreementDto => ({
    id: 'sba-1',
    customerId: 's-1',
    agreementReference: 'SBA-1',
    status: 'ACTIVE',
    sellerIdentityAssurance: 'COUNTERPARTY_VERIFIED',
    verifiedParticipant: '0248:OM1',
    verifiedAt: '2026-01-01T00:00:00Z',
    effectiveFrom: '2026-01-01',
    effectiveTo: null,
    withdrawnAt: null,
    withdrawalReason: null,
    version: 0,
    ...extra,
  })

  it('is offered only under a signed, active agreement', () => {
    expect(selfBillGate(null, [], '2026-09-30')).toMatchObject({ allowed: false })
    expect(selfBillGate('s-1', null, '2026-09-30')).toMatchObject({ allowed: false })
    expect(selfBillGate('s-1', [agreement({})], '2026-09-30')).toMatchObject({ allowed: true })
    expect(selfBillGate('s-1', [agreement({ status: 'SUSPENDED' })], '2026-09-30')).toMatchObject({
      allowed: false,
      reasonKey: 'tradeDocs.selfBill.suspended',
    })
  })
})
