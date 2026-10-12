import { apiRequest } from '../../api'
import type { ServerFieldMap } from './errors'
import { GOVERNORATE_NAMES, type GovernorateId } from '../governorates'
import type { BusinessSize, InvoiceAccent, InvoicingMethod } from '../onboarding'
import {
  isKnownPlanId,
  type BillingCycle,
  type KnownPlanId,
  type PlanId,
  type SignupPaymentMethod,
} from '../pricing'
import type { BusinessTypeId } from '../subBusinessTypes'
import {
  email,
  omanPhone,
  postalCode,
  required,
  toOmanE164,
  vatin,
  type FieldError,
} from '../validation'

/** `SignupBusinessSize`, `SignupInvoicingMethod`, `SignupBusinessCategory`, `SignupBusinessType`. */
export type SignupBusinessSize = 'JUST_ME' | 'PEOPLE_2_TO_10' | 'PEOPLE_11_TO_50' | 'PEOPLE_50_PLUS'
export type SignupInvoicingMethod =
  | 'PAPER_OR_MANUAL'
  | 'SPREADSHEETS'
  | 'ACCOUNTING_SOFTWARE'
  | 'FULL_ERP_SYSTEM'
export type SignupBusinessCategory = 'FOOD_AND_BEVERAGE'
export type SignupBusinessType =
  | 'COFFEE_SHOP'
  | 'RESTAURANT'
  | 'BAKERY'
  | 'FAST_FOOD'
  | 'JUICE_BAR'
  | 'DESSERT_SHOP'
  | 'CATERING'

export const BUSINESS_SIZE: Record<BusinessSize, SignupBusinessSize> = {
  'just-me': 'JUST_ME',
  '2-10': 'PEOPLE_2_TO_10',
  '11-50': 'PEOPLE_11_TO_50',
  '50-plus': 'PEOPLE_50_PLUS',
}

export const INVOICING_METHOD: Record<InvoicingMethod, SignupInvoicingMethod> = {
  paper: 'PAPER_OR_MANUAL',
  spreadsheets: 'SPREADSHEETS',
  accounting: 'ACCOUNTING_SOFTWARE',
  erp: 'FULL_ERP_SYSTEM',
}

/**
 * Only Food & Beverage can be registered. `SignupBusinessCategory` defines exactly that one
 * member, deliberately — its Javadoc: inventing siblings would put unapproved options in front of
 * a tenant. The design's other seven categories stay on screen and are refused on Continue
 * rather than mapped onto the wrong category or sent as a name the enum would reject.
 */
const BUSINESS_CATEGORY = new Map<BusinessTypeId, SignupBusinessCategory>([
  ['food-beverage', 'FOOD_AND_BEVERAGE'],
])

/** The category → type matrix is the backend's; these are the seven types it permits for F&B. */
const BUSINESS_TYPE = new Map<string, SignupBusinessType>([
  ['coffee-shop', 'COFFEE_SHOP'],
  ['restaurant', 'RESTAURANT'],
  ['bakery', 'BAKERY'],
  ['fast-food', 'FAST_FOOD'],
  ['juice-bar', 'JUICE_BAR'],
  ['dessert-shop', 'DESSERT_SHOP'],
  ['catering', 'CATERING'],
])

export function backendCategoryFor(category: BusinessTypeId): SignupBusinessCategory | undefined {
  return BUSINESS_CATEGORY.get(category)
}

export function backendTypeFor(subBusinessType: string): SignupBusinessType | undefined {
  return BUSINESS_TYPE.get(subBusinessType)
}

const keyFor = <K, V>(map: ReadonlyMap<K, V>, value: V | null | undefined): K | undefined =>
  [...map].find(([, mapped]) => mapped === value)?.[0]

/** The screen ids for a saved category and type, for a page restored from the status read. */
export const categoryIdFor = (category: SignupBusinessCategory | null | undefined) =>
  keyFor(BUSINESS_CATEGORY, category)
