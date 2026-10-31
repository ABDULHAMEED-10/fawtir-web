/**
 * The bundle form's parts and request (`BundleRequest`): what the screen holds per part, and what
 * it sends. VAT and classification are never sent; the server works them out from the parts.
 */
import type { ProductDto, ProductVariant } from '../api/catalog/products'
import type { BundleDto, BundleRequest } from '../api/catalog/bundles'
import { round3 } from './catalogInsights'
import kindProductIcon from '../assets/catalog/kind-product.svg'
import kindServiceIcon from '../assets/catalog/kind-service.svg'

/** A glyph per part: a service or a thing handed over. */
export const partIcon = (goodsOrService: string | null | undefined) =>
  goodsOrService === 'S' ? kindServiceIcon : kindProductIcon

/** One part as the form holds it: what is sent, plus what the rows and sums show. */
export type EditPart = {
  key: string
  productId: string
  variantId: string | null
  code: string
  name: string
  quantity: number
  free: boolean
  /** On its own, before VAT, in the working branch. */
  unitPrice: number
  taxRate: number | null
  goodsOrService: string | null
  /** Known only for a saved part read with a branch; null otherwise. */
  counted: boolean | null
  onHand: number | null
  /** The product's sizes and options, for a part picked here that is sold that way. */
  variants?: ProductVariant[]
}

let nextKey = 1
const partKey = () => `part-${nextKey++}`

export const partsFromBundle = (bundle: BundleDto): EditPart[] =>
  bundle.parts.map((part) => ({
    key: partKey(),
    productId: part.productId,
    variantId: part.variantId,
    code: part.code,
    name: part.name,
    quantity: part.quantity,
    free: part.free,
    unitPrice: part.unitPrice,
    taxRate: part.taxRate,
    goodsOrService: part.goodsOrService,
    counted: part.counted,
    onHand: part.onHand,
  }))

/** A product picked from the catalogue, at its working-branch price (or its size's). */
export function partFromProduct(product: ProductDto): EditPart {
  const variants = (product.variants ?? []).filter((variant) => variant.onSale)
  const first = variants[0]
  return {
    key: partKey(),
    productId: product.id,
    variantId: first?.id ?? null,
    code: first?.code ?? product.code,
    name: first?.name ?? product.name,
    quantity: 1,
    free: false,
    unitPrice: first?.price ?? product.effectivePrice ?? product.defaultUnitPrice,
    taxRate: product.defaultTaxRate,
    goodsOrService: product.classificationGoodsOrService ?? null,
    counted: null,
    onHand: null,
    variants: variants.length ? variants : undefined,
  }
}

/** What the form sends (`BundleRequest`): never VAT or classification, the server works them out. */
export function bundleRequest(form: {
  code: string
  name: string
  description: string
  kindId: string
  price: string
  showParts: boolean
  parts: readonly EditPart[]
  base?: BundleDto | null
}): BundleRequest {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    nameAr: form.base?.nameAr ?? null,
    description: form.description.trim() || null,
    kindId: form.kindId || null,
    barcode: form.base?.barcode ?? null,
    price: round3(Number(form.price) || 0),
    unitCode: form.base?.unitCode ?? null,
    showParts: form.showParts,
    parts: form.parts.map((part) => ({
      productId: part.productId,
      variantId: part.variantId,
      quantity: part.quantity,
      free: part.free,
    })),
  }
}

/** How many can be made from the parts the form knows the stock of, and which part binds. */
/**
 * A part just picked has no stock figure until the bundle is saved and read back, so nothing can
 * be said yet about what is counted or how many can be made.
 */
export const stockShownOnceSaved = (parts: readonly EditPart[]) =>
  parts.some((part) => part.counted === null)

export function canMakeOf(parts: readonly EditPart[]) {
  let count: number | null = null
  let limitedBy: string | null = null
  for (const part of parts) {
    if (!part.counted || part.onHand === null) continue
    const possible = Math.floor(part.onHand / part.quantity)
    if (count === null || possible < count) {
      count = possible
      limitedBy = part.name
    }
  }
  return { count, limitedBy }
}
