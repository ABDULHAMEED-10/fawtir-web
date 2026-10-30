import type { ProductDto, ProductStockState } from '../api/catalog/products'
import type { CatalogGroupDto } from '../api/catalog/groups'
import type { TaxCategoryDto } from '../api/reference/referenceData'
import type { BundleInvoiceLinesDto } from '../api/catalog/bundles'
import { lineFromBundleLine, lineFromProduct } from './productLine'
import { toBaisa, type SaleAddOn, type SaleLine } from './pos'
import type { DiscountType } from './invoiceMath'

/**
 * The till's shelf: the branch's catalogue (`GET /v1/products?branchId=&includeUnavailable=true`,
 * P.9). One product record for the whole company, at the branch's own price (`effectivePrice`);
 * an item switched off in the branch stays on the shelf greyed (`availableHere: false`).
 *
 * The list asks for each row's sizes, options and add-ons (`include=variants,addOns`) and its
 * stock in the branch (`include=stock`): fixed by backend #808 and #815, not deployed on
 * 29 Oct 2026 (INCOME.md P.27). A server without them answers those as null, and a tile is then
 * read in full (`GET /v1/products/{id}`) when it is tapped, as before; with them nothing more is
 * read, and the kept copy of the shelf sells an item never opened while the till is offline.
 */

/** How a tile is drawn when the item has no photo: the design's flat illustrations. */
export type ItemArt =
  'cup' | 'cupDark' | 'cupIced' | 'cupGreen' | 'bag' | 'bagPale' | 'pastry' | 'grinder' | 'bottle'

export type PosItem = {
  id: string
  name: string
  code: string
  barcode: string | null
  groupId: string | null
  /** TODO(backend): products carry no photo, so every tile shows an illustration (row P.27). */
  art: ItemArt
  /** The branch's price before VAT, in baisa. */
  price: number
  /** False: switched off or not sold in this branch, drawn greyed. */
  available: boolean
  /** The branch's stock, flagged on the tile; never stops the sale. Null: nothing to flag. */
  stock: StockFlag | null
  product: ProductDto
}

/**
 * What the till flags about an item's stock (guide section 8): zero or below never stops a sale,
 * the tile and the size only say so. Not counted, OK, or no figure at all: no flag.
 */
export type StockFlag = 'LOW' | 'OUT' | 'BELOW_ZERO'

const SEVERITY: Record<StockFlag, number> = { LOW: 1, OUT: 2, BELOW_ZERO: 3 }

export function stockFlagOf(state: ProductStockState | null | undefined): StockFlag | null {
  return state === 'LOW' || state === 'OUT' || state === 'BELOW_ZERO' ? state : null
}

/** One variant's flag, from the row's `stock` (backend #815). */
export function variantStockFlag(product: ProductDto, variantId: string): StockFlag | null {
  return stockFlagOf(product.stock?.variants?.find((entry) => entry.variantId === variantId)?.state)
}

/**
 * The tile's flag. A product with sizes is flagged only when every size on sale is, and then by
 * the mildest of them: one size out while another is in stock leaves the tile unflagged, and the
 * size chooser flags the size itself.
 */
export function itemStockFlag(product: ProductDto): StockFlag | null {
  const stock = product.stock
  if (!stock) return null
  if (!stock.variants?.length) return stockFlagOf(stock.state)
  const onSale = Array.isArray(product.variants)
    ? product.variants.filter((variant) => variant.onSale).map((variant) => variant.id)
    : stock.variants.map((entry) => entry.variantId)
  if (!onSale.length) return null
  let mildest: StockFlag | null = null
  for (const id of onSale) {
    const flag = variantStockFlag(product, id)
    if (!flag) return null
    if (!mildest || SEVERITY[flag] < SEVERITY[mildest]) mildest = flag
  }
  return mildest
}

const pick = (name: string, nameAr: string | null | undefined, ar: boolean) =>
  ar && nameAr ? nameAr : name

export function shelfItem(product: ProductDto, ar: boolean): PosItem {
  return {
    id: product.id,
    name: pick(product.name, product.nameAr, ar),
    code: product.code,
    barcode: product.barcode ?? null,
    groupId: product.groupId ?? null,
    art: product.classificationGoodsOrService === 'S' ? 'bagPale' : 'bag',
    price: toBaisa(product.effectivePrice ?? product.defaultUnitPrice),
    available: product.availableHere !== false && product.active,
    stock: itemStockFlag(product),
    product,
  }
}

/** The tabs: everything, then the company's own groups, each counted from the shelf. */
export type ShelfTab = { id: string; label: string; count: number }

