import { ApiError } from '../api'
import type {
  NewProduct,
  ProductDto,
  ProductItemKind,
  VariantRequest,
} from '../api/catalog/products'
import type { TaxCategoryDto } from '../api/reference/referenceData'
import { CODED_REASON, itemTypeOfUnit, type ItemType } from './invoiceDraft'
import { formatAmount, parseAmount, type DiscountType } from './invoiceMath'
import { taxCategoryOf } from './productLine'
import {
  ITEM_TYPE_OF_KIND,
  TIME_UNITS,
  type AddOn,
  type ItemKind,
  type Size,
} from './catalogItem'

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
  /** Whether the stored item has options (then a size's code is set per combination). */
  hasOptions?: boolean
  /** The four cards; absent on a product saved before they were stored. */
  kind?: ItemKind
  nameAr?: string
  barcode?: string
  /** The kind (level 2) of the catalogue's groups; '' for none. */
  kindId?: string
  /** VATZR-OM / VATEX-OM code for Z and E. */
  reasonCode?: string
  /** Written reason, for O. */
  reasonText?: string
  /** True while the category needs a reason (Z, E) that has not been picked. */
  reasonMissing?: boolean
  discountType?: DiscountType
  /** As typed; empty or 0 is no discount. */
  discountValue?: string
  includesVat?: boolean
  staffCanChange?: boolean
  keepCount?: boolean
  /**
   * The item form's sizes and add-ons. Absent leaves the stored setup alone; present replaces it.
   * A size or add-on marked `saved` keeps its server id.
   */
  sizes?: Size[]
  addOns?: AddOn[]
}

/** The item form's cards and the backend's `itemKind`. */
export const ITEM_KIND_TO_API: Record<ItemKind, ProductItemKind> = {
  handOver: 'HAND_OVER',
  youDo: 'DO',
  byTime: 'BY_TIME',
  several: 'BUNDLE',
}

const ITEM_KIND_FROM_API: Record<ProductItemKind, ItemKind> = {
  HAND_OVER: 'handOver',
  DO: 'youDo',
  BY_TIME: 'byTime',
  BUNDLE: 'several',
}

/** A stored product's card: its own `itemKind`, else read from goods or service and the unit. */
export function itemKindOf(product: ProductDto, itemType: ItemType): ItemKind {
  if (product.itemKind) return ITEM_KIND_FROM_API[product.itemKind]
  if (itemType === 'goods') return 'handOver'
  return TIME_UNITS.includes(product.defaultUnitCode) && product.defaultUnitCode !== 'ZZ'
    ? 'byTime'
    : 'youDo'
}

/**
 * The stored sizes as the item form's rows. A size's code and on-sale belong to its combination,
 * which is the size alone while the item has no options; with options they are set per
 * combination on the Sizes and options page.
 */
export function sizesFrom(product: ProductDto): Size[] {
  const variants = product.variants ?? []
  return (product.sizes ?? []).map((size) => {
    const own = variants.find((variant) => variant.sizeId === size.id && !variant.optionId)
    return {
      id: size.id,
      name: size.name,
      nameAr: size.nameAr,
      delta: size.priceDelta,
      code: own?.code ?? '',
      onSale: own?.onSale ?? true,
      price: own?.price,
      priceOverride: own?.priceOverride ?? null,
      saved: true,
    }
  })
}

export function addOnsFrom(product: ProductDto): AddOn[] {
  return (product.addOns ?? []).map((addOn) => ({
    id: addOn.id,
    name: addOn.name,
    nameAr: addOn.nameAr,
    delta: addOn.free ? 0 : addOn.price,
    saved: true,
  }))
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
    hasOptions: (product.options ?? []).length > 0,
    kind: itemKindOf(product, itemType),
    nameAr: product.nameAr ?? '',
    barcode: product.barcode ?? '',
    kindId: product.kindId ?? '',
    reasonCode: product.defaultTaxReasonCode ?? '',
    reasonText: product.defaultTaxReasonText ?? '',
    discountType: product.defaultDiscount?.type ?? 'PERCENTAGE',
    discountValue: product.defaultDiscount ? String(product.defaultDiscount.value) : '',
    includesVat: product.priceEntryIncludesVat ?? false,
    staffCanChange: product.staffCanChangePrice ?? false,
    keepCount: product.keepCount ?? false,
    sizes: sizesFrom(product),
    addOns: addOnsFrom(product),
  }
}

