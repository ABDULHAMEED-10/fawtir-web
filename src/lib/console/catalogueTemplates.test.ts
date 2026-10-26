import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api'
import {
  codeFromName,
  formatNames,
  itemAfter,
  moved,
  newItem,
  nodeOfPath,
  parseNames,
  refusalKey,
  templateRowErrors,
} from './catalogueTemplates'

describe('business type codes', () => {
  it('suggests an upper snake case code from a name', () => {
    expect(codeFromName('Coffee shop')).toBe('COFFEE_SHOP')
    expect(codeFromName('Food & Beverage')).toBe('FOOD_AND_BEVERAGE')
    expect(codeFromName('  24/7 Kiosk ')).toBe('KIOSK')
    expect(codeFromName('مقهى')).toBe('')
  })

  it('moves one code a place and leaves the ends alone', () => {
    expect(moved(['A', 'B', 'C'], 'B', -1)).toEqual(['B', 'A', 'C'])
    expect(moved(['A', 'B', 'C'], 'B', 1)).toEqual(['A', 'C', 'B'])
    expect(moved(['A', 'B'], 'A', -1)).toBeNull()
  })

  it('words each refusal, never the server prose', () => {
    const refused = (problemType: string, status = 409) =>
      new ApiError({ status, problemType, problem: { detail: 'English prose' } })
    expect(refusalKey(refused('catalogue-code-taken'))).toBe(
      'console.businessTypes.error.codeTaken',
    )
    expect(refusalKey(refused('business-type-has-no-active-sub-type'))).toBe(
      'console.businessTypes.error.noActiveSubType',
    )
    expect(refusalKey(new Error('x'))).toBe('console.businessTypes.error.failed')
  })
})

describe('template rows', () => {
  it('reads sizes, options and add-ons as names with an optional Arabic name', () => {
    expect(parseNames('Small=صغير, Large | Oat milk،Extra')).toEqual([
      { name: 'Small', nameAr: 'صغير' },
      { name: 'Large', nameAr: null },
      { name: 'Oat milk', nameAr: null },
      { name: 'Extra', nameAr: null },
    ])
    expect(formatNames(parseNames('Small=صغير,Large'))).toBe('Small=صغير, Large')
  })

  it('points a draft error at its node', () => {
    expect(nodeOfPath('groups[0].kinds[1].items[3].hsCode')).toEqual({ g: 0, k: 1, i: 3 })
    expect(nodeOfPath('groups[2].name')).toEqual({ g: 2, k: undefined, i: undefined })
    expect(nodeOfPath(null)).toBeNull()
  })

  it('reads the row errors of a refused import', () => {
    const error = new ApiError({
      status: 400,
      problemType: 'catalogue-template-invalid',
      problem: { errors: [{ row: 12, path: null, field: 'hs_code', message: 'bad' }, 'junk'] },
    })
    expect(templateRowErrors(error)).toEqual([
      { row: 12, path: null, field: 'hs_code', message: 'bad' },
    ])
  })

  it('keeps an item consistent when it becomes a service or changes VAT category', () => {
    const goods = { ...newItem('Massage'), defaultUnitCode: 'KGM' }
    const service = itemAfter(goods, {
      classification: { ...goods.classification, goodsOrService: 'S' },
    })
    expect(service.classification).toEqual({
      goodsOrService: 'S',
      hsCode: null,
      serviceTypeCode: null,
    })
    expect(service.defaultUnitCode).toBe('C62')
    const zero = itemAfter(goods, { defaultTaxCategory: 'Z', defaultTaxReasonCode: 'VATZR-OM-01' })
    expect(zero.defaultTaxReasonCode).toBe('VATZR-OM-01')
    const standard = itemAfter(zero, { defaultTaxCategory: 'S', defaultTaxReasonText: 'x' })
    expect(standard.defaultTaxReasonCode).toBeNull()
    expect(standard.defaultTaxReasonText).toBeNull()
  })
})