export const subTypeIdFor = (type: SignupBusinessType | null | undefined) =>
  keyFor(BUSINESS_TYPE, type)

/**
 * The category whose trades the sub-type screen lists: the chosen one when it can be registered,
 * otherwise the one that can. A registrant reaches that screen only after a category was saved,
 * and only a registrable category can be.
 */
export function registrableCategory(chosen: BusinessTypeId | undefined): BusinessTypeId {
  if (chosen && BUSINESS_CATEGORY.has(chosen)) return chosen
  const [first] = BUSINESS_CATEGORY.keys()
  return first
}

/** `SelfServiceSignupService.toStatus` — the server, not the client, orders the steps. */
export type SignupStage =
  | 'BUSINESS_PROFILE'
  | 'BUSINESS_CATEGORY'
  | 'BUSINESS_TYPE'
  | 'BUSINESS_IDENTITY'
  | 'ADDRESS_CONTACT'
  | 'PLAN'
  | 'PAYMENT'
  | 'READY_FOR_SUBMISSION'
  | 'UNDER_REVIEW'
  | 'ACTIVATED'
  | 'REJECTED'

/**
 * Phase A contract §1: a catalogue code, or ENTERPRISE, which is not a catalogue row. The
 * catalogue is edited in the console (catalogue contract §11), so any published code can arrive.
 */
export type SignupPlanCode = 'STARTER' | 'BUSINESS' | 'BUSINESS_PLUS' | 'ENTERPRISE' | (string & {})
export type SignupBillingCycle = 'MONTHLY' | 'ANNUAL'
export type SignupPaymentMethodCode = 'CARD_LINK' | 'BANK_TRANSFER' | 'CASH'
export type SignupLinkChannel = 'EMAIL' | 'WHATSAPP'
/** V283: a free trial, or paying from approval. Neither charges anything at signup. */
export type SignupEnrollmentCode = 'TRIAL' | 'PAY_NOW'

/**
 * The saved answers the status read returns (Phase A contract §4), so a reload or a new tab shows
 * them instead of "Saved earlier". Every member may be absent: an older server sends none, and a
 * step not yet saved has nothing to return.
 */
export type SignupDraft = {
  businessProfile?: {
    businessSize?: SignupBusinessSize | null
    invoicingMethod?: SignupInvoicingMethod | null
    usesPos?: boolean | null
  } | null
  businessCategory?: SignupBusinessCategory | null
  businessType?: SignupBusinessType | null
  businessIdentity?: Record<string, unknown> | null
  addressContact?: Record<string, unknown> | null
}

/**
 * The saved plan, and what it costs, as the backend computed it from the price version the draft
 * is pinned to (catalogue contract §10). Amounts are OMR strings with three decimals and are
 * shown as they arrive: the screens do no price arithmetic of their own. Every amount is absent
 * from an older server and `null` for Enterprise, which is quoted.
 */
export type SignupStatusPlan = {
  planCode: SignupPlanCode
  billingCycle: SignupBillingCycle | null
  priceVersionId?: string | null
  currency?: string | null
  monthlyPrice?: string | null
  annualPrice?: string | null
  amountExclVat?: string | null
  /** The backend sends a fraction (`"0.05"`); a percentage (`"5"`) is read the same way. */
  vatRate?: string | null
  vatAmount?: string | null
  amountInclVat?: string | null
  trialDays?: number | null
}

export type SignupStatusResponse = {
  stage: SignupStage
  businessProfileComplete: boolean
  businessCategoryComplete: boolean
  businessTypeComplete: boolean
  businessIdentityComplete: boolean
  addressContactComplete: boolean
  submitted: boolean
  verificationStatus: string | null
  loginEnabled: boolean
  planComplete?: boolean
  paymentPreferenceComplete?: boolean
  plan?: SignupStatusPlan | null
  paymentPreference?: {
    /** `null` on a preference saved before the choice existed: the step then reads incomplete. */
    enrollment?: SignupEnrollmentCode | null
    /** `null` for a trial. */
    method: SignupPaymentMethodCode | null
    linkChannel: SignupLinkChannel | null
    erpExtractionAddon: boolean
  } | null
  /** The registrant's own email (ONBOARDING.md row 1.8). */
  accountEmail?: string | null
  draft?: SignupDraft | null
}

