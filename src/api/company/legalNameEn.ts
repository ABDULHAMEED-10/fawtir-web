import { apiRequest } from '../client'

/**
 * The company's legal name in English letters (`CompanyProfileController`'s `/legal-name-en`),
 * used only as the payer name of a bank file (PAIN.001), never on an invoice. Optional, and
 * editable whatever the verification status: unlike `PUT /company-profile` it re-submits nothing
 * for verification. `GET /company-profile` carries the same value read-only as `legalNameEn`.
 *
 * `PUT` needs `admin.settings.manage`. The server trims the name, and null or blank clears it
 * (answering `null`). It refuses a name over {@link LEGAL_NAME_EN_MAX_LENGTH} characters or with a
 * character outside the bank set with a 400 whose `errors[0]` is `{ field: 'legalNameEn', code:
 * 'TOO_LONG' | 'INVALID_CHARACTERS' }`. Every change is written to the activity log.
 */
export const LEGAL_NAME_EN_PATH = '/v1/company-profile/legal-name-en'

export type LegalNameEnDto = { legalNameEn: string | null }

/** The bank file clips the payer name to 70 characters, so the server refuses a longer one. */
export const LEGAL_NAME_EN_MAX_LENGTH = 70

/** Latin letters, digits, space and `/ - ? : ( ) . , ' +` (ISO 20022's basic Latin set; no `&`). */
const BANK_LATIN = /^[A-Za-z0-9/\-?:().,'+ ]+$/

export type LegalNameEnRefusal = 'TOO_LONG' | 'INVALID_CHARACTERS'

/**
 * The server's own check, in its order, for instant feedback. The server's answer still decides.
 * A blank name is fine: it clears the setting.
 */
export function checkLegalNameEn(value: string): LegalNameEnRefusal | null {
  const stated = value.trim()
  if (stated === '') return null
  if (stated.length > LEGAL_NAME_EN_MAX_LENGTH) return 'TOO_LONG'
  if (!BANK_LATIN.test(stated)) return 'INVALID_CHARACTERS'
  return null
}

export function saveLegalNameEn(legalNameEn: string | null): Promise<LegalNameEnDto> {
  return apiRequest<LegalNameEnDto>(LEGAL_NAME_EN_PATH, {
    method: 'PUT',
    body: { legalNameEn },
  })
}
