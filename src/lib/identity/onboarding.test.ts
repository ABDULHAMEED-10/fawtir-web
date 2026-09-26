import { describe, expect, it } from 'vitest'
import { SUB_TYPES_BY_BUSINESS, type BusinessTypeId } from '../subBusinessTypes'
import {
  BUSINESS_SIZE,
  INVOICING_METHOD,
  allowedRoute,
  backendCategoryFor,
  backendTypeFor,
  buildAddressContactRequest,
  buildBusinessIdentityRequest,
  registrableCategory,
  validateAddressContact,
  validateBusinessIdentity,
  type AddressContactValues,
} from './onboarding'

describe('backend vocabulary', () => {
  it('maps every business size and invoicing method to its enum', () => {
    expect(BUSINESS_SIZE).toEqual({
      'just-me': 'JUST_ME',
      '2-10': 'PEOPLE_2_TO_10',
      '11-50': 'PEOPLE_11_TO_50',
      '50-plus': 'PEOPLE_50_PLUS',
    })
    expect(INVOICING_METHOD).toEqual({
      paper: 'PAPER_OR_MANUAL',
      spreadsheets: 'SPREADSHEETS',
      accounting: 'ACCOUNTING_SOFTWARE',
      erp: 'FULL_ERP_SYSTEM',
    })
  })

  it('registers Food & Beverage only, never another category under its name', () => {
    expect(backendCategoryFor('food-beverage')).toBe('FOOD_AND_BEVERAGE')
    const others = Object.keys(SUB_TYPES_BY_BUSINESS).filter((id) => id !== 'food-beverage')
    expect(others).toHaveLength(7)
    for (const id of others) expect(backendCategoryFor(id as BusinessTypeId)).toBeUndefined()
  })

  it('maps each Food & Beverage trade to the backend type it names', () => {
    const mapped = SUB_TYPES_BY_BUSINESS['food-beverage'].map((option) => backendTypeFor(option.id))
    expect(mapped).toEqual([
      'COFFEE_SHOP',
      'RESTAURANT',
      'BAKERY',
      'FAST_FOOD',
      'JUICE_BAR',
      'DESSERT_SHOP',
      'CATERING',
    ])
    expect(backendTypeFor('garage')).toBeUndefined()
    expect(backendTypeFor('constructor')).toBeUndefined()
  })

  it('lists trades for the chosen category only when it can be registered', () => {
    expect(registrableCategory('food-beverage')).toBe('food-beverage')
    expect(registrableCategory('retail')).toBe('food-beverage')
    expect(registrableCategory(undefined)).toBe('food-beverage')
  })
})

describe('allowedRoute', () => {
  it('sends a registrant to the first unsaved step', () => {
    expect(allowedRoute('BUSINESS_PROFILE', '/address-contact')).toBe('/about-business')
    expect(allowedRoute('BUSINESS_TYPE', '/business-identity')).toBe('/sub-business-type')
  })

  it('lets a registrant revisit any step already saved', () => {
    expect(allowedRoute('ADDRESS_CONTACT', '/about-business')).toBe('/about-business')
    expect(allowedRoute('READY_FOR_SUBMISSION', '/business-identity')).toBe('/business-identity')
  })

  it('opens review only once every step is saved', () => {
    expect(allowedRoute('ADDRESS_CONTACT', '/signup-review')).toBe('/address-contact')
    expect(allowedRoute('READY_FOR_SUBMISSION', '/signup-review')).toBe('/signup-review')
  })

  it('closes every page once the draft is with a reviewer', () => {
    for (const stage of ['UNDER_REVIEW', 'ACTIVATED', 'REJECTED'] as const) {
      expect(allowedRoute(stage, '/business-identity')).toBe('/signup-pending')
      expect(allowedRoute(stage, '/signup-review')).toBe('/signup-pending')
    }
  })

  it('never opens the waiting screen for a draft that is not submitted', () => {
    expect(allowedRoute('READY_FOR_SUBMISSION', '/signup-pending')).toBe('/signup-review')
  })
})