/**
 * The step screens in order. Size and invoicing never decide the route; only "Will you use
 * Fawtir POS?" does: without POS the backend stores no category or type (Phase A contract §5),
 * so the two trade screens are skipped.
 */
export const ONBOARDING_ROUTES = [
  '/about-business',
  '/business-type',
  '/sub-business-type',
  '/business-identity',
  '/address-contact',
] as const

/**
 * The plan and how the first bill will be paid, chosen after the address and before review
 * (owner decision, 8 Oct 2026). Nothing is charged here: the trial starts on approval and the
 * first bill goes out when it ends. Both choices are saved on the draft (ONBOARDING.md rows 1.2
 * and 1.3, Phase A contract §1-§2).
 */
export const PLANS_ROUTE = '/plans'
export const PAYMENT_ROUTE = '/payment'
/** Where the registrant checks every answer and submits. */
export const REVIEW_ROUTE = '/signup-review'
/** Where a submitted registration waits for the human decision. */
export const PENDING_ROUTE = '/signup-pending'

const FLOW_ROUTES: readonly string[] = [
  ...ONBOARDING_ROUTES,
  PLANS_ROUTE,
  PAYMENT_ROUTE,
  REVIEW_ROUTE,
]

export const ROUTE_FOR_STAGE: Record<SignupStage, string> = {
  BUSINESS_PROFILE: ONBOARDING_ROUTES[0],
  BUSINESS_CATEGORY: ONBOARDING_ROUTES[1],
  BUSINESS_TYPE: ONBOARDING_ROUTES[2],
  BUSINESS_IDENTITY: ONBOARDING_ROUTES[3],
  ADDRESS_CONTACT: ONBOARDING_ROUTES[4],
  PLAN: PLANS_ROUTE,
  PAYMENT: PAYMENT_ROUTE,
  READY_FOR_SUBMISSION: REVIEW_ROUTE,
  UNDER_REVIEW: PENDING_ROUTE,
  ACTIVATED: PENDING_ROUTE,
  REJECTED: PENDING_ROUTE,
}

/**
 * Stages in which the draft is with a reviewer. A rejection that reopens the draft reports
 * `READY_FOR_SUBMISSION` again, so it lands back on review rather than here.
 */
export function isSubmittedStage(stage: SignupStage): boolean {
  return ROUTE_FOR_STAGE[stage] === PENDING_ROUTE
}

/**
 * The page a registrant at `stage` may see when asking for `requested`: the requested page if
 * every step before it is saved — steps stay revisable until submission — otherwise the first
 * unsaved one. Once submitted, only the waiting screen: the backend guide closes the pages while
 * a reviewer holds the draft.
 */
export function allowedRoute(stage: SignupStage, requested: string): string {
  const next = ROUTE_FOR_STAGE[stage]
  if (isSubmittedStage(stage)) return next
  const index = FLOW_ROUTES.indexOf(requested)
  return index !== -1 && index <= FLOW_ROUTES.indexOf(next) ? requested : next
}

const post = (path: string, body: object, signal?: AbortSignal) =>
  apiRequest<void>(path, { method: 'POST', body, signal, credentials: 'omit' })

export function readSignupStatus(onboardingToken: string): Promise<SignupStatusResponse> {
  // POST so the bearer token travels in the body, never a URL (backend SignupController).
  return apiRequest<SignupStatusResponse>('/v1/auth/signup/status', {
    method: 'POST',
    body: { onboardingToken },
    credentials: 'omit',
  })
}

/**
 * Hands the draft to a human reviewer. `204` means received, not approved — the decision arrives
 * by email. Refused with `409` for a missing step, a second submission, or a VATIN/CR that a
 * company reached first: identifiers only become unique at this moment.
 */