/** Rows left without a name are not sent. */
const named = <T extends { name: string }>(rows: readonly T[]) =>
  rows.filter((row) => row.name.trim() !== '')

/** What the form sends, on create (`POST`) and edit (`PUT`) alike: `ProductRequest`. */
export function productRequestFrom(
  categories: TaxCategoryDto[],
  fields: ProductFields,
): NewProduct {
  const tax = categories.find((option) => option.code === fields.taxCode) ?? null
  const category = tax?.en16931Category ?? ''
  const goods = fields.itemType === 'goods'
  const discount = Number(fields.discountValue || 0)
  const request: NewProduct = {
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
    // IBT-121 for Z and E (a code from CL-05-OM / CL-10-OM), IBT-120 text for O; never on S.
    defaultTaxReasonCode: CODED_REASON.has(category) ? fields.reasonCode || null : null,
    defaultTaxReasonText: category === 'O' ? fields.reasonText?.trim() || null : null,
    nameAr: fields.nameAr?.trim() || null,
    barcode: fields.barcode?.trim() || null,
    kindId: fields.kindId || null,
    priceEntryIncludesVat: fields.includesVat ?? false,
    staffCanChangePrice: fields.staffCanChange ?? false,
    // Only goods are counted on the shelf (PRODUCT_KEEP_COUNT_ON_SERVICE).
    keepCount: goods && (fields.keepCount ?? false),
    defaultDiscount:
      discount > 0
        ? { type: fields.discountType ?? 'PERCENTAGE', value: Number(threeDecimals(discount)) }
        : null,
  }
  // The card is sent only when it agrees with goods or service (PRODUCT_ITEM_KIND_MISMATCH).
  if (fields.kind && ITEM_TYPE_OF_KIND[fields.kind] === fields.itemType) {
    request.itemKind = ITEM_KIND_TO_API[fields.kind]
  }
  if (fields.sizes) {
    const sizes = named(fields.sizes)
    request.sizes = sizes.map((size) => ({
      ...(size.saved ? { id: size.id } : {}),
      name: size.name.trim(),
      nameAr: size.nameAr ?? null,
      priceDelta: Number(threeDecimals(size.delta)),
    }))
    // While the item has no options each size is a combination of its own, so its code and
    // on-sale go with it. With options, the Sizes and options page sets them per combination.
    if (!fields.hasOptions) {
      request.variants = sizes.map((size): VariantRequest => ({
        size: size.name.trim(),
        option: null,
        code: size.code.trim() || null,
        price: size.priceOverride ?? null,
        onSale: size.onSale,
      }))
    }
  }
  if (fields.addOns) {
    request.addOns = named(fields.addOns).map((addOn) => ({
      ...(addOn.saved ? { id: addOn.id } : {}),
      name: addOn.name.trim(),
      nameAr: addOn.nameAr ?? null,
      price: Number(threeDecimals(addOn.delta)),
      free: addOn.delta === 0,
    }))
  }
  return request
}

