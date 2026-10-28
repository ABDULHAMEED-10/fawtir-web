import { apiRequest } from '../client'
import { withQuery } from '../query'

/**
 * Bundles (`BundleController`, guide §3 "Several things"). A bundle is a product of item kind
 * `BUNDLE`: its `id` is that product's id, an invoice or till line cites it as `productId`, and its
 * branch prices and on/off come from the product's `branch-settings`. Its VAT and classification
 * are worked out from the parts; the client never sends them. `price` is always before VAT.
 */
export const BUNDLES_PATH = '/v1/bundles'

export type BundleStatus = 'ACTIVE' | 'ARCHIVED' | 'ALL'

export type BundleSplitReason = 'VAT_TREATMENTS_DIFFER' | 'CLASSIFICATIONS_DIFFER'

export type BundleUnavailableReason =
  'ARCHIVED' | 'NOT_SOLD_IN_BRANCH' | 'SWITCHED_OFF' | 'VARIANT_REMOVED'

export type BundlePartDto = {
  /** 1 is the first part. */
  position: number
  productId: string
  variantId: string | null
  code: string
  name: string
  quantity: number
  free: boolean
  /** What it sells for on its own in the branch asked about (else base), before VAT. */
  unitPrice: number
  taxCategory: string
  taxRate: number | null
  taxReasonCode: string | null
  goodsOrService: string | null
  /** Null without `branchId`. */
  counted: boolean | null
  onHand: number | null
  /** floor(onHand / quantity); null when not counted. */
  allows: number | null
}

/** Only with `branchId`. */
export type BundleAvailabilityDto = {
  branchId: string
  available: boolean
  /** Null: no part is counted, so it can always be made. 0 when anything below applies. */
  canBeMade: number | null
  limitedByProductId: string | null
  limitedByName: string | null
  unavailableBecause: {
    productId: string
    variantId: string | null
    name: string
    reason: BundleUnavailableReason
  }[]
}

export type BundleDto = {
  id: string
  code: string
  name: string
  nameAr: string | null
  description: string | null
  kindId: string | null
  groupId: string | null
  barcode: string | null
  unitCode: string
  basePrice: number
  /** In the branch asked about, else the base price; before VAT. */
  price: number
  /** The parts bought separately at the same prices; free parts count nothing. */
  partsValue: number
  /** partsValue less price; negative when the bundle costs more. */
  saving: number
  taxCategory: string
  taxRate: number | null
  showParts: boolean
  splitOnInvoice: boolean
  splitBecause: BundleSplitReason | null
  active: boolean
  version: number
  parts: BundlePartDto[]
  availability: BundleAvailabilityDto | null
}

export type BundlePartRequest = {
  productId: string
  /** Required for a product sold by size or option. */
  variantId?: string | null
  quantity: number
  free?: boolean
}

/** `BundleRequest`: 2 to 50 parts; no VAT or classification (worked out from the parts). */
export type BundleRequest = {
  code: string
  name: string
  nameAr?: string | null
  description?: string | null
  kindId?: string | null
  barcode?: string | null
  /** Before VAT, three decimals at most. */
  price: number
  unitCode?: string | null
  showParts?: boolean
  parts: BundlePartRequest[]
}

export const bundleListPath = (query: { branchId?: string | null; status?: BundleStatus } = {}) =>
  withQuery(BUNDLES_PATH, { branchId: query.branchId, status: query.status })

/** `GET /v1/bundles`: not paged (`content` only). */
export async function listBundles(path: string): Promise<BundleDto[]> {
  return (await apiRequest<{ content: BundleDto[] }>(path)).content ?? []
}

export const bundlePath = (id: string, branchId?: string | null) =>
  withQuery(`${BUNDLES_PATH}/${encodeURIComponent(id)}`, { branchId })

export function getBundle(path: string): Promise<BundleDto> {
  return apiRequest<BundleDto>(path)
}

