import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ApiError } from '../api'
import { posRefusalKey } from './posRefusals'

const coded = (status: number, code: string, problem: Record<string, unknown> = {}) =>
  new ApiError({ status, problemType: null, code, problem: { code, ...problem } })

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('POS_REFUND_NOTHING_TO_PAY_BACK (backend fix/refund-edge-cases, probe zeroPieces)', () => {
  it('is worded by its code at 422', () => {
    const error = coded(422, 'POS_REFUND_NOTHING_TO_PAY_BACK', { lines: [1], expected: 0 })
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_REFUND_NOTHING_TO_PAY_BACK')
  })
})

describe('the new till sentences in Arabic', () => {
  it.each(['pos.refusal.POS_REFUND_NOTHING_TO_PAY_BACK', 'pos.warning.POS_REFUND_PIECE_CARRIED'])(
    '%s',
    async (key) => {
      await i18n.changeLanguage('ar')
      expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
      expect(i18n.t(key, { line: 1 })).not.toMatch(/[A-Za-z]{4,}/)
    },
  )
})

describe('the sale document ceiling on a till refund (PRV43-CMP F3-1, owner round 12)', () => {
  it.each(['CREDIT_NOTE_NOTHING_CORRECTABLE', 'CREDIT_NOTE_EXCEEDS_CORRECTABLE_AMOUNT'])(
    '%s is worded by its code, never as "Try again"',
    (code) => {
      const key = posRefusalKey(coded(409, code))
      expect(key).toBe(`pos.refusal.${code}`)
      expect(i18n.exists(key, { lng: 'en', fallbackLng: false })).toBe(true)
      expect(i18n.t(key)).not.toBe(i18n.t('pos.refusal.failed'))
      expect(i18n.t(key)).not.toMatch(/try again/i)
    },
  )

  it('nothing left says so and points at the existing credit notes', () => {
    expect(i18n.t('pos.refusal.CREDIT_NOTE_NOTHING_CORRECTABLE')).toMatch(
      /^There is no remaining amount available to credit on this sale\. Review its existing credit notes\./,
    )
  })

  it('more than is left never says the sale is used up: a smaller refund may still fit', () => {
    const sentence = i18n.t('pos.refusal.CREDIT_NOTE_EXCEEDS_CORRECTABLE_AMOUNT')
    expect(sentence).toMatch(/more than the amount still available to credit on this sale/)
    expect(sentence).not.toMatch(/no remaining|nothing (is )?left|fully|already credited|used up/i)
  })

  it('a code the till does not word still reads as the general failure', () => {
    expect(posRefusalKey(coded(409, 'CREDIT_NOTE_SOMETHING_NEW'))).toBe('pos.refusal.failed')
  })

  it.each([
    'pos.refusal.CREDIT_NOTE_NOTHING_CORRECTABLE',
    'pos.refusal.CREDIT_NOTE_EXCEEDS_CORRECTABLE_AMOUNT',
  ])('%s exists in Arabic (native sign-off pending)', async (key) => {
    await i18n.changeLanguage('ar')
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t(key)).not.toMatch(/[A-Za-z]{4,}/)
  })
})
