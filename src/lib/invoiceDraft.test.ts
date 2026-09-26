import { describe, expect, it } from 'vitest'
import { SEEDED_REFERENCE, SEEDED_TAX_CATEGORIES } from '../testing/referenceData'
import type { DraftResponse } from '../api/invoices/drafts'
import {
  blankDraftForm,
  blankDraftLine,
  fromDraftResponse,
  placeFieldErrors,
  problemsBeforeIssue,
  problemsBeforeSave,
  toDraftRequest,
  type DraftForm,
} from './invoiceDraft'

function form(overrides: Partial<DraftForm> = {}): DraftForm {
  return {
    ...blankDraftForm(SEEDED_TAX_CATEGORIES),
    customerId: 'c-1',
    branchId: 'b-1',
    lines: [
      {
        ...blankDraftLine(SEEDED_TAX_CATEGORIES),
        productId: 'p-1',
        productCode: 'FLT-1',
        description: 'Flat White',
        unitPrice: '1.600',
        quantity: '12',
      },
    ],
    ...overrides,
  }
}

describe('the draft a form saves', () => {
  it('sends exclusive prices, the tax option, and the transaction type the tab implies', () => {
    const request = toDraftRequest(SEEDED_REFERENCE, form(), true, false, () => 'Net 30 days')
    expect(request).toMatchObject({
      customerId: 'c-1',
      branchId: 'b-1',
      currency: 'OMR',
      vatMode: 'EXCLUSIVE',
      headerDiscount: { type: 'PERCENTAGE', value: 0 },
      details: {
        transactionType: 'FULL_TAX',
        paymentTerms: { code: 'NET30', label: 'Net 30 days' },
        internalNote: '',
      },
    })
    expect(request.lines[0]).toEqual({
      lineNumber: 1,
      productId: 'p-1',
      productCode: 'FLT-1',
      description: 'Flat White',
      unitCode: 'EA',
      quantity: 12,
      unitPrice: 1.6,
      discount: { type: 'PERCENTAGE', value: 0 },
      taxCategory: { code: 'S5', en16931Category: 'S', rate: 5, exemptionReason: null },
    })
    expect(
      toDraftRequest(SEEDED_REFERENCE, form({ customerType: 'consumer' }), true).details
        .transactionType,
    ).toBe('SIMPLIFIED')
  })

  it('sends a free-text line with no product, and a goods line with its HS code', () => {
    const free = { ...blankDraftLine(SEEDED_TAX_CATEGORIES), description: 'Consulting', unitPrice: '25.000' }
    const request = toDraftRequest(
      SEEDED_REFERENCE,
      form({ lines: [free, { ...free, description: 'Beans', hsCode: '090121000000' }] }),
      true,
    )
    expect(request.lines[0]).not.toHaveProperty('productId')
    expect(request.lines[0]).not.toHaveProperty('productCode')
    expect(request.lines[0]).not.toHaveProperty('classification')
    expect(request.lines[1].classification).toEqual({ goodsOrService: 'G', hsCode: '090121000000' })
  })

  it('leaves a services line unclassified until the official service types are served', () => {
    const service = {
      ...blankDraftLine(SEEDED_TAX_CATEGORIES),
      description: 'Catering',
      itemType: 'service' as const,
      unit: 'HUR',
      serviceType: '63393',
    }
    expect(toDraftRequest(SEEDED_REFERENCE, form({ lines: [service] }), true).lines[0]).not.toHaveProperty(
      'classification',
    )
  })

  it('sends the terms the design offers by code, labelled, even where the platform list lacks them', () => {
    // End of month is one of the design's terms; the catalogue seeds NET0..NET60 only.
    expect(
      toDraftRequest(SEEDED_REFERENCE, form({ paymentTerms: 'EOM' }), true).details.paymentTerms,
    ).toEqual({ code: 'EOM', label: 'End of month' })
    expect(
      toDraftRequest(SEEDED_REFERENCE, form({ paymentTerms: 'NET14' }), true).details.paymentTerms,
    ).toEqual({ code: 'NET14', label: 'NET14' })
    // A code neither list knows keeps the label the loaded draft carried.
    expect(
      toDraftRequest(
        SEEDED_REFERENCE,
        form({ paymentTerms: 'NET90', paymentTermsLabel: 'Net 90 days' }),
        true,
      ).details.paymentTerms,
    ).toEqual({ code: 'NET90', label: 'Net 90 days' })
  })

  it('strips VAT out of a price entered inclusive, since the server prices exclusive only', () => {
    const request = toDraftRequest(
      SEEDED_REFERENCE,
      form({ lines: [{ ...form().lines[0], unitPrice: '1.05' }] }),
      false,
    )
    expect(request.lines[0].unitPrice).toBe(1)
  })

  it('sends a reason only where the category needs one', () => {
    const exempt = {
      ...form().lines[0],
      taxCode: 'E0',
      vatRate: '0',
      exemptionReason: '  Financial service  ',
    }
    expect(
      toDraftRequest(SEEDED_REFERENCE, form({ lines: [exempt] }), true).lines[0].taxCategory,
    ).toEqual({
      code: 'E0',
      en16931Category: 'E',
      rate: 0,
      exemptionReason: 'Financial service',
    })
    expect(
      toDraftRequest(
        SEEDED_REFERENCE,
        form({ lines: [{ ...exempt, taxCode: 'S5', vatRate: '5' }] }),
        true,
      ).lines[0].taxCategory.exemptionReason,
    ).toBeNull()
  })

  it('leaves the internal note out when this person cannot read it, so the server keeps it', () => {
    expect(
      'internalNote' in
        toDraftRequest(SEEDED_REFERENCE, form({ internalNote: null }), true).details,
    ).toBe(false)
    expect(
      toDraftRequest(SEEDED_REFERENCE, form({ internalNote: '' }), true).details.internalNote,
    ).toBe('')
  })
})