export function submitForReview(onboardingToken: string, signal?: AbortSignal): Promise<void> {
  return post('/v1/auth/signup/final-submission', { onboardingToken }, signal)
}

/**
 * The `409` problem types Phase A adds (contract §2-§3). Each names what is missing, so the screen
 * can say it rather than fall back to the generic conflict.
 */
export const SIGNUP_PLAN_REQUIRED = 'signup-plan-required'
export const SIGNUP_PAYMENT_PREFERENCE_REQUIRED = 'signup-payment-preference-required'
export const SIGNUP_PAYMENT_NOT_APPLICABLE = 'signup-payment-not-applicable'
/** A free trial was asked for on a plan that has none (also re-checked at submission). */
export const SIGNUP_TRIAL_NOT_OFFERED = 'signup-trial-not-offered'
/**
 * The `priceVersionId` sent with the plan is no longer the plan's current version (catalogue
 * contract §10): the price changed while the screen was open, so nothing was saved.
 */
export const PLAN_PRICE_CHANGED = 'plan-price-changed'

/** The sign-up flow's launch plan ids against the contract's codes; `premium` is Business. */
export const PLAN_CODE: Record<KnownPlanId, SignupPlanCode> = {
  starter: 'STARTER',
  premium: 'BUSINESS',
  businessPlus: 'BUSINESS_PLUS',
  enterprise: 'ENTERPRISE',
}

/** The code to send for a sign-up plan: a plan published since the launch is its own code. */
export const planCodeFor = (plan: PlanId): SignupPlanCode =>
  isKnownPlanId(plan) ? PLAN_CODE[plan] : plan

/** The sign-up plan id for a backend code; the inverse of {@link planCodeFor}. */
export function planIdFor(code: SignupPlanCode): PlanId {
  const known = (Object.keys(PLAN_CODE) as KnownPlanId[]).find((id) => PLAN_CODE[id] === code)
  return known ?? code
}
export const BILLING_CYCLE: Record<BillingCycle, SignupBillingCycle> = {
  monthly: 'MONTHLY',
  annual: 'ANNUAL',
}
export const PAYMENT_METHOD_CODE: Record<SignupPaymentMethod, SignupPaymentMethodCode> = {
  cardLink: 'CARD_LINK',
  bankTransfer: 'BANK_TRANSFER',
  cash: 'CASH',
}

/**
 * @param priceVersionId the catalogue version the screen showed, so the server refuses the choice
 *        (`plan-price-changed`) instead of recording a price the registrant never saw. Never sent
 *        for Enterprise, which has no catalogue price.
 */
export function buildPlanRequest(plan: PlanId, billing: BillingCycle, priceVersionId?: string) {
  // The contract refuses a billing cycle on Enterprise: its terms are agreed on a call.
  return {
    planCode: planCodeFor(plan),
    billingCycle: plan === 'enterprise' ? null : BILLING_CYCLE[billing],
    ...(plan !== 'enterprise' && priceVersionId ? { priceVersionId } : {}),
  }
}

/** Records the choice only; nothing is subscribed or charged (contract §1). */
export function recordPlan(
  onboardingToken: string,
  plan: PlanId,
  billing: BillingCycle,
  signal?: AbortSignal,
  priceVersionId?: string,
): Promise<void> {
  return post(
    '/v1/auth/signup/plan',
    { onboardingToken, ...buildPlanRequest(plan, billing, priceVersionId) },
    signal,
  )
}

/**
 * A trial or a paid start, as the payment screen decided it. The union makes "trial with a method"
 * and "pay now without one" unrepresentable here; the server refuses both too (V283).
 */
export type EnrollmentChoice =
  | { enrollment: 'trial' }
  | { enrollment: 'payNow'; method: SignupPaymentMethod }

