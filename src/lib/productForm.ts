import { ApiError } from '../api'
import type { NewProduct, ProductDto } from '../api/catalog/products'
import type { TaxCategoryDto } from '../api/reference/referenceData'
import { itemTypeOfUnit, type ItemType } from './invoiceDraft'
import { formatAmount, parseAmount } from './invoiceMath'
import { taxCategoryOf } from './productLine'

/**
 * The catalogue item form against `/v1/products`: what a stored product fills the form with, what
 * the form sends, what it refuses before sending, and the server's refusals as sentences.
 *
 * Field names are the backend's own: the request's `classification` is `ItemClassificationRequest`
 * (`goodsOrService`, `hsCode`, `serviceTypeCode`, `industrialClassificationCode`), the response's
 * are `classificationGoodsOrService`, `classificationHsCode`, `classificationServiceTypeCode` and
 * `classificationIsicCode` (`ProductResponse`).
 */

/** The fields of the item form that the product record holds. */
export type ProductFields = {
  itemType: ItemType
  name: string
  description: string
  code: string
  unit: string
  /** Before VAT, three decimals. */
  basePrice: string
  /** The platform's tax option (`S5`, `Z0`…), which carries the UNCL5305 category and rate. */
  taxCode: string
  hsCode: string
  serviceType: string
  /** Stored and not edited here; sent back so a PUT does not erase it. */
  isicCode: string | null
}

/** UNCL5305 categories that carry no rate: the rate is absent, not zero. */
const RATELESS = new Set(['E', 'O'])

/** CL-12-OM's "not applicable", which the server stores when a product names no service type. */
export const SERVICE_TYPE_NONE = '00000000'

const TWELVE_DIGITS = /^\d{12}$/

const threeDecimals = (value: number | string) =>
  formatAmount(parseAmount(String(value)), 3).replace(/,/g, '')

/**
 * A stored product as the form shows it. A product saved without a classification is goods or
 * service by its unit, as the list reads it.
 */
export function productFieldsFrom(
  categories: TaxCategoryDto[],
  product: ProductDto,
): ProductFields {
  const tax = taxCategoryOf(categories, product.defaultTaxCategory, product.defaultTaxRate)
  const itemType: ItemType =
    product.classificationGoodsOrService === 'S'
      ? 'service'
      : product.classificationGoodsOrService === 'G'
        ? 'goods'
        : itemTypeOfUnit(product.defaultUnitCode)
  const serviceType = product.classificationServiceTypeCode ?? ''
  return {
    itemType,
    name: product.name,
    description: product.description ?? '',
    code: product.code,
    unit: product.defaultUnitCode,
    basePrice: threeDecimals(product.defaultUnitPrice),
    taxCode: tax?.code ?? '',
    hsCode: itemType === 'goods' ? (product.classificationHsCode ?? '') : '',
    serviceType: itemType === 'service' && serviceType !== SERVICE_TYPE_NONE ? serviceType : '',
    isicCode: product.classificationIsicCode ?? null,
  }
}

/** What the form sends, on create (`POST`) and edit (`PUT`) alike: `ProductRequest`. */
export function productRequestFrom(
  categories: TaxCategoryDto[],
  fields: ProductFields,
): NewProduct {
  const tax = categories.find((option) => option.code === fields.taxCode) ?? null
  const category = tax?.en16931Category ?? ''
  const goods = fields.itemType === 'goods'
  return {
    code: fields.code.trim(),
    name: fields.name.trim(),
    description: fields.description.trim() || null,
    defaultUnitCode: fields.unit,
    defaultUnitPrice: Number(threeDecimals(fields.basePrice || '0')),
    defaultTaxCategory: category,
    defaultTaxRate: tax === null || RATELESS.has(category) ? null : Number(tax.rate),
    classification: {
      goodsOrService: goods ? 'G' : 'S',
      industrialClassificationCode: fields.isicCode,
      // Goods carry the HS code, a service never does (HS_CODE_ON_SERVICES_LINE).
      hsCode: goods ? fields.hsCode.trim() || null : null,
      serviceTypeCode: goods ? null : fields.serviceType || null,
    },
  }
}

export type ProductField = 'name' | 'code' | 'unit' | 'price' | 'tax' | 'hsCode' | 'serviceType'

