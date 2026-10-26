import { describe, expect, it } from 'vitest'
import type { ProductDto } from '../../api/catalog/products'
import { productSearchPath } from '../../api/catalog/products'
import { catalogRows, matchesCatalogTab } from './catalogList'

const product = (over: Partial<ProductDto>): ProductDto => ({
  id: over.code ?? 'x',
  code: 'X',
  name: 'X',
  description: null,
  defaultUnitCode: 'EA',
  defaultUnitPrice: 1,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  active: true,
  version: 0,
  ...over,
})

const LATTE = product({ code: 'LAT-1', name: 'Latte', defaultUnitPrice: 1.6 })
const BEANS = product({
  code: 'BEAN-1',
  name: 'beans',
  defaultUnitPrice: 9.5,
  defaultUnitCode: 'KGM',
})
const TRAINING = product({
  code: 'SRV-1',
  name: 'Training',
  defaultUnitCode: 'HUR',
  defaultUnitPrice: 15,
})
const EXPORT = product({
  code: 'EXP-1',
  name: 'Export lot',
  defaultTaxCategory: 'G',
  defaultTaxRate: 0,
})
const FREE = product({
  code: 'FREE-1',
  name: 'Free sample',
  defaultUnitPrice: 0,
  defaultTaxCategory: 'Z',
  defaultTaxRate: 0,
})
const ALL = [LATTE, BEANS, TRAINING, EXPORT, FREE]

const codes = (rows: ProductDto[]) => rows.map((row) => row.code)

describe('the catalogue list tabs', () => {
  it('splits goods from services by the product flag or, without it, the unit', () => {
    expect(codes(ALL.filter((p) => matchesCatalogTab(p, 'services')))).toEqual(['SRV-1'])
    expect(matchesCatalogTab(product({ classificationGoodsOrService: 'S' }), 'services')).toBe(true)
    expect(matchesCatalogTab(TRAINING, 'goods')).toBe(false)
  })

  it('wants attention for no price or a VAT category Oman does not use', () => {
    expect(codes(ALL.filter((p) => matchesCatalogTab(p, 'attention')))).toEqual(['EXP-1', 'FREE-1'])
  })

  it('lists everything not at the standard rate', () => {
    expect(codes(ALL.filter((p) => matchesCatalogTab(p, 'notStandard')))).toEqual([
      'EXP-1',
      'FREE-1',
    ])
    expect(ALL.every((p) => matchesCatalogTab(p, 'all'))).toBe(true)
  })

  it('puts items switched off in the working branch on their own tab, out of every other', () => {
    const off = { ...EXPORT, code: 'OFF-1', availableHere: false }
    const here = { ...LATTE, availableHere: true }
    const tabs = ['all', 'goods', 'services', 'attention', 'notStandard'] as const
    for (const tab of tabs) expect(matchesCatalogTab(off, tab)).toBe(false)
    expect(matchesCatalogTab(here, 'all')).toBe(true)
    expect(codes([off, here, BEANS].filter((p) => matchesCatalogTab(p, 'switchedOff')))).toEqual([
      'OFF-1',
    ])
    expect(matchesCatalogTab(off, 'archived')).toBe(false)
  })
})

describe('the catalogue list sort', () => {
  it('orders by name ignoring case, by code, and by price both ways', () => {
    expect(codes(catalogRows(ALL, 'all', 'name', 'en'))).toEqual([
      'BEAN-1',
      'EXP-1',
      'FREE-1',
      'LAT-1',
      'SRV-1',
    ])
    expect(codes(catalogRows(ALL, 'all', 'code', 'en'))).toEqual([
      'BEAN-1',
      'EXP-1',
      'FREE-1',
      'LAT-1',
      'SRV-1',
    ])
    expect(codes(catalogRows(ALL, 'all', 'priceLow', 'en'))).toEqual([
      'FREE-1',
      'EXP-1',
      'LAT-1',
      'BEAN-1',
      'SRV-1',
    ])
    expect(codes(catalogRows(ALL, 'all', 'priceHigh', 'en'))).toEqual([
      'SRV-1',
      'BEAN-1',
      'LAT-1',
      'EXP-1',
      'FREE-1',
    ])
  })

  it('filters and sorts without touching the loaded page', () => {
    const page = [...ALL]
    expect(codes(catalogRows(page, 'goods', 'priceHigh', 'en'))).toEqual([
      'BEAN-1',
      'LAT-1',
      'EXP-1',
      'FREE-1',
    ])
    expect(page).toEqual(ALL)
  })
})

describe('the product search path', () => {
  it('leaves the first page out, so callers that never page keep their path', () => {
    expect(productSearchPath('')).toBe('/v1/products?size=20')
    expect(productSearchPath('flat', 20, 0)).toBe('/v1/products?q=flat&size=20')
    expect(productSearchPath('', 20, 2)).toBe('/v1/products?size=20&page=2')
  })
})
