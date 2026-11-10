import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useState } from 'react'
import i18n from '../../i18n'
import { PosSalePanel } from './PosSalePanel'
import { invoiceLinesFor, totalsFor, type SaleLine } from '../../lib/pos'
import { discountBreach } from '../../lib/posDiscountLimit'
import { onlyGivenAway, refundRequest } from '../../lib/posRefund'
import { posRefusalKey, refusalValues } from '../../lib/posRefusals'
import { resetOpenSale } from '../../lib/posSale'
import { ApiError } from '../../api'
import type { PosRefundLookupDto } from '../../api/pos/pos'

let limits: Record<string, number> | undefined
vi.mock('../../hooks/useEntitlements', () => ({
  useEntitlements: () => ({
    entitlements: { discountLimits: limits },
    ready: true,
  }),
}))

const line = (patch: Partial<SaleLine> = {}): SaleLine =>
  ({
    id: 'l1',
    productId: 'p1',
    productCode: 'P1',
    name: 'Bun',
    variant: null,
    addOns: [],
    qty: 1,
    price: 2000,
    itemType: 'goods',
    unit: 'EA',
    taxCode: 'S',
    vatRate: '5',
    discountType: 'PERCENTAGE',
    discountValue: '0',
    ...patch,
  }) as SaleLine

const NONE = { type: 'PERCENTAGE' as const, value: '' }

function Panel({ start }: { start: SaleLine[] }) {
  const [lines, setLines] = useState(start)
  return (
    <MemoryRouter>
      <PosSalePanel lines={lines} onLines={setLines} onTakePayment={vi.fn()} />
    </MemoryRouter>
  )
}

describe('a typed line discount', () => {
  it('replaces the rule and the catalogue discount; blank brings them back', () => {
    const ruled = line({ rulePercent: 20, lineDiscount: { type: 'PERCENTAGE', value: '5' } })
    expect(invoiceLinesFor([ruled])[0].discountValue).toBe('5')
    expect(
      invoiceLinesFor([{ ...ruled, lineDiscount: { type: 'PERCENTAGE', value: '' } }])[0]
        .discountValue,
    ).toBe('20')
  })

  it('a percentage runs through the add-ons; an amount comes off the item once', () => {
    const withAddOn = { addOns: [{ id: 'a', label: 'Shot', price: 500 }] } as Partial<SaleLine>
    const percent = invoiceLinesFor([
      line({ ...withAddOn, lineDiscount: { type: 'PERCENTAGE', value: '10' } }),
    ])
    expect(percent.map((l) => l.discountValue)).toEqual(['10', '10'])
    const amount = invoiceLinesFor([
      line({ ...withAddOn, lineDiscount: { type: 'FIXED_AMOUNT', value: '0.200' } }),
    ])
    expect(amount.map((l) => [l.discountType, l.discountValue])).toEqual([
      ['FIXED_AMOUNT', '0.200'],
      ['PERCENTAGE', '0'],
    ])
  })

  it('100% keeps the price and shows the discount, so the line is the giveaway', () => {
    const given = line({ lineDiscount: { type: 'PERCENTAGE', value: '100' } })
    expect(invoiceLinesFor([given])[0].unitPrice).toBe('2.000')
    expect(totalsFor([given])).toMatchObject({ items: 2000, discount: 2000, sale: 0 })
  })
})

describe('the limit, as the server judges it', () => {
  const typed = (value: string, type: 'PERCENTAGE' | 'FIXED_AMOUNT' = 'PERCENTAGE') =>
    line({ lineDiscount: { type, value } })

  it('holds exactly at the limit, by percent and by amount', () => {
    expect(discountBreach([typed('10')], NONE, 10)).toBeNull()
    expect(discountBreach([typed('0.200', 'FIXED_AMOUNT')], NONE, 10)).toBeNull()
  })

  it('refuses over it, by percent and by amount', () => {
    expect(discountBreach([typed('20')], NONE, 10)).toEqual({
      kind: 'line',
      lineId: 'l1',
      percent: 20,
    })
    expect(discountBreach([typed('0.500', 'FIXED_AMOUNT')], NONE, 10)).toMatchObject({
      kind: 'line',
      percent: 25,
    })
  })

  it('refuses the line and the whole sale together: 10% and 10% is 19%', () => {
    expect(discountBreach([typed('10')], { type: 'PERCENTAGE', value: '10' }, 10)).toEqual({
      kind: 'total',
      percent: 19,
    })
    expect(discountBreach([line()], { type: 'PERCENTAGE', value: '15' }, 10)).toEqual({
      kind: 'sale',
      percent: 15,
    })
  })

  it("does not count a rule's or the catalogue's discount", () => {
    expect(discountBreach([line({ rulePercent: 20 })], NONE, 10)).toBeNull()
    expect(discountBreach([line({ discountValue: '15' })], NONE, 10)).toBeNull()
  })

  it('without a limit only an amount above the line is stopped', () => {
    expect(discountBreach([typed('100')], NONE, null)).toBeNull()
    expect(discountBreach([typed('3.000', 'FIXED_AMOUNT')], NONE, null)).toEqual({
      kind: 'tooMuch',
      lineId: 'l1',
    })
  })
})

