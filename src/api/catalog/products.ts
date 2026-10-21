import { apiRequest } from '../client'
import { fromSpringPage, type Page, type SpringPage } from '../page'
import { withQuery } from '../query'

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
  /*
   * TODO(backend): what an invoice line also needs from its product (owner, 21 Oct 2026); the
   * product record does not carry these yet (docs/backend-guides/INCOME.md, rows P.3 and P.4).
   * Each is optional, so a product without them fills a line as before.
   */
  /** VATZR-OM (Z) or VATEX-OM (E) code. */
  exemptionReasonCode?: string | null
  /** Written reason, for O. */
  exemptionReason?: string | null
  /** The catalogue discount, the line's starting discount. */
  defaultDiscount?: { type: 'PERCENTAGE' | 'FIXED_AMOUNT'; value: number } | null
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
}

/**
 * Active products whose code or name contains `q`. Also the request's identity.
 *
 * `page` is Spring's zero-based page. The first page leaves it out, so the path of every caller
 * that never pages stays what it was.
 */
export function productSearchPath(q: string, size = PRODUCT_PICKER_SIZE, page = 0): string {
  return withQuery(PRODUCTS_PATH, { q: q.trim(), size, page: page > 0 ? page : undefined })
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

/**
 * Archives a product. `DELETE` never erases: issued invoices keep naming it.
 * TODO(backend): there is no route to put an archived product back on sale (INCOME.md P.14).
 */
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
