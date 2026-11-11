/**
 * Sizes and options for one catalogue item (Figma "Catalog -> Detail Edit Variants", 154:125539).
 *
 * A customer makes two choices (how much, and how it is ground, in the House Blend example). The
 * first choice runs down the side of the price grid and the second across the top; every
 * combination is a separate thing the till sells, with its own price and code.
 *
 * Each value carries a price change against the item's base price, so a combination's worked-out
 * price is the base plus both changes. A price typed into the grid that differs from that is
 * "set by hand" and survives everything except "Rebuild prices from the base".
 *
 * On a saved item the two choices are its sizes (down the side) and its options (across the top),
 * read from the product and saved with `PUT /v1/products/{id}/variants` (`productVariantsState`
 * and `variantsRequest` below). The House Blend example (`sampleOptions`) stays for the prototype.
 */

import type {
  ProductAddOn,
  ProductDto,
  ProductVariantsRequest,
  SizeRequest,
} from '../api/catalog/products'

export type OptionValue = {
  id: string
  /** As the owner typed it; the Arabic is shown when the screen is in Arabic. */
  name: string
  nameAr: string
  /** The few letters this value adds to a combination's item code. */
  short: string
  /** The price change against the base, before VAT. */
  delta: number
  /** Read from the server: its id is sent back so a rename keeps its combinations. */
  saved?: boolean
}

export type OptionSet = {
  id: string
  name: string
  nameAr: string
  /** The word "Add a ..." uses, in each language. */
  noun: string
  nounAr: string
  values: OptionValue[]
}

/** One combination: whether it is sold, its price and its item code. */
export type Cell = {
  /** Backend V509: the combination's own barcode as typed. Absent on a server without the field. */
  barcode?: string
  /** The barcode as read, so that a save sends one only when it changed. */
  storedBarcode?: string
  on: boolean
  price: number
  byHand: boolean
  code: string
  /** The Arabic line name set by hand (backend #808, `nameArSet`); empty means worked out. */
  nameAr?: string | null
  /** The one the server worked out, shown as the input's placeholder. Never sent. */
  nameArAuto?: string | null
}

export type OptionsState = {
  base: number
  /** Down the side. */
  side: OptionSet
  /** Across the top. */
  top: OptionSet
  cells: Record<string, Cell>
}

export const cellKey = (sideId: string, topId: string) => `${sideId}:${topId}`

/**
 * Stands in for a choice with no values: an item with sizes and no options sells each size on its
 * own, and the other way round. With neither, the item has no combinations at all.
 */
export const NONE: OptionValue = { id: '-', name: '', nameAr: '', short: '', delta: 0 }

/** A choice's values as the grid lays them out: the placeholder when it has none. */
export const valuesOf = (set: OptionSet) => (set.values.length ? set.values : [NONE])

const bothEmpty = (state: OptionsState) =>
  state.side.values.length === 0 && state.top.values.length === 0

const round3 = (value: number) => Math.round(value * 1000) / 1000

/** The price a combination works out to from the base and the two price changes. */
export const workedOutPrice = (state: OptionsState, sideId: string, topId: string) => {
  const side = state.side.values.find((value) => value.id === sideId)
  const top = state.top.values.find((value) => value.id === topId)
  return round3(state.base + (side?.delta ?? 0) + (top?.delta ?? 0))
}

/** The code a combination is sold under: the item code, then each value's short code. */
export const codeFor = (itemCode: string, side: OptionValue, top: OptionValue) =>
  [itemCode, side.short, top.short].filter(Boolean).join('-')

/** Every combination, in grid order (row by row). */
export function combinations(state: OptionsState) {
  if (bothEmpty(state)) return []
  return valuesOf(state.side).flatMap((side) =>
    valuesOf(state.top).map((top) => ({
      side,
      top,
      key: cellKey(side.id, top.id),
      cell: state.cells[cellKey(side.id, top.id)] ?? blankCell(state, side.id, top.id),
    })),
  )
}

const blankCell = (state: OptionsState, sideId: string, topId: string): Cell => ({
  on: true,
  price: workedOutPrice(state, sideId, topId),
  byHand: false,
  code: '',
})

/** Fills in a cell for every combination that has none and drops cells nobody can reach. */
export function reconcile(state: OptionsState): OptionsState {
  const cells: Record<string, Cell> = {}
  for (const { key, side, top } of combinations(state)) {
    cells[key] = state.cells[key] ?? blankCell(state, side.id, top.id)
  }
  return { ...state, cells }
}