export function buildPaymentPreferenceRequest(choice: EnrollmentChoice, addon: boolean) {
  // No link channel: the owner removed the email/WhatsApp link choice (11 Oct 2026), and the
  // server no longer requires one for a card.
  return choice.enrollment === 'trial'
    ? { enrollment: 'TRIAL' as const, method: null, erpExtractionAddon: addon }
    : {
        enrollment: 'PAY_NOW' as const,
        method: PAYMENT_METHOD_CODE[choice.method],
        erpExtractionAddon: addon,
      }
}

export function recordPaymentPreference(
  onboardingToken: string,
  choice: EnrollmentChoice,
  addon: boolean,
  signal?: AbortSignal,
): Promise<void> {
  return post(
    '/v1/auth/signup/payment-preference',
    { onboardingToken, ...buildPaymentPreferenceRequest(choice, addon) },
    signal,
  )
}

export type SignupBankTransferStatus =
  | 'AVAILABLE'
  | 'NOT_OFFERED'
  | 'NO_ACCOUNT'
  | 'STORAGE_UNAVAILABLE'

/**
 * Which methods can be chosen, from the server: bank transfer only with a confirmed ACTIVE account,
 * card only with a configured provider. Replaces the static `bankBeneficiaryVerified` flag.
 */
export type SignupPaymentOptions = {
  bankTransfer: boolean
  bankTransferStatus: SignupBankTransferStatus
  cash: boolean
  card: boolean
  beneficiary: { legalName: string; bankName: string; iban: string; swiftCode: string | null } | null
}

export function readPaymentOptions(
  onboardingToken: string,
  signal?: AbortSignal,
): Promise<SignupPaymentOptions> {
  // POST so the bearer token travels in the body, never a URL (backend SignupController).
  return apiRequest<SignupPaymentOptions>('/v1/auth/signup/payment-options', {
    method: 'POST',
    body: { onboardingToken },
    signal,
    credentials: 'omit',
  })
}

/**
 * `usesPos` is always sent. Without POS the backend stores no business category or type and does
 * not require them (Phase A contract §5); a placeholder category and type used to be posted here
 * instead, which put an invented trade on a real registration.
 */
export function recordBusinessProfile(
  onboardingToken: string,
  size: BusinessSize,
  method: InvoicingMethod,
  usesPos: boolean,
  signal?: AbortSignal,
): Promise<void> {
  return post(
    '/v1/auth/signup/business-profile',
    {
      onboardingToken,
      businessSize: BUSINESS_SIZE[size],
      invoicingMethod: INVOICING_METHOD[method],
      usesPos,
    },
    signal,
  )
}

export function recordBusinessCategory(
  onboardingToken: string,
  businessCategory: SignupBusinessCategory,
  signal?: AbortSignal,
): Promise<void> {
  return post('/v1/auth/signup/business-category', { onboardingToken, businessCategory }, signal)
}

export function recordBusinessType(
  onboardingToken: string,
  businessType: SignupBusinessType,
  signal?: AbortSignal,
): Promise<void> {
  return post('/v1/auth/signup/business-type', { onboardingToken, businessType }, signal)
}

export type BusinessIdentityValues = {
  companyName: string
  crNumber: string
  vatin: string
  /** ISIC Rev. 4, Oman 6-digit code (IBR-081-OM): what the registered business does. */
  industrialClassification: string
  accent: InvoiceAccent
}

export type BusinessIdentityField =
  | 'companyName'
  | 'crNumber'
  | 'industrialClassification'
  | 'vatin'
export const BUSINESS_IDENTITY_FIELD_ORDER: readonly BusinessIdentityField[] = [
  'companyName',
  'crNumber',
  'industrialClassification',
  'vatin',
]

/** `SignupBusinessIdentityRequest` minus the token. `logoObjectReference` is omitted: see below. */
export type BusinessIdentityRequest = {
  legalCompanyName: string
  commercialRegistrationNumber: string
  taxNumber: string
  invoiceAccent: InvoiceAccent
  /** BTOM-033, optional: the six-digit ISIC code of what the business does. Left out when skipped. */
  industrialClassificationCode?: string
}