export function createBundle(body: BundleRequest): Promise<BundleDto> {
  return apiRequest<BundleDto>(BUNDLES_PATH, { method: 'POST', body })
}

/** Replaces the fields and every part, under the product's version. */
export function updateBundle(
  id: string,
  expectedVersion: number,
  body: BundleRequest,
): Promise<BundleDto> {
  return apiRequest<BundleDto>(withQuery(bundlePath(id), { expectedVersion }), {
    method: 'PUT',
    body,
  })
}

/** Archives the bundle's product; never erases it, issued invoices name it. */
export function archiveBundle(id: string, expectedVersion: number): Promise<BundleDto> {
  return apiRequest<BundleDto>(withQuery(bundlePath(id), { expectedVersion }), {
    method: 'DELETE',
  })
}

export function reactivateBundle(id: string, expectedVersion: number): Promise<BundleDto> {
  return apiRequest<BundleDto>(withQuery(`${bundlePath(id)}/reactivate`, { expectedVersion }), {
    method: 'POST',
  })
}

/** One line of `BundleInvoiceLines`, shaped as a draft line without its number. */
export type BundleInvoiceLineDto = {
  productId: string
  variantId: string | null
  productCode: string
  description: string
  unitCode: string
  quantity: number
  unitPrice: number
  discount: { type: string; value: number } | null
  taxCategory: {
    code: string
    en16931Category?: string
    rate: number
    exemptionReason?: string | null
    exemptionReasonCode?: string | null
  }
  classification: {
    goodsOrService: string
    hsCode?: string | null
    serviceTypeCode?: string | null
  } | null
  /** Sent back on each part line of a split bundle, so the bundles report counts it. */
  bundleId: string | null
}

export type BundleInvoiceLinesDto = {
  bundleId: string
  branchId: string | null
  quantity: number
  /** One line per part when the parts' VAT or classification differ (VAT ER Art. 10, 12). */
  split: boolean
  splitBecause: BundleSplitReason | null
  lines: BundleInvoiceLineDto[]
}

export const bundleInvoiceLinesPath = (
  id: string,
  query: { branchId?: string | null; quantity?: number } = {},
) =>
  withQuery(`${BUNDLES_PATH}/${encodeURIComponent(id)}/invoice-lines`, {
    branchId: query.branchId,
    quantity: query.quantity,
  })

/**
 * `GET /v1/bundles/{id}/invoice-lines`: the lines a draft or till sale carries for a bundle. The
 * bundle screen previews them ("On the invoice").
 *
 * TODO(backend): INCOME.md BU.3. The invoice composer does not offer bundles yet; when it does it
 * must build a bundle's lines from this call (a mixed-VAT bundle sent as one line is refused,
 * `BUNDLE_SPLIT_REQUIRED`) and send each part line back with its `bundleId`.
 */
export function getBundleInvoiceLines(path: string): Promise<BundleInvoiceLinesDto> {
  return apiRequest<BundleInvoiceLinesDto>(path)
}

export type BundleReportRow = {
  bundleId: string
  code: string
  name: string
  active: boolean
  unitsSold: number
  /** Before VAT, net of credit notes. */
  revenue: number
  partsValue: number
  discountGiven: number
}

export type BundleReportDto = {
  from: string
  to: string
  branchId: string | null
  revenue: number
  discountGiven: number
  bundles: BundleReportRow[]
}

export const bundleReportPath = (
  query: { from?: string; to?: string; branchId?: string | null } = {},
) =>
  withQuery(`${BUNDLES_PATH}/report`, { from: query.from, to: query.to, branchId: query.branchId })

/** `GET /v1/bundles/report`: `reports.read` or `reports.sales.read`; the last 90 days by default. */
export function getBundleReport(path: string): Promise<BundleReportDto> {
  return apiRequest<BundleReportDto>(path)
}

/** The bundles report's permission: the same pair as the other sales reports. */
export const BUNDLE_REPORT_PERMISSIONS = ['reports.read', 'reports.sales.read'] as const
