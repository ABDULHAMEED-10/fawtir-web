import { describe, expect, it } from 'vitest'
import {
  NONE,
  productVariantsState,
  variantsRequest,
  addValue,
  cellKey,
  codeFor,
  generateCodes,
  rebuildFromBase,
  removeValue,
  roundAll,
  roundTo050,
  sampleOptions,
  setDelta,
  setPrice,
  shortCodeFor,
  summarise,
  tickEverything,
  toggleCell,
  workedOutPrice,
} from '../../lib/catalogOptions'

const CODE = 'HB'

/** Sizes and options for an item (Figma "Catalog -> Detail Edit Variants"). */
describe('sizes and options', () => {
  it('starts on the House Blend example: 10 of 12 sold, one price set by hand', () => {
    const state = sampleOptions(CODE)
    const figures = summarise(state)
    expect(figures).toMatchObject({
      total: 12,
      onSale: 10,
      unticked: 2,
      byHand: 1,
      codesReady: 10,
      needsStockCounts: 10,
      min: 2.7,
      max: 9.8,
    })
    expect(state.cells[cellKey('w500', 'tk')].price).toBe(5.3)
    expect(state.cells[cellKey('w1kg', 'wb')].price).toBe(9.5)
    expect(state.cells[cellKey('w1kg', 'es')]).toMatchObject({ price: 9.8, byHand: true })
    expect(state.cells[cellKey('w250', 'tk')].on).toBe(false)
  })

  it('builds codes from the item code and the short codes of both values', () => {
    const state = sampleOptions(CODE)
    expect(state.cells[cellKey('w250', 'wb')].code).toBe('HB-250-WB')
    expect(state.cells[cellKey('w1kg', 'fl')].code).toBe('HB-1KG-FL')
    expect(codeFor('CAT-0208', state.side.values[1], state.top.values[3])).toBe('CAT-0208-500-TK')
    // A combination not sold gets no code until it is ticked and the codes are generated.
    expect(state.cells[cellKey('w250', 'tk')].code).toBe('')
    const ticked = generateCodes(toggleCell(state, cellKey('w250', 'tk')), CODE)
    expect(ticked.cells[cellKey('w250', 'tk')].code).toBe('HB-250-TK')
  })

  it('makes short codes for new values', () => {
    expect(shortCodeFor('250 g', [], 1)).toBe('250')
    expect(shortCodeFor('2 kg', [], 1)).toBe('2KG')
    expect(shortCodeFor('Cold brew', [], 1)).toBe('CB')
    expect(shortCodeFor('Coarse', ['CO'], 1)).toBe('CO2')
    expect(shortCodeFor('خشن', [], 5)).toBe('O5')
  })

  it('ticks and unticks a combination, and ticks everything', () => {
    let state = sampleOptions(CODE)
    state = toggleCell(state, cellKey('w250', 'wb'))
    expect(summarise(state).onSale).toBe(9)
    state = tickEverything(state)
    expect(summarise(state)).toMatchObject({ onSale: 12, unticked: 0 })
  })

  it('marks a typed price set by hand only when it differs from the worked-out one', () => {
    let state = sampleOptions(CODE)
    state = setPrice(state, cellKey('w500', 'wb'), 5.25)
    expect(state.cells[cellKey('w500', 'wb')]).toMatchObject({ price: 5.25, byHand: true })
    expect(summarise(state).byHand).toBe(2)
    state = setPrice(state, cellKey('w500', 'wb'), 5.1)
    expect(state.cells[cellKey('w500', 'wb')].byHand).toBe(false)
  })

  it('moves prices with a price change but leaves those set by hand', () => {
    const state = setDelta(sampleOptions(CODE), 'side', 'w1kg', 7)
    expect(state.cells[cellKey('w1kg', 'wb')].price).toBe(9.7)
    expect(state.cells[cellKey('w1kg', 'es')].price).toBe(9.8)
    expect(workedOutPrice(state, 'w1kg', 'tk')).toBe(9.9)
  })

  it('rebuilds every price from the base', () => {
    const state = rebuildFromBase(sampleOptions(CODE))
    expect(state.cells[cellKey('w1kg', 'es')]).toMatchObject({ price: 9.5, byHand: false })
    expect(summarise(state).byHand).toBe(0)
  })

  it('rounds every price to the nearest 0.050', () => {
    expect(roundTo050(2.724)).toBe(2.7)
    expect(roundTo050(2.725)).toBe(2.75)
    expect(roundTo050(5.333)).toBe(5.35)
    const state = roundAll(setPrice(sampleOptions(CODE), cellKey('w250', 'fl'), 2.737))
    expect(state.cells[cellKey('w250', 'fl')]).toMatchObject({ price: 2.75, byHand: true })
    expect(state.cells[cellKey('w250', 'wb')]).toMatchObject({ price: 2.7, byHand: false })
  })

  it('adds and removes values with their combinations', () => {
    let state = addValue(sampleOptions(CODE), 'side', '2 kg')
    expect(state.side.values).toHaveLength(4)
    let figures = summarise(state)
    expect(figures).toMatchObject({ total: 16, onSale: 14, codesReady: 10 })
    state = generateCodes(state, CODE)
    expect(summarise(state).codesReady).toBe(14)
    state = removeValue(state, 'top', 'tk')
    figures = summarise(state)
    expect(figures).toMatchObject({ total: 12, onSale: 12, unticked: 0 })
    expect(Object.keys(state.cells)).toHaveLength(12)
  })

  it('lets a choice be emptied: the other choice is then sold on its own', () => {
    let state = sampleOptions(CODE)
    state = removeValue(state, 'side', 'w250')
    state = removeValue(state, 'side', 'w500')
    state = removeValue(state, 'side', 'w1kg')
    expect(state.side.values).toHaveLength(0)
    // One combination per grind, priced from the base.
    expect(summarise(state)).toMatchObject({ total: 4 })
    expect(state.cells[cellKey(NONE.id, 'tk')].price).toBe(2.9)
    // With neither choice, the item has no combinations at all.
    for (const id of ['wb', 'fl', 'es', 'tk']) state = removeValue(state, 'top', id)
    expect(summarise(state).total).toBe(0)
  })
})

