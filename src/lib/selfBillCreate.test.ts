import { describe, expect, it } from 'vitest'
import { SEEDED_REFERENCE } from '../testing/referenceData'
import {
  blankComposerLine,
  blankSelfBillForm,
  fromSelfBilledDraft,
  problemsBeforeSave,
  toSelfBilledDraftRequest,
} from './selfBillCreate'

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
