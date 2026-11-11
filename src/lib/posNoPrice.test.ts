import { describe, expect, it } from 'vitest'
import { invoiceLinesFor } from './pos'
import {
  addToSale,
  mayTypePrice,
  saleLineFor,
  shelfItem,
  tilePrice,
  typedPriceBaisa,
  whenPicked,
  type ItemChoices,
} from './posShelf'
import type { ProductDto } from '../api/catalog/products'

const item = (price: number, patch: Partial<ProductDto> = {}) =>
  shelfItem(
    {
      id: 'p',
      code: 'P',
      name: 'Thing',
      defaultUnitCode: 'EA',
      defaultUnitPrice: price,
      effectivePrice: price,
      defaultTaxCategory: 'S',
      defaultTaxRate: 5,
      active: true,
      ...patch,
    } as ProductDto,
    false,
  )

const none: ItemChoices = { sizes: [], addOns: [] }
const sizes = (...prices: number[]): ItemChoices => ({
  sizes: prices.map((price, index) => ({ id: `v${index}`, label: `S${index}`, price, code: 'C' })),
  addOns: [],
})
const freeAddOn = { id: 'a', label: 'Free', price: 0 }

describe('mayTypePrice', () => {
  it('needs the setting and the right to sell', () => {
    const open = item(0, { staffCanChangePrice: true })
    expect(mayTypePrice(open, true)).toBe(true)
    expect(mayTypePrice(open, false)).toBe(false)
    expect(mayTypePrice(item(0), true)).toBe(false)
  })
})

describe('whenPicked', () => {
  it('adds a priced item, chooses when there is a choice', () => {
    expect(whenPicked(item(1), none, true)).toBe('add')
    expect(whenPicked(item(1), { sizes: [], addOns: [freeAddOn] }, true)).toBe('choose')
  })
  it('refuses or asks for an item at 0.000', () => {
    expect(whenPicked(item(0), none, true)).toBe('refuse')
    expect(whenPicked(item(0, { staffCanChangePrice: true }), none, true)).toBe('choose')
    expect(whenPicked(item(0, { staffCanChangePrice: true }), none, false)).toBe('refuse')
  })
  it('a free add-on does not stand in for a price', () => {
    expect(whenPicked(item(0), { sizes: [], addOns: [freeAddOn] }, true)).toBe('refuse')
  })
  it('sizes decide for an item that has them', () => {
    expect(whenPicked(item(0), sizes(0, 500), true)).toBe('choose')
    expect(whenPicked(item(0), sizes(0, 0), true)).toBe('refuse')
    expect(whenPicked(item(5), sizes(0, 0), true)).toBe('refuse')
  })
})

describe('tilePrice', () => {
  it('is the price, the cheapest priced size, or nothing', () => {
    expect(tilePrice(item(2), undefined)).toBe(2000)
    expect(tilePrice(item(0), sizes(0, 700, 500))).toBe(500)
    expect(tilePrice(item(0), sizes(0))).toBe(0)
    expect(tilePrice(item(0), undefined)).toBe(0)
  })
})

describe('typedPriceBaisa', () => {
  it('takes figures above nothing, three decimals at most', () => {
    expect(typedPriceBaisa('1.25')).toBe(1250)
    expect(typedPriceBaisa('.5')).toBe(500)
    expect(typedPriceBaisa('3')).toBe(3000)
    for (const bad of ['', '0', '0.000', '.', '1.2345', '1.2.3', 'abc']) {
      expect(typedPriceBaisa(bad)).toBe(0)
    }
  })
})

describe('the sale itself', () => {
  it('addToSale never takes a line with no price, whichever way it got there', () => {
    expect(addToSale([], saleLineFor([], item(0), null, []))).toEqual([])
    const zeroSize = { id: 'v', label: 'S', price: 0, code: 'C' }
    expect(addToSale([], saleLineFor([], item(5), zeroSize, []))).toEqual([])
  })
  it('the typed price is what the invoice line is filed at, with the catalogue reference', () => {
    const [line] = invoiceLinesFor([saleLineFor([], item(0), null, [], 1250)])
    expect(line.unitPrice).toBe('1.250')
    expect(line.ref).toMatchObject({ role: 'ITEM', productId: 'p', variantId: null })
  })
  it('a 100% discount leaves the price on the line', () => {
    const line = saleLineFor([], item(3), null, [])
    expect(addToSale([], { ...line, discountValue: '100' })).toHaveLength(1)
  })
})