/** A short code for a newly typed value: "250 g" gives 250, "1 kg" 1KG, "Cold brew" CB. */
export function shortCodeFor(name: string, taken: readonly string[], fallbackIndex: number) {
  const words = name
    .toUpperCase()
    .split(/\s+/)
    .map((word) => word.replace(/[^A-Z0-9]/g, ''))
    .filter(Boolean)
  let short = ''
  if (words.length > 0 && /^\d/.test(words[0])) {
    const unit = words[1] ?? ''
    // Grams and millilitres are the everyday unit, so the number alone says it.
    short = words[0] + (unit === 'G' || unit === 'ML' ? '' : unit)
  } else if (words.length >= 2) {
    short = words
      .slice(0, 3)
      .map((word) => word[0])
      .join('')
  } else if (words.length === 1) {
    short = words[0].slice(0, 2)
  }
  if (!short) short = `O${fallbackIndex}`
  short = short.slice(0, 5)
  let unique = short
  let n = 2
  while (taken.includes(unique)) unique = `${short}${n++}`
  return unique
}

let nextId = 1
const newId = (prefix: string) => `${prefix}-new-${nextId++}`

/** Adds a value to one of the two choices; its combinations start ticked at the worked-out price. */
export function addValue(state: OptionsState, which: 'side' | 'top', name: string): OptionsState {
  const trimmed = name.trim()
  if (!trimmed) return state
  const set = state[which]
  const value: OptionValue = {
    id: newId(set.id),
    name: trimmed,
    nameAr: trimmed,
    short: shortCodeFor(
      trimmed,
      set.values.map((entry) => entry.short),
      set.values.length + 1,
    ),
    delta: 0,
  }
  return reconcile({ ...state, [which]: { ...set, values: [...set.values, value] } })
}

/**
 * Takes a value away, and every combination it was part of. A choice may be left with none: the
 * other choice's values are then sold on their own.
 */
export function removeValue(state: OptionsState, which: 'side' | 'top', id: string): OptionsState {
  const set = state[which]
  return reconcile({ ...state, [which]: { ...set, values: set.values.filter((v) => v.id !== id) } })
}

/**
 * Changes a value's price change. Combinations that follow the base move with it; a price set by
 * hand stays where it was put.
 */
export function setDelta(
  state: OptionsState,
  which: 'side' | 'top',
  id: string,
  delta: number,
): OptionsState {
  const set = state[which]
  const next: OptionsState = {
    ...state,
    [which]: {
      ...set,
      values: set.values.map((v) => (v.id === id ? { ...v, delta: round3(delta) } : v)),
    },
  }
  const cells = { ...next.cells }
  for (const { key, side, top, cell } of combinations(next)) {
    if (!cell.byHand) cells[key] = { ...cell, price: workedOutPrice(next, side.id, top.id) }
  }
  return { ...next, cells }
}

export function toggleCell(state: OptionsState, key: string): OptionsState {
  const cell = state.cells[key]
  if (!cell) return state
  return { ...state, cells: { ...state.cells, [key]: { ...cell, on: !cell.on } } }
}

/** The barcode typed for a combination; emptied, a save removes the stored one. */
export function setBarcode(state: OptionsState, key: string, barcode: string): OptionsState {
  const cell = state.cells[key]
  if (!cell) return state
  return { ...state, cells: { ...state.cells, [key]: { ...cell, barcode } } }
}

/** A price typed into the grid. It is set by hand when it differs from the worked-out price. */
export function setPrice(state: OptionsState, key: string, price: number): OptionsState {
  const found = combinations(state).find((entry) => entry.key === key)
  if (!found) return state
  const rounded = round3(Math.max(0, price))
  const byHand = rounded !== workedOutPrice(state, found.side.id, found.top.id)
  return { ...state, cells: { ...state.cells, [key]: { ...found.cell, price: rounded, byHand } } }
}

const mapCells = (
  state: OptionsState,
  fn: (cell: Cell, side: OptionValue, top: OptionValue) => Cell,
) => {
  const cells: Record<string, Cell> = {}
  for (const { key, cell, side, top } of combinations(state)) cells[key] = fn(cell, side, top)
  return { ...state, cells }
}

/** The Arabic line name typed for a combination; empty returns it to the worked-out one. */
export function setVariantNameAr(state: OptionsState, key: string, nameAr: string): OptionsState {
  const cell = state.cells[key]
  if (!cell) return state
  return { ...state, cells: { ...state.cells, [key]: { ...cell, nameAr } } }
}

