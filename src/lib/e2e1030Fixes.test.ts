import { describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ApiError } from '../api'
import { readiness } from './catalogItem'
import { posRefusalKey, refusalValues } from './posRefusals'
import { shelfTabs, type PosItem } from './posShelf'
import { stockLineWarningTexts } from './stockLineWarnings'

const refused = (code: string, status = 400, extra: Record<string, unknown> = {}) =>
  new ApiError({
    status,
    problemType: 'x',
    code,
    problem: { detail: 'server words', ...extra },
  })

/** The full-guide E2E of 30 Oct: what the till and the catalogue say. */
describe('till refusals in words', () => {
  it.each([
    'SELLER_PARTICIPANT_NOT_VERIFIED',
    'SELLER_ADDRESS_INCOMPLETE',
    'SELLER_CONTACT_INCOMPLETE',
    'INDUSTRIAL_CLASSIFICATION_REQUIRED',
    'PERIOD_CLOSED',
    'BRANCH_NOT_ACTIVE',
    'POS_ZERO_PRICE',
    'POS_SOLD_AT_IN_FUTURE',
    'POS_SHIFT_NOT_OPEN',
    'POS_TILL_LIMIT',
  ])('%s has its own sentence in both languages', (code) => {
    const key = posRefusalKey(refused(code))
    expect(key).toBe(`pos.refusal.${code}`)
    expect(i18n.exists(key, { lng: 'en' })).toBe(true)
    const ar = i18n.getResource('ar', 'translation', key)
    expect(ar).toEqual(expect.any(String))
    expect(ar).not.toBe(i18n.getResource('en', 'translation', key))
  })

  it('names the line of an unpriced sale', () => {
    const error = refused('POS_ZERO_PRICE', 422, { line: 2 })
    expect(i18n.t(posRefusalKey(error), { ...refusalValues(error), lng: 'en' })).toContain('Line 2')
  })

  it('still reads an unknown code as the general failure', () => {
    expect(posRefusalKey(refused('SOMETHING_NEW'))).toBe('pos.refusal.failed')
  })
})

describe('a credit note that could not put all of it back', () => {
  const t = i18n.getFixedT('en')

  it('says so on the issue answer, line by line, not in the server words', () => {
    expect(
      stockLineWarningTexts(t, [
        { line: 1, code: 'STOCK_RETURN_EXCEEDS_SALE' },
        { line: 2, code: 'STOCK_NOT_TRACKED_AT_SALE' },
        { line: 3, code: 'ZR_FOOD_NOT_LISTED' },
      ]),
    ).toEqual([
      expect.stringMatching(/^Line 1: not all of it went back on the shelf/),
      expect.stringMatching(/^Line 2: nothing went back on the shelf/),
    ])
  })

  it('has the till refund sentences in both languages', () => {
    for (const lng of ['en', 'ar']) {
      for (const code of ['STOCK_RETURN_EXCEEDS_SALE', 'STOCK_NOT_TRACKED_AT_SALE']) {
        expect(i18n.t(`pos.warning.${code}`, { line: 4, lng })).toContain('4')
      }
    }
  })
})

describe('the till shelf tabs', () => {
  const item = (id: string, groupId: string, available: boolean) =>
    ({ id, groupId, available }) as PosItem
  const items = [item('a', 'g1', true), item('b', 'g1', false), item('c', 'g2', false)]
  const groups = [
    { id: 'g1', name: 'Drinks', nameAr: null },
    { id: 'g2', name: 'Beans', nameAr: null },
  ] as Parameters<typeof shelfTabs>[1]
  const counts = (filter: 'active' | 'inactive' | 'both') =>
    shelfTabs(items, groups, false, 'Everything', filter).map((tab) => tab.count)

  it('count what the filter shows', () => {
    expect(counts('active')).toEqual([1, 1, 0])
    expect(counts('inactive')).toEqual([2, 1, 1])
    expect(counts('both')).toEqual([3, 2, 1])
  })

  it('keep a group whose items the filter hides, so the open tab does not vanish', () => {
    expect(shelfTabs(items, groups, false, 'Everything', 'active').map((tab) => tab.id)).toEqual([
      'all',
      'g1',
      'g2',
    ])
  })
})

describe('ready to sell', () => {
  const record = {
    name: 'Latte',
    basePrice: 1,
    taxCategory: 'S5',
    group: 'g',
    kind: 'k',
    barcode: '',
  }
  const coded = (code: string) => readiness({ ...record, code }).find((c) => c.id === 'coded')?.done

  it('is not ticked without the code a save needs', () => {
    expect(coded('  ')).toBe(false)
    expect(coded('LAT-1')).toBe(true)
    expect(i18n.t('item.ready.codedOff', { lng: 'en' })).toBe('Still needs an item code')
  })
})
