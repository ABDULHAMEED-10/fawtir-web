import { describe, expect, it } from 'vitest'
import {
  LEGACY_CONTACT,
  mailto,
  parsePublicCompanyContact,
  resolveCompanyContact,
} from './companyContact'

const SETTING = {
  version: 1,
  supportEmail: 'fawtara@insight.om',
  supportPhone: '+968 0000 0000',
  websiteUrl: 'https://www.fawtir.om',
  addressEn: 'Al Rusayl 124, Sultanate of Oman',
  addressAr: 'الرسيل 124، سلطنة عُمان',
  linkedinUrl: null,
  instagramUrl: 'https://instagram.com/fawtir',
}

describe('company contact details (CS-1)', () => {
  it('only an object is a setting: no body, a list or empty fields keep the old values', () => {
    expect(parsePublicCompanyContact(undefined)).toBeNull()
    expect(parsePublicCompanyContact([SETTING])).toBeNull()
    expect(parsePublicCompanyContact({ supportEmail: '  ', supportPhone: null })).toBeNull()
    expect(parsePublicCompanyContact(SETTING)?.supportEmail).toBe('fawtara@insight.om')
  })

  it('never links an address that is not https', () => {
    const parsed = parsePublicCompanyContact({
      ...SETTING,
      linkedinUrl: 'javascript:alert(1)',
      websiteUrl: 'http://fawtir.om',
    })
    expect(parsed?.linkedinUrl).toBeNull()
    expect(parsed?.websiteUrl).toBeNull()
    expect(parsed?.instagramUrl).toBe('https://instagram.com/fawtir')
  })

  it('without a setting every place, the Contact page included, uses the one support email', () => {
    expect(resolveCompanyContact(null, 'en')).toEqual({
      supportEmail: 'support@fawtir.om',
      contactPagePhone: null,
      address: null,
      website: null,
      linkedinUrl: null,
      instagramUrl: null,
    })
    expect(LEGACY_CONTACT.supportEmail).toBe('support@fawtir.om')
    expect(LEGACY_CONTACT).not.toHaveProperty('contactPagePhone')
    expect(Object.values(LEGACY_CONTACT)).toEqual(['support@fawtir.om'])
  })

  it('with a setting every place shows it, the address in the reader language', () => {
    const contact = parsePublicCompanyContact(SETTING)
    const en = resolveCompanyContact(contact, 'en')
    expect(en.supportEmail).toBe('fawtara@insight.om')
    expect(en.contactPagePhone).toBe('+968 0000 0000')
    expect(en.address).toBe('Al Rusayl 124, Sultanate of Oman')
    expect(resolveCompanyContact(contact, 'ar').address).toBe('الرسيل 124، سلطنة عُمان')
  })

  it('a field the setting leaves empty falls back on its own, and no phone means none', () => {
    const contact = parsePublicCompanyContact({ ...SETTING, supportPhone: null, addressAr: null })
    const ar = resolveCompanyContact(contact, 'ar')
    expect(ar.contactPagePhone).toBeNull()
    expect(ar.address).toBe('Al Rusayl 124, Sultanate of Oman')
  })

  it('builds mail links with the subject and body encoded', () => {
    expect(mailto('a@b.om')).toBe('mailto:a@b.om')
    expect(mailto('a@b.om', 'Fawtir demo request')).toBe(
      'mailto:a@b.om?subject=Fawtir%20demo%20request',
    )
    expect(mailto('a@b.om', 'Hi', 'x\ny')).toBe('mailto:a@b.om?subject=Hi&body=x%0Ay')
  })
})
