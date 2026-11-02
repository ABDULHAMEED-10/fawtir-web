import { describe, expect, it } from 'vitest'
import { ApiError } from '../api'
import en from '../i18n/locales/en.json'
import ar from '../i18n/locales/ar.json'
import { describeApiFailure } from './apiFailure'
import { PAYMENT_REFUSALS } from './invoiceDetail'

function lookup(locale: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], locale)
}

describe('discount above the invoice.draft ceiling (RC3 #841, B37 WEB-13)', () => {
  it('names both figures when the 403 carries the code', () => {
    const error = new ApiError({
      status: 403,
      problemType: 'insufficient-permission',
      code: 'DISCOUNT_ABOVE_LIMIT',
      problem: { code: 'DISCOUNT_ABOVE_LIMIT', requestedPercent: 25, limitPercent: 10 },
    })
    expect(describeApiFailure(error)).toMatchObject({
      key: 'apiErrors.discountAboveLimit',
      values: { requestedPercent: '25', limitPercent: '10' },
    })
  })

  it('keeps the permission sentence for a 403 with no code (b48e85031)', () => {
    const error = new ApiError({ status: 403, problemType: 'insufficient-permission' })
    expect(describeApiFailure(error).key).toBe('apiErrors.forbidden')
  })

  it('has English and Arabic wording with both placeholders', () => {
    for (const locale of [en, ar]) {
      const text = String(lookup(locale, 'apiErrors.discountAboveLimit'))
      expect(text).toContain('{{requestedPercent}}')
      expect(text).toContain('{{limitPercent}}')
    }
  })
})

describe('card number in a payment reference (DEC-30-06, B37 WEB-11)', () => {
  it('puts the refusal on the reference field, worded in both languages', () => {
    expect(PAYMENT_REFUSALS.PAYMENT_REFERENCE_CARD_NUMBER.field).toBe('reference')
    const key = PAYMENT_REFUSALS.PAYMENT_REFERENCE_CARD_NUMBER.key
    expect(typeof lookup(en, key)).toBe('string')
    expect(typeof lookup(ar, key)).toBe('string')
    expect(lookup(ar, key)).not.toBe(lookup(en, key))
  })
})
