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
  active: boolean
  version: number
  /*
   * TODO(backend): what an invoice line also needs from its product (owner, 21 Oct 2026); the
   * product record does not carry these yet (docs/backend-guides/INCOME.md, rows P.1 to P.4).
   * Each is optional, so a product without them fills a line as before.
   */
  /** Goods or service; the unit decides when it is absent. */
  itemType?: 'GOODS' | 'SERVICE'
  /** 12-digit Oman HS code of goods (IBR-079-OM). */
  hsCode?: string | null
  /** CL-12-OM service type of a service (IBR-155-OM). */
  serviceTypeCode?: string | null
  /** VATZR-OM (Z) or VATEX-OM (E) code. */
  exemptionReasonCode?: string | null
  /** Written reason, for O. */
  exemptionReason?: string | null
  /** The catalogue discount, the line's starting discount. */
  defaultDiscount?: { type: 'PERCENTAGE' | 'FIXED_AMOUNT'; value: number } | null
}

export type NewProduct = {
  code: string
  name: string
  defaultUnitCode: string
  defaultUnitPrice: number
  defaultTaxCategory: string
  defaultTaxRate: number | null
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

export async function searchProducts(path: string): Promise<Page<ProductDto>> {
  return fromSpringPage(await apiRequest<SpringPage<ProductDto>>(path))
}

export function createProduct(product: NewProduct): Promise<ProductDto> {
  return apiRequest<ProductDto>(PRODUCTS_PATH, { method: 'POST', body: product })
}
