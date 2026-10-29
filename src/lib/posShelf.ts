import type { ProductDto } from '../api/catalog/products'
import type { CatalogGroupDto } from '../api/catalog/groups'
import type { TaxCategoryDto } from '../api/reference/referenceData'
import { lineFromProduct } from './productLine'
import { toBaisa, type SaleAddOn, type SaleLine } from './pos'
import type { DiscountType } from './invoiceMath'

/**
 * The till's shelf: the branch's catalogue (`GET /v1/products?branchId=&includeUnavailable=true`,
 * P.9). One product record for the whole company, at the branch's own price (`effectivePrice`);
 * an item switched off in the branch stays on the shelf greyed (`availableHere: false`).
 *
 * The list does not carry sizes, options or add-ons (they are null on list rows), so a tile is
 * read in full (`GET /v1/products/{id}`) when it is tapped. TODO(backend): a list row that says
 * whether the item has sizes or add-ons, so the tile can carry its Sizes badge before it is
 * tapped (INCOME.md row P.27).
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
  product: ProductDto
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

/** A scanned barcode, matched exactly. */
export function itemByBarcode(items: PosItem[], code: string): PosItem | null {
  const scanned = code.trim()
  if (!scanned) return null
  return items.find((item) => item.barcode === scanned && item.available) ?? null
}

/* --------------------------------------------------------- sizes and add-ons */

export type SizeChoice = { id: string; label: string; price: number; code: string }

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
  const name = (list: typeof sizes, valueId: string | null, fallback: string | null) => {
    const found = list.find((entry) => entry.id === valueId)
    return found ? pick(found.name, found.nameAr, ar) : fallback
  }
  return {
    sizes: (detail.variants ?? [])
      .filter((variant) => variant.onSale)
      .map((variant) => ({
        id: variant.id,
        code: variant.code,
        label:
          [
            name(sizes, variant.sizeId, variant.size),
            name(options, variant.optionId, variant.option),
          ]
            .filter(Boolean)
            .join(' · ') || variant.name,
        price:
          variant.priceOverride != null
            ? toBaisa(variant.priceOverride)
            : branchPrice + delta(sizes, variant.sizeId) + delta(options, variant.optionId),
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

export function hasChoices(choices: ItemChoices): boolean {
  return choices.sizes.length > 0 || choices.addOns.length > 0
}

/**
 * A line of the sale from a product, in the invoice composer's own terms (`lineFromProduct`), so
 * a till line carries what a typed invoice line would: unit, VAT category, classification, the
 * no-VAT reason and the catalogue discount.
 */
export function saleLineFor(
  categories: TaxCategoryDto[],
  item: PosItem,
  size: SizeChoice | null,
  addOns: SaleAddOn[],
): SaleLine {
  const patch = lineFromProduct(categories, item.product, true)
  return {
    id: `l${Date.now()}${Math.round(Math.random() * 1000)}`,
    productId: item.id,
    productCode: size?.code ?? item.code,
    name: item.name,
    kindId: item.product.kindId ?? null,
    groupId: item.product.groupId ?? null,
    bundle: item.product.itemKind === 'BUNDLE',
    variant: size ? { id: size.id, label: size.label } : null,
    addOns,
    qty: 1,
    price: size ? size.price : item.price,
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

/** The same thing again adds to its line rather than starting another. */
export function addToSale(lines: SaleLine[], next: SaleLine): SaleLine[] {
  const key = (line: SaleLine) =>
    `${line.productId}|${line.variant?.id ?? ''}|${line.addOns
      .map((a) => a.id)
      .sort()
      .join(',')}`
  const same = lines.find((line) => key(line) === key(next))
  if (same) return lines.map((line) => (line === same ? { ...line, qty: line.qty + 1 } : line))
  return [...lines, next]
}
