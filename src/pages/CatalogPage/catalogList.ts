import type { ProductDto, ProductListQuery } from '../../api/catalog/products'
import { itemTypeOfUnit, OMAN_VAT_CATEGORIES } from '../../lib/invoiceDraft'

/** Goods or service: the product's own flag (`classificationGoodsOrService`), else its unit. */
export const kindOf = (product: ProductDto) =>
  product.classificationGoodsOrService === 'S'
    ? 'service'
    : product.classificationGoodsOrService === 'G'
      ? 'goods'
      : itemTypeOfUnit(product.defaultUnitCode)

/** No price, or a VAT category Oman does not use (CL-04-OM): the product needs a look. */
export const needsAttention = (product: ProductDto) =>
  !(product.defaultUnitPrice > 0) || !OMAN_VAT_CATEGORIES.has(product.defaultTaxCategory)

/**
 * The catalogue list's tabs: only the ones a product record can answer.
 *
 * Items taken off sale have their own tab, read from the server (`status=ARCHIVED`, P.15).
 * TODO(backend): the frame's "On sale", "Never sold" and "Switched off" tabs need the per-branch
 * on/off (P.9) and per-item sales figures (P.17), so they are not drawn.
 */
export const CATALOG_TABS = [
  { id: 'all', labelKey: 'catalogReal.tab.all' },
  { id: 'goods', labelKey: 'catalogReal.tab.goods' },
  { id: 'services', labelKey: 'catalogReal.tab.services' },
  { id: 'attention', labelKey: 'catalogReal.tab.attention' },
  { id: 'notStandard', labelKey: 'catalogReal.tab.notStandard' },
  // Off sale: read on its own with `status=ARCHIVED` (INCOME.md P.15), counted by the server.
  { id: 'archived', labelKey: 'catalogReal.tab.archived' },
] as const

export type CatalogTab = (typeof CATALOG_TABS)[number]['id']

export function matchesCatalogTab(product: ProductDto, tab: CatalogTab): boolean {
  switch (tab) {
    case 'goods':
      return kindOf(product) === 'goods'
    case 'services':
      return kindOf(product) === 'service'
    case 'attention':
      return needsAttention(product)
    case 'notStandard':
      return product.defaultTaxCategory !== 'S'
    case 'archived':
      return !product.active
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
): ProductDto[] {
  const text = (a: string, b: string) => a.localeCompare(b, locale, { sensitivity: 'base' })
  return products
    .filter((product) => matchesCatalogTab(product, tab))
    .sort((a, b) => {
      if (sort === 'code') return text(a.code, b.code)
      if (sort === 'priceLow')
        return a.defaultUnitPrice - b.defaultUnitPrice || text(a.name, b.name)
      if (sort === 'priceHigh')
        return b.defaultUnitPrice - a.defaultUnitPrice || text(a.name, b.name)
      return text(a.name, b.name)
    })
}