describe('the control in the sale panel', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    resetOpenSale([])
    limits = { 'pos.sell': 10 }
  })

  const open = () =>
    fireEvent.click(screen.getByRole('button', { name: 'Set a line discount for Bun' }))

  it('shows the limit and stops Take payment over it, saying why', () => {
    render(<Panel start={[line()]} />)
    open()
    expect(screen.getByText('Your limit: up to 10%')).toBeTruthy()
    expect(screen.queryByText('Give it away (100%)')).toBeNull()
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: '20' } })
    expect(screen.getByRole('alert').textContent).toBe('This takes 20% off. Your limit is 10%.')
    const pay = screen.getByRole('button', { name: i18n.t('pos.takePayment') }) as HTMLButtonElement
    expect(pay.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Discount'), { target: { value: '10' } })
    expect(pay.disabled).toBe(false)
    expect(screen.getByText('−0.200')).toBeTruthy()
  })

  it('offers the giveaway to someone without a limit', () => {
    limits = undefined
    render(<Panel start={[line()]} />)
    open()
    fireEvent.click(screen.getByText('Give it away (100%)'))
    expect(screen.getByText('−2.000')).toBeTruthy()
    expect(screen.getByText('100% off')).toBeTruthy()
  })

  it('in Arabic too', async () => {
    await i18n.changeLanguage('ar')
    render(<Panel start={[line()]} />)
    fireEvent.click(screen.getByRole('button', { name: 'تحديد خصم على Bun' }))
    expect(screen.getByText('حدّك: حتى 10%')).toBeTruthy()
  })
})

describe('the server refusal', () => {
  const refused = (problem: Record<string, unknown>) =>
    new ApiError({
      status: 403,
      problemType: 'insufficient-permission',
      code: (problem.code as string) ?? null,
      problem,
    })

  it('reads the coded figures', () => {
    const error = refused({ code: 'DISCOUNT_ABOVE_LIMIT', requestedPercent: 25, limitPercent: 10 })
    expect(posRefusalKey(error)).toBe('pos.refusal.DISCOUNT_ABOVE_LIMIT')
    expect(refusalValues(error)).toMatchObject({ requestedPercent: '25', limitPercent: '10' })
  })

  it('reads an older server too, whose refusal has only its sentence', () => {
    const error = refused({
      detail: 'Discount on line 1 of 25% exceeds the 10% your role allows',
    })
    expect(posRefusalKey(error)).toBe('pos.refusal.DISCOUNT_ABOVE_LIMIT')
    expect(refusalValues(error)).toMatchObject({ requestedPercent: '25', limitPercent: '10' })
  })
})

describe('returning a given-away line', () => {
  const lookupLine = (lineNumber: number, givenFree?: boolean) => ({
    lineNumber,
    role: 'ITEM' as const,
    productId: 'p',
    description: `Line ${lineNumber}`,
    quantitySold: 1,
    quantityRefunded: 0,
    unitPrice: 1,
    discount: null,
    vatRate: 5,
    vatCategory: 'S',
    refundable: true,
    givenFree,
  })
  const sale = (lines: ReturnType<typeof lookupLine>[]) => ({ lines }) as PosRefundLookupDto

  it('free lines alone send no money; a priced line sends it; an older server is as before', () => {
    const mixed = sale([lookupLine(1, false), lookupLine(2, true)])
    expect(onlyGivenAway(mixed, [{ lineNumber: 2, qty: 1 }])).toBe(true)
    expect(
      onlyGivenAway(mixed, [
        { lineNumber: 1, qty: 1 },
        { lineNumber: 2, qty: 1 },
      ]),
    ).toBe(false)
    expect(onlyGivenAway(sale([lookupLine(1)]), [{ lineNumber: 1, qty: 1 }])).toBe(false)
    const body = refundRequest({
      tillId: 't',
      why: 'changedMind',
      note: '',
      returning: [{ lineNumber: 2, qty: 1 }],
      backOnShelf: true,
      noMoney: true,
      moneyBack: [{ method: 'CASH', amount: 0 }],
    })
    expect(body.moneyBack).toEqual([])
    expect(body.lines).toEqual([{ lineNumber: 2, quantity: 1, backOnShelf: true }])
  })
})