const LEGAL_NAME_MAX_LENGTH = 255
/**
 * Length only. `SelfServiceSignupService.requireCommercialRegistration` withdrew the numeric
 * grammar — the SRS marks its source illustrative and it was reverted twice — so a stricter
 * client rule (the shared 7-digit `crNumber`) would refuse registrants the server accepts.
 */
const CR_MAX_LENGTH = 20

export function validateBusinessIdentity(
  values: BusinessIdentityValues,
): Partial<Record<BusinessIdentityField, FieldError>> {
  const tooLong = (value: string, max: number) =>
    value.trim().length > max ? 'validation.tooLong' : undefined
  return {
    companyName: required(values.companyName) ?? tooLong(values.companyName, LEGAL_NAME_MAX_LENGTH),
    crNumber: required(values.crNumber) ?? tooLong(values.crNumber, CR_MAX_LENGTH),
    // Skippable: issuing does not depend on it, only the Tax Authority submission does, and the
    // company can set it later in Settings › Company (Abdul Hameed, 2026-09-26).
    industrialClassification: undefined,
    vatin: vatin(values.vatin),
  }
}

/**
 * Upper-cased as the server stores them, so what the preview shows is what is saved. No
 * `logoObjectReference`: the only upload routes are the authenticated customer and company-profile
 * ones, so an anonymous registrant cannot mint a reference, and sending a made-up one would point
 * the tenant's logo at nothing.
 */
export function buildBusinessIdentityRequest(
  values: BusinessIdentityValues,
): BusinessIdentityRequest {
  // The business activity is optional: sent only when one was chosen, and stored on the company's
  // settings when the registration is submitted (backend `feat/signup-business-activity`).
  return {
    legalCompanyName: values.companyName.trim(),
    commercialRegistrationNumber: values.crNumber.trim().toUpperCase(),
    taxNumber: values.vatin.trim().toUpperCase(),
    invoiceAccent: values.accent,
    ...(values.industrialClassification.trim()
      ? { industrialClassificationCode: values.industrialClassification.trim() }
      : {}),
  }
}

export function recordBusinessIdentity(
  onboardingToken: string,
  request: BusinessIdentityRequest,
  signal?: AbortSignal,
): Promise<void> {
  return post('/v1/auth/signup/business-identity', { onboardingToken, ...request }, signal)
}

export const BUSINESS_IDENTITY_SERVER_FIELDS: ServerFieldMap<BusinessIdentityField> = new Map([
  ['legalCompanyName', { field: 'companyName', key: 'validation.required' }],
  ['commercialRegistrationNumber', { field: 'crNumber', key: 'validation.tooLong' }],
  ['taxNumber', { field: 'vatin', key: 'validation.vatin' }],
])

export type AddressContactValues = {
  addressLine: string
  addressLine2: string
  addressLine3: string
  postalCode: string
  poBox: string
  city: string
  governorate: GovernorateId
  contactName: string
  role: string
  phone: string
  email: string
}

export type AddressContactField =
  | 'addressLine'
  | 'addressLine2'
  | 'addressLine3'
  | 'postalCode'
  | 'poBox'
  | 'city'
  | 'governorate'
  | 'contactName'
  | 'role'
  | 'phone'
  | 'email'

export const ADDRESS_CONTACT_FIELD_ORDER: readonly AddressContactField[] = [
  'addressLine',
  'addressLine2',
  'addressLine3',
  'postalCode',
  'poBox',
  'city',
  'governorate',
  'contactName',
  'role',
  'phone',
  'email',
]

/**
 * `SignupAddressContactRequest` minus the token; optional members are omitted when blank.
 *
 * Lines 2 and 3 were once collected here and then dropped, on the belief that the request had no
 * field for them; it had (SETTINGS.md row 1.6), so every self-service company reached its first
 * invoice without them and was refused it (`SELLER_ADDRESS_INCOMPLETE`, IBR-010-OM).
 */
