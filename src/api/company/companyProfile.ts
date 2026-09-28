import { apiRequest } from '../client'

/**
 * The company's own identity (`CompanyProfileController`'s `/company-profile`, IBR-010-OM +
 * IBG-06): legal name, tax number, registered address and contact. `PUT` replaces the whole
 * profile as a unit and re-submits it for verification — refused outright once
 * `verificationStatus` is `VERIFIED` ("Verified company profiles require an approved amendment
 * workflow", which does not exist yet), so a client only offers it while `PENDING_VERIFICATION`
 * or `REJECTED`.
 */
export const COMPANY_PROFILE_PATH = '/v1/company-profile'

export type CompanyVerificationStatus = 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED'

export type CompanyProfileDto = {
  tenantId: string
  tenantCode: string
  tenantName: string
  legalName: string
  legalNameAr: string | null
  tradingName: string | null
  taxNumber: string
  commercialRegistrationNumber: string
  country: string
  registeredAddress: string
  registeredAddressLine2: string | null
  registeredAddressLine3: string | null
  registeredCity: string | null
  registeredPostalCode: string | null
  registeredCountrySubdivision: string | null
  registeredPoBox: string | null
  contactPersonName: string | null
  contactPhone: string | null
  contactEmail: string | null
  profileRevision: number
  verificationStatus: CompanyVerificationStatus
}

/** Every field `PUT` needs, since it replaces the profile as a unit — a client that read the
 * current state with {@link loadCompanyProfile} and changes only what it means to change sends
 * the rest back unaltered. */
export type UpdateCompanyProfileCommand = {
  expectedRevision: number
  tenantName: string
  legalName: string
  legalNameAr: string | null
  tradingName: string | null
  taxNumber: string
  commercialRegistrationNumber: string
  country: string
  registeredAddress: string
  registeredAddressLine2: string | null
  registeredAddressLine3: string | null
  registeredCity: string | null
  registeredPostalCode: string | null
  registeredCountrySubdivision: string | null
  registeredPoBox: string | null
  contactPersonName: string | null
  contactPhone: string | null
  contactEmail: string | null
}

export function loadCompanyProfile(): Promise<CompanyProfileDto> {
  return apiRequest<CompanyProfileDto>(COMPANY_PROFILE_PATH)
}

export function saveCompanyProfile(command: UpdateCompanyProfileCommand): Promise<CompanyProfileDto> {
  return apiRequest<CompanyProfileDto>(COMPANY_PROFILE_PATH, {
    method: 'PUT',
    body: command,
  })
}
