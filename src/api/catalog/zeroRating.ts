import { apiRequest } from '../client'
import { withQuery } from '../query'
import { PRODUCTS_PATH } from './products'

/**
 * Zero-rating by HS code (INCOME.md Z.1, Z.7 to Z.15): Oman's zero-rated lists, each with its
 * dates, read from the published annexes (food, VATZR-OM-01; medicines and medical equipment and
 * veterinary, VATZR-OM-02). Nothing here changes anything: the server suggests and warns, the
 * person decides.
 */
export type ZeroRatingListKey = 'FOOD' | 'MEDICAL' | 'VETERINARY'

/** The warning codes the server names; the screen words them itself (Z.13). */
export type ZeroRatingWarningCode =
  | 'ZR_FOOD_NOT_LISTED'
  | 'ZR_FOOD_CHARGED_STANDARD'
  | 'ZR_MEDICAL_NOT_LISTED'
  | 'ZR_MEDICAL_CHARGED_STANDARD'

export type HsSuggestionDto = {
  hsCode: string
  judgedOn: string
  /** `Z` when the code is on a list in force on that date. */
  suggestedTaxCategory: 'Z' | null
  /** Null when none, or when the code is on lists with different reasons. */
  suggestedReasonCode: string | null
  suggestedReasonCodes: string[]
  matches: {
    listKey: ZeroRatingListKey
    reasonCode: string
    listId: string
    effectiveFrom: string
    effectiveTo: string | null
    decisionRef: string | null
    matchedCode: string
    matchedBy: 'EXACT' | 'FIRST_EIGHT_DIGITS'
  }[]
}

/** A product's warning after a save; non-blocking. */
export type ProductZeroRatingWarning = {
  code: ZeroRatingWarningCode
  severity: 'warning'
  hsCode: string | null
  reasonCode: string | null
  listKey: ZeroRatingListKey | null
  suggestedReasonCode: string | null
  effectiveFrom: string | null
  judgedOn: string
  /** English fallback only; the screen words the code. */
  message: string
}

/** The flag the re-check leaves on a stored product whose rate no longer matches its list. */
export type ZeroRatingAttentionDto = {
  code: ZeroRatingWarningCode
  hsCode: string | null
  listKey: ZeroRatingListKey | null
  listEffectiveFrom: string | null
  flaggedAt: string
}

/** One row of the "Wanting attention" re-check results. */
export type ZeroRatingAttentionRow = {
  productId: string
  productCode: string
  productName: string
  code: ZeroRatingWarningCode
  hsCode: string | null
  taxCategory: string
  reasonCode: string | null
  listKey: ZeroRatingListKey | null
  listEffectiveFrom: string | null
  judgedOn: string
  flaggedAt: string
}

export type ZeroRatingAttentionPage = {
  items: ZeroRatingAttentionRow[]
  page: number
  size: number
  total: number
}

/** An invoice line's warning (Z.11, Z.13), on a draft and on its preview. Non-blocking. */
export type InvoiceLineZeroRatingWarning = {
  line: number
  code: ZeroRatingWarningCode
  severity: 'warning'
  hsCode: string | null
  /** LINE: the line's own HS code; PRODUCT: the catalogue product's (a consumer line, Z.12). */
  hsCodeSource: 'LINE' | 'PRODUCT'
  reasonCode: string | null
  listKey: ZeroRatingListKey | null
  effectiveFrom: string | null
  judgedOn: string
  message: string
}

export const hsSuggestionPath = (hsCode: string, date?: string) =>
  withQuery('/v1/zero-rating/hs-suggestion', { hsCode, date })

/** `GET /v1/zero-rating/hs-suggestion`: whether a 12-digit HS code is zero-rated on that date. */
export function getHsSuggestion(hsCode: string, date?: string): Promise<HsSuggestionDto> {
  return apiRequest<HsSuggestionDto>(hsSuggestionPath(hsCode, date))
}

export const ZERO_RATING_ATTENTION_PATH = `${PRODUCTS_PATH}/zero-rating-attention`

export const zeroRatingAttentionPath = (size = 50, page = 0) =>
  withQuery(ZERO_RATING_ATTENTION_PATH, { page: page > 0 ? page : undefined, size })

/** `GET /v1/products/zero-rating-attention`: the products the re-check flagged. */
export function getZeroRatingAttention(path: string): Promise<ZeroRatingAttentionPage> {
  return apiRequest<ZeroRatingAttentionPage>(path)
}
