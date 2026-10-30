import { apiRequest } from '../client'
import { fromSpringPage, type Page, type SpringPage } from '../page'
import { withQuery } from '../query'
import type { ProductZeroRatingWarning, ZeroRatingAttentionDto } from './zeroRating'

/**
 * The product catalogue (`ProductController`). An invoice line names a product (decision D7): its
 * id, and the name, unit, price and tax category it starts from.
 */
export const PRODUCTS_PATH = '/v1/products'

/** How many matches the picker shows; more typing narrows it rather than scrolling. */
export const PRODUCT_PICKER_SIZE = 20

/** `ProductResponse`, the members the picker reads. */
export type ProductDto = {
  id: string
  code: string
  name: string
  description: string | null
  defaultUnitCode: string
  defaultUnitPrice: number
  /** UNCL5305: S, Z, E, O, AE, G, K, L, M. */
  defaultTaxCategory: string
  /** Absent for E and O, which have no rate; zero-rated (Z) carries an explicit 0. */
  defaultTaxRate: number | null
  /** BTOM-019: `G` goods, `S` services; null on a product saved without a classification. */
  classificationGoodsOrService?: 'G' | 'S' | null
  /** BTOM-033, the seller's ISIC activity; the catalogue form sends it back unchanged. */
  classificationIsicCode?: string | null
  /** IBT-158, the 12-digit Oman HS code of goods (IBR-080-OM, CL-08-OM-HS). */
  classificationHsCode?: string | null
  /** CL-12-OM service type of a service; the server stores `00000000` ("not applicable") when none is given. */
  classificationServiceTypeCode?: string | null
  active: boolean
  /** When the product was archived (`DELETE`); null while it is on sale. */
  archivedAt?: string | null
  version: number
  /** VATZR-OM (Z) or VATEX-OM (E) code, the line's IBT-121 code. Never on S. */
  defaultTaxReasonCode?: string | null
  /** Written reason, for O (and the text of a coded reason). */
  defaultTaxReasonText?: string | null
  /** The catalogue discount, the line's starting discount. Null when none. */
  defaultDiscount?: ProductDiscount | null
  /** Arabic name; null when none. */
  nameAr?: string | null
  /** Printable ASCII, unique among the company's active products. */
  barcode?: string | null
  /** The kind (level 2) the item sits in; the group is the kind's parent. */
  kindId?: string | null
  groupId?: string | null
  /** The item form's four cards. */
  itemKind?: ProductItemKind | null
  /** Entry preference only: `defaultUnitPrice` is always before VAT. */
  priceEntryIncludesVat?: boolean
  staffCanChangePrice?: boolean
  /** Goods only. */
  keepCount?: boolean
  /**
   * Sizes, options, their combinations and add-ons. Filled on the one-product answers (read,
   * create, update, reactivate, variants); null on the list, where they are not loaded, unless the
   * list asks for them with `include` (backend #808, INCOME.md P.24 and P.27). A server without
   * `include` answers null on the list, so a null array means "not read", never "none".
   */
  sizes?: ProductSize[] | null
  options?: ProductOption[] | null
  variants?: ProductVariant[] | null
  addOns?: ProductAddOn[] | null
  /**
   * On a list read with `branchId`: that branch's price before VAT (its own, else the base
   * price). Null otherwise (INCOME.md P.9).
   */
  effectivePrice?: number | null
  /** Filled by a create or update (INCOME.md Z.15): non-blocking; `[]` on reads. */
  zeroRatingWarnings?: ProductZeroRatingWarning[] | null
  /** Left by the re-check when a new list no longer matches the stored rate; null when none. */
  zeroRatingAttention?: ZeroRatingAttentionDto | null
  /**
   * On a list read with `branchId`: false for an active product switched off or not sold in that
   * branch, which only `includeUnavailable=true` returns. Absent without a branch.
   */
  availableHere?: boolean | null
  /**
   * `include=stock` on a branch list (the till, backend #815): the branch's stock of a counted
   * product, so the till can flag it. Null for a product that is not counted, for a caller without
   * `stock.read`, and absent from a server without it: the till then flags nothing.
   */
  stock?: ProductStockDto | null
  /**
   * A list read with `barcode` (the till's lookup, backend V509): the size whose own barcode is the
   * one asked, so the till adds that size directly. Null when the product's own barcode matched;
   * absent from a server without size barcodes.
   */
  matchedVariantId?: string | null
}

/** A stock state as the stock list words it (`StockRow.state`). */
export type ProductStockState = 'OK' | 'LOW' | 'OUT' | 'BELOW_ZERO' | 'NOT_COUNTED'

/** `Product.stock` (backend #815): a product without variants, or one entry per variant. */
export type ProductStockDto = {
  onHand: number | null
  reorderLevel: number | null
  /** Null for a product with variants: each variant has its own. */
  state: ProductStockState | null
  variants: {
    variantId: string
    onHand: number | null
    reorderLevel: number | null
    state: ProductStockState
  }[]
}