export function shelfTabs(
  items: PosItem[],
  groups: CatalogGroupDto[],
  ar: boolean,
  everything: string,
): ShelfTab[] {
  const count = (id: string) => items.filter((item) => item.groupId === id).length
  return [
    { id: 'all', label: everything, count: items.length },
    ...groups
      .map((group) => ({
        id: group.id,
        label: pick(group.name, group.nameAr, ar),
        count: count(group.id),
      }))
      .filter((tab) => tab.count > 0),
  ]
}

export type ActiveFilter = 'active' | 'inactive' | 'both'

export const ACTIVE_FILTERS: ActiveFilter[] = ['active', 'inactive', 'both']

export function activeCounts(items: PosItem[]) {
  const active = items.filter((item) => item.available).length
  return { active, inactive: items.length - active, both: items.length }
}

export function itemsFor(
  items: PosItem[],
  group: string,
  filter: ActiveFilter,
  query: string,
): PosItem[] {
  const text = query.trim().toLowerCase()
  return items.filter((item) => {
    if (group !== 'all' && item.groupId !== group) return false
    if (filter === 'active' && !item.available) return false
    if (filter === 'inactive' && item.available) return false
    if (
      text &&
      ![item.name, item.product.name, item.product.nameAr ?? '', item.code, item.barcode ?? '']
        .join(' ')
        .toLowerCase()
        .includes(text)
    )
      return false
    return true
  })
}

/* A scanned barcode is matched by `findOnShelf` (lib/posScan), sizes included. */

/* --------------------------------------------------------- sizes and add-ons */

export type SizeChoice = {
  id: string
  label: string
  price: number
  code: string
  /** The size's own stock flag in the branch (backend #815); null when nothing to flag. */
  stock?: StockFlag | null
}

export type ItemChoices = { sizes: SizeChoice[]; addOns: SaleAddOn[] }

/**
 * What a full product offers at the till: every size and option on sale, at the branch's price
 * plus the size's and option's changes unless it has its own price (the server's own rule,
 * `ProductVariantSetup.priceOf`), and its add-ons.
 */
