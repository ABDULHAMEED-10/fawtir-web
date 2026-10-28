import { apiRequest } from '../client'
import { withQuery } from '../query'
import { productPath } from './products'

/**
 * A product's per-branch settings (Business Rules BA-3, INCOME.md P.9): one product for the whole
 * company, sold in every branch or only in chosen ones, with an optional price before VAT and an
 * on/off per branch. Name, code, VAT, its reason, the HS code and the unit are never per branch.
 */
export type BranchAvailability = 'ALL_BRANCHES' | 'CHOSEN_BRANCHES'

export type ProductBranchRow = {
  branchId: string
  branchCode: string
  branchName: string
  /** False for a closed branch, which cannot be chosen. */
  branchActive: boolean
  soldHere: boolean
  /** Before VAT; null = the base price. */
  branchPrice: number | null
  /** False when switched off in this branch. */
  onSale: boolean
  effectivePrice: number
}

export type ProductBranchSettingsDto = {
  productId: string
  availability: BranchAvailability
  /** Chosen branches; [] under ALL_BRANCHES. Only the branches the caller can see. */
  branchIds: string[]
  /** 0 = never saved; sent back as `expectedVersion`. */
  version: number
  basePrice: number
  /** Every branch the caller can see, closed ones flagged. */
  branches: ProductBranchRow[]
}

export type ProductBranchSettingsRequest = {
  availability: BranchAvailability
  /** Required for CHOSEN_BRANCHES; left out for ALL_BRANCHES. */
  branchIds?: string[]
  /** Each entry upserts that branch; unlisted branches keep what they have. */
  branches?: { branchId: string; branchPrice: number | null; onSale: boolean }[]
}

export const branchSettingsPath = (productId: string) => `${productPath(productId)}/branch-settings`

/** `GET /v1/products/{id}/branch-settings` (`product.read`); archived products are readable. */
export function getBranchSettings(productId: string): Promise<ProductBranchSettingsDto> {
  return apiRequest<ProductBranchSettingsDto>(branchSettingsPath(productId))
}

/**
 * `PUT` with the version read (0 for a product never set). A branch the caller is not assigned
 * to, or a staff member changing `availability`, is refused with 403 `branch-not-in-scope`.
 */
export function saveBranchSettings(
  productId: string,
  expectedVersion: number,
  body: ProductBranchSettingsRequest,
): Promise<ProductBranchSettingsDto> {
  return apiRequest<ProductBranchSettingsDto>(
    withQuery(branchSettingsPath(productId), { expectedVersion }),
    { method: 'PUT', body },
  )
}