describe('business identity', () => {
  const valid = {
    companyName: ' Al Noor Trading LLC ',
    crNumber: ' cr-1234567 ',
    vatin: ' om1100112233 ',
    industrialClassification: '561001',
    accent: 'GREEN' as const,
  }

  it('builds exactly the backend fields, upper-cased as stored, with no logo reference', () => {
    const request = buildBusinessIdentityRequest(valid)
    expect(request).toEqual({
      legalCompanyName: 'Al Noor Trading LLC',
      commercialRegistrationNumber: 'CR-1234567',
      taxNumber: 'OM1100112233',
      invoiceAccent: 'GREEN',
      industrialClassificationCode: '561001',
    })
    expect(request).not.toHaveProperty('logoObjectReference')
    expect(request).not.toHaveProperty('peppolId')
  })

  it('sends no business activity when the registrant skipped it', () => {
    const request = buildBusinessIdentityRequest({ ...valid, industrialClassification: '' })
    expect(request).not.toHaveProperty('industrialClassificationCode')
  })

  it('checks CR length only, as the backend does', () => {
    expect(validateBusinessIdentity({ ...valid, crNumber: 'A1' }).crNumber).toBeUndefined()
    expect(validateBusinessIdentity({ ...valid, crNumber: 'x'.repeat(21) }).crNumber).toBe(
      'validation.tooLong',
    )
    expect(validateBusinessIdentity({ ...valid, crNumber: '  ' }).crNumber).toBe(
      'validation.required',
    )
  })

  it('accepts only OM11 and OM12 VATINs', () => {
    expect(validateBusinessIdentity({ ...valid, vatin: 'OM1200000001' }).vatin).toBeUndefined()
    expect(validateBusinessIdentity({ ...valid, vatin: 'OM1300000001' }).vatin).toBe(
      'validation.vatin',
    )
    expect(validateBusinessIdentity({ ...valid, vatin: 'OM110011223' }).vatin).toBe(
      'validation.vatin',
    )
  })

  it('requires the legal name and bounds it at 255', () => {
    expect(validateBusinessIdentity({ ...valid, companyName: '' }).companyName).toBe(
      'validation.required',
    )
    expect(validateBusinessIdentity({ ...valid, companyName: 'x'.repeat(256) }).companyName).toBe(
      'validation.tooLong',
    )
  })
})

describe('address and contact', () => {
  const valid: AddressContactValues = {
    addressLine: ' Building 4, Way 2301 ',
    postalCode: '',
    city: ' Seeb ',
    governorate: 'ashSharqiyahNorth',
    contactName: ' Salim Al Harthy ',
    role: '',
    phone: '9123 4567',
    email: ' salim@example.test ',
  }

  it('sends the governorate by its stable English name and the phone as +968', () => {
    expect(buildAddressContactRequest(valid)).toEqual({
      addressLine: 'Building 4, Way 2301',
      city: 'Seeb',
      governorate: 'Ash Sharqiyah North',
      contactPersonName: 'Salim Al Harthy',
      contactPhone: '+96891234567',
      contactEmail: 'salim@example.test',
    })
  })

  it('omits blank optional fields and sends them when filled', () => {
    const request = buildAddressContactRequest({ ...valid, postalCode: '133', role: 'Owner' })
    expect(request.postalCode).toBe('133')
    expect(request.contactRole).toBe('Owner')
    expect(JSON.stringify(buildAddressContactRequest(valid))).not.toMatch(/postalCode|contactRole/)
  })

  it('applies the service limits, not the wider record ones', () => {
    expect(validateAddressContact({ ...valid, addressLine: 'x'.repeat(141) }).addressLine).toBe(
      'validation.addressTooLong',
    )
    expect(validateAddressContact({ ...valid, role: 'x'.repeat(101) }).role).toBe(
      'validation.tooLong',
    )
  })

  it('validates the required fields, phone and email', () => {
    const errors = validateAddressContact({
      ...valid,
      addressLine: '',
      city: '',
      contactName: '',
      phone: '123',
      email: 'nope',
    })
    expect(errors).toMatchObject({
      addressLine: 'validation.required',
      city: 'validation.required',
      contactName: 'validation.required',
      phone: 'validation.phoneLength',
      email: 'validation.email',
    })
  })
})