/** What a product list may ask to be filled in on each row (`include`, backend #808 and #815). */
export type ProductListInclude = 'variants' | 'addOns' | 'stock'

export type ProductItemKind = 'HAND_OVER' | 'DO' | 'BY_TIME' | 'BUNDLE'

/** The invoice engine's own `DiscountType`, so a line copies it unchanged. */
export type ProductDiscount = { type: 'PERCENTAGE' | 'FIXED_AMOUNT'; value: number }

/** A size: a price change against the base, before VAT. */
export type ProductSize = {
  id: string
  name: string
  nameAr: string | null
  priceDelta: number
  sortOrder: number
}

export type ProductOption = ProductSize

/** One size x option combination: the thing the till sells, with its own code and price. */
export type ProductVariant = {
  id: string
  sizeId: string | null
  size: string | null
  optionId: string | null
  option: string | null
  /** The invoice line's item name: product, size and option. */
  name: string
  code: string
  /** A price set by hand; null = base plus the size's and option's changes. */
  priceOverride: number | null
  /** What it sells for, before VAT, worked out by the server. */
  price: number
  onSale: boolean
  /**
   * Backend #808: the Arabic line name (set by hand, else worked out from the Arabic names), and
   * the size's and option's own Arabic names. Absent from an older server; null when none.
   */
  nameAr?: string | null
  nameArSet?: boolean
  sizeAr?: string | null
  optionAr?: string | null
  /**
   * Backend #808, on a branch list (`GET /v1/products?branchId=&include=variants`) only: the
   * price before VAT in that branch, as the till sale checks it. Null or absent elsewhere.
   */
  branchPrice?: number | null
  /** Backend V509: the size's own barcode for the till. Absent from an older server; null when none. */
  barcode?: string | null
}

export type ProductAddOn = {
  id: string
  name: string
  nameAr: string | null
  price: number
  free: boolean
  sortOrder: number
}

/** `ItemClassificationRequest` (openapi): the product's goods/services flag and its codes. */
export type ProductClassification = {
  goodsOrService: 'G' | 'S'
  industrialClassificationCode?: string | null
  hsCode?: string | null
  serviceTypeCode?: string | null
}

export type NewProduct = {
  code: string
  name: string
  defaultUnitCode: string
  defaultUnitPrice: number
  defaultTaxCategory: string
  defaultTaxRate: number | null
  description?: string | null
  classification?: ProductClassification | null
  defaultTaxReasonCode?: string | null
  defaultTaxReasonText?: string | null
  nameAr?: string | null
  barcode?: string | null
  kindId?: string | null
  itemKind?: ProductItemKind | null
  priceEntryIncludesVat?: boolean
  staffCanChangePrice?: boolean
  keepCount?: boolean
  defaultDiscount?: ProductDiscount | null
  /** Absent leaves the stored setup as it is on `PUT`; `[]` clears it. */
  sizes?: SizeRequest[]
  options?: SizeRequest[]
  variants?: VariantRequest[]
  addOns?: AddOnRequest[]
}

/** A size or option to keep (by `id`), rename, or create (no `id`: matched by name, else new). */
export type SizeRequest = { id?: string; name: string; nameAr?: string | null; priceDelta: number }

/** Picks a combination by its size and option names; `price` null = base plus the changes. */
export type VariantRequest = {
  size?: string | null
  option?: string | null
  code?: string | null
  price?: number | null
  onSale?: boolean
  /**
   * Backend #808 (V508): a hand-set Arabic line name; null or blank lets the server work it out.
   * Sent only to keep one read with `nameArSet`, since a listed combination without it loses it.
   */
  nameAr?: string | null
  /** Backend V509: the size's own barcode. Left out keeps the stored one; blank removes it. */
  barcode?: string | null
}

export type AddOnRequest = {
  id?: string
  name: string
  nameAr?: string | null
  price: number
  free: boolean
}

/** `PUT /v1/products/{id}/variants`: the four arrays replace the whole setup, in display order. */
export type ProductVariantsRequest = {
  sizes: SizeRequest[]
  options: SizeRequest[]
  variants: VariantRequest[]
  addOns: AddOnRequest[]
}

export type ProductStatus = 'ACTIVE' | 'ARCHIVED' | 'ALL'
export type ProductSort = 'NAME' | 'CODE' | 'PRICE' | 'UPDATED'

