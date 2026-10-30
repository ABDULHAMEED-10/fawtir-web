import type { ProductDto, ProductListQuery } from '../../api/catalog/products'
import { itemTypeOfUnit, OMAN_VAT_CATEGORIES } from '../../lib/invoiceDraft'

/** Goods or service: the product's own flag (`classificationGoodsOrService`), else its unit. */
export const kindOf = (product: ProductDto) =>
  product.classificationGoodsOrService === 'S'
    ? 'service'
    : product.classificationGoodsOrService === 'G'
      ? 'goods'
      : itemTypeOfUnit(product.defaultUnitCode)

/**
 * No price, a VAT category Oman does not use (CL-04-OM), or a rate the zero-rating re-check
 * flagged against Oman's lists (Z.15, on the product or in `flagged`): the product needs a look.
 */
export const needsAttention = (product: ProductDto, flagged?: ReadonlySet<string>) =>
  !(product.defaultUnitPrice > 0) ||
  !OMAN_VAT_CATEGORIES.has(product.defaultTaxCategory) ||
  Boolean(product.zeroRatingAttention) ||
  Boolean(flagged?.has(product.id))

/**
 * The catalogue list's tabs: only the ones a product record can answer.
 *
 * Items taken off sale have their own tab, read from the server (`status=ARCHIVED`, P.15).
 * "Switched off" holds the active items switched off or not sold in the working branch
 * (`availableHere: false`); every other tab counts only what is on sale there. The frame's
 * "On sale" and "Never sold" tabs, and Switched off once opened, are the server's own filters
 * (`availability`, `sales`, guide §6), which work with a working branch only.
 */
export const CATALOG_TABS = [
  { id: 'all', labelKey: 'catalogReal.tab.all' },
  // On sale in the working branch, counted by the server (`availability=ON_SALE`).
  { id: 'onSale', labelKey: 'catalogReal.tab.onSale' },
  { id: 'goods', labelKey: 'catalogReal.tab.goods' },
  { id: 'services', labelKey: 'catalogReal.tab.services' },
  { id: 'attention', labelKey: 'catalogReal.tab.attention' },
  { id: 'notStandard', labelKey: 'catalogReal.tab.notStandard' },
  // Never on an issued invoice of the working branch (`sales=NEVER_SOLD`; a till sale is one).
  { id: 'neverSold', labelKey: 'catalogReal.tab.neverSold' },
  // Switched off or not sold in the working branch: greyed, still opens to switch it back on.
  { id: 'switchedOff', labelKey: 'catalogReal.tab.switchedOff' },
  // Off sale: read on its own with `status=ARCHIVED` (INCOME.md P.15), counted by the server.
  { id: 'archived', labelKey: 'catalogReal.tab.archived' },
] as const

export type CatalogTab = (typeof CATALOG_TABS)[number]['id']

/** The tabs the server filters, with the working branch; the page asks for them by these. */
export const SERVER_TABS: Partial<
  Record<CatalogTab, Pick<ProductListQuery, 'availability' | 'sales'>>
> = {
  onSale: { availability: 'ON_SALE' },
  neverSold: { sales: 'NEVER_SOLD' },
  switchedOff: { availability: 'SWITCHED_OFF' },
}

/** Tabs that need a working branch: the server filters them only with one. */
export const BRANCH_ONLY_TABS: ReadonlySet<CatalogTab> = new Set(['onSale', 'neverSold'])

/** The tab a link asks for; anything else is All. */
export const catalogTabOf = (raw: string | null): CatalogTab =>
  CATALOG_TABS.find((entry) => entry.id === raw)?.id ?? 'all'

/** On sale in the working branch: anything the server did not mark `availableHere: false`. */
export const onSaleHere = (product: ProductDto) => product.availableHere !== false

export function matchesCatalogTab(
  product: ProductDto,
  tab: CatalogTab,
  flagged?: ReadonlySet<string>,
): boolean {
  if (tab === 'archived') return !product.active
  if (tab === 'switchedOff') return !onSaleHere(product)
  // The server already narrowed the list to the items never sold in the branch.
  if (tab === 'neverSold') return true
  if (!onSaleHere(product)) return false
  switch (tab) {
    case 'goods':
      return kindOf(product) === 'goods'
    case 'services':
      return kindOf(product) === 'service'
    case 'attention':
      return needsAttention(product, flagged)
    case 'notStandard':
      return product.defaultTaxCategory !== 'S'
    default:
      return true
  }
}

export const CATALOG_SORTS = [
  { value: 'name', labelKey: 'catalogReal.sort.name' },
  { value: 'code', labelKey: 'catalogReal.sort.code' },
  { value: 'priceLow', labelKey: 'catalogReal.sort.priceLow' },
  { value: 'priceHigh', labelKey: 'catalogReal.sort.priceHigh' },
] as const

export type CatalogSort = (typeof CATALOG_SORTS)[number]['value']

/** The order a link asks for; anything else is by name. */
export const catalogSortOf = (raw: string | null): CatalogSort =>
  CATALOG_SORTS.find((entry) => entry.value === raw)?.value ?? 'name'

/** The server's order for each choice, so sorting runs across every page, not just this one. */
export const SERVER_SORT: Record<CatalogSort, Pick<ProductListQuery, 'sort' | 'direction'>> = {
  name: { sort: 'NAME', direction: 'ASC' },
  code: { sort: 'CODE', direction: 'ASC' },
  priceLow: { sort: 'PRICE', direction: 'ASC' },
  priceHigh: { sort: 'PRICE', direction: 'DESC' },
}

/** The loaded page, narrowed to a tab and put in the chosen order. Never changes `products`. */
export function catalogRows(
  products: readonly ProductDto[],
  tab: CatalogTab,
  sort: CatalogSort,
  locale?: string,
  flagged?: ReadonlySet<string>,
): ProductDto[] {
  const text = (a: string, b: string) => a.localeCompare(b, locale, { sensitivity: 'base' })
  return products
    .filter((product) => matchesCatalogTab(product, tab, flagged))
    .sort((a, b) => {
      if (sort === 'code') return text(a.code, b.code)
      if (sort === 'priceLow')
        return a.defaultUnitPrice - b.defaultUnitPrice || text(a.name, b.name)
      if (sort === 'priceHigh')
        return b.defaultUnitPrice - a.defaultUnitPrice || text(a.name, b.name)
      return text(a.name, b.name)
    })
}
