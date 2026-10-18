import { ApiError, apiRequest } from '../../api'

/**
 * The console's edit of Fawtir's own contact details (CS-1, decision D1): the support email, phone,
 * website, address and social pages the app, Fawtir's mails and the public site show. An
 * append-only versioned record like the billing seller: every change sends `If-Match` with the
 * version read and a reason; the server adds MFA, no impersonation and the production PLATFORM
 * realm.
 *
 * API ASSUMPTION (CS-1): matches the openapi.yaml of the backend's branch
 * feat/company-contact-settings (V398) as committed locally, before it was pushed;
 * `lib/companyContact.ts` names the public read. Re-check both once published.
 */
export const COMPANY_CONTACT_PATH = '/v1/platform/company-contact'
export const COMPANY_CONTACT_HISTORY_PATH = `${COMPANY_CONTACT_PATH}/history?limit=50`
/** Reading needs the billing read permission, changing the manage one, as for the seller. */
export const COMPANY_CONTACT_READ_PERMISSION = 'platform.billing.read'
export const COMPANY_CONTACT_MANAGE_PERMISSION = 'platform.billing.manage'
export const COMPANY_CONTACT_CONFLICT = 'company-contact-version-conflict'

/** The author V398's seeded first version carries: nobody, so it reads as the system. */
const SEED_AUTHOR = '00000000-0000-0000-0000-000000000000'

export type CompanyContactDto = {
  id: string
  version: number
  supportEmail: string
  supportPhone: string
  websiteUrl: string | null
  addressEn: string | null
  addressAr: string | null
  linkedinUrl: string | null
  instagramUrl: string | null
  reason: string
  createdBy: string
  createdAt: string
}

/** Omitting an optional field (or sending null) clears it: the form sends the whole set it shows. */
export type CompanyContactRequest = Omit<
  CompanyContactDto,
  'id' | 'version' | 'createdBy' | 'createdAt'
>

/** The server's limits, so a long value is stopped at the keyboard rather than refused. */
export const COMPANY_CONTACT_MAX = {
  supportEmail: 254,
  supportPhone: 20,
  websiteUrl: 300,
  addressEn: 300,
  addressAr: 300,
  linkedinUrl: 300,
  instagramUrl: 300,
  reason: 500,
} as const satisfies Record<keyof CompanyContactRequest, number>

/** The database's checks (V398), so the server's 400 is the exception. */
export const isContactEmail = (value: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)
export const isContactPhone = (value: string) => /^\+\d[\d ]{6,18}$/.test(value)
export const isHttpsUrl = (value: string) => /^https:\/\/\S+$/.test(value)

/** Who saved a version, for the history: null for the seeded one. */
export const contactAuthor = (dto: Pick<CompanyContactDto, 'createdBy'>) =>
  dto.createdBy === SEED_AUTHOR ? null : dto.createdBy

export function saveCompanyContact(
  version: number,
  request: CompanyContactRequest,
): Promise<CompanyContactDto> {
  return apiRequest(COMPANY_CONTACT_PATH, {
    method: 'PUT',
    headers: { 'If-Match': `"${version}"` },
    body: request,
  })
}

export function isContactConflict(error: unknown): boolean {
  return error instanceof ApiError && error.problemType === COMPANY_CONTACT_CONFLICT
}

/** The refusal in words, as an i18n key. */
export function contactRefusalKey(error: unknown): string {
  if (error instanceof ApiError) {
    if (isContactConflict(error)) return 'console.companyContact.refusal.conflict'
    if (error.problemType === 'production-platform-realm-required')
      return 'console.companyContact.refusal.realm'
    if (error.problemType === 'impersonation-not-allowed')
      return 'console.companyContact.refusal.impersonation'
    // Any other 403 is a lapsed MFA session or a missing permission.
    if (error.status === 403) return 'console.companyContact.refusal.forbidden'
    if (error.status === 400) return 'console.companyContact.refusal.invalid'
  }
  return 'console.billing.refusal.other'
}
