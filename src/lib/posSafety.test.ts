import { describe, expect, it } from 'vitest'
import { containsCardNumber } from './cardNumbers'
import { parseSignedBaisa } from './posClose'
import { ownSellLimit, parseSellLimit, roleSellLimit, withSellLimit } from './posSellLimit'
import type { RoleDto } from '../api/settings/people'

describe('containsCardNumber (mirrors backend CardNumbers, FIN-5)', () => {
  it('finds a Luhn-valid 13 to 19 digit run, split or in Arabic digits', () => {
    expect(containsCardNumber('4111111111111111')).toBe(true)
    expect(containsCardNumber('4111 1111-1111.1111')).toBe(true)
    expect(containsCardNumber('٤١١١١١١١١١١١١١١١')).toBe(true)
    expect(containsCardNumber('4111‏1111‎1111 1111')).toBe(true)
  })

  it('lets an approval code, a failed Luhn and a longer run through', () => {
    expect(containsCardNumber('123456')).toBe(false)
    expect(containsCardNumber('4111111111111112')).toBe(false)
    expect(containsCardNumber('41111111111111110000')).toBe(false)
    expect(containsCardNumber('')).toBe(false)
    expect(containsCardNumber(null)).toBe(false)
  })
})

describe('the bank machine total keeps its sign (A-05)', () => {
  it('reads a negative machine total as negative', () => {
    expect(parseSignedBaisa('-5.000')).toBe(-5000)
    expect(parseSignedBaisa('−1.250')).toBe(-1250)
    expect(parseSignedBaisa('12.345')).toBe(12345)
  })
})

describe('the till discount ceiling (pos.sell MAX_PERCENT)', () => {
  const role = (code: string, qualifier: 'MAX_PERCENT' | null, value: number | null) =>
    ({ code, permissions: [{ code: 'pos.sell', qualifier, value }] }) as unknown as RoleDto

  it('resolves several roles as the server does', () => {
    expect(roleSellLimit([role('CASHIER', 'MAX_PERCENT', 10)], ['CASHIER'])).toBe(10)
    expect(
      roleSellLimit(
        [role('A', 'MAX_PERCENT', 10), role('B', 'MAX_PERCENT', 15)],
        ['A', 'B'],
      ),
    ).toBe(15)
    expect(
      roleSellLimit([role('A', 'MAX_PERCENT', 10), role('B', null, null)], ['A', 'B']),
    ).toBeNull()
    expect(roleSellLimit([role('A', 'MAX_PERCENT', 10)], ['OTHER'])).toBeUndefined()
  })

  it('reads the person\'s own ceiling, and bounds a typed one as the server does', () => {
    expect(ownSellLimit([{ code: 'pos.sell', qualifier: 'MAX_PERCENT', value: 12.5 }])).toBe(12.5)
    expect(ownSellLimit([{ code: 'pos.sell', qualifier: null, value: null }])).toBeNull()
    expect(ownSellLimit([])).toBeUndefined()
    expect(parseSellLimit('')).toBeNull()
    expect(parseSellLimit('10')).toBe(10)
    expect(parseSellLimit('0')).toBe('invalid')
    expect(parseSellLimit('100.5')).toBe('invalid')
    expect(parseSellLimit('7.125')).toBe('invalid')
  })

  it('sets or clears only the person\'s own pos.sell grant, keeping every other grant', () => {
    const other = { code: 'customer.manage', qualifier: null, value: null }
    expect(withSellLimit([other], 10, true)).toEqual([
      other,
      { code: 'pos.sell', qualifier: 'MAX_PERCENT', value: 10 },
    ])
    expect(
      withSellLimit([other, { code: 'pos.sell', qualifier: 'MAX_PERCENT', value: 10 }], null, true),
    ).toEqual([other])
    expect(withSellLimit([other], null, false)).toEqual([
      other,
      { code: 'pos.sell', qualifier: null, value: null },
    ])
  })
})