/** `GET /v1/products` filters. Every one is optional; absent ones are not sent. */
export type ProductListQuery = {
  q?: string
  /** ACTIVE, ARCHIVED or ALL; absent keeps the server's old default (active only). */
  status?: ProductStatus
  /** Exact match, for a scanner. */
  barcode?: string
  kindId?: string
  /** Any kind in the group. */
  groupId?: string
  itemKind?: ProductItemKind
  /**
   * The working branch: only products on sale there, each with its `effectivePrice`. Archived
   * products are never listed with it.
   */
  branchId?: string | null
  /**
   * With `branchId`: also the active products switched off or not sold there, each with
   * `availableHere: false`. For the catalogue management list only; the till and the invoice
   * item pickers never send it, so they keep hiding those.
   */
  includeUnavailable?: boolean
  sort?: ProductSort
  direction?: 'ASC' | 'DESC'
  size?: number
  page?: number
  /**
   * Rows filled in beyond the list's own (backend #808, #815). An older server leaves the word out
   * and answers the rows as before, so every caller still copes with null arrays.
   */
  include?: ProductListInclude[]
}

/** The list's path, which is also the request's identity. The first page leaves `page` out. */
export function productListPath(query: ProductListQuery): string {
  return withQuery(PRODUCTS_PATH, {
    q: query.q?.trim(),
    status: query.status,
    barcode: query.barcode?.trim(),
    kindId: query.kindId,
    groupId: query.groupId,
    itemKind: query.itemKind,
    branchId: query.branchId,
    includeUnavailable: query.branchId && query.includeUnavailable ? true : undefined,
    sort: query.sort,
    direction: query.direction,
    size: query.size ?? PRODUCT_PICKER_SIZE,
    page: query.page && query.page > 0 ? query.page : undefined,
    include: includeWords(query.include, query.branchId),
  })
}

/** `include` as sent: comma-separated, `stock` only with a branch (the server ignores it without). */
function includeWords(
  include: ProductListInclude[] | undefined,
  branchId: string | null | undefined,
): string | undefined {
  const words = (include ?? []).filter((word) => word !== 'stock' || Boolean(branchId))
  return words.length ? words.join(',') : undefined
}

/**
 * Active products whose code or name contains `q`. Also the request's identity.
 *
 * `page` is Spring's zero-based page. The first page leaves it out, so the path of every caller
 * that never pages stays what it was.
 */
export function productSearchPath(
  q: string,
  size = PRODUCT_PICKER_SIZE,
  page = 0,
  branchId?: string | null,
  include?: ProductListInclude[],
): string {
  return withQuery(PRODUCTS_PATH, {
    q: q.trim(),
    // The working branch (P.9): only what is sold there, at its price. Absent leaves the path as it was.
    branchId,
    size,
    page: page > 0 ? page : undefined,
    include: includeWords(include, branchId),
  })
}

export const productPath = (id: string) => `${PRODUCTS_PATH}/${encodeURIComponent(id)}`

/** `GET /v1/products/{id}`: one product, archived or not. */
export function getProduct(id: string): Promise<ProductDto> {
  return apiRequest<ProductDto>(productPath(id))
}

/**
 * `PUT` with the version the form read; another writer's change is refused
 * (`PRODUCT_VERSION_CONFLICT`) rather than overwritten. An archived product cannot be changed.
 */
export function updateProduct(
  id: string,
  expectedVersion: number,
  product: NewProduct,
): Promise<ProductDto> {
  return apiRequest<ProductDto>(withQuery(productPath(id), { expectedVersion }), {
    method: 'PUT',
    body: product,
  })
}

/** Archives a product. `DELETE` never erases: issued invoices keep naming it. */
export function archiveProduct(id: string, expectedVersion: number): Promise<ProductDto> {
  return apiRequest<ProductDto>(withQuery(productPath(id), { expectedVersion }), {
    method: 'DELETE',
  })
}

export async function searchProducts(path: string): Promise<Page<ProductDto>> {
  return fromSpringPage(await apiRequest<SpringPage<ProductDto>>(path))
}

export function createProduct(product: NewProduct): Promise<ProductDto> {
  return apiRequest<ProductDto>(PRODUCTS_PATH, { method: 'POST', body: product })
}

/**
 * `POST /v1/products/{id}/reactivate` (INCOME.md P.14): an archived product back on sale. Refused
 * while another active product holds its code, barcode or a variant code.
 */
export function reactivateProduct(id: string, expectedVersion: number): Promise<ProductDto> {
  return apiRequest<ProductDto>(withQuery(`${productPath(id)}/reactivate`, { expectedVersion }), {
    method: 'POST',
  })
}

/**
 * `PUT /v1/products/{id}/variants`: sizes, options, their combinations and add-ons in one call,
 * under the product's version (the item and its setup are one record). Answers the whole product.
 */
export function saveProductVariants(
  id: string,
  expectedVersion: number,
  body: ProductVariantsRequest,
): Promise<ProductDto> {
  return apiRequest<ProductDto>(withQuery(`${productPath(id)}/variants`, { expectedVersion }), {
    method: 'PUT',
    body,
  })
}
