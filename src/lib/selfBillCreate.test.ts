import { describe, expect, it } from 'vitest'
import { SEEDED_REFERENCE } from '../testing/referenceData'
import {
  blankComposerLine,
  blankSelfBillForm,
  fromSelfBilledDraft,
  problemsBeforeSave,
  taxCategoryCodes,
  toSelfBilledDraftRequest,
} from './selfBillCreate'
import { omanTaxCategories } from './invoiceDraft'

const form = (lines: ReturnType<typeof blankComposerLine>[]) => ({
  ...blankSelfBillForm('2026-09-27', 'b-1'),
  customerId: 'c-1',
  lines,
})

const first = (lines: ReturnType<typeof blankComposerLine>[]) =>
  toSelfBilledDraftRequest(form(lines), true, SEEDED_REFERENCE).lines[0]

describe('a self-billed draft request', () => {
  it('classifies every line: goods by their HS code, services as services', () => {
    const goods = { ...blankComposerLine('1'), description: 'Cement', hsCode: '090121000000' }
    expect(first([goods]).classification).toEqual({ goodsOrService: 'G', hsCode: '090121000000' })

    const service = { ...blankComposerLine('1'), description: 'Advice', kind: 'service' as const }
    expect(first([service]).classification).toEqual({ goodsOrService: 'S' })
    // Only an official eight-digit service type is passed on.
    expect(first([{ ...service, serviceType: '83000000' }]).classification).toEqual({
      goodsOrService: 'S',
      serviceTypeCode: '83000000',
    })
    expect(first([{ ...service, serviceType: '92900' }]).classification).toEqual({
      goodsOrService: 'S',
    })
  })

  it('sends no classification for a goods line with no HS code yet, and never an industrial one', () => {
    const goods = { ...blankComposerLine('1'), description: 'Cement' }
    expect(first([goods])).not.toHaveProperty('classification')
    const request = first([{ ...goods, hsCode: '090121000000' }])
    expect(JSON.stringify(request)).not.toContain('industrialClassificationCode')
  })
})

describe('the reason no VAT is charged, on a self-billed draft', () => {
  const line = { ...blankComposerLine('1'), description: 'Rice' }
  const withTax = (taxCategory: string, more: object) => ({
    ...form([line]),
    taxCategory,
    ...more,
  })
  const request = (f: ReturnType<typeof form>) =>
    toSelfBilledDraftRequest(f, true, SEEDED_REFERENCE).lines[0].taxCategory

  it('sends the reason code of a zero-rated or exempt document on every line', () => {
    expect(request(withTax('Z0', { exemptionReasonCode: 'VATZR-OM-01' }))).toMatchObject({
      en16931Category: 'Z',
      exemptionReasonCode: 'VATZR-OM-01',
      exemptionReason: null,
    })
    expect(request(withTax('E0', { exemptionReasonCode: 'VATEX-OM-03' }))).toMatchObject({
      exemptionReasonCode: 'VATEX-OM-03',
    })
  })

  it('sends the written reason of a reverse-charge document, and none at standard rate', () => {
    expect(request(withTax('AE0', { exemptionReason: ' Export of goods ' }))).toMatchObject({
      exemptionReason: 'Export of goods',
      exemptionReasonCode: null,
    })
    expect(
      request(withTax('S5', { exemptionReasonCode: 'VATZR-OM-01', exemptionReason: 'x' })),
    ).toMatchObject({ exemptionReason: null, exemptionReasonCode: null })
  })

  it('will not save without the reason, and reads it back from a draft', () => {
    expect(problemsBeforeSave(withTax('Z0', {}), SEEDED_REFERENCE)).toContain('reason')
    expect(problemsBeforeSave(withTax('AE0', {}), SEEDED_REFERENCE)).toContain('reason')
    expect(
      problemsBeforeSave(withTax('Z0', { exemptionReasonCode: 'VATZR-OM-01' }), SEEDED_REFERENCE),
    ).not.toContain('reason')
    expect(problemsBeforeSave(withTax('S5', {}), SEEDED_REFERENCE)).not.toContain('reason')
    const draft = {
      customerId: 'c-1',
      branchId: 'b-1',
      currency: 'OMR',
      details: {},
      lines: [{ taxCategoryCode: 'Z0', exemptionReasonCode: 'VATZR-OM-01', unitCode: 'EA' }],
    } as unknown as Parameters<typeof fromSelfBilledDraft>[0]
    expect(fromSelfBilledDraft(draft, '2026-09-27').exemptionReasonCode).toBe('VATZR-OM-01')
  })
})

describe('a tax category per line, on a self-billed draft', () => {
  const rice = { ...blankComposerLine('1'), description: 'Rice' }
  const advice = { ...blankComposerLine('2'), description: 'Advice' }

  it('sends each line at its own category and reason, the rest at the default', () => {
    const lines = toSelfBilledDraftRequest(
      form([{ ...rice, taxCode: 'Z0', exemptionReasonCode: 'VATZR-OM-01' }, advice]),
      true,
      SEEDED_REFERENCE,
    ).lines
    expect(lines[0].taxCategory).toMatchObject({
      code: 'Z0',
      exemptionReasonCode: 'VATZR-OM-01',
      exemptionReason: null,
    })
    expect(lines[1].taxCategory).toMatchObject({ code: 'S5', exemptionReasonCode: null })
  })

  it('asks for the reason on the zero-rated line alone, and allows outside scope beside taxed lines (PINT-OM has no BR-O-11)', () => {
    expect(
      problemsBeforeSave(form([{ ...rice, taxCode: 'Z0' }, advice]), SEEDED_REFERENCE),
    ).toContain('reason')
    expect(
      problemsBeforeSave(
        form([{ ...rice, taxCode: 'Z0', exemptionReasonCode: 'VATZR-OM-01' }, advice]),
        SEEDED_REFERENCE,
      ),
    ).not.toContain('reason')
    expect(
      problemsBeforeSave(
        form([{ ...rice, taxCode: 'O0', exemptionReason: 'Not a supply' }, advice]),
        SEEDED_REFERENCE,
      ),
    ).toEqual([])
  })

  it('reads each line category and reason back from a draft', () => {
    const draft = {
      ...form([]),
      branchId: 'b-1',
      details: {},
      lines: [
        { taxCategoryCode: 'Z0', exemptionReasonCode: 'VATZR-OM-01', unitCode: 'EA', taxRate: 0 },
        { taxCategoryCode: 'S5', unitCode: 'EA', taxRate: 5 },
      ],
    } as unknown as Parameters<typeof fromSelfBilledDraft>[0]
    const lines = fromSelfBilledDraft(draft, '2026-09-27').lines
    expect(lines.map((line) => [line.taxCode, line.exemptionReasonCode])).toEqual([
      ['Z0', 'VATZR-OM-01'],
      ['S5', ''],
    ])
  })
})

describe('the VAT categories Oman allows', () => {
  it('offers only S, Z, E and O: reverse charge and export are not PINT-OM categories (CL-04-OM)', () => {
    expect(taxCategoryCodes(null)).toEqual(['S5', 'Z0', 'E0', 'O0'])
    expect(
      omanTaxCategories([
        { code: 'S5', en16931Category: 'S', active: true },
        { code: 'AE0', en16931Category: 'AE', active: true },
        { code: 'G0', en16931Category: 'G', active: true },
        { code: 'O0', en16931Category: 'O', active: true },
        { code: 'Z0', en16931Category: 'Z', active: false },
      ]).map((row) => row.code),
    ).toEqual(['S5', 'O0'])
  })
})