export function choicesOf(detail: ProductDto, branchPrice: number, ar: boolean): ItemChoices {
  const sizes = detail.sizes ?? []
  const options = detail.options ?? []
  const delta = (list: typeof sizes, valueId: string | null) =>
    toBaisa(list.find((entry) => entry.id === valueId)?.priceDelta ?? 0)
  const name = (
    list: typeof sizes,
    valueId: string | null,
    fallback: string | null,
    fallbackAr: string | null | undefined,
  ) => {
    const found = list.find((entry) => entry.id === valueId)
    return found ? pick(found.name, found.nameAr, ar) : fallback && pick(fallback, fallbackAr, ar)
  }
  return {
    sizes: (detail.variants ?? [])
      .filter((variant) => variant.onSale)
      .map((variant) => ({
        id: variant.id,
        code: variant.code,
        label:
          [
            name(sizes, variant.sizeId, variant.size, variant.sizeAr),
            name(options, variant.optionId, variant.option, variant.optionAr),
          ]
            .filter(Boolean)
            .join(' · ') || pick(variant.name, variant.nameAr, ar),
        // The branch list's own figure when it carries one (backend #808), else worked out here.
        price:
          variant.branchPrice != null
            ? toBaisa(variant.branchPrice)
            : variant.priceOverride != null
              ? toBaisa(variant.priceOverride)
              : branchPrice + delta(sizes, variant.sizeId) + delta(options, variant.optionId),
        // Only when there is something to flag, so a size reads as before without stock.
        ...(variantStockFlag(detail, variant.id)
          ? { stock: variantStockFlag(detail, variant.id) }
          : {}),
      })),
    addOns: [...(detail.addOns ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((addOn) => ({
        id: addOn.id,
        label: pick(addOn.name, addOn.nameAr, ar),
        price: addOn.free ? 0 : toBaisa(addOn.price),
      })),
  }
}

/**
 * The choices a list row already carries (`include=variants,addOns`, backend #808), or undefined
 * when the server left them out (null arrays) and the item must be read when tapped.
 */
export function listedChoices(item: PosItem, ar: boolean): ItemChoices | undefined {
  const { variants, addOns } = item.product
  if (!Array.isArray(variants) || !Array.isArray(addOns)) return undefined
  return choicesOf(item.product, item.price, ar)
}

export function hasChoices(choices: ItemChoices): boolean {
  return choices.sizes.length > 0 || choices.addOns.length > 0
}

/* --------------------------------------------------------- an item with no price */

/**
 * A 0.000 item must never be sold for free by mistake (Abdul, 30 Oct 2026; template items start at
 * 0.000). Whether a price may be typed for one: the item's "Let staff change the price at the till"
 * and the person's right to sell (`pos.sell`, the only till permission the server's price check
 * knows; `PosSaleService` lets such a line through at any price, and takes no other permission).
 * Only the item's or size's own price counts: an add-on at 0 is a free add-on, and a line that
 * comes to 0 through a discount or a price rule still has a price.
 */
export function mayTypePrice(item: PosItem, canSell: boolean): boolean {
  return canSell && item.product.staffCanChangePrice === true
}

/** What a tap or a scan does: put it on the sale, open the chooser, or say there is no price. */
export function whenPicked(
  item: PosItem,
  choices: ItemChoices,
  canSell: boolean,
): 'add' | 'choose' | 'refuse' {
  const priced = choices.sizes.length
    ? choices.sizes.some((size) => size.price > 0)
    : item.price > 0
  if (!priced && !mayTypePrice(item, canSell)) return 'refuse'
  return !priced || hasChoices(choices) ? 'choose' : 'add'
}

/** The tile's figure: its price, else its cheapest priced size, else 0 ("No price yet"). */
export function tilePrice(item: PosItem, choices: ItemChoices | undefined): number {
  if (item.price > 0) return item.price
  const priced = (choices?.sizes ?? []).map((size) => size.price).filter((price) => price > 0)
  return priced.length ? Math.min(...priced) : 0
}

/** A typed price in baisa; 0 for anything that is not a figure above nothing. */
export function typedPriceBaisa(raw: string): number {
  return /^(\d+(\.\d{0,3})?|\.\d{1,3})$/.test(raw.trim()) ? toBaisa(Number(raw)) : 0
}

/**
 * A line of the sale from a product, in the invoice composer's own terms (`lineFromProduct`), so
 * a till line carries what a typed invoice line would: unit, VAT category, classification, the
 * no-VAT reason and the catalogue discount. `typedPrice` is the price asked for at the till, in
 * baisa, for an item with none.
 */
export function saleLineFor(
  categories: TaxCategoryDto[],
  item: PosItem,
  size: SizeChoice | null,
  addOns: SaleAddOn[],
  typedPrice?: number,
): SaleLine {
  const patch = lineFromProduct(categories, item.product, true)
  return {
    id: `l${Date.now()}${Math.round(Math.random() * 1000)}`,
    productId: item.id,
    productCode: size?.code ?? item.code,
    name: item.name,
    variant: size ? { id: size.id, label: size.label } : null,
    addOns,
    qty: 1,
    price: typedPrice ?? (size ? size.price : item.price),
    itemType: patch.itemType ?? 'goods',
    unit: patch.unit,
    taxCode: patch.taxCode ?? 'S5',
    vatRate: patch.vatRate,
    hsCode: patch.hsCode,
    serviceType: patch.serviceType,
    exemptionReasonCode: patch.exemptionReasonCode,
    exemptionReason: patch.exemptionReason,
    discountType: (patch.discountType ?? 'PERCENTAGE') as DiscountType,
    discountValue: patch.discountValue ?? '0',
  }
}

/**
 * A split bundle's sale line (`GET /v1/bundles/{id}/invoice-lines` with quantity 1). It stays one
 * row on the screens, at what its parts come to, and files one invoice line per part.
 */
export function bundleSaleLine(
  categories: TaxCategoryDto[],
  item: PosItem,
  answer: BundleInvoiceLinesDto,
): SaleLine {
  const bundleParts = answer.lines.map((line) => {
    const fields = lineFromBundleLine(categories, line)
    return {
      productId: line.productId,
      variantId: line.variantId,
      productCode: line.productCode,
      description: line.description,
      unit: fields.unit,
      quantity: Number(line.quantity),
      price: toBaisa(line.unitPrice),
      itemType: fields.itemType,
      hsCode: fields.hsCode,
      serviceType: fields.serviceType,
      taxCode: fields.taxCode ?? line.taxCategory.code,
      vatRate: fields.vatRate,
      exemptionReasonCode: fields.exemptionReasonCode,
      exemptionReason: fields.exemptionReason,
      discountType: fields.discountType,
      discountValue: fields.discountValue,
    }
  })
  return {
    ...saleLineFor(categories, item, null, []),
    bundleParts,
    price: bundleParts.reduce((sum, part) => sum + Math.round(part.price * part.quantity), 0),
  }
}

/**
 * The same thing again, at the same price, adds to its line rather than starting another. The last
 * word on a line with no price: it does not go on the sale, whichever way it got here.
 */
export function addToSale(lines: SaleLine[], next: SaleLine): SaleLine[] {
  if (!(next.price > 0)) return lines
  const key = (line: SaleLine) =>
    `${line.productId}|${line.variant?.id ?? ''}|${line.price}|${line.addOns
      .map((a) => a.id)
      .sort()
      .join(',')}`
  const same = lines.find((line) => key(line) === key(next))
  if (same) return lines.map((line) => (line === same ? { ...line, qty: line.qty + 1 } : line))
  return [...lines, next]
}
