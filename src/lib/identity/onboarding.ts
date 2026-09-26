import { apiRequest } from '../../api'
import type { ServerFieldMap } from './errors'
import { GOVERNORATE_NAMES, type GovernorateId } from '../governorates'
import type { BusinessSize, InvoiceAccent, InvoicingMethod } from '../onboarding'
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
  'PAPER_OR_MANUAL' | 'SPREADSHEETS' | 'ACCOUNTING_SOFTWARE' | 'FULL_ERP_SYSTEM'
export type SignupBusinessCategory = 'FOOD_AND_BEVERAGE'
export type SignupBusinessType =
  'COFFEE_SHOP' | 'RESTAURANT' | 'BAKERY' | 'FAST_FOOD' | 'JUICE_BAR' | 'DESSERT_SHOP' | 'CATERING'

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
  | 'READY_FOR_SUBMISSION'
  | 'UNDER_REVIEW'
  | 'ACTIVATED'
  | 'REJECTED'

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
}

/**
 * Every registrant walks every step. The prototype skipped the two business-type screens for
 * larger teams and existing software users, but `submitForReview` refuses a draft missing the
 * category or the type, so that shortcut led to a registration that could never be submitted.
 */
export const ONBOARDING_ROUTES = [
  '/about-business',
  '/business-type',
  '/sub-business-type',
  '/business-identity',
  '/address-contact',
] as const

/** Where the registrant checks every answer and submits. */
export const REVIEW_ROUTE = '/signup-review'
/** Where a submitted registration waits for the human decision. */
export const PENDING_ROUTE = '/signup-pending'

const FLOW_ROUTES: readonly string[] = [...ONBOARDING_ROUTES, REVIEW_ROUTE]

export const ROUTE_FOR_STAGE: Record<SignupStage, string> = {
  BUSINESS_PROFILE: ONBOARDING_ROUTES[0],
  BUSINESS_CATEGORY: ONBOARDING_ROUTES[1],
  BUSINESS_TYPE: ONBOARDING_ROUTES[2],
  BUSINESS_IDENTITY: ONBOARDING_ROUTES[3],
  ADDRESS_CONTACT: ONBOARDING_ROUTES[4],
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

export function recordBusinessProfile(
  onboardingToken: string,
  size: BusinessSize,
  method: InvoicingMethod,
  signal?: AbortSignal,
): Promise<void> {
  return post(
    '/v1/auth/signup/business-profile',
    {
      onboardingToken,
      businessSize: BUSINESS_SIZE[size],
      invoicingMethod: INVOICING_METHOD[method],
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

/**
 * A registrant who will not use Fawtir POS skips the Business type and Sub business type
 * screens. The backend still requires both answers before the identity step and at submission,
 * so they are saved here with the one category it accepts and a placeholder type, never shown.
 * TODO(backend): make category and type optional when `usesPos` is false (or accept a
 * `usesPos` flag on the business profile), then drop these two calls.
 */
export const NO_POS_PLACEHOLDER = {
  category: 'FOOD_AND_BEVERAGE' as SignupBusinessCategory,
  type: 'RESTAURANT' as SignupBusinessType,
}

export async function recordNoPosDefaults(
  onboardingToken: string,
  signal?: AbortSignal,
): Promise<void> {
  await recordBusinessCategory(onboardingToken, NO_POS_PLACEHOLDER.category, signal)
  await recordBusinessType(onboardingToken, NO_POS_PLACEHOLDER.type, signal)
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
  'companyName' | 'crNumber' | 'industrialClassification' | 'vatin'
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
  // TODO(backend): `industrialClassification` (the 6-digit ISIC code chosen on this step) is not
  // sent: `SignupBusinessIdentityRequest` has no field for it yet. It travels in the onboarding
  // state to the review page; see docs/backend-guides/INCOME.md §C8.
  return {
    legalCompanyName: values.companyName.trim(),
    commercialRegistrationNumber: values.crNumber.trim().toUpperCase(),
    taxNumber: values.vatin.trim().toUpperCase(),
    invoiceAccent: values.accent,
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
  postalCode: string
  city: string
  governorate: GovernorateId
  contactName: string
  role: string
  phone: string
  email: string
}

export type AddressContactField =
  'addressLine' | 'postalCode' | 'city' | 'governorate' | 'contactName' | 'role' | 'phone' | 'email'

export const ADDRESS_CONTACT_FIELD_ORDER: readonly AddressContactField[] = [
  'addressLine',
  'postalCode',
  'city',
  'governorate',
  'contactName',
  'role',
  'phone',
  'email',
]

/** `SignupAddressContactRequest` minus the token; optional members are omitted when blank. */
export type AddressContactRequest = {
  addressLine: string
  postalCode?: string
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
const CONTACT_NAME_MAX_LENGTH = 200
const CONTACT_ROLE_MAX_LENGTH = 100

export function validateAddressContact(
  values: AddressContactValues,
): Partial<Record<AddressContactField, FieldError>> {
  const tooLong = (value: string, max: number) =>
    value.trim().length > max ? 'validation.tooLong' : undefined
  return {
    addressLine:
      required(values.addressLine) ??
      (values.addressLine.trim().length > ADDRESS_LINE_MAX_LENGTH
        ? 'validation.addressTooLong'
        : undefined),
    postalCode: postalCode(values.postalCode),
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
    postalCode: optional(values.postalCode),
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
  ['postalCode', { field: 'postalCode', key: 'validation.postalCode' }],
  ['city', { field: 'city', key: 'validation.required' }],
  ['governorate', { field: 'governorate', key: 'validation.required' }],
  ['contactPersonName', { field: 'contactName', key: 'validation.required' }],
  ['contactRole', { field: 'role', key: 'validation.tooLong' }],
  ['contactPhone', { field: 'phone', key: 'validation.phoneLength' }],
  ['contactEmail', { field: 'email', key: 'validation.email' }],
])
