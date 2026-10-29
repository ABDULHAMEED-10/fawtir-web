import { describe, expect, it } from 'vitest'
import { SEEDED_REFERENCE, SEEDED_TAX_CATEGORIES } from '../testing/referenceData'
import type { DraftResponse } from '../api/invoices/drafts'
import { EXEMPT_REASONS, ZERO_RATED_REASONS, taxReasonsFor } from './codeLists/taxReasons'
import {
  CATEGORY_REASON_CONFLICT,
  blankDraftForm,
  blankDraftLine,
  categoryReasonConflicts,
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
      taxCategory: {
        code: 'S5',
        en16931Category: 'S',
        rate: 5,
        exemptionReason: null,
        exemptionReasonCode: null,
      },
    })
    expect(
      toDraftRequest(SEEDED_REFERENCE, form({ customerType: 'consumer' }), true).details
        .transactionType,
    ).toBe('SIMPLIFIED')
  })

  it('sends a free-text line with no product, and a goods line with its HS code', () => {
    const free = {
      ...blankDraftLine(SEEDED_TAX_CATEGORIES),
      description: 'Consulting',
      unitPrice: '25.000',
    }
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

  it('states a services line as services, and passes a service type on only when it is an official code', () => {
    const service = {
      ...blankDraftLine(SEEDED_TAX_CATEGORIES),
      description: 'Catering',
      itemType: 'service' as const,
      unit: 'HUR',
    }
    const lines = (over: object, customerType: 'business' | 'consumer' = 'business') =>
      toDraftRequest(
        SEEDED_REFERENCE,
        form({ customerType, lines: [{ ...service, ...over }] }),
        true,
      ).lines[0]
    // No service type: IBR-155-OM asks for one on an export of services alone.
    expect(lines({}).classification).toEqual({ goodsOrService: 'S' })
    // The composer's placeholder codes are five digits and the backend refuses them.
    expect(lines({ serviceType: '63393' }).classification).toEqual({ goodsOrService: 'S' })
    expect(lines({ serviceType: '83000000' }).classification).toEqual({
      goodsOrService: 'S',
      serviceTypeCode: '83000000',
    })
    // A consumer's simplified invoice carries no classification.
    expect(lines({}, 'consumer')).not.toHaveProperty('classification')
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

  it('sends a reason code for zero-rated and exempt lines, text for the other categories', () => {
    const base = { ...form().lines[0], vatRate: '0' }
    const request = (line: object) =>
      toDraftRequest(SEEDED_REFERENCE, form({ lines: [{ ...base, ...line }] }), true).lines[0]
        .taxCategory
    // Exempt: a VATEX code, and no free text alongside it.
    expect(
      request({ taxCode: 'E0', exemptionReason: 'left over', exemptionReasonCode: 'VATEX-OM-02' }),
    ).toEqual({
      code: 'E0',
      en16931Category: 'E',
      rate: 0,
      exemptionReason: null,
      exemptionReasonCode: 'VATEX-OM-02',
    })
    // Zero-rated: a VATZR code.
    expect(request({ taxCode: 'Z0', exemptionReasonCode: 'VATZR-OM-09' })).toEqual({
      code: 'Z0',
      en16931Category: 'Z',
      rate: 0,
      exemptionReason: null,
      exemptionReasonCode: 'VATZR-OM-09',
    })
    // Reverse charge still gives text, and no code.
    expect(request({ taxCode: 'AE0', exemptionReason: '  Reverse charge  ' })).toMatchObject({
      exemptionReason: 'Reverse charge',
      exemptionReasonCode: null,
    })
    // Standard rate: neither.
    expect(
      request({ taxCode: 'S5', vatRate: '5', exemptionReasonCode: 'VATZR-OM-09' }),
    ).toMatchObject({
      exemptionReason: null,
      exemptionReasonCode: null,
    })
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

  it('keeps an ordinary invoice’s own buyer reference (IBT-010), but never its contract reference', () => {
    const details = toDraftRequest(
      SEEDED_REFERENCE,
      form({ buyerReference: 'BR-41', contractReference: 'CTR-9' }),
      true,
      false,
    ).details
    expect(details).toMatchObject({ buyerReference: 'BR-41' })
    expect(details).not.toHaveProperty('contractReference')
    expect(
      toDraftRequest(SEEDED_REFERENCE, form({ buyerReference: '  ' }), true, false).details,
    ).not.toHaveProperty('buyerReference')
    expect(
      toDraftRequest(
        SEEDED_REFERENCE,
        form({ customerType: 'consumer', buyerReference: 'BR-41' }),
        true,
        false,
      ).details,
    ).not.toHaveProperty('buyerReference')
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
        exemptionReason: null,
        exemptionReasonCode: 'VATEX-OM-01',
      },
    ],
  }

  it('reopens a business line saved with no classification unchosen, a consumer line by its unit (A-12)', () => {
    const hourly = { ...saved, lines: [{ ...saved.lines[0], unitCode: 'HUR', classification: null }] }
    expect(fromDraftResponse(SEEDED_TAX_CATEGORIES, hourly, 'business').lines[0].itemType).toBeNull()
    expect(fromDraftResponse(SEEDED_TAX_CATEGORIES, hourly, 'consumer').lines[0].itemType).toBe('service')
    const goods = { ...hourly, lines: [{ ...hourly.lines[0], classification: { goodsOrService: 'G' as const, hsCode: '090121000000' } }] }
    expect(fromDraftResponse(SEEDED_TAX_CATEGORIES, goods, 'business').lines[0].itemType).toBe('goods')
  })

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
      exemptionReasonCode: 'VATEX-OM-01',
      discountValue: '10',
    })
    const again = toDraftRequest(SEEDED_REFERENCE, restored, true)
    expect(again.lines[0]).toMatchObject({
      unitPrice: 1.8,
      taxCategory: { code: 'E0', en16931Category: 'E', exemptionReasonCode: 'VATEX-OM-01' },
    })
    expect(again.headerDiscount).toEqual({ type: 'FIXED_AMOUNT', value: 5 })
  })
})