describe('a saved draft back into the form', () => {
  const saved: DraftResponse = {
    id: 'd-1',
    version: 3,
    authoringState: 'DRAFT',
    customerId: 'c-1',
    branchId: 'b-1',
    currency: 'OMR',
    invoiceNumber: null,
    details: {
      deliveryDate: '2026-09-10',
      subject: 'September supply',
      purchaseOrderReference: 'PO-9',
      customerVisibleNote: null,
      paymentTerms: { code: 'NET14', label: 'Net 14 days' },
      transactionType: 'FULL_TAX',
    },
    headerDiscount: { type: 'FIXED_AMOUNT', value: 5 },
    lines: [
      {
        lineNumber: 1,
        productId: 'p-1',
        productCode: 'FLT-1',
        description: 'Flat White',
        unitCode: 'EA',
        quantity: 12,
        unitPrice: 1.8,
        discountType: 'PERCENTAGE',
        discountValue: 10,
        taxCategoryCode: 'E0',
        en16931Category: 'E',
        taxRate: 0,
        exemptionReason: 'Financial service',
      },
    ],
  }

  it('reads every field the save sends, so saving again changes nothing', () => {
    const restored = fromDraftResponse(SEEDED_TAX_CATEGORIES, saved, 'business')
    expect(restored).toMatchObject({
      paymentTerms: 'NET14',
      deliveryDate: '2026-09-10',
      subject: 'September supply',
      purchaseOrder: 'PO-9',
      headerDiscountType: 'FIXED_AMOUNT',
      headerDiscountValue: '5',
      internalNote: null,
    })
    expect(restored.lines[0]).toMatchObject({
      unitPrice: '1.800',
      taxCode: 'E0',
      exemptionReason: 'Financial service',
      discountValue: '10',
    })
    const again = toDraftRequest(SEEDED_REFERENCE, restored, true)
    expect(again.lines[0]).toMatchObject({
      unitPrice: 1.8,
      taxCategory: { code: 'E0', en16931Category: 'E', exemptionReason: 'Financial service' },
    })
    expect(again.headerDiscount).toEqual({ type: 'FIXED_AMOUNT', value: 5 })
  })
})

describe('checks before saving', () => {
  it('names each gap and the line it is on', () => {
    const blank = {
      ...blankDraftForm(SEEDED_TAX_CATEGORIES),
      lines: [
        { ...blankDraftLine(SEEDED_TAX_CATEGORIES), unitPrice: '' },
        {
          ...blankDraftLine(SEEDED_TAX_CATEGORIES, 'E0'),
          description: 'Advice',
          unitPrice: '1',
          quantity: '0',
        },
      ],
    }
    expect(
      problemsBeforeSave(SEEDED_TAX_CATEGORIES, blank).map(
        (problem) => `${problem.field}${problem.line ?? ''}`,
      ),
    ).toEqual(['customer', 'branch', 'description0', 'unitPrice0', 'quantity1', 'exemptionReason1'])
    expect(problemsBeforeSave(SEEDED_TAX_CATEGORIES, form())).toEqual([])
  })

  it('wants an HS code on goods lines and a service type on service lines, except for a consumer', () => {
    const goods = form().lines[0]
    const service = {
      ...blankDraftLine(SEEDED_TAX_CATEGORIES),
      description: 'Barista training',
      itemType: 'service' as const,
      unit: 'HUR',
      unitPrice: '15.000',
      quantity: '2',
    }
    const unclassified = form({ lines: [goods, service] })
    expect(problemsBeforeSave(SEEDED_TAX_CATEGORIES, unclassified)).toEqual([])
    expect(
      problemsBeforeIssue(unclassified).map((problem) => `${problem.field}${problem.line}`),
    ).toEqual(['hsCode0', 'serviceType1'])
    expect(problemsBeforeIssue({ ...unclassified, customerType: 'government' })).toHaveLength(2)
    expect(problemsBeforeIssue({ ...unclassified, customerType: 'consumer' })).toEqual([])
    const classified = form({
      lines: [
        { ...goods, hsCode: '000000000000' },
        { ...service, serviceType: '92900' },
      ],
    })
    expect(problemsBeforeIssue(classified)).toEqual([])
    // Neither code reaches the draft request: it refuses members the API does not know.
    const sent = toDraftRequest(SEEDED_REFERENCE, classified, true).lines
    expect('hsCode' in sent[0]).toBe(false)
    expect('serviceType' in sent[1]).toBe(false)
  })

  it('puts the server field errors on their lines and keeps the rest', () => {
    const placed = placeFieldErrors([
      { field: 'draft.lines[1].unitPrice', message: 'must be greater than or equal to 0.0' },
      { field: 'draft.lines[0].productId', message: 'must not be null' },
      { field: 'draft.branchId', message: 'must not be null' },
    ])
    expect(placed.lines).toEqual({
      1: { unitPrice: 'must be greater than or equal to 0.0' },
      0: { product: 'must not be null' },
    })
    expect(placed.other).toEqual(['branchId: must not be null'])
  })
})
