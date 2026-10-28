/**
 * Business types for sign-up and Settings › Company, and the company's catalogue template
 * (`src/api/catalog/businessTypes.ts`, `src/api/catalog/templates.ts`). The data and the console's
 * changes live in `../data/businessTypes.mjs`.
 */
import { companyBusinessType, findSub, problem, signupList, store } from '../data/businessTypes.mjs'

const notAvailable = () =>
  problem(400, 'business-type-not-available', 'Business type not available', {
    code: 'BUSINESS_TYPE_NOT_AVAILABLE',
  })

/** Sign-up accepts any open, active code (contract section 2); a step saved answers 204. */
const openType = (code) => signupList().find((type) => type.code === code)

/**
 * Settings › Company reads the profile before it draws anything; no other module answers it, so
 * the page renders here with the business type field (Al Bahja Coffee, as the session names it).
 */
const COMPANY_PROFILE = {
  tenantId: 't-fawtir',
  tenantCode: 'ALBAHJA',
  tenantName: 'Al Bahja Coffee',
  legalName: 'Al Bahja Coffee LLC',
  legalNameAr: 'شركة البهجة للقهوة ش.م.م',
  tradingName: 'Al Bahja Coffee',
  taxNumber: 'OM1100112233',
  commercialRegistrationNumber: '1234567',
  country: 'OM',
  registeredAddress: 'Building 4, Way 2301',
  registeredAddressLine2: 'Al Khuwair',
  registeredAddressLine3: null,
  registeredCity: 'Muscat',
  registeredPostalCode: '133',
  registeredCountrySubdivision: 'Muscat',
  registeredPoBox: null,
  registeredCountrySubdivisionCode: 'OM-MA',
  contactPersonName: 'Nasser Al Habsi',
  contactPhone: '+96891234567',
  contactEmail: 'nasser@albahja.test',
  profileRevision: 3,
  verificationStatus: 'VERIFIED',
}

export default [
  { match: '/api/v1/company-profile', reply: () => COMPANY_PROFILE },
  { match: '/api/v1/company-profile/industrial-classification', reply: () => ({ code: '563001' }) },
  {
    match: '/api/v1/company-profile/changes',
    reply: () => [
      { field: 'businessType', changedAt: '2026-10-26T08:00:00Z', changedBy: 'u-nasser' },
    ],
  },
  { match: '/api/v1/auth/signup/business-types', reply: () => signupList() },
  {
    method: 'POST',
    match: '/api/v1/auth/signup/business-category',
    reply: ({ body }) => (openType(body?.businessCategory) ? { status: 204 } : notAvailable()),
  },
  {
    method: 'POST',
    match: '/api/v1/auth/signup/business-type',
    reply: ({ body }) =>
      signupList().some((type) => type.subTypes.some((sub) => sub.code === body?.businessType))
        ? { status: 204 }
        : notAvailable(),
  },
  { match: '/api/v1/public/business-types', reply: () => signupList() },
  { match: '/api/v1/company-profile/business-type', reply: () => companyBusinessType() },
  {
    method: 'PUT',
    match: '/api/v1/company-profile/business-type',
    reply: ({ body }) => {
      const code = body?.subBusinessTypeCode ?? null
      if (code === null) {
        store.companySubType = null
        return companyBusinessType()
      }
      const found = findSub(code)
      if (!found || found.sub.retiredAt || found.type.retiredAt) return notAvailable()
      store.companySubType = code
      return companyBusinessType()
    },
  },
  {
    match: '/api/v1/catalog/templates',
    reply: ({ query }) => {
      const code = query.get('subBusinessType') || store.companySubType
      const latest = code ? store.templates.get(code)?.versions.at(-1) : undefined
      if (!latest) return problem(404, 'resource-not-found', 'Not found')
      return {
        subBusinessTypeCode: code,
        version: latest.version,
        publishedAt: latest.publishedAt,
        groups: latest.groups,
      }
    },
  },
]
