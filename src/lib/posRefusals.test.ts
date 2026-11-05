import { afterEach, describe, expect, it } from 'vitest'
import i18n from '../i18n'
import { ApiError } from '../api'
import { posRefusalKey, queueRefusalKey, refusalValues } from './posRefusals'

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

// NOT RUN (static only). Backend 8f04050ab (HS Slice B, IBR-078-OM).
describe('a line that states neither goods nor services', () => {
  it('online, is worded by its code with the line it names', () => {
    const error = coded(400, 'GOODS_OR_SERVICE_REQUIRED', {
      line: 2,
      field: 'classification.goodsOrServiceCode',
    })
    expect(posRefusalKey(error)).toBe('pos.refusal.GOODS_OR_SERVICE_REQUIRED')
    expect(i18n.t(posRefusalKey(error), { line: '2' })).toContain('2')
  })

  it('queued, has its own sentence, never the HS code one', () => {
    expect(queueRefusalKey('POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED', null)).toBe(
      'pos.queue.reason.POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED',
    )
  })

  it.each([
    'pos.refusal.GOODS_OR_SERVICE_REQUIRED',
    'pos.queue.reason.POS_QUEUED_SALE_GOODS_OR_SERVICE_REQUIRED',
    'pos.queue.goodsOrServiceLines',
    'pos.queue.goodsOrServiceHint',
  ])('%s is in Arabic', async (key) => {
    await i18n.changeLanguage('ar')
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t(key, { line: 1, lines: '1' })).not.toMatch(/[A-Za-z]{4,}/)
  })
})