export const tickEverything = (state: OptionsState) =>
  mapCells(state, (cell) => ({ ...cell, on: true }))

/** Every price back to base plus changes; nothing stays set by hand. */
export const rebuildFromBase = (state: OptionsState) =>
  mapCells(state, (cell, side, top) => ({
    ...cell,
    price: workedOutPrice(state, side.id, top.id),
    byHand: false,
  }))

/** Rounds to the nearest 0.050, the smallest step a till hands back in change. */
export const roundTo050 = (price: number) => Math.round(round3(price) * 20) / 20

export const roundAll = (state: OptionsState) =>
  mapCells(state, (cell, side, top) => {
    const price = round3(roundTo050(cell.price))
    return { ...cell, price, byHand: price !== workedOutPrice(state, side.id, top.id) }
  })

/** Codes for every combination sold, from the item code and the values' short codes. */
export const generateCodes = (state: OptionsState, itemCode: string) =>
  mapCells(state, (cell, side, top) => ({
    ...cell,
    code: cell.on ? codeFor(itemCode, side, top) : cell.code,
  }))

/** The figures the "What this adds up to" card and the footer read. */
export function summarise(state: OptionsState) {
  const all = combinations(state)
  const sold = all.filter((entry) => entry.cell.on)
  const prices = sold.map((entry) => entry.cell.price)
  const lowest = sold.reduce<(typeof sold)[number] | undefined>(
    (best, entry) => (!best || entry.cell.price < best.cell.price ? entry : best),
    undefined,
  )
  const highest = sold.reduce<(typeof sold)[number] | undefined>(
    (best, entry) => (!best || entry.cell.price > best.cell.price ? entry : best),
    undefined,
  )
  return {
    total: all.length,
    onSale: sold.length,
    unticked: all.length - sold.length,
    byHand: sold.filter((entry) => entry.cell.byHand).length,
    codesReady: sold.filter((entry) => entry.cell.code !== '').length,
    /** Each combination sold keeps its own count on the shelf. */
    needsStockCounts: sold.length,
    min: prices.length ? Math.min(...prices) : 0,
    max: prices.length ? Math.max(...prices) : 0,
    lowest,
    highest,
  }
}

/** The House Blend example the frame draws. */
export const HOUSE_BLEND_BASE = 2.7

export function sampleOptions(itemCode: string): OptionsState {
  const side: OptionSet = {
    id: 'weight',
    name: 'Weight',
    nameAr: 'الوزن',
    noun: 'weight',
    nounAr: 'وزنًا',
    values: [
      { id: 'w250', name: '250 g', nameAr: '250 غ', short: '250', delta: 0 },
      { id: 'w500', name: '500 g', nameAr: '500 غ', short: '500', delta: 2.4 },
      { id: 'w1kg', name: '1 kg', nameAr: '1 كغ', short: '1KG', delta: 6.8 },
    ],
  }
  const top: OptionSet = {
    id: 'grind',
    name: 'Grind',
    nameAr: 'الطحن',
    noun: 'grind',
    nounAr: 'طحنًا',
    values: [
      { id: 'wb', name: 'Whole bean', nameAr: 'حبوب كاملة', short: 'WB', delta: 0 },
      { id: 'fl', name: 'Filter grind', nameAr: 'طحن للفلتر', short: 'FL', delta: 0 },
      { id: 'es', name: 'Espresso grind', nameAr: 'طحن للإسبريسو', short: 'ES', delta: 0 },
      { id: 'tk', name: 'Turkish grind', nameAr: 'طحن تركي', short: 'TK', delta: 0.2 },
    ],
  }
  let state = reconcile({ base: HOUSE_BLEND_BASE, side, top, cells: {} })
  state = toggleCell(state, cellKey('w250', 'tk'))
  state = toggleCell(state, cellKey('w1kg', 'tk'))
  state = setPrice(state, cellKey('w1kg', 'es'), 9.8)
  return generateCodes(state, itemCode)
}

/* ------------------------------------------------------- on the server (P.5) */

/** The words the two choices are called by, in each language. */
export type ChoiceWords = {
  sizes: { name: string; nameAr: string; noun: string; nounAr: string }
  options: { name: string; nameAr: string; noun: string; nounAr: string }
}

