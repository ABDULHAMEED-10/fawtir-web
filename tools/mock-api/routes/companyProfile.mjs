/**
 * Screenshot and development tooling only. This file is never loaded by the application build:
 * nothing under `src/` imports it, `tsc -b` and `vite build` do not include `tools/`, and the only
 * thing that reads it is `tools/mock-api/server.mjs`, a Node process a developer starts by hand.
 *
 * Settings > Company profile: the company (`src/api/company/companyProfile.ts`), verified, with
 * an Arabic legal name and no legal name in English yet, and the English legal name's own read and
 * save (`src/api/company/legalNameEn.ts`). The save checks what the server checks: trimmed, blank
 * clears it, at most 70 characters, then Latin letters, digits, space and `/ - ? : ( ) . , ' +`.
 *
 * The other company-profile routes (branding, defaults, business activity, the amendment) are not
 * mocked: they answer 404, which the screen shows as it would any failed read.
 */
const BASE = '/api/v1/company-profile'
const MAX_LENGTH = 70
const BANK_LATIN = /^[A-Za-z0-9/\-?:().,'+ ]+$/

const profile = {
  tenantId: 't-fawtir',
  tenantCode: 'BAHJA',
  tenantName: 'Al Bahja Coffee',
  legalName: 'شركة البهجة للقهوة ش.م.م',
  legalNameAr: 'شركة البهجة للقهوة ش.م.م',
  tradingName: 'Al Bahja Coffee',
  taxNumber: 'OM1100112233',
  commercialRegistrationNumber: '1234567',
  country: 'OM',
  registeredAddress: 'Way 3015, Al Khuwair',
  registeredAddressLine2: 'Al Khuwair',
  registeredAddressLine3: 'Building 214',
  registeredCity: 'Muscat',
  registeredPostalCode: '133',
  registeredCountrySubdivision: 'Muscat',
  registeredPoBox: null,
  registeredCountrySubdivisionCode: 'OM-MA',
  contactPersonName: 'Nasser Al Habsi',
  contactPhone: '+96824000000',
  contactEmail: 'accounts@bahja.om',
  profileRevision: 4,
  verificationStatus: 'VERIFIED',
  legalNameEn: null,
}

function refused(code, fieldCode, message) {
  return {
    status: 400,
    body: {
      type: 'https://api.fawtir.om/problems/validation-failed',
      title: 'Validation failed',
      status: 400,
      code,
      errors: [{ field: 'legalNameEn', code: fieldCode, message }],
    },
  }
}

export default [
  { match: BASE, reply: () => profile },
  { match: `${BASE}/legal-name-en`, reply: () => ({ legalNameEn: profile.legalNameEn }) },
  {
    method: 'PUT',
    match: `${BASE}/legal-name-en`,
    reply: ({ body }) => {
      const requested = typeof body?.legalNameEn === 'string' ? body.legalNameEn.trim() : ''
      if (requested.length > MAX_LENGTH) {
        return refused(
          'COMPANY_LEGAL_NAME_EN_TOO_LONG',
          'TOO_LONG',
          `The legal name in English may be at most ${MAX_LENGTH} characters.`,
        )
      }
      if (requested !== '' && !BANK_LATIN.test(requested)) {
        return refused(
          'COMPANY_LEGAL_NAME_EN_NOT_LATIN',
          'INVALID_CHARACTERS',
          'The legal name in English may use only Latin letters, digits, space and / - ? : ( ) . , \' +.',
        )
      }
      profile.legalNameEn = requested === '' ? null : requested
      return { legalNameEn: profile.legalNameEn }
    },
  },
]