// Backend a2c9fcf0c (FIN-M3-CURRENCY-MIX Phase 2a). Problem bodies as PosShiftCurrencies builds them.
describe('a shift whose cash is in more than one currency, or in unrecorded ones', () => {
  const MIXED = () => coded(409, 'POS_SHIFT_CURRENCY_MIXED', { currencies: ['OMR', 'USD'] })
  const UNRECORDED = () =>
    coded(409, 'POS_SHIFT_CURRENCY_UNRECORDED', { unrecordedMovements: 3, currencies: [] })

  // Review WB2-1: no screen lets a cashier count the float or open a new shift (and the backend hands
  // the cashier their own withheld shift back), so the sentence offers neither: a manager sorts it out.
  it('MIXED names the currencies, says nothing was recorded, and leaves it to a manager', () => {
    const error = MIXED()
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_SHIFT_CURRENCY_MIXED')
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toContain('OMR, USD')
    expect(text).toMatch(/nothing was recorded/i)
    expect(text).toMatch(/can't be totalled/i)
    expect(text).toMatch(/a manager needs to sort this out/i)
    expect(text).not.toMatch(/count the float|new shift/i)
    expect(text).not.toContain('{{')
  })

  it('UNRECORDED names how many movements, and says what to do', () => {
    const error = UNRECORDED()
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_SHIFT_CURRENCY_UNRECORDED')
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toContain('(3)')
    expect(text).toMatch(/no currency recorded/i)
    expect(text).toMatch(/a manager needs to sort this out/i)
    expect(text).not.toMatch(/count the float|new shift/i)
    expect(text).not.toContain('{{')
  })

  it('takes a currency list only when every entry is a three-letter code, and a count only as a whole number', () => {
    expect(refusalValues(coded(409, 'POS_SHIFT_CURRENCY_MIXED', { currencies: ['OMR', 'USD'] }))).toEqual({
      currencies: 'OMR, USD',
    })
    expect(
      refusalValues(coded(409, 'POS_SHIFT_CURRENCY_MIXED', { currencies: ['OMR', '<b>x</b>'] })),
    ).toEqual({})
    expect(
      refusalValues(coded(409, 'POS_SHIFT_CURRENCY_UNRECORDED', { unrecordedMovements: 'many' })),
    ).toEqual({})
    expect(
      refusalValues(coded(409, 'POS_SHIFT_CURRENCY_UNRECORDED', { unrecordedMovements: 2 })),
    ).toEqual({ unrecordedMovements: '2' })
  })
})

describe('cash in a currency the drawer does not hold', () => {
  it('a paid-out names both currencies', () => {
    const error = coded(422, 'POS_PAID_OUT_CURRENCY_MISMATCH', {
      shiftCurrency: 'OMR',
      sentCurrency: 'USD',
    })
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_PAID_OUT_CURRENCY_MISMATCH')
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toContain('OMR')
    expect(text).toContain('USD')
    expect(text).toMatch(/nothing was recorded/i)
  })

  it('a paid-in names both currencies', () => {
    const error = coded(422, 'POS_CASH_MOVEMENT_CURRENCY_MISMATCH', {
      shiftCurrency: 'OMR',
      sentCurrency: 'AED',
    })
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_CASH_MOVEMENT_CURRENCY_MISMATCH')
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toContain('OMR')
    expect(text).toContain('AED')
  })

  // Review WB2-3: the backend sends card money back only for what the card itself paid (checkRoutes),
  // and no other drawer in the sale's currency is known to exist, so neither is offered.
  it('a cash refund names only what is certain: not this drawer, ask a manager', () => {
    const error = coded(422, 'POS_REFUND_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', saleCurrency: 'USD' })
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toMatch(/can't come from this drawer/i)
    expect(text).toMatch(/ask a manager/i)
    expect(text).not.toMatch(/card|from a drawer in/i)
  })

  it('a cash refund names the sale currency and the drawer currency, and says nothing was refunded', () => {
    const error = coded(422, 'POS_REFUND_CURRENCY_MISMATCH', {
      shiftCurrency: 'OMR',
      saleCurrency: 'USD',
    })
    expect(posRefusalKey(error)).toBe('pos.refusal.POS_REFUND_CURRENCY_MISMATCH')
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).toContain('USD')
    expect(text).toContain('OMR')
    expect(text).toMatch(/nothing was refunded/i)
  })

  it('takes a currency value only as a three-letter code', () => {
    expect(
      refusalValues(
        coded(422, 'POS_PAID_OUT_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', sentCurrency: 'usd dollars' }),
      ),
    ).toEqual({ shiftCurrency: 'OMR' })
  })

  it.each(['POS_CASH_MOVEMENT_CURRENCY_INVALID', 'POS_CASH_MOVEMENT_CURRENCY_REQUIRED'])(
    '%s at 400 is worded by its code, never the general failure',
    (code) => {
      const key = posRefusalKey(coded(400, code))
      expect(key).toBe(`pos.refusal.${code}`)
      expect(i18n.t(key)).not.toBe(i18n.t('pos.refusal.failed'))
      expect(i18n.t(key)).toMatch(/nothing was recorded/i)
    },
  )

  it.each([
    'POS_SHIFT_CURRENCY_MIXED',
    'POS_SHIFT_CURRENCY_UNRECORDED',
    'POS_PAID_OUT_CURRENCY_MISMATCH',
    'POS_CASH_MOVEMENT_CURRENCY_MISMATCH',
    'POS_REFUND_CURRENCY_MISMATCH',
    'POS_CASH_MOVEMENT_CURRENCY_INVALID',
    'POS_CASH_MOVEMENT_CURRENCY_REQUIRED',
  ])('pos.refusal.%s is in Arabic', async (code) => {
    await i18n.changeLanguage('ar')
    const key = `pos.refusal.${code}`
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
    const text = i18n.t(key, {
      currencies: 'OMR, USD',
      unrecordedMovements: '3',
      shiftCurrency: 'OMR',
      sentCurrency: 'USD',
      saleCurrency: 'USD',
    })
    expect(text.replace(/OMR|USD/g, '')).not.toMatch(/[A-Za-z]{4,}/)
    expect(text).not.toContain('{{')
  })
})

