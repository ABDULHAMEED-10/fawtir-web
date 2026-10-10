import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import i18n from '../i18n'
import { issueRefusalOf } from './invoiceIssue'

const refused = (code: string) => new ApiError({ status: 400, problemType: 'request-rejected', code })

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
