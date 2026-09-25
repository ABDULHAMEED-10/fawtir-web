import { apiRequest } from '../client'

export const PLATFORM_COMPANIES_PATH = '/v1/platform/companies'

/**
 * `PlatformCompanyOnboardingRequest`. Flat, and deliberately narrower than the desk's form.
 *
 * There is no administrator password and no administrator username, because the backend has no
 * field for either: the first administrator sets both when they accept their invitation. An
 * operator who typed a customer's password would have chosen a credential for someone else, and
 * every later proof that the account is theirs would be worth less for it.
 *
 * There is no plan, term, method or payment either. A tenant with no subscription row already
 * resolves to the configured default plan, so sending one would record a decision nobody made.
 */
export type PlatformCompanyRequestDto = {
  tenantCode: string
  tenantName: string
  legalName: string
  taxNumber: string
  commercialRegistrationNumber: string
  country: string
  registeredAddress: string
  administratorEmail: string
  timezone?: string
}

/**
 * `PlatformCompanyOnboardingResult`.
 *
 * `tenantId` is the authoritative identifier — the database generated it, and it is what every
 * later read of this business uses. Navigation must use it rather than anything derived from the
 * name or the code.
 *
 * `invitationId` names the first-administrator invitation but carries no token: the acceptance
 * secret goes to the administrator's mailbox and nowhere else.
 *
 * `replayed` distinguishes a fresh creation (201) from a retry that found the original (200).
 */
export type PlatformCompanyResultDto = {
  tenantId: string
  tenantCode: string
  status: string
  companyVerificationStatus: string
  invitationId: string
  administratorEmail: string
  replayed: boolean
}

/**
 * `platform.tenants.manage`. The key belongs to the form, not to the click, so a second submit or
 * a retry replays the first company instead of creating a second one.
 */
export function createPlatformCompany(
  idempotencyKey: string,
  body: PlatformCompanyRequestDto,
  signal?: AbortSignal,
): Promise<PlatformCompanyResultDto> {
  return apiRequest<PlatformCompanyResultDto>(PLATFORM_COMPANIES_PATH, {
    method: 'POST',
    body,
    headers: { 'Idempotency-Key': idempotencyKey },
    signal,
  })
}

/**
 * One key per logical onboarding, minted when the form opens.
 *
 * Deliberately not minted per submit: the whole point is that the operator's second click carries
 * the key the first one did, so the backend answers with the company it already created. The
 * caller rotates it only after a completed onboarding, when the next company is a different
 * operation.
 */
export function newPlatformCompanyKey(): string {
  return `platform-company-${crypto.randomUUID()}`
}
