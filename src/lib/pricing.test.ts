import { describe, expect, it } from 'vitest'
import { formatBaisa, getOrderSummary, vatOnBaisa } from './pricing'

const printed = (summary: ReturnType<typeof getOrderSummary>) =>
  summary && {
    monthlyRate: summary.monthlyRate.toFixed(3),
    plan: formatBaisa(summary.baisa.planSubtotal),
    addon: formatBaisa(summary.baisa.addonSubtotal),
    vat: formatBaisa(summary.baisa.vat),
    total: formatBaisa(summary.baisa.total),
  }

describe('the sign-up order summary, in exact baisa', () => {
  it.each([
    ['starter', 'monthly', { monthlyRate: '35.000', plan: '35.000', vat: '1.750', total: '36.750' }],
    ['starter', 'annual', { monthlyRate: '29.167', plan: '350.000', vat: '17.500', total: '367.500' }],
    ['premium', 'monthly', { monthlyRate: '80.000', plan: '80.000', vat: '4.000', total: '84.000' }],
    ['premium', 'annual', { monthlyRate: '66.667', plan: '800.000', vat: '40.000', total: '840.000' }],
    [
      'businessPlus',
      'monthly',
      { monthlyRate: '150.000', plan: '150.000', vat: '7.500', total: '157.500' },
    ],
    [
      'businessPlus',
      'annual',
      { monthlyRate: '125.000', plan: '1500.000', vat: '75.000', total: '1575.000' },
    ],
  ] as const)('%s billed %s', (plan, billing, expected) => {
    expect(printed(getOrderSummary(plan, billing))).toEqual({ ...expected, addon: '0.000' })
  })

  it('bills a year as ten months, never a rounded month times twelve (the 800.004 defect)', () => {
    const summary = getOrderSummary('premium', 'annual')!
    expect(summary.baisa).toEqual({
      planSubtotal: 800_000,
      addonSubtotal: 0,
      subtotal: 800_000,
      vat: 40_000,
      total: 840_000,
    })
    expect(summary.total).toBe(840)
  })

  it('adds the extraction add-on monthly with no annual discount, only where it is priced', () => {
    expect(printed(getOrderSummary('businessPlus', 'monthly', { addon: true }))).toMatchObject({
      addon: '20.000',
      vat: '8.500',
      total: '178.500',
    })
    expect(printed(getOrderSummary('businessPlus', 'annual', { addon: true }))).toMatchObject({
      plan: '1500.000',
      addon: '240.000',
      vat: '87.000',
      total: '1827.000',
    })
    // Business does not offer it, whatever the caller asked.
    expect(getOrderSummary('premium', 'annual', { addon: true })!.baisa.addonSubtotal).toBe(0)
  })

  it('has no figure for Enterprise, agreed on a call', () => {
    expect(getOrderSummary('enterprise', 'annual')).toBeNull()
  })
})

describe('VAT rounding to the baisa', () => {
  it.each([
    [0, 0],
    [9, 0], // 0.45 baisa
    [10, 1], // 0.5 baisa rounds up
    [29, 1], // 1.45
    [30, 2], // 1.5
    [19_990, 1000], // 999.5
    [19_989, 999], // 999.45
    [800_000, 40_000],
  ])('5%% of %i baisa is %i baisa', (amount, vat) => {
    expect(vatOnBaisa(amount)).toBe(vat)
  })

  it('formats baisa as rial without float drift', () => {
    expect(formatBaisa(840_000)).toBe('840.000')
    expect(formatBaisa(66_667)).toBe('66.667')
    expect(formatBaisa(5)).toBe('0.005')
    expect(formatBaisa(-1_250)).toBe('-1.250')
  })
})