export type ProductProblem = { field: ProductField | null; key: string }

/** What is refused before anything is sent: the server's required fields and the HS code rule. */
export function productFormProblems(fields: ProductFields): ProductProblem[] {
  const problems: ProductProblem[] = []
  if (!fields.name.trim()) problems.push({ field: 'name', key: 'itemForm.problem.name' })
  if (!fields.code.trim()) problems.push({ field: 'code', key: 'itemForm.problem.code' })
  if (!fields.unit) problems.push({ field: 'unit', key: 'itemForm.problem.unit' })
  if (!/^\d+(\.\d{0,3})?$|^\.\d{1,3}$/.test(fields.basePrice.trim())) {
    problems.push({ field: 'price', key: 'itemForm.problem.price' })
  }
  if (!fields.taxCode) problems.push({ field: 'tax', key: 'itemForm.problem.tax' })
  // IBR-080-OM: a goods line's HS code is the Oman 12-digit code on CL-08-OM-HS. "Other"
  // (000000000000) is always offered, so this never leaves a product unsaveable.
  if (fields.itemType === 'goods' && !TWELVE_DIGITS.test(fields.hsCode.trim())) {
    problems.push({ field: 'hsCode', key: 'itemForm.problem.hsCode' })
  }
  return problems
}

/** The version-conflict refusal: the form offers to reload the product. */
export const PRODUCT_VERSION_CONFLICT = 'PRODUCT_VERSION_CONFLICT'

/**
 * The product routes' refusals (`InvoiceRestExceptionHandler`: 400, or 409 for the version,
 * duplicate and archived codes, 404 for a missing product), each with the field it belongs to.
 */
export const PRODUCT_REFUSALS: Record<string, ProductProblem> = {
  PRODUCT_CODE_REQUIRED: { field: 'code', key: 'itemForm.problem.code' },
  PRODUCT_NAME_REQUIRED: { field: 'name', key: 'itemForm.problem.name' },
  PRODUCT_UNIT_CODE_REQUIRED: { field: 'unit', key: 'itemForm.problem.unit' },
  PRODUCT_TAX_CATEGORY_REQUIRED: { field: 'tax', key: 'itemForm.problem.tax' },
  PRODUCT_UNIT_PRICE_NEGATIVE: { field: 'price', key: 'itemForm.problem.price' },
  PRODUCT_TAX_RATE_OUT_OF_RANGE: { field: 'tax', key: 'itemForm.refused.taxRate' },
  PRODUCT_TAX_RATE_TOO_PRECISE: { field: 'tax', key: 'itemForm.refused.taxRate' },
  PRODUCT_CODE_DUPLICATE: { field: 'code', key: 'itemForm.refused.codeTaken' },
  [PRODUCT_VERSION_CONFLICT]: { field: null, key: 'itemForm.refused.changed' },
  PRODUCT_ARCHIVED: { field: null, key: 'itemForm.refused.archived' },
  PRODUCT_NOT_FOUND: { field: null, key: 'itemForm.refused.notFound' },
  HS_CODE_UNKNOWN: { field: 'hsCode', key: 'itemForm.refused.hsUnknown' },
  HS_CODE_MALFORMED: { field: 'hsCode', key: 'itemForm.problem.hsCode' },
  HS_CODE_ON_SERVICES_LINE: { field: 'hsCode', key: 'itemForm.refused.hsOnService' },
  GOODS_OR_SERVICE_CODE_INVALID: { field: null, key: 'itemForm.refused.kind' },
  SERVICE_TYPE_CODE_INVALID: { field: 'serviceType', key: 'itemForm.refused.serviceType' },
  INDUSTRIAL_CLASSIFICATION_CODE_MALFORMED: { field: null, key: 'itemForm.refused.isic' },
  INDUSTRIAL_CLASSIFICATION_CODE_UNKNOWN: { field: null, key: 'itemForm.refused.isic' },
}

/** The sentence for a refused save, or null when it is not a product refusal the form knows. */
export function productRefusal(error: unknown): (ProductProblem & { code: string }) | null {
  if (!(error instanceof ApiError) || !error.code) return null
  const known = PRODUCT_REFUSALS[error.code]
  return known ? { ...known, code: error.code } : null
}
