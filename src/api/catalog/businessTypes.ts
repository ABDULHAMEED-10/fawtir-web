import { apiRequest } from '../client'

/**
 * Business types and sub business types (Catalogue guide 1A). The lists are kept in the console
 * (Settings › Business types); sign-up, Settings › Company and the catalogue's "Build from a
 * template" read them from the server, so a type added, renamed or opened there shows everywhere
 * without a release. Codes are permanent; names may change.
 */

/** A suggested business activity (ISIC Rev. 4, Oman six digits): a hint, never filled in. */
export type SuggestedIsicDto = { code: string; nameEn: string; nameAr: string | null }

/** One sub business type as sign-up reads it. */
export type SignupSubBusinessTypeDto = {
  code: string
  nameEn: string
  /** The server sends the English name here while there is no Arabic one. */
  nameAr: string | null
  icon: string | null
  displayOrder: number
  suggestedIsic: SuggestedIsicDto | null
  /** A published catalogue template exists for it. */
  hasTemplate: boolean
}

/** One business type as sign-up reads it, with its active sub types in display order. */
export type SignupBusinessTypeDto = {
  code: string
  nameEn: string
  nameAr: string | null
  icon: string | null
  displayOrder: number
  subTypes: SignupSubBusinessTypeDto[]
}

/**
 * Only the types open for sign-up and not retired, each with its non-retired sub types. No session
 * is needed (the alias `GET /v1/public/business-types` answers the same).
 */
export const SIGNUP_BUSINESS_TYPES_PATH = '/v1/auth/signup/business-types'

export function readSignupBusinessTypes(signal?: AbortSignal): Promise<SignupBusinessTypeDto[]> {
  return apiRequest<SignupBusinessTypeDto[]>(SIGNUP_BUSINESS_TYPES_PATH, {
    signal,
    credentials: 'omit',
  }).then((body) => {
    // An unreadable body is not "nothing open": it fails like any other bad answer.
    if (!Array.isArray(body)) throw new TypeError('The business types were not a list')
    return [...body]
      .sort((a, b) => a.displayOrder - b.displayOrder)
      .map((type) => ({
        ...type,
        subTypes: [...(type.subTypes ?? [])].sort((a, b) => a.displayOrder - b.displayOrder),
      }))
  })
}

/** The company's stored type or sub type. A retired one is still returned, marked retired. */
export type CompanyBusinessTypeRefDto = {
  code: string
  nameEn: string
  nameAr: string | null
  retired: boolean
}

export type CompanyBusinessTypeDto = {
  /** Both `null` for a company that does not use POS or has not chosen. */
  businessType: CompanyBusinessTypeRefDto | null
  subBusinessType: (CompanyBusinessTypeRefDto & { suggestedIsic: SuggestedIsicDto | null }) | null
}

/**
 * Settings › Company: which sub business type the company is. It only changes which catalogue
 * template is offered. Both verbs need `admin.settings.manage`; the business type follows from the
 * sub type, and `null` clears both. A retired sub type is refused (400
 * `business-type-not-available`).
 */
export const COMPANY_BUSINESS_TYPE_PATH = '/v1/company-profile/business-type'

export function readCompanyBusinessType(): Promise<CompanyBusinessTypeDto> {
  return apiRequest<CompanyBusinessTypeDto>(COMPANY_BUSINESS_TYPE_PATH)
}

export function saveCompanyBusinessType(
  subBusinessTypeCode: string | null,
): Promise<CompanyBusinessTypeDto> {
  return apiRequest<CompanyBusinessTypeDto>(COMPANY_BUSINESS_TYPE_PATH, {
    method: 'PUT',
    body: { subBusinessTypeCode },
  })
}

/** The refusal when a code is unknown, retired, or its type is closed for sign-up. */
export const BUSINESS_TYPE_NOT_AVAILABLE = 'business-type-not-available'
