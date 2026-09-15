import type { NewProduct, ProductDto } from '../api/catalog/products'
import { TAX_CATEGORIES, type TaxCategory } from './catalogues'
import { formatAmount, parseAmount } from './invoiceMath'

/**
 * Between a catalogue product and an invoice line: what picking a product puts on the line, and
 * what a quick-created product is stored as.
 */

/** UNCL5305 categories that carry no rate: the rate is absent, not zero (`Product.defaultTaxRate`). */
const RATELESS = new Set(['E', 'O'])

/**
 * The tax option for a category and rate. Both are needed: zero-rated, exempt, out of scope,
 * reverse charge and export are all 0%, so a rate alone would read an exempt product as
 * zero-rated.
 */
export function taxCategoryOf(category: string, rate: number | null): TaxCategory | null {
  return (
    TAX_CATEGORIES.find(
      (option) =>
        option.categoryId === category &&
        (RATELESS.has(category) || parseAmount(option.rate) === parseAmount(String(rate ?? 0))),
    ) ?? null
  )
}

export type ProductLinePatch = {
  productId: string
  description: string
  unitPrice: string
  unit: string
  vatRate: string
  taxCode: string | null
}

/**
 * The line a picked product starts. The catalogue price is exclusive of VAT; a line being entered
 * inclusive of VAT gets the inclusive price, as the toggle would have converted it.
 */
export function lineFromProduct(product: ProductDto, exclVat: boolean): ProductLinePatch {
  const tax = taxCategoryOf(product.defaultTaxCategory, product.defaultTaxRate)
  const vatRate = tax?.rate ?? String(product.defaultTaxRate ?? 0)
  const price = parseAmount(String(product.defaultUnitPrice))
  const rate = parseAmount(vatRate)
  const hundred = parseAmount('100')
  const unitPrice = exclVat || rate === 0n ? price : (price * (hundred + rate)) / hundred
  return {
    productId: product.id,
    description: product.name,
    unitPrice: formatAmount(unitPrice, 3).replace(/,/g, ''),
    unit: product.defaultUnitCode,
    vatRate,
    taxCode: tax?.code ?? null,
  }
}

/** A quick-created product from the form's fields; the tax option supplies category and rate. */
export function newProductFrom(fields: {
  code: string
  name: string
  unit: string
  price: string
  taxCode: string
}): NewProduct {
  const tax = TAX_CATEGORIES.find((option) => option.code === fields.taxCode) ?? TAX_CATEGORIES[0]
  return {
    code: fields.code.trim(),
    name: fields.name.trim(),
    defaultUnitCode: fields.unit,
    defaultUnitPrice: Number(formatAmount(parseAmount(fields.price), 3).replace(/,/g, '')),
    defaultTaxCategory: tax.categoryId,
    defaultTaxRate: RATELESS.has(tax.categoryId) ? null : Number(tax.rate),
  }
}

/**
 * A code suggested from the name: its words' first letters and a short number, upper case.
 * Only a suggestion; the person can change it, and the server refuses a code already in use.
 */
export function suggestProductCode(name: string, random: () => number = Math.random): string {
  const letters = name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .map((word) => Array.from(word)[0])
    .join('')
    .toUpperCase()
  const number = String(Math.floor(random() * 9000) + 1000)
  return `${letters || 'P'}-${number}`
}
