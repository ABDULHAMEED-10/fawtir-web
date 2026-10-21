import { apiRequest } from '../../api'

/**
 * The platform billing settings and the seller named on subscription bills (seller and VAT
 * contract, 14 Oct 2026). Both are append-only versioned records: every change sends `If-Match`
 * with the version read and a reason, so two operators editing at once cannot overwrite each
 * other silently.
 */
export const BILLING_SETTINGS_PATH = '/v1/platform/billing/settings'
export const BILLING_SELLER_PATH = '/v1/platform/billing/seller'
export const BILLING_SELLER_HISTORY_PATH = `${BILLING_SELLER_PATH}/history?limit=50`

export type BillingSettingsDto = {
  version: number
  graceDays: number
  /** OMR, three decimals ("50.000"). */
  dualApprovalThreshold: string
  currency: string
  reason: string
  createdBy: string
  createdAt: string
  /** A fraction ("0.05000"); "0.00000" means no VAT is charged. Null only on version 1. */
  vatRate: string | null
  /** Null only on version 1. */
  renewalBillLeadDays: number | null
  /**
   * V406 (backend #656): how many months of the monthly price one annual period of a paid extra
   * charges, 1 to 12. Null on versions before V406, read as the defaults
   * ({@link ANNUAL_MONTHS_DEFAULTS}); absent from an older server, which has no such setting.
   */
  erpAddonAnnualMonths?: number | null
  extraUserAnnualMonths?: number | null
  extraBranchAnnualMonths?: number | null
  /**
   * The numbers the business rules make console settings (backend V415). The current settings
   * always carry them, from the deployment until an operator sets one; an older server sends none.
   */
  maxExtraUsersPerOrder?: number | null
  maxExtraBranchesPerOrder?: number | null
  trialReminderLeadDays?: number | null
  /** Ascending, e.g. [1, 4, 7]. */
  graceReminderDays?: number[] | null
  /** Latest first, e.g. [7, 1]. */
  renewalReminderDays?: number[] | null
  correctionWindowDays?: number | null
  /** Card on or off in the console; card is offered only while the deployment has it on too. */
  cardPaymentsEnabled?: boolean | null
}

export const ANNUAL_MONTHS_FIELDS = [
  'erpAddonAnnualMonths',
  'extraUserAnnualMonths',
  'extraBranchAnnualMonths',
] as const
export type AnnualMonthsField = (typeof ANNUAL_MONTHS_FIELDS)[number]

/** What the server reads a null as: the add-on a full year, an extra user or branch ten months. */
export const ANNUAL_MONTHS_DEFAULTS: Readonly<Record<AnnualMonthsField, number>> = {
  erpAddonAnnualMonths: 12,
  extraUserAnnualMonths: 10,
  extraBranchAnnualMonths: 10,
}
export const ANNUAL_MONTHS_MIN = 1
export const ANNUAL_MONTHS_MAX = 12

/** Each console number is sent only when changed: omitted keeps the value in force. */
export type BillingSettingsRequest = {
  graceDays: number
  dualApprovalThreshold: string
  /** Omitted keeps the rate in force. */
  vatRate?: string
  renewalBillLeadDays?: number
  /** Omitted keeps the value in force (V406). */
  erpAddonAnnualMonths?: number
  extraUserAnnualMonths?: number
  extraBranchAnnualMonths?: number
  maxExtraUsersPerOrder?: number
  maxExtraBranchesPerOrder?: number
  trialReminderLeadDays?: number
  graceReminderDays?: number[]
  renewalReminderDays?: number[]
  correctionWindowDays?: number
  cardPaymentsEnabled?: boolean
  reason: string
}

/** The server's ranges for the console numbers (V415). */
export const MAX_PER_ORDER = 1000
/** The trial length (TR-1); a trial reminder can come at most the day after it starts. */
export const TRIAL_DAYS = 14
export const MAX_TRIAL_REMINDER_LEAD_DAYS = TRIAL_DAYS - 1
export const MAX_GRACE_REMINDER_DAY = 60
export const MAX_RENEWAL_REMINDER_DAY = 28
export const MAX_CORRECTION_WINDOW_DAYS = 180
/**
 * How long a payment link stays valid (business rules, console settings: "payment link validity,
 * 7 days today").
 * TODO(backend): the billing settings carry no validity yet, so the console shows this fixed value
 * read-only (docs/backend-guides/CONSOLE.md 4.1).
 */
