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
}

export type NewProduct = {
  code: string
  name: string
  defaultUnitCode: string
  defaultUnitPrice: number
  defaultTaxCategory: string
  defaultTaxRate: number | null
}

/** Active products whose code or name contains `q`. Also the request's identity. */
export function productSearchPath(q: string, size = PRODUCT_PICKER_SIZE): string {
  return withQuery(PRODUCTS_PATH, { q: q.trim(), size })
}

export async function searchProducts(path: string): Promise<Page<ProductDto>> {
  return fromSpringPage(await apiRequest<SpringPage<ProductDto>>(path))
}

export function createProduct(product: NewProduct): Promise<ProductDto> {
  return apiRequest<ProductDto>(PRODUCTS_PATH, { method: 'POST', body: product })
}
