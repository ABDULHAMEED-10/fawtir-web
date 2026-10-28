import type { NewProduct, ProductDto } from '../api/catalog/products'
import type { TaxCategoryDto } from '../api/reference/referenceData'
import type { ItemType } from './invoiceDraft'
import { formatAmount, parseAmount, type DiscountType } from './invoiceMath'

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
export function taxCategoryOf(
  categories: TaxCategoryDto[],
  category: string,
  rate: number | null,
): TaxCategoryDto | null {
  return (
    categories.find(
      (option) =>
        option.en16931Category === category &&
        (RATELESS.has(category) || parseAmount(option.rate) === parseAmount(String(rate ?? 0))),
    ) ?? null
  )
}

export type ProductLinePatch = {
  productId: string
  /** The draft carries the code too; issue refuses a line whose code no longer matches the product. */
  productCode: string
  description: string
  unitPrice: string
  unit: string
  vatRate: string
  taxCode: string | null
  /** Present only when the product says; otherwise the unit decides (`itemTypeOfUnit`). */
  itemType?: ItemType
  hsCode?: string
  serviceType?: string
  exemptionReasonCode?: string
  exemptionReason?: string
  discountType?: DiscountType
  discountValue?: string
}

/**
 * The line a picked product starts. The catalogue price is exclusive of VAT; a line being entered
 * inclusive of VAT gets the inclusive price, as the toggle would have converted it.
 */
export function lineFromProduct(
  categories: TaxCategoryDto[],
  product: ProductDto,
  exclVat: boolean,
): ProductLinePatch {
  const tax = taxCategoryOf(categories, product.defaultTaxCategory, product.defaultTaxRate)
  const vatRate = tax?.rate ?? String(product.defaultTaxRate ?? 0)
  // The working branch's own price when the list was read for a branch (P.9), else the base.
  const price = parseAmount(String(product.effectivePrice ?? product.defaultUnitPrice))
  const rate = parseAmount(vatRate)
  const hundred = parseAmount('100')
  const unitPrice = exclVat || rate === 0n ? price : (price * (hundred + rate)) / hundred
  return {
    productId: product.id,
    productCode: product.code,
    description: product.name,
    unitPrice: formatAmount(unitPrice, 3).replace(/,/g, ''),
    unit: product.defaultUnitCode,
    vatRate,
    taxCode: tax?.code ?? null,
    ...productExtras(product),
  }
}

/**
 * The rest of what the product knows: goods or service, its classification, the reason it
 * carries no VAT and its discount, so a line filled from the catalogue is complete. Only what
 * the product holds is returned; the line keeps its own value for the rest.
 */
function productExtras(product: ProductDto): Partial<ProductLinePatch> {
  const extras: Partial<ProductLinePatch> = {}
  const kind = product.classificationGoodsOrService
  if (kind === 'G' || kind === 'S') extras.itemType = kind === 'S' ? 'service' : 'goods'
  if (extras.itemType === 'goods' && product.classificationHsCode) {
    extras.hsCode = product.classificationHsCode
  }
  if (extras.itemType === 'service' && product.classificationServiceTypeCode) {
    extras.serviceType = product.classificationServiceTypeCode
  }
  // The product's no-VAT reason (`defaultTaxReasonCode` / `Text`) is the line's IBT-121 / IBT-120.
  if (product.defaultTaxReasonCode) extras.exemptionReasonCode = product.defaultTaxReasonCode
  if (product.defaultTaxReasonText) extras.exemptionReason = product.defaultTaxReasonText
  if (product.defaultDiscount && product.defaultDiscount.value > 0) {
    extras.discountType = product.defaultDiscount.type
    extras.discountValue = String(product.defaultDiscount.value)
  }
  return extras
}

/** A quick-created product from the form's fields; the tax option supplies category and rate. */
export function newProductFrom(
  categories: TaxCategoryDto[],
  fields: {
    code: string
    name: string
    unit: string
    price: string
    taxCode: string
  },
): NewProduct {
  const tax = categories.find((option) => option.code === fields.taxCode) ?? categories[0] ?? null
  return {
    code: fields.code.trim(),
    name: fields.name.trim(),
    defaultUnitCode: fields.unit,
    defaultUnitPrice: Number(formatAmount(parseAmount(fields.price), 3).replace(/,/g, '')),
    defaultTaxCategory: tax?.en16931Category ?? '',
    defaultTaxRate: RATELESS.has(tax.en16931Category) ? null : Number(tax.rate),
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