export type ProductField =
  | 'name'
  | 'code'
  | 'unit'
  | 'price'
  | 'tax'
  | 'hsCode'
  | 'serviceType'
  | 'reason'
  | 'barcode'
  | 'kind'
  | 'discount'
  | 'sizes'
  | 'addOns'

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
  // BR-OM: a zero-rated or exempt item names its reason; out of scope may leave it blank.
  if (fields.reasonMissing) {
    problems.push({ field: 'reason', key: 'itemForm.problem.reason' })
  }
  // Barcodes are printable ASCII with no spaces (PRODUCT_BARCODE_INVALID).
  const barcode = fields.barcode?.trim() ?? ''
  if (barcode && !/^[\x21-\x7e]{1,64}$/.test(barcode)) {
    problems.push({ field: 'barcode', key: 'itemForm.refused.barcodeInvalid' })
  }
  const discount = fields.discountValue?.trim() ?? ''
  if (
    discount &&
    (!/^\d*(\.\d{0,3})?$/.test(discount) ||
      (fields.discountType === 'PERCENTAGE' && Number(discount) > 100))
  ) {
    problems.push({ field: 'discount', key: 'itemForm.refused.discountInvalid' })
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
  PRODUCT_PRICE_TOO_PRECISE: { field: 'price', key: 'itemForm.problem.price' },
  PRODUCT_BARCODE_INVALID: { field: 'barcode', key: 'itemForm.refused.barcodeInvalid' },
  PRODUCT_BARCODE_DUPLICATE: { field: 'barcode', key: 'itemForm.refused.barcodeTaken' },
  CATALOGUE_KIND_NOT_FOUND: { field: 'kind', key: 'itemForm.refused.groupGone' },
  PRODUCT_ITEM_KIND_MISMATCH: { field: null, key: 'itemForm.refused.kind' },
  PRODUCT_KEEP_COUNT_ON_SERVICE: { field: null, key: 'itemForm.refused.keepCountService' },
  PRODUCT_DEFAULT_DISCOUNT_INVALID: { field: 'discount', key: 'itemForm.refused.discountInvalid' },
  PRODUCT_UNIT_KIND_MISMATCH: { field: 'unit', key: 'itemForm.refused.unitKind' },
  PRODUCT_UNIT_NOT_TIME_BASED: { field: 'unit', key: 'itemForm.refused.unitTime' },
  PRODUCT_SERVICE_TYPE_ON_GOODS: {
    field: 'serviceType',
    key: 'itemForm.refused.serviceTypeOnGoods',
  },
  PRODUCT_HS_CODE_REQUIRED: { field: 'hsCode', key: 'itemForm.problem.hsCode' },
  PRODUCT_TAX_REASON_CODE_NOT_APPLICABLE: {
    field: 'reason',
    key: 'itemForm.refused.reasonNotHere',
  },
  PRODUCT_TAX_REASON_CODE_INVALID: { field: 'reason', key: 'itemForm.refused.reasonInvalid' },
  PRODUCT_TAX_REASON_NOT_APPLICABLE: { field: 'reason', key: 'itemForm.refused.reasonNotHere' },
  PRODUCT_SIZE_DUPLICATE: { field: 'sizes', key: 'itemForm.refused.sizeTwice' },
  PRODUCT_OPTION_DUPLICATE: { field: 'sizes', key: 'itemForm.refused.optionTwice' },
  PRODUCT_ADDON_DUPLICATE: { field: 'addOns', key: 'itemForm.refused.addOnTwice' },
  PRODUCT_VARIANT_UNKNOWN_COMBINATION: { field: 'sizes', key: 'itemForm.refused.variantUnknown' },
  PRODUCT_VARIANT_DUPLICATE: { field: 'sizes', key: 'itemForm.refused.variantUnknown' },
  PRODUCT_VARIANT_CODE_INVALID: { field: 'sizes', key: 'itemForm.refused.variantCodeInvalid' },
  PRODUCT_VARIANT_CODE_DUPLICATE: { field: 'sizes', key: 'itemForm.refused.variantCodeTaken' },
  PRODUCT_VARIANT_PRICE_NEGATIVE: {
    field: 'sizes',
    key: 'itemForm.refused.variantPriceNegative',
  },
  PRODUCT_ADDON_FREE_WITH_PRICE: { field: 'addOns', key: 'itemForm.refused.addOnFreeWithPrice' },
  PRODUCT_VARIANT_LIMIT: { field: 'sizes', key: 'itemForm.refused.variantLimit' },
}

/** The sentence for a refused save, or null when it is not a product refusal the form knows. */
export function productRefusal(error: unknown): (ProductProblem & { code: string }) | null {
  if (!(error instanceof ApiError) || !error.code) return null
  const known = PRODUCT_REFUSALS[error.code]
  return known ? { ...known, code: error.code } : null
}