describe('checks before saving', () => {
  it('wants a reason code on a zero-rated or exempt line, and text on the other categories', () => {
    const line = (taxCode: string, over: object = {}) => ({
      ...form().lines[0],
      taxCode,
      vatRate: '0',
      ...over,
    })
    const problems = (l: object) =>
      problemsBeforeSave(SEEDED_TAX_CATEGORIES, form({ lines: [l as never] })).map((p) => p.field)
    expect(problems(line('Z0'))).toEqual(['exemptionReason'])
    expect(problems(line('Z0', { exemptionReasonCode: 'VATZR-OM-10' }))).toEqual([])
    expect(problems(line('E0', { exemptionReason: 'typed text is not the code' }))).toEqual([
      'exemptionReason',
    ])
    expect(problems(line('E0', { exemptionReasonCode: 'VATEX-OM-02' }))).toEqual([])
    expect(problems(line('AE0'))).toEqual(['exemptionReason'])
    expect(problems(line('AE0', { exemptionReason: 'Reverse charge' }))).toEqual([])
    // Outside scope: the reason is optional (no PINT-OM rule asks for IBT-120 on O; backend V210).
    expect(problems(line('O0'))).toEqual([])
    expect(problems(line('O0', { exemptionReason: 'Not a supply' }))).toEqual([])
  })

  it('carries the 16 zero-rated and 12 exempt reason codes, never mixed', () => {
    expect(ZERO_RATED_REASONS.map((r) => r.code)).toEqual(
      Array.from({ length: 16 }, (_, i) => `VATZR-OM-${String(i + 1).padStart(2, '0')}`),
    )
    expect(EXEMPT_REASONS.map((r) => r.code)).toEqual(
      Array.from({ length: 12 }, (_, i) => `VATEX-OM-${String(i + 1).padStart(2, '0')}`),
    )
    expect(taxReasonsFor('Z')).toBe(ZERO_RATED_REASONS)
    expect(taxReasonsFor('E')).toBe(EXEMPT_REASONS)
    expect(taxReasonsFor('S')).toBeUndefined()
    expect(ZERO_RATED_REASONS.find((r) => r.code === 'VATZR-OM-09')?.en).toBe('Export of service')
  })

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

  it('refuses a line whose amount the server cannot hold, and allows the bound itself', () => {
    const line = form().lines[0]
    const over = form({
      lines: [{ ...line, quantity: '1000000000', unitPrice: '99999999999.000' }],
    })
    expect(problemsBeforeSave(SEEDED_TAX_CATEGORIES, over).map((problem) => problem.key)).toEqual([
      'invoiceDraft.problem.lineAmount',
    ])
    const atBound = form({ lines: [{ ...line, quantity: '1', unitPrice: '999999999999.999' }] })
    expect(problemsBeforeSave(SEEDED_TAX_CATEGORIES, atBound)).toEqual([])
  })

  it('wants an HS code on goods lines, and no service type on service lines, except for a consumer', () => {
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
    ).toEqual(['hsCode0'])
    expect(problemsBeforeIssue({ ...unclassified, customerType: 'government' })).toHaveLength(1)
    expect(problemsBeforeIssue({ ...unclassified, customerType: 'consumer' })).toEqual([])
    const classified = form({
      lines: [
        { ...goods, hsCode: '000000000000' },
        { ...service, serviceType: '92900' },
      ],
    })
    expect(problemsBeforeIssue(classified)).toEqual([])
    // Neither field reaches the draft request as a top-level member: it refuses members the API
    // does not know. The codes travel inside `classification`.
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

describe('one reason per VAT category and rate (V.6, BR-CO-18)', () => {
  const zeroRated = (code: string, description: string) => ({
    ...blankDraftLine(SEEDED_TAX_CATEGORIES, 'Z0'),
    description,
    unitPrice: '10.000',
    exemptionReasonCode: code,
  })

  it('refuses a second zero-rated line with another reason code, on that line', () => {
    const conflicting = form({
      lines: [
        zeroRated('VATZR-OM-10', 'Export, goods'),
        zeroRated('VATZR-OM-09', 'Export, services'),
      ],
    })
    expect(problemsBeforeSave(SEEDED_TAX_CATEGORIES, conflicting)).toEqual([
      { field: 'exemptionReason', line: 1, key: CATEGORY_REASON_CONFLICT },
    ])
  })

  it('lets the same category and rate share a reason, and different categories differ', () => {
    const same = form({
      lines: [zeroRated('VATZR-OM-10', 'A'), zeroRated('VATZR-OM-10', 'B')],
    })
    expect(problemsBeforeSave(SEEDED_TAX_CATEGORIES, same)).toEqual([])
    const exempt = {
      ...blankDraftLine(SEEDED_TAX_CATEGORIES, 'E0'),
      description: 'Exempt',
      exemptionReasonCode: 'VATEX-OM-02',
    }
    const mixed = form({ lines: [zeroRated('VATZR-OM-10', 'A'), exempt] })
    expect(problemsBeforeSave(SEEDED_TAX_CATEGORIES, mixed)).toEqual([])
  })

  it('compares the written reason on outside-scope lines', () => {
    expect(
      categoryReasonConflicts([
        { code: 'O0', rate: 0, en16931Category: 'O', exemptionReason: 'Not a supply' },
        { code: 'O0', rate: '0', en16931Category: 'O', exemptionReason: ' Not a supply ' },
        { code: 'O0', rate: 0, en16931Category: 'O', exemptionReason: 'Disbursement' },
        { code: 'S5', rate: 5, en16931Category: 'S' },
      ]),
    ).toEqual([2])
  })

  it('tells a line missing its reason that first, not the conflict', () => {
    const missing = form({ lines: [zeroRated('VATZR-OM-10', 'A'), zeroRated('', 'B')] })
    expect(problemsBeforeSave(SEEDED_TAX_CATEGORIES, missing).map((p) => p.key)).toEqual([
      'invoiceDraft.problem.exemptionReason',
    ])
  })
})
