import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import i18n from '../i18n'
import { issueRefusalOf } from './invoiceIssue'

const refused = (code: string) => new ApiError({ status: 400, problemType: 'request-rejected', code })

// Backend 073d5261c (QR-E2): the issue route's 422 for a zone that does not keep Muscat time.
describe('issue refused for a company zone that is not Oman time', () => {
  it('words TENANT_TIMEZONE_NOT_SUPPORTED_FOR_E_INVOICE without its code, in English and Arabic', async () => {
    const error = new ApiError({
      status: 422,
      problemType: 'tenant-timezone-not-supported-for-e-invoice',
      code: 'TENANT_TIMEZONE_NOT_SUPPORTED_FOR_E_INVOICE',
    })
    const refusal = issueRefusalOf(error)
    expect(refusal).toEqual({ field: null, key: 'invoiceIssue.refused.timezoneNotOman' })
    await i18n.changeLanguage('en')
    expect(i18n.t(refusal!.key)).toMatch(/Asia\/Muscat/)
    expect(i18n.t(refusal!.key)).not.toMatch(/TENANT_TIMEZONE/)
    await i18n.changeLanguage('ar')
    expect(i18n.exists(refusal!.key, { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t(refusal!.key)).toMatch(/Asia\/Muscat/)
    await i18n.changeLanguage('en')
  })
})

describe("issue refused on the company's own incomplete details", () => {
  it.each([
    ['SELLER_ADDRESS_INCOMPLETE', 'invoiceIssue.refused.sellerAddressIncomplete'],
    ['SELLER_CONTACT_INCOMPLETE', 'invoiceIssue.refused.sellerContactIncomplete'],
  ])('names %s and sends the reader to Settings › Company, in English and Arabic', async (code, key) => {
    expect(issueRefusalOf(refused(code))).toEqual({ field: null, key })
    await i18n.changeLanguage('en')
    expect(i18n.t(key)).toMatch(/Settings › Company/)
    await i18n.changeLanguage('ar')
    expect(i18n.t(key)).toMatch(/الإعدادات › الشركة/)
    await i18n.changeLanguage('en')
  })
})
