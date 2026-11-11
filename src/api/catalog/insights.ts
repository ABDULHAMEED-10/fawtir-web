import { apiRequest } from '../client'
import { withQuery } from '../query'
import { productPath } from './products'

/**
 * One item's three read-only pages (`ProductInsightsController`, guide §6): how it sells, where it
 * is used and its history. Each needs `product.read` and covers only the caller's branches (BA-1).
 * The screens keep their own URLs (`/sells`, `/used`, `/changes`); the API names them `/sales`,
 * `/usage` and `/history`.
 */

/** `ProductSalesFigures`: units, revenue before VAT, and how many issued invoices named the item. */
export type ProductSalesFigures = { units: number; revenue: number; sales: number }

export type ProductSalesInterval = 'DAY' | 'WEEK' | 'MONTH'

export type ProductSalesBucket = {
  /** The first day of the bucket (ISO week from Monday, month from the 1st). */
  start: string
  units: number
  revenue: number
  sales: number
  tillUnits: number
  invoiceUnits: number
}

/** `ProductSalesResponse`: issued invoices only (a till sale is an invoice), net of credit notes. */
export type ProductSalesDto = {
  productId: string
  from: string
  to: string
  interval: ProductSalesInterval
  branchId: string | null
  currency: string
  total: ProductSalesFigures
  /** revenue / units, before VAT; null when nothing sold. */
  averagePrice: number | null
  /** Given back on credit notes in the period (already netted out of `total`). */
  returnedUnits: number
  returnedRevenue: number
  till: ProductSalesFigures
  invoice: ProductSalesFigures
  series: ProductSalesBucket[]
  /** By size or option; `variantId` null is the item sold as itself. */
  variants: {
    variantId: string | null
    code: string | null
    name: string | null
    units: number
    revenue: number
  }[]
  addOns: { addOnId: string | null; name: string | null; quantity: number; revenue: number }[]
}

export type ProductSalesQuery = {
  from?: string
  to?: string
  interval?: ProductSalesInterval
  branchId?: string | null
  currency?: string
}

export const productSalesPath = (id: string, query: ProductSalesQuery = {}) =>
  withQuery(`${productPath(id)}/sales`, {
    from: query.from,
    to: query.to,
    interval: query.interval,
    branchId: query.branchId,
    currency: query.currency,
  })

/** `GET /v1/products/{id}/sales`. 400 PRODUCT_SALES_PERIOD_INVALID / PRODUCT_SALES_CURRENCY_INVALID. */
export function getProductSales(path: string): Promise<ProductSalesDto> {
  return apiRequest<ProductSalesDto>(path)
}

export const USAGE_KINDS = [
  'INVOICE',
  'TILL_SALE',
  'CREDIT_NOTE',
  'DEBIT_NOTE',
  'QUOTATION',
  'ORDER_FORM',
  'DELIVERY_NOTE',
  'PERIODIC',
] as const

export type UsageKind = (typeof USAGE_KINDS)[number]

export type ProductUsageRow = {
  kind: UsageKind
  documentId: string
  number: string | null
  date: string
  state: string
  customerId: string | null
  customerName: string | null
  branchId: string | null
  /** The item's lines on the document, before VAT. */
  quantity: number
  lineValue: number
  currency: string
}

/** `ProductUsagePage`: newest first; drafts included, discarded documents left out. */
export type ProductUsagePageDto = {
  content: ProductUsageRow[]
  page: number
  size: number
  /** Counts the kinds asked for. */
  totalElements: number
  /** Every kind's count, whatever kind was asked for: the tabs read it. */
  counts: Partial<Record<UsageKind, number>>
}

/** `kind` repeats (`kind=INVOICE&kind=QUOTATION`); none means every kind. */
export function productUsagePath(
  id: string,
  query: { kinds?: readonly UsageKind[]; page?: number; size?: number } = {},
): string {
  const params = new URLSearchParams()
  for (const kind of query.kinds ?? []) params.append('kind', kind)
  if (query.page && query.page > 0) params.set('page', String(query.page))
  if (query.size) params.set('size', String(query.size))
  const text = params.toString()
  return `${productPath(id)}/usage${text ? `?${text}` : ''}`
}

/** `GET /v1/products/{id}/usage`. */
export function getProductUsage(path: string): Promise<ProductUsagePageDto> {
  return apiRequest<ProductUsagePageDto>(path)
}

export type HistoryCategory =
  'CREATED' | 'DETAILS' | 'PRICE' | 'TAX' | 'SIZES' | 'BRANCHES' | 'STATUS'

/** One field that moved. A per-branch change names its branch; an empty side is null. */
export type ProductHistoryChange = {
  field: string
  branchId: string | null
  branchName: string | null
  from: string | null
  to: string | null
}

export type ProductHistoryEntry = {
  id: string
  occurredAt: string
  /** The audit event: ProductCreated, ProductUpdated, ProductArchived, ProductReactivated, ProductVariantsChanged, ProductBranchSettingsChanged. */
  action: string
  categories: HistoryCategory[]
  actorId: string | null
  actorType: string | null
  actorName: string | null
  changes: ProductHistoryChange[]
}

/** `ProductHistoryPage`: newest first, paged by `hasMore` (no total). */
export type ProductHistoryPageDto = {
  content: ProductHistoryEntry[]
  page: number
  size: number
  hasMore: boolean
  /** From the product row, for an item made before its history was recorded. */
  productCreatedAt: string | null
  productCreatedBy: string | null
  productCreatedByName: string | null
}

export const productHistoryPath = (id: string, query: { page?: number; size?: number } = {}) =>
  withQuery(`${productPath(id)}/history`, {
    page: query.page && query.page > 0 ? query.page : undefined,
    size: query.size,
  })

/** `GET /v1/products/{id}/history`. */
export function getProductHistory(path: string): Promise<ProductHistoryPageDto> {
  return apiRequest<ProductHistoryPageDto>(path)
}