// Review WB2-2: a sentence never prints "{{name}}" for a figure the problem body did not carry.
describe('a currency refusal whose figures are missing or unusable', () => {
  const CASES: [number, string, Record<string, unknown>][] = [
    [409, 'POS_SHIFT_CURRENCY_MIXED', { currencies: ['OMR', 'USD'] }],
    [409, 'POS_SHIFT_CURRENCY_UNRECORDED', { unrecordedMovements: 2 }],
    [422, 'POS_PAID_OUT_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', sentCurrency: 'USD' }],
    [422, 'POS_CASH_MOVEMENT_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', sentCurrency: 'USD' }],
    [422, 'POS_REFUND_CURRENCY_MISMATCH', { shiftCurrency: 'OMR', saleCurrency: 'USD' }],
  ]
  const BROKEN: Record<string, Record<string, unknown>> = {
    POS_SHIFT_CURRENCY_MIXED: { currencies: ['OMR', 'dollars'] },
    POS_SHIFT_CURRENCY_UNRECORDED: { unrecordedMovements: 'some' },
    POS_PAID_OUT_CURRENCY_MISMATCH: { shiftCurrency: 'OMR', sentCurrency: 'us dollars' },
    POS_CASH_MOVEMENT_CURRENCY_MISMATCH: { shiftCurrency: 'omr', sentCurrency: 'USD' },
    POS_REFUND_CURRENCY_MISMATCH: { saleCurrency: 'USD' },
  }

  it.each(CASES)('%s %s with its figures uses the sentence that names them', (status, code, problem) => {
    const error = coded(status, code, problem)
    expect(posRefusalKey(error)).toBe(`pos.refusal.${code}`)
    expect(i18n.t(posRefusalKey(error), refusalValues(error))).not.toContain('{{')
  })

  it.each(CASES)('%s %s with no figures uses one that names none', (status, code) => {
    const error = coded(status, code)
    expect(posRefusalKey(error)).toBe(`pos.refusal.withoutFigures.${code}`)
    const text = i18n.t(posRefusalKey(error), refusalValues(error))
    expect(text).not.toContain('{{')
    expect(text).toMatch(/nothing was (recorded|refunded)/i)
  })

  it.each(CASES)('%s %s with unusable figures uses one that names none', (status, code) => {
    const error = coded(status, code, BROKEN[code])
    expect(posRefusalKey(error)).toBe(`pos.refusal.withoutFigures.${code}`)
    expect(i18n.t(posRefusalKey(error), refusalValues(error))).not.toContain('{{')
  })

  it('the queue picks the same way from the values the entry kept', () => {
    expect(queueRefusalKey('POS_SHIFT_CURRENCY_MIXED', null, { currencies: 'OMR, USD' })).toBe(
      'pos.refusal.POS_SHIFT_CURRENCY_MIXED',
    )
    expect(queueRefusalKey('POS_SHIFT_CURRENCY_MIXED', null)).toBe(
      'pos.refusal.withoutFigures.POS_SHIFT_CURRENCY_MIXED',
    )
    expect(queueRefusalKey('POS_SHIFT_CURRENCY_UNRECORDED', null, {})).toBe(
      'pos.refusal.withoutFigures.POS_SHIFT_CURRENCY_UNRECORDED',
    )
  })

  it('the two value-free codes need no fallback', () => {
    for (const code of ['POS_CASH_MOVEMENT_CURRENCY_INVALID', 'POS_CASH_MOVEMENT_CURRENCY_REQUIRED']) {
      expect(posRefusalKey(coded(400, code))).toBe(`pos.refusal.${code}`)
      expect(i18n.t(`pos.refusal.${code}`)).not.toContain('{{')
    }
  })

  it.each(CASES)('pos.refusal.withoutFigures.%s is in Arabic', async (_status, code) => {
    await i18n.changeLanguage('ar')
    const key = `pos.refusal.withoutFigures.${code}`
    expect(i18n.exists(key, { lng: 'ar', fallbackLng: false })).toBe(true)
    expect(i18n.t(key)).not.toMatch(/[A-Za-z]{4,}/)
  })
})
