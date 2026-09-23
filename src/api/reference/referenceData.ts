import { apiRequest } from '../client'

/**
 * Platform-owned code lists (`ReferenceDataController`).
 *
 * These were front-end constants until 2026-09-23. They are not tenant data — EN 16931 tax
 * categories, UN/ECE Rec 20 units and UNCL4461 payment means are international code lists, and the
 * Omani rate is law.
 *
 * **The rate here is for display only.** Since the same change, the server derives a draft line's
 * rate from its `en16931Category` and ignores whatever the browser sends, so this list labels the
 * dropdown rather than deciding what anyone is charged.
 *
 * **No labels in the response.** Those live in the locale files keyed by code, so Arabic has one
 * home rather than two.
 */

export const REFERENCE_DATA_PATH = '/v1/reference-data'

export type TaxCategoryDto = {
  code: string
  en16931Category: 'S' | 'Z' | 'E' | 'AE' | 'G' | 'O'
  /** Percent, as a string: it is money, and a JSON number round-trips through a double. */
  rate: string
  exemptionReasonRequired: boolean
  active: boolean
}

export type UnitDto = { code: string; active: boolean }
/** `netDays` drives the composer's due date (INV-PD-005). */
export type PaymentTermDto = { code: string; netDays: number; active: boolean }
export type PaymentMethodDto = { code: string; active: boolean }

export type ReferenceDataDto = {
  taxCategories: TaxCategoryDto[]
  units: UnitDto[]
  paymentTerms: PaymentTermDto[]
  paymentMethods: PaymentMethodDto[]
}

export function loadReferenceData(): Promise<ReferenceDataDto> {
  return apiRequest<ReferenceDataDto>(REFERENCE_DATA_PATH)
}