export type AddressContactRequest = {
  addressLine: string
  addressLine2: string
  addressLine3: string
  postalCode: string
  /** IBT-038 as Oman reads it (the PO Box); a company may have it beside a postal code. */
  poBox?: string
  city: string
  governorate: string
  contactPersonName: string
  contactRole?: string
  contactPhone: string
  contactEmail: string
}

/**
 * `SELLER_STREET_ADDRESS_MAX`: the request record allows 255, but the service stops at 140 because
 * the line is printed on the invoice. The rest are `requireText` / `optionalText` bounds.
 */
const ADDRESS_LINE_MAX_LENGTH = 140
const CITY_MAX_LENGTH = 100
const PO_BOX_MAX_LENGTH = 30
const CONTACT_NAME_MAX_LENGTH = 200
const CONTACT_ROLE_MAX_LENGTH = 100

export function validateAddressContact(
  values: AddressContactValues,
): Partial<Record<AddressContactField, FieldError>> {
  const tooLong = (value: string, max: number) =>
    value.trim().length > max ? 'validation.tooLong' : undefined
  // All three lines and the postal code are printed for the seller on every invoice (IBR-010-OM).
  const addressLine = (value: string) =>
    required(value) ??
    (value.trim().length > ADDRESS_LINE_MAX_LENGTH ? 'validation.addressTooLong' : undefined)
  return {
    addressLine: addressLine(values.addressLine),
    addressLine2: addressLine(values.addressLine2),
    addressLine3: addressLine(values.addressLine3),
    postalCode: required(values.postalCode) ?? postalCode(values.postalCode),
    poBox: tooLong(values.poBox, PO_BOX_MAX_LENGTH),
    city: required(values.city) ?? tooLong(values.city, CITY_MAX_LENGTH),
    contactName:
      required(values.contactName) ?? tooLong(values.contactName, CONTACT_NAME_MAX_LENGTH),
    role: tooLong(values.role, CONTACT_ROLE_MAX_LENGTH),
    phone: omanPhone(values.phone),
    email: email(values.email),
  }
}

const optional = (value: string) => value.trim() || undefined

export function buildAddressContactRequest(values: AddressContactValues): AddressContactRequest {
  return {
    addressLine: values.addressLine.trim(),
    addressLine2: values.addressLine2.trim(),
    addressLine3: values.addressLine3.trim(),
    postalCode: values.postalCode.trim(),
    poBox: optional(values.poBox),
    city: values.city.trim(),
    governorate: GOVERNORATE_NAMES[values.governorate],
    contactPersonName: values.contactName.trim(),
    contactRole: optional(values.role),
    contactPhone: toOmanE164(values.phone),
    contactEmail: values.email.trim(),
  }
}

export function recordAddressContact(
  onboardingToken: string,
  request: AddressContactRequest,
  signal?: AbortSignal,
): Promise<void> {
  return post('/v1/auth/signup/address-contact', { onboardingToken, ...request }, signal)
}

export const ADDRESS_CONTACT_SERVER_FIELDS: ServerFieldMap<AddressContactField> = new Map([
  ['addressLine', { field: 'addressLine', key: 'validation.addressTooLong' }],
  ['addressLine2', { field: 'addressLine2', key: 'validation.addressTooLong' }],
  ['addressLine3', { field: 'addressLine3', key: 'validation.addressTooLong' }],
  ['postalCode', { field: 'postalCode', key: 'validation.postalCode' }],
  ['poBox', { field: 'poBox', key: 'validation.tooLong' }],
  ['city', { field: 'city', key: 'validation.required' }],
  ['governorate', { field: 'governorate', key: 'validation.required' }],
  ['contactPersonName', { field: 'contactName', key: 'validation.required' }],
  ['contactRole', { field: 'role', key: 'validation.tooLong' }],
  ['contactPhone', { field: 'phone', key: 'validation.phoneLength' }],
  ['contactEmail', { field: 'email', key: 'validation.email' }],
])