const WORDS = {
  sizes: { name: 'Size', nameAr: 'الحجم', noun: 'size', nounAr: 'حجمًا' },
  options: { name: 'Option', nameAr: 'الخيار', noun: 'option', nounAr: 'خيارًا' },
}

const FLAT_WHITE = {
  id: 'p-flat',
  code: 'FLT-1',
  name: 'Flat White',
  description: null,
  defaultUnitCode: 'EA',
  defaultUnitPrice: 1.333,
  defaultTaxCategory: 'S',
  defaultTaxRate: 5,
  active: true,
  version: 4,
  sizes: [
    { id: 's-r', name: 'Regular', nameAr: 'عادي', priceDelta: 0, sortOrder: 0 },
    { id: 's-l', name: 'Large', nameAr: null, priceDelta: 0.3, sortOrder: 1 },
  ],
  options: [{ id: 'o-oat', name: 'Oat milk', nameAr: null, priceDelta: 0.2, sortOrder: 0 }],
  variants: [
    {
      id: 'v-1',
      sizeId: 's-r',
      size: 'Regular',
      optionId: 'o-oat',
      option: 'Oat milk',
      name: 'x',
      code: 'FLT-1-1',
      priceOverride: null,
      price: 1.533,
      onSale: true,
    },
    {
      id: 'v-2',
      sizeId: 's-l',
      size: 'Large',
      optionId: 'o-oat',
      option: 'Oat milk',
      name: 'y',
      code: 'FLT-1-2',
      priceOverride: 2,
      price: 2,
      onSale: false,
    },
  ],
  addOns: [{ id: 'a-1', name: 'Extra shot', nameAr: null, price: 0.3, free: false, sortOrder: 0 }],
}

describe('sizes and options on the server (P.5)', () => {
  it("reads the item's sizes, options and the server's prices", () => {
    const state = productVariantsState(FLAT_WHITE, WORDS)
    expect(state.side.values.map((v) => v.name)).toEqual(['Regular', 'Large'])
    expect(state.top.values.map((v) => v.name)).toEqual(['Oat milk'])
    expect(state.cells[cellKey('s-r', 'o-oat')]).toEqual({
      on: true,
      price: 1.533,
      byHand: false,
      code: 'FLT-1-1',
    })
    expect(state.cells[cellKey('s-l', 'o-oat')]).toEqual({
      on: false,
      price: 2,
      byHand: true,
      code: 'FLT-1-2',
    })
  })

  it('sends every combination by name, a hand-set price only when set by hand, and the add-ons unchanged', () => {
    let state = productVariantsState(FLAT_WHITE, WORDS)
    state = addValue(state, 'top', 'Soy milk')
    expect(variantsRequest(state, FLAT_WHITE.addOns)).toEqual({
      sizes: [
        { id: 's-r', name: 'Regular', nameAr: 'عادي', priceDelta: 0 },
        { id: 's-l', name: 'Large', nameAr: null, priceDelta: 0.3 },
      ],
      options: [
        { id: 'o-oat', name: 'Oat milk', nameAr: null, priceDelta: 0.2 },
        { name: 'Soy milk', nameAr: null, priceDelta: 0 },
      ],
      variants: [
        { size: 'Regular', option: 'Oat milk', code: 'FLT-1-1', price: null, onSale: true },
        { size: 'Regular', option: 'Soy milk', code: null, price: null, onSale: true },
        { size: 'Large', option: 'Oat milk', code: 'FLT-1-2', price: 2, onSale: false },
        { size: 'Large', option: 'Soy milk', code: null, price: null, onSale: true },
      ],
      addOns: [{ id: 'a-1', name: 'Extra shot', nameAr: null, price: 0.3, free: false }],
    })
  })
})