/** A server from before backend V509 returns no `barcode` on its rows: it cannot store one. */
export const canSetVariantBarcodes = (product: Pick<ProductDto, 'variants'>) =>
  (product.variants ?? []).some((variant) => variant.barcode !== undefined)

/**
 * A saved product's sizes and options as the grid. Each combination shows what the server says it
 * sells for (`variant.price`); one priced by hand (`priceOverride`) is marked so.
 */
export function productVariantsState(product: ProductDto, words: ChoiceWords): OptionsState {
  const values = (rows: ProductDto['sizes']): OptionValue[] => {
    const shorts: string[] = []
    return (rows ?? []).map((row, index) => {
      const short = shortCodeFor(row.name, shorts, index + 1)
      shorts.push(short)
      return {
        id: row.id,
        name: row.name,
        nameAr: row.nameAr || row.name,
        short,
        delta: row.priceDelta,
        saved: true,
      }
    })
  }
  const side: OptionSet = { id: 'sizes', ...words.sizes, values: values(product.sizes) }
  const top: OptionSet = { id: 'options', ...words.options, values: values(product.options) }
  const cells: Record<string, Cell> = {}
  for (const variant of product.variants ?? []) {
    cells[cellKey(variant.sizeId ?? NONE.id, variant.optionId ?? NONE.id)] = {
      ...(variant.barcode !== undefined
        ? { barcode: variant.barcode ?? '', storedBarcode: variant.barcode ?? '' }
        : {}),
      on: variant.onSale,
      price: variant.price,
      byHand: variant.priceOverride !== null,
      code: variant.code ?? '',
      ...(variant.nameAr
        ? variant.nameArSet
          ? { nameAr: variant.nameAr }
          : { nameArAuto: variant.nameAr }
        : {}),
    }
  }
  return reconcile({ base: product.defaultUnitPrice, side, top, cells })
}

/** The barcode to send: only a changed one ('' removes it). Left out, the server keeps its own. */
const changedBarcode = (cell: Cell) => {
  const barcode = cell.barcode?.trim()
  return barcode === undefined || barcode === (cell.storedBarcode ?? '') ? {} : { barcode }
}

/**
 * The combinations a barcode refusal belongs to, as the server does not say which it was: the ones
 * the refusal fits (not a valid code; the same code twice, or the item's own), else every barcode
 * this save changes. Empty when this save changes none, so the refusal is about something else.
 */
export function refusedBarcodes(state: OptionsState, code: string, ownBarcode?: string | null) {
  const all = combinations(state).map(({ key, cell }) => ({
    key,
    cell,
    typed: cell.barcode?.trim() ?? '',
  }))
  const changed = all.filter(({ cell, typed }) => typed && 'barcode' in changedBarcode(cell))
  const fits = all.filter(({ typed }) =>
    !typed
      ? false
      : code === 'PRODUCT_VARIANT_BARCODE_INVALID'
        ? !/^[\x21-\x7e]{1,64}$/.test(typed)
        : typed === ownBarcode || all.filter((other) => other.typed === typed).length > 1,
  )
  return (fits.length ? fits : changed).map(({ key }) => key)
}

const valueRequest = (value: OptionValue): SizeRequest => ({
  ...(value.saved ? { id: value.id } : {}),
  name: value.name.trim(),
  nameAr: value.nameAr && value.nameAr !== value.name ? value.nameAr : null,
  priceDelta: value.delta,
})

/**
 * What `PUT /v1/products/{id}/variants` is sent: the sizes and options in their order, every
 * combination with its code, on/off and a hand-set price (null follows the base), and the item's
 * add-ons unchanged, since the four arrays replace the whole setup.
 */
export function variantsRequest(
  state: OptionsState,
  addOns: readonly ProductAddOn[] | null | undefined,
): ProductVariantsRequest {
  return {
    sizes: state.side.values.map(valueRequest),
    options: state.top.values.map(valueRequest),
    variants: combinations(state).map(({ side, top, cell }) => ({
      size: side === NONE ? null : side.name.trim(),
      option: top === NONE ? null : top.name.trim(),
      ...changedBarcode(cell),
      code: cell.code.trim() || null,
      price: cell.byHand ? cell.price : null,
      onSale: cell.on,
      ...(cell.nameAr?.trim() ? { nameAr: cell.nameAr.trim() } : {}),
    })),
    addOns: (addOns ?? []).map((addOn) => ({
      id: addOn.id,
      name: addOn.name,
      nameAr: addOn.nameAr,
      price: addOn.price,
      free: addOn.free,
    })),
  }
}
