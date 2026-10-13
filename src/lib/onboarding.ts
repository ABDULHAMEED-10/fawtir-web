import type { AddressContactValues, SignupStatusPlan } from './identity/onboarding'
import type { TFunction } from 'i18next'
import {
  isKnownPlanId,
  type BillingCycle,
  type PlanId,
  type SignupPaymentMethod,
} from './pricing'
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
  addressLine2?: string
  addressLine3?: string
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
  /** The ISIC code chosen on the identity step, so Back restores it and the review shows it. */
  industrialClassification: string
  accent: InvoiceAccent
  /** A data URL, shown in the preview only: the backend has no anonymous logo upload. */
  logoUrl: string | null
}

/**
 * The answers carried between onboarding screens in router state, so Back restores a choice and
 * the preview can draw the header. It is a cache: the server holds the saved record, and a page
 * opened without it (a new tab, a typed URL) refills it from `/signup/status` rather than trusting
 * anything kept in the browser. Nothing here is a credential.
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
  /**
   * Whether the registrant will use Fawtir POS. Only a POS user is asked the business type and
   * sub-type; `false` skips both screens and the backend stores no category or type.
   */
  usesPos?: boolean
  businessType?: BusinessTypeId
  subBusinessType?: string
  identity?: IdentityPreview
  address?: AddressContactValues
  /** The address the account was created with, carried from email verification. */
  accountEmail?: string
  /** Chosen on /plans. `premium` is the catalogue's Business plan. */
  plan?: PlanId
  billing?: BillingCycle
  /**
   * The plan's names as the catalogue published them, for a plan the app has no name of its own
   * for (one added in the console since the launch).
   */
  planNames?: { en: string; ar: string | null }
  /**
   * What the saved plan costs, exactly as `/signup/status` computed it from the pinned price
   * version. Cleared whenever the plan or cycle is chosen again, so a figure for an earlier choice
   * is never shown against a new one.
   */
  planTerms?: SignupStatusPlan
  /** The automatic ERP extraction add-on, ticked on /payment. */
  addon?: boolean
  /**
   * Chosen on /payment (V287): a free trial, or paying with the application. Undefined until chosen, and
   * for a preference saved before the choice existed; never set for Enterprise.
   */
  enrollment?: 'trial' | 'payNow'
  /** Chosen on /payment for `payNow` only; never set for a trial or for Enterprise. */
  paymentMethod?: SignupPaymentMethod
  /**
   * Set when this state was refilled from `/signup/status`, so the gate renders the page instead
   * of asking again: a draft with nothing saved yet would otherwise never look "ready".
   */
  restored?: boolean
}

export function onboardingStateFrom(value: unknown): OnboardingState {
  return typeof value === 'object' && value !== null ? (value as OnboardingState) : {}
}

/**
 * The chosen plan's name: the app's own for a launch plan, else the catalogue's as carried from
 * /plans, else its code. The code is the last resort, for a plan restored in a fresh tab that
 * the app has no name for; showing it is better than a wrong name.
 */
export function planDisplayName(t: TFunction, state: OnboardingState, language: string): string {
  const { plan, planNames } = state
  if (!plan) return ''
  if (isKnownPlanId(plan)) return t(`plans.${plan}.name`)
  return (language.startsWith('ar') ? planNames?.ar : null) || planNames?.en || plan
}