export const PAYMENT_LINK_VALIDITY_DAYS = 7

export type BillingSellerDto = {
  version: number
  legalNameEn: string
  legalNameAr: string | null
  legalType: string | null
  crNumber: string
  taxIdentificationNumber: string | null
  /** Oman VATIN; null when the seller is not VAT registered. */
  vatNumber: string | null
  addressEn: string
  addressAr: string | null
  reason: string
  createdBy: string
  createdAt: string
}

export type BillingSellerRequest = Omit<BillingSellerDto, 'version' | 'createdBy' | 'createdAt'>

/**
 * The fewest and most extra documents one purchase may buy: a versioned record of its own
 * (`PlatformExtraDocumentsController`), read with `platform.billing.read` and changed with
 * `platform.billing.manage`, MFA, `If-Match` and a reason.
 */
export const EXTRA_DOCUMENT_SETTINGS_PATH = '/v1/platform/billing/extra-documents/settings'
export const EXTRA_DOCUMENT_SETTINGS_HISTORY_PATH = `${EXTRA_DOCUMENT_SETTINGS_PATH}/history?limit=50`
/** The server's ceiling for the maximum per purchase. */
export const MAX_PER_PURCHASE_CEILING = 1_000_000

export type ExtraDocumentSettingsDto = {
  id: string
  version: number
  minPerPurchase: number
  maxPerPurchase: number
  reason: string
  /** Null on the seeded first version. */
  createdBy: string | null
  createdAt: string
}

export type ExtraDocumentSettingsRequest = {
  minPerPurchase: number
  maxPerPurchase: number
  reason: string
}

const ifMatch = (version: number) => ({ 'If-Match': `"${version}"` })

export function saveBillingSettings(
  version: number,
  request: BillingSettingsRequest,
): Promise<BillingSettingsDto> {
  return apiRequest(BILLING_SETTINGS_PATH, {
    method: 'PUT',
    headers: ifMatch(version),
    body: request,
  })
}

/** `version` 0 when no seller exists yet, as the server expects for the first one. */
export function saveBillingSeller(
  version: number,
  request: BillingSellerRequest,
): Promise<BillingSellerDto> {
  return apiRequest(BILLING_SELLER_PATH, {
    method: 'PUT',
    headers: ifMatch(version),
    body: request,
  })
}

/**
 * "5" as "0.05000". Counted in thousandths of a percent, whole numbers only, because floating
 * point turns 5.1 % into 0.050999999. Expects a percent already checked by {@link isPercent}.
 */
export function percentToFraction(percent: string): string {
  const [whole, decimals = ''] = percent.trim().split('.')
  const scaled = Number(whole) * 1000 + Number(decimals.padEnd(3, '0'))
  const digits = String(scaled).padStart(6, '0')
  return `${digits.slice(0, -5)}.${digits.slice(-5)}`
}

/** "0.05000" as "5", the reverse of {@link percentToFraction}. */
export function fractionToPercent(fraction: string): string {
  const scaled = Math.round(Number(fraction) * 100_000)
  const rest = String(scaled % 1000)
    .padStart(3, '0')
    .replace(/0+$/, '')
  const whole = String(Math.floor(scaled / 1000))
  return rest ? `${whole}.${rest}` : whole
}

/** A rate the server accepts: below 100 %, at most three decimals (five as a fraction). */
export function isPercent(value: string): boolean {
  return /^\d{1,2}(\.\d{1,3})?$/.test(value.trim())
}

/** VAT is off exactly when the rate is zero; there is no separate flag to disagree with it. */
export function chargesVat(rate: string | null | undefined): boolean {
  return rate != null && Number(rate) > 0
}

export function saveExtraDocumentSettings(
  version: number,
  request: ExtraDocumentSettingsRequest,
): Promise<ExtraDocumentSettingsDto> {
  return apiRequest(EXTRA_DOCUMENT_SETTINGS_PATH, {
    method: 'PUT',
    headers: ifMatch(version),
    body: request,
  })
}
