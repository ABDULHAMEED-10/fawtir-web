import { describe, expect, it } from 'vitest'
import type { ProductDto, ProductVariant } from '../api/catalog/products'
import { choicesOf, itemStockFlag, listedChoices, shelfItem } from './posShelf'

/**
 * The till's shelf on backend #808 and #815: sizes and add-ons on the list rows, and the branch's
 * stock flagged (never blocking). A server without them answers null, and nothing changes.
 */

const base: ProductDto = {
  id: 'p-1',
  code: 'BEAN',
  name: 'Coffee beans',
  nameAr: 'بن',
  description: null,
  defaultUnitCode: 'KGM',
  defaultUnitPrice: 9.5,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  active: true,
  version: 1,
  effectivePrice: 9,
  availableHere: true,
  sizes: null,
  options: null,
  variants: null,
  addOns: null,
}

const variant = (
  id: string,
  size: string,
  patch: Partial<ProductVariant> = {},
): ProductVariant => ({
  id,
  sizeId: `s-${id}`,
  size,
  optionId: null,
  option: null,
  name: `Coffee beans · ${size}`,
  code: `BEAN-${id}`,
  priceOverride: null,
  price: 9.5,
  onSale: true,
  ...patch,
})

const withSizes: ProductDto = {
  ...base,
  sizes: [
    { id: 's-a', name: '250 g', nameAr: '250 غ', priceDelta: 0, sortOrder: 0 },
    { id: 's-b', name: '1 kg', nameAr: '1 كغ', priceDelta: 6, sortOrder: 1 },
  ],
  options: [],
  variants: [variant('a', '250 g'), variant('b', '1 kg', { branchPrice: 14.75 })],
  addOns: [],
}

describe('sizes and add-ons on the list row (backend #808, P.27)', () => {
  it('reads nothing from a row an older server sent without them', () => {
    expect(listedChoices(shelfItem(base, false), false)).toBeUndefined()
    // Only one of the two arrays is not enough to know the item.
    expect(listedChoices(shelfItem({ ...base, variants: [] }, false), false)).toBeUndefined()
  })

  it('takes a plain item as having none when both arrays are there', () => {
    const choices = listedChoices(shelfItem({ ...base, variants: [], addOns: [] }, false), false)
    expect(choices).toEqual({ sizes: [], addOns: [] })
  })

  it('prices a size at the branch price the list worked out, else as before', () => {
    const choices = listedChoices(shelfItem(withSizes, false), false)!
    // 250 g: the branch's 9.000 plus its 0 change; 1 kg: the list's own branchPrice.
    expect(choices.sizes.map((size) => size.price)).toEqual([9000, 14750])
  })

  it('names the sizes in Arabic, from sizeAr when the size list is missing', () => {
    const ar = choicesOf(withSizes, 9000, true)
    expect(ar.sizes.map((size) => size.label)).toEqual(['250 غ', '1 كغ'])
    const bare = choicesOf(
      { ...withSizes, sizes: [], variants: [variant('a', '250 g', { sizeAr: '250 غ' })] },
      9000,
      true,
    )
    expect(bare.sizes[0].label).toBe('250 غ')
  })
})

describe('the stock flag (backend #815): said, never blocking', () => {
  const stock = (state: 'OK' | 'LOW' | 'OUT' | 'BELOW_ZERO' | 'NOT_COUNTED' | null) => ({
    onHand: 0,
    reorderLevel: 4,
    state,
    variants: [],
  })

  it('flags nothing without a figure: an older server, a product not counted, or not counted yet', () => {
    expect(itemStockFlag(base)).toBeNull()
    expect(itemStockFlag({ ...base, stock: null })).toBeNull()
    expect(itemStockFlag({ ...base, stock: stock('NOT_COUNTED') })).toBeNull()
    expect(itemStockFlag({ ...base, stock: stock('OK') })).toBeNull()
  })

  it('flags low, out and below zero, and the tile stays sellable', () => {
    for (const state of ['LOW', 'OUT', 'BELOW_ZERO'] as const) {
      const item = shelfItem({ ...base, stock: stock(state) }, false)
      expect(item.stock).toBe(state)
      expect(item.available).toBe(true)
    }
  })

  it('flags each size, and the tile only when every size on sale is flagged, by the mildest', () => {
    const sized = (
      a: 'OK' | 'LOW' | 'OUT' | 'BELOW_ZERO',
      b: 'OK' | 'LOW' | 'OUT' | 'BELOW_ZERO',
    ) => ({
      ...withSizes,
      stock: {
        onHand: null,
        reorderLevel: null,
        state: null,
        variants: [
          { variantId: 'a', onHand: 0, reorderLevel: 2, state: a },
          { variantId: 'b', onHand: -1, reorderLevel: 2, state: b },
        ],
      },
    })
    expect(itemStockFlag(sized('OK', 'BELOW_ZERO'))).toBeNull()
    expect(itemStockFlag(sized('OUT', 'BELOW_ZERO'))).toBe('OUT')
    expect(itemStockFlag(sized('LOW', 'OUT'))).toBe('LOW')
    const choices = choicesOf(sized('OK', 'BELOW_ZERO'), 9000, false)
    expect(choices.sizes.map((size) => size.stock ?? null)).toEqual([null, 'BELOW_ZERO'])
    // A size switched off does not keep the tile from its flag.
    const offSale = sized('OK', 'OUT')
    offSale.variants = [variant('a', '250 g', { onSale: false }), variant('b', '1 kg')]
    expect(itemStockFlag(offSale)).toBe('OUT')
  })
})
