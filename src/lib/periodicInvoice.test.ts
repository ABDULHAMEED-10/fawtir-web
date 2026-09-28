import { describe, expect, it } from 'vitest'
import {
  blankPeriodicForm,
  periodicProblems,
  templateOfForm,
  type PeriodicLine,
} from './periodicInvoice'

const line = {
  id: '1',
  kind: 'goods' as const,
  description: 'Rice',
  unitPrice: '10.000',
  vatRate: '0',
  quantity: '1',
  unit: 'EA',
  discountType: 'PERCENTAGE' as const,
  discountValue: '0',
}
const form = (taxCategory: string, more: object = {}) => ({
  ...blankPeriodicForm('2026-09-27'),
  customerId: 'c-1',
  taxCategory,
  ...more,
})
const sent = (f: ReturnType<typeof form>) => templateOfForm(f, [line], true, null)

describe('the reason no VAT is charged, on a periodic template', () => {
  it('sends the reason code of a zero-rated or exempt document, on the document and every line', () => {
    const template = sent(form('Z0', { exemptionReasonCode: 'VATZR-OM-01' }))
    expect(template.exemptionReasonCode).toBe('VATZR-OM-01')
    expect(template.lines[0].taxCategory.exemptionReasonCode).toBe('VATZR-OM-01')
    expect(sent(form('E0', { exemptionReasonCode: 'VATEX-OM-03' })).exemptionReasonCode).toBe(
      'VATEX-OM-03',
    )
  })

  it('sends the written reason of a reverse-charge document and nothing at standard rate', () => {
    expect(sent(form('AE0', { exemptionReason: ' Export ' })).lines[0].taxCategory).toMatchObject({
      exemptionReason: 'Export',
      exemptionReasonCode: null,
    })
    const standard = sent(form('S5', { exemptionReasonCode: 'VATZR-OM-01', exemptionReason: 'x' }))
    expect(standard.exemptionReasonCode).toBeNull()
    expect(standard.lines[0].taxCategory.exemptionReason).toBeNull()
  })

  it('asks for the reason before saving, only when the category needs one', () => {
    const problem = (f: ReturnType<typeof form>) =>
      periodicProblems(f, '2026-09-27', false, 1).exemptionReasonCode
    expect(problem(form('Z0'))).toBe('periodicInvoice.error.reasonRequired')
    expect(problem(form('AE0'))).toBe('periodicInvoice.error.reasonRequired')
    expect(problem(form('Z0', { exemptionReasonCode: 'VATZR-OM-01' }))).toBeUndefined()
    expect(problem(form('S5'))).toBeUndefined()
  })
})

describe('a tax category per line, on a periodic template', () => {
  const service = {
    ...line,
    id: '2',
    kind: 'service' as const,
    description: 'Delivery',
    vatRate: '5',
  }

  it('sends each line at its own category and reason, the rest at the default', () => {
    const template = templateOfForm(
      form('S5'),
      [{ ...line, taxCode: 'Z0', exemptionReasonCode: 'VATZR-OM-01' }, service],
      true,
      null,
    )
    expect(template.lines[0].taxCategory).toMatchObject({
      code: 'Z0',
      exemptionReasonCode: 'VATZR-OM-01',
    })
    expect(template.lines[1].taxCategory).toMatchObject({ code: 'S5', exemptionReasonCode: null })
  })

  it('asks for the reason on the zero-rated line alone', () => {
    const check = (lines: PeriodicLine[]) =>
      periodicProblems(form('S5'), '2026-09-27', false, lines.length, lines).lines
    expect(check([{ ...line, taxCode: 'Z0' }, service])).toBe(
      'periodicInvoice.error.reasonRequired',
    )
    expect(check([{ ...line, taxCode: 'Z0', exemptionReasonCode: 'VATZR-OM-01' }, service])).toBe(
      undefined,
    )
  })
})
