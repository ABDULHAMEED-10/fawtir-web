import type { AddressContactValues } from './identity/onboarding'
import type { BusinessTypeId } from './subBusinessTypes'

export type BusinessSize = 'just-me' | '2-10' | '11-50' | '50-plus'
export type InvoicingMethod = 'paper' | 'spreadsheets' | 'accounting' | 'erp'

export const BUSINESS_SIZE_LABEL_KEYS: Record<BusinessSize, string> = {
  'just-me': 'aboutBusiness.size.justMe',
  '2-10': 'aboutBusiness.size.twoToTen',
  '11-50': 'aboutBusiness.size.elevenToFifty',
  '50-plus': 'aboutBusiness.size.fiftyPlus',
}

export const INVOICING_METHOD_LABEL_KEYS: Record<InvoicingMethod, string> = {
  paper: 'aboutBusiness.invoicing.paper',
  spreadsheets: 'aboutBusiness.invoicing.spreadsheets',
  accounting: 'aboutBusiness.invoicing.accounting',
  erp: 'aboutBusiness.invoicing.erp',
}

export const CATEGORY_LABEL_KEYS: Record<BusinessTypeId, string> = {
  'food-beverage': 'businessType.options.foodBeverage',
  automotive: 'businessType.options.automotive',
  retail: 'businessType.options.retail',
  'beauty-wellness': 'businessType.options.beautyWellness',
  healthcare: 'businessType.options.healthcare',
  hospitality: 'businessType.options.hospitality',
  education: 'businessType.options.education',
  professional: 'businessType.options.professional',
}

/**
 * The swatches the design draws, identified by the backend's `SignupInvoiceAccent` names so the
 * value saved is the value shown; the hex is presentation only.
 */
export const INVOICE_ACCENTS = [
  { id: 'BLUE', color: '#2C4EB7' },
  { id: 'GREEN', color: '#007D58' },
  { id: 'ORANGE', color: '#D43400' },
  { id: 'PURPLE', color: '#8635F6' },
  { id: 'RED', color: '#CA0005' },
  { id: 'NAVY', color: '#0A1032' },
] as const

export type InvoiceAccent = (typeof INVOICE_ACCENTS)[number]['id']

export function accentColor(accent: InvoiceAccent): string {
  return INVOICE_ACCENTS.find((option) => option.id === accent)?.color ?? INVOICE_ACCENTS[0].color
}

/** Up to two letters for the preview badge when there is no logo. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

/** What the left-hand invoice preview draws. */
export type InvoicePreviewData = {
  companyName: string
  crNumber: string
  vatin: string
  peppolId: string
  initials: string
  accentColor: string
  /** Data URL of the picked logo; the preview falls back to initials when absent. */
  logoUrl?: string | null
  addressLine?: string
  city?: string
  governorate?: string
  postalCode?: string
}

/** The first frame, before a form reports its values; the preview shows its own placeholders. */
export const EMPTY_PREVIEW: InvoicePreviewData = {
  companyName: '',
  crNumber: '',
  vatin: '',
  peppolId: '',
  initials: '',
  accentColor: INVOICE_ACCENTS[0].color,
}

/** What the invoice preview needs from the identity step, carried to the address step. */
export type IdentityPreview = {
  companyName: string
  crNumber: string
  vatin: string
  accent: InvoiceAccent
  /** A data URL, shown in the preview only — the backend has no anonymous logo upload. */
  logoUrl: string | null
}

/**
 * The answers carried between onboarding screens in router state, so Back restores a choice and
 * the preview can draw the header. The server holds the saved record; this is never read back as
 * truth, and nothing here is a credential.
 *
 * `businessType` / `subBusinessType` keep the screen names: the "Business Type" screen answers the
 * backend's business *category*, and "Sub Business Type" answers its business *type*.
 *
 * `address` holds the contact's phone and email, so it travels only as far as the review screen,
 * which exists to show them; submission sends none of the answers onward.
 */
export type OnboardingState = {
  businessSize?: BusinessSize
  invoicingMethod?: InvoicingMethod
  businessType?: BusinessTypeId
  subBusinessType?: string
  identity?: IdentityPreview
  address?: AddressContactValues
}

export function onboardingStateFrom(value: unknown): OnboardingState {
  return typeof value === 'object' && value !== null ? (value as OnboardingState) : {}
}
