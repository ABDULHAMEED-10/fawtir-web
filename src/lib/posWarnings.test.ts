import { describe, expect, it } from 'vitest'
import i18n from '../i18n'

// NOT RUN (batch 43, static only). Owner Round 31 F-4: the till's off-sale warning must claim no order of
// events (the server knows only that the line is not on sale now), and must read exactly as the approved
// hold-detail sentence. The Arabic is checked for presence only: that is not a translation approval, and
// the current Arabic still awaits native rewording.

const KEY = 'pos.warning.POS_PRODUCT_NOT_SELLABLE_ACCEPTED'

describe("the till's off-sale warning", () => {
  it('reads the owner-approved English exactly', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t(KEY, { line: 2 })).toBe('Line 2 was sold offline and is not on sale now.')
  })

  it('says nothing about when the product went off sale', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t(KEY, { line: 2 })).not.toMatch(/\bafter\b/i)
  })

  it('uses the same approved sentence as the hold detail', async () => {
    await i18n.changeLanguage('en')
    expect(i18n.t(KEY, { line: 4 })).toBe(i18n.t('pos.offline.detail.heldFor.notOnSaleNow', { line: 4 }))
  })

  it('has an Arabic entry of its own', () => {
    expect(i18n.exists(KEY, { lng: 'ar', fallbackLng: false })).toBe(true)
  })
})
